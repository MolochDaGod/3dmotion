import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { useGameStore } from "./useGameStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnimKey =
  | "idle"
  | "walkFwd" | "walkBwd"
  | "strafeL" | "strafeR"
  | "walkArcL" | "walkArcR"
  | "runFwd"
  | "jump" | "jumpLand"
  | "standToKneel" | "kneelingIdle" | "kneelToStand";

export interface PlayerProps {
  onShoot: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onMelee: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead: () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WALK_SPEED    = 4.5;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 9;
const GRAVITY       = -22;
const SENSITIVITY   = 0.002;
const PITCH_MIN     = -Math.PI / 2.8;
const PITCH_MAX     = Math.PI / 7;

// Over-the-shoulder offset in PLAYER LOCAL SPACE (right, up, back)
const SHOULDER_R    = 0.6;   // right of player center
const SHOULDER_U    = 1.55;  // above player origin
const SHOULDER_B    = 3.0;   // behind player
const EYE_H         = 0;     // extra height (already in SHOULDER_U)

// Roll
const ROLL_SPEED    = 14;
const ROLL_DURATION = 0.45;
const ROLL_COOLDOWN = 1.2;

// Melee
const MELEE_RANGE    = 2.6;
const MELEE_COOLDOWN = 0.7;

// ─── FBX load queue (model first, then 13 animations) ────────────────────────

const LOAD_QUEUE: Array<{ key: AnimKey | "__model__"; file: string }> = [
  { key: "__model__",    file: "/models/Meshy_AI_Corsair_King_0323082850_texture_fbx.fbx" },
  { key: "idle",         file: "/models/pistol idle.fbx" },
  { key: "walkFwd",      file: "/models/pistol walk.fbx" },
  { key: "walkBwd",      file: "/models/pistol walk backward.fbx" },
  { key: "strafeL",      file: "/models/pistol strafe.fbx" },
  { key: "strafeR",      file: "/models/pistol strafe (2).fbx" },
  { key: "walkArcL",     file: "/models/pistol walk arc.fbx" },
  { key: "walkArcR",     file: "/models/pistol walk arc (2).fbx" },
  { key: "runFwd",       file: "/models/pistol run.fbx" },
  { key: "jump",         file: "/models/pistol jump.fbx" },
  { key: "jumpLand",     file: "/models/pistol jump (2).fbx" },
  { key: "standToKneel", file: "/models/pistol stand to kneel.fbx" },
  { key: "kneelingIdle", file: "/models/pistol kneeling idle.fbx" },
  { key: "kneelToStand", file: "/models/pistol kneel to stand.fbx" },
];

// ─── Animation resolver ───────────────────────────────────────────────────────

interface MoveInput {
  fwd: boolean; bwd: boolean; left: boolean; right: boolean;
  sprint: boolean; grounded: boolean; crouching: boolean; jumping: boolean;
  rolling: boolean;
}

function resolveAnim(inp: MoveInput, cur: AnimKey): AnimKey {
  if (cur === "standToKneel" || cur === "kneelToStand") return cur;
  if (!inp.grounded) return inp.jumping ? "jump" : "jumpLand";
  if (inp.crouching)  return "kneelingIdle";
  if (inp.rolling)    return "runFwd"; // closest we have to a dive

  const { fwd, bwd, left, right, sprint } = inp;
  if (!fwd && !bwd && !left && !right) return "idle";

  if (fwd && !bwd) {
    if (!left && !right) return sprint ? "runFwd" : "walkFwd";
    if (left)            return "walkArcL";
    if (right)           return "walkArcR";
  }
  if (bwd && !fwd) return "walkBwd";
  if (left)  return "strafeL";
  if (right) return "strafeR";
  return "idle";
}

// ─── Reusable temporaries (avoid per-frame alloc) ────────────────────────────

const _up    = new THREE.Vector3(0, 1, 0);
const _yawQ  = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _offset = new THREE.Vector3();
const _camPos = new THREE.Vector3();

// ─── Player ───────────────────────────────────────────────────────────────────

export function Player({ onShoot, onMelee, onDead, playerPosRef }: PlayerProps) {
  const rootRef      = useRef<THREE.Group>(null!);
  const bodyRef      = useRef<THREE.Group>(null!); // for roll tilt

  // Physics
  const velY        = useRef(0);
  const grounded    = useRef(true);
  const wasGrounded = useRef(true);

  // Look
  const yaw   = useRef(0);
  const pitch = useRef(0);

  // Input
  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  // Action state
  const deadFired      = useRef(false);
  const shootCooldown  = useRef(0);
  const meleeCooldown  = useRef(0);

  // Crouch
  const crouching     = useRef(false);
  const crouchPending = useRef<"kneel" | "stand" | null>(null);

  // Roll
  const rolling      = useRef(false);
  const rollTimer    = useRef(0);
  const rollDir      = useRef(new THREE.Vector3(0, 0, -1));
  const rollCooldown = useRef(0);
  const rollInvin    = useRef(false); // invincibility frames

  // Animation
  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim    = useRef<AnimKey>("idle");

  const [modelObj, setModelObj] = useState<THREE.Group | null>(null);

  const { camera } = useThree();
  const { health, shoot, reload, ammo, isReloading, setInvincible } = useGameStore();

  // ── Sequential FBX loader ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const loader = new FBXLoader();
    let mixer: THREE.AnimationMixer | null = null;

    const loadIndex = (i: number) => {
      if (cancelled || i >= LOAD_QUEUE.length) return;
      const { key, file } = LOAD_QUEUE[i];

      loader.load(file, (fbx) => {
        if (cancelled) return;

        if (key === "__model__") {
          fbx.scale.setScalar(0.01);
          fbx.rotation.y = Math.PI;
          fbx.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });
          mixer = new THREE.AnimationMixer(fbx);
          mixerRef.current = mixer;
          setModelObj(fbx);
        } else {
          const clip = fbx.animations[0];
          if (clip && mixer) {
            clip.name = key;
            const action = mixer.clipAction(clip);
            if (key === "standToKneel" || key === "kneelToStand") {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
            }
            actionsRef.current[key as AnimKey] = action;
            if (key === "idle") {
              action.play();
              curAnim.current = "idle";
            }
          }
        }
        loadIndex(i + 1);
      },
      undefined,
      () => { if (!cancelled) loadIndex(i + 1); });
    };

    loadIndex(0);
    return () => { cancelled = true; mixerRef.current?.stopAllAction(); };
  }, []);

  // ── Animation helper ─────────────────────────────────────────────────────

  const transitionTo = useCallback((next: AnimKey, fade = 0.15) => {
    if (curAnim.current === next) return;
    actionsRef.current[curAnim.current]?.fadeOut(fade);
    const a = actionsRef.current[next];
    if (a) { a.reset().fadeIn(fade).play(); curAnim.current = next; }
  }, []);

  // ── Crouch helpers ───────────────────────────────────────────────────────

  const startCrouch = useCallback(() => {
    if (crouching.current || crouchPending.current) return;
    crouchPending.current = "kneel";
    crouching.current = true;
    transitionTo("standToKneel", 0.1);
    setTimeout(() => {
      if (crouching.current && !rolling.current) transitionTo("kneelingIdle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo]);

  const endCrouch = useCallback(() => {
    if (!crouching.current || crouchPending.current) return;
    crouchPending.current = "stand";
    crouching.current = false;
    transitionTo("kneelToStand", 0.1);
    setTimeout(() => {
      transitionTo("idle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo]);

  // ── Input listeners ──────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    yaw.current   -= e.movementX * SENSITIVITY;
    pitch.current -= e.movementY * SENSITIVITY;
    pitch.current  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch.current));
  }, []);

  // LMB = shoot
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }
      if (shootCooldown.current > 0 || isReloading) return;
      const fired = shoot();
      if (fired) {
        shootCooldown.current = 0.12;
        // Bullet direction = EXACTLY where camera is looking = screen center crosshair
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // Muzzle comes from camera pos so shots match crosshair perfectly
        const origin = camera.position.clone().add(dir.clone().multiplyScalar(0.5));
        onShoot(origin, dir);
      } else if (ammo <= 0) reload();
    }

    // RMB = melee
    if (e.button === 2) {
      if (!locked.current) return;
      if (meleeCooldown.current > 0) return;
      meleeCooldown.current = MELEE_COOLDOWN;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = rootRef.current.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      onMelee(origin, dir);
    }
  }, [shoot, reload, ammo, isReloading, onShoot, onMelee, camera]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent Alt from opening browser menu
    if (e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
    keys.current[e.code] = true;

    if (e.code === "KeyR") reload();

    // Alt = crouch toggle
    if (e.code === "AltLeft" || e.code === "AltRight") {
      crouching.current ? endCrouch() : startCrouch();
    }

    // Ctrl = roll (if grounded, not crouching, off cooldown)
    if ((e.code === "ControlLeft" || e.code === "ControlRight")
      && grounded.current && !rolling.current && !crouching.current
      && rollCooldown.current <= 0) {

      rolling.current   = true;
      rollTimer.current = ROLL_DURATION;
      rollCooldown.current = ROLL_COOLDOWN;
      rollInvin.current = true;

      // Roll direction = current movement intent or forward
      const fwdVec = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const rgtVec = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      const d = new THREE.Vector3();
      if (keys.current["KeyW"])   d.add(fwdVec);
      if (keys.current["KeyS"])   d.sub(fwdVec);
      if (keys.current["KeyA"])   d.sub(rgtVec);
      if (keys.current["KeyD"])   d.add(rgtVec);
      if (d.lengthSq() < 0.01)   d.copy(fwdVec); // default: roll forward
      rollDir.current.copy(d.normalize());

      // Store invincibility via game store
      if (setInvincible) setInvincible(true);
      setTimeout(() => {
        rolling.current = false;
        if (setInvincible) setInvincible(false);
        rollInvin.current = false;
      }, ROLL_DURATION * 1000);
    }
  }, [reload, startCrouch, endCrouch, setInvincible]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = false;
  }, []);

  const handlePLC = useCallback(() => {
    locked.current = document.pointerLockElement === document.body;
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => e.preventDefault(), []);

  useEffect(() => {
    document.addEventListener("mousemove",         handleMouseMove);
    document.addEventListener("mousedown",         handleMouseDown);
    document.addEventListener("keydown",           handleKeyDown);
    document.addEventListener("keyup",             handleKeyUp);
    document.addEventListener("pointerlockchange", handlePLC);
    document.addEventListener("contextmenu",       handleContextMenu);
    return () => {
      document.removeEventListener("mousemove",         handleMouseMove);
      document.removeEventListener("mousedown",         handleMouseDown);
      document.removeEventListener("keydown",           handleKeyDown);
      document.removeEventListener("keyup",             handleKeyUp);
      document.removeEventListener("pointerlockchange", handlePLC);
      document.removeEventListener("contextmenu",       handleContextMenu);
    };
  }, [handleMouseMove, handleMouseDown, handleKeyDown, handleKeyUp, handlePLC, handleContextMenu]);

  // ── Game loop ────────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    if (!rootRef.current) return;
    if (health <= 0 && !deadFired.current) { deadFired.current = true; onDead(); return; }

    // Cooldown ticks
    if (shootCooldown.current  > 0) shootCooldown.current  -= delta;
    if (meleeCooldown.current  > 0) meleeCooldown.current  -= delta;
    if (rollCooldown.current   > 0) rollCooldown.current   -= delta;
    if (rollTimer.current      > 0) rollTimer.current      -= delta;

    mixerRef.current?.update(delta);

    // ── Movement ─────────────────────────────────────────────────────────

    const sprint  = (keys.current["ShiftLeft"] || keys.current["ShiftRight"]) && !crouching.current;
    const fwdVec  = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const rgtVec  = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const fwd   = !!(keys.current["KeyW"] || keys.current["ArrowUp"]);
    const bwd   = !!(keys.current["KeyS"] || keys.current["ArrowDown"]);
    const left  = !!(keys.current["KeyA"] || keys.current["ArrowLeft"]);
    const right = !!(keys.current["KeyD"] || keys.current["ArrowRight"]);

    // During roll: override movement with roll direction
    if (rolling.current && rollTimer.current > 0) {
      const rollMove = rollDir.current.clone().multiplyScalar(ROLL_SPEED * delta);
      rootRef.current.position.add(rollMove);

      // Visual tilt: dip the body group forward over roll arc
      if (bodyRef.current) {
        const t = 1 - rollTimer.current / ROLL_DURATION;
        const tilt = Math.sin(t * Math.PI) * 0.9; // rises and falls
        bodyRef.current.rotation.x = -tilt;
      }
    } else {
      // Reset body tilt after roll
      if (bodyRef.current && Math.abs(bodyRef.current.rotation.x) > 0.01) {
        bodyRef.current.rotation.x *= 0.8;
      }

      const canMove = !crouching.current && crouchPending.current === null;
      if (canMove) {
        const move = new THREE.Vector3();
        if (fwd)   move.add(fwdVec);
        if (bwd)   move.sub(fwdVec);
        if (left)  move.sub(rgtVec);
        if (right) move.add(rgtVec);
        if (move.lengthSq() > 0) {
          const speed = sprint ? RUN_SPEED : WALK_SPEED;
          move.normalize().multiplyScalar(speed * delta);
          rootRef.current.position.add(move);
        }
      }
    }

    // ── Vertical physics ──────────────────────────────────────────────────

    const canJump = grounded.current && !crouching.current && !rolling.current;
    if (keys.current["Space"] && canJump) {
      velY.current     = JUMP_FORCE;
      grounded.current = false;
    }
    velY.current += GRAVITY * delta;
    rootRef.current.position.y += velY.current * delta;
    if (rootRef.current.position.y <= 0) {
      rootRef.current.position.y = 0;
      velY.current = 0;
      if (!grounded.current) {
        grounded.current = true;
        transitionTo("jumpLand", 0.08);
        setTimeout(() => { if (grounded.current) transitionTo("idle", 0.2); }, 320);
      }
    }
    wasGrounded.current = grounded.current;

    // World bounds
    const half = 49;
    rootRef.current.position.x = Math.max(-half, Math.min(half, rootRef.current.position.x));
    rootRef.current.position.z = Math.max(-half, Math.min(half, rootRef.current.position.z));

    playerPosRef.current.copy(rootRef.current.position);
    rootRef.current.rotation.y = yaw.current;

    // ── Animation state machine ───────────────────────────────────────────

    const goingUp = velY.current > 0.5;
    const inp: MoveInput = {
      fwd, bwd, left, right, sprint,
      grounded: grounded.current,
      crouching: crouching.current,
      jumping: goingUp,
      rolling: rolling.current,
    };
    const locked_ = ["standToKneel", "kneelToStand"] as AnimKey[];
    if (!locked_.includes(curAnim.current)) {
      transitionTo(resolveAnim(inp, curAnim.current));
    }

    // ── Camera: directly attached to player (zero rubber-band) ───────────
    //
    // Algorithm:
    //   1. Rotate shoulder offset by YAW ONLY — keeps camera behind player
    //      regardless of pitch (no vertical swinging)
    //   2. Camera position = playerPos + offset  (no lerp = no lag)
    //   3. Camera rotation = set via YXZ Euler directly  (no lookAt fight)
    //
    _yawQ.setFromAxisAngle(_up, yaw.current);

    _offset.set(SHOULDER_R, SHOULDER_U, SHOULDER_B);
    _offset.applyQuaternion(_yawQ);

    _camPos.copy(rootRef.current.position).add(_offset);
    camera.position.copy(_camPos);

    // Direct rotation — pitch + yaw, no lerp, no lookAt
    _euler.set(pitch.current, yaw.current, 0, "YXZ");
    camera.quaternion.setFromEuler(_euler);
  });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        {modelObj ? (
          <primitive object={modelObj} />
        ) : (
          <group>
            <mesh position={[0, 0.9, 0]} castShadow>
              <capsuleGeometry args={[0.35, 1.0, 4, 8]} />
              <meshStandardMaterial color="#4a90d9" />
            </mesh>
            <mesh position={[0, 1.75, 0]} castShadow>
              <sphereGeometry args={[0.28, 8, 8]} />
              <meshStandardMaterial color="#f4c896" />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}
