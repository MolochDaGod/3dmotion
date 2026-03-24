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
  onDead:  () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WALK_SPEED    = 4.5;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 9;
const GRAVITY       = -22;
const SENSITIVITY   = 0.002;
const PITCH_MIN     = -Math.PI / 2.5;
const PITCH_MAX     = Math.PI / 8;

// Camera shoulder rig — LOCAL to the player root (right, up, back)
// The player root's -Z is the forward direction; +Z is behind.
const CAM_X =  0.55;   // right of spine
const CAM_Y =  1.55;   // approximate eye/chest height
const CAM_Z =  2.8;    // behind the character

// Roll
const ROLL_SPEED    = 14;
const ROLL_DURATION = 0.45;
const ROLL_COOLDOWN = 1.2;

// Melee
const MELEE_COOLDOWN = 0.7;

// ─── FBX load queue ───────────────────────────────────────────────────────────

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
  sprint: boolean; grounded: boolean; crouching: boolean;
  jumping: boolean; rolling: boolean;
}

function resolveAnim(inp: MoveInput, cur: AnimKey): AnimKey {
  if (cur === "standToKneel" || cur === "kneelToStand") return cur;
  if (!inp.grounded) return inp.jumping ? "jump" : "jumpLand";
  if (inp.crouching)  return "kneelingIdle";
  if (inp.rolling)    return "runFwd";

  const { fwd, bwd, left, right, sprint } = inp;
  if (!fwd && !bwd && !left && !right) return "idle";

  if (fwd && !bwd) {
    if (!left && !right) return sprint ? "runFwd" : "walkFwd";
    if (left)  return "walkArcL";
    if (right) return "walkArcR";
  }
  if (bwd && !fwd) return "walkBwd";
  if (left)  return "strafeL";
  if (right) return "strafeR";
  return "idle";
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function Player({ onShoot, onMelee, onDead, playerPosRef }: PlayerProps) {
  // rootRef is the scene-graph parent of BOTH the character model AND the camera.
  // rootRef.rotation.y  = world yaw  (only axis that changes on rootRef)
  // rootRef.position    = world player position
  const rootRef = useRef<THREE.Group>(null!);

  // Physics
  const velY        = useRef(0);
  const grounded    = useRef(true);

  // Look — yaw lives on rootRef, pitch lives on the camera locally
  const yaw   = useRef(0);
  const pitch = useRef(0);

  // Input
  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  // Action timers / state
  const deadFired      = useRef(false);
  const shootCooldown  = useRef(0);
  const meleeCooldown  = useRef(0);

  // Crouch
  const crouching     = useRef(false);
  const crouchPending = useRef<"kneel" | "stand" | null>(null);

  // Roll
  const rolling        = useRef(false);
  const rollTimer      = useRef(0);
  const rollDir        = useRef(new THREE.Vector3(0, 0, -1));
  const rollCooldown   = useRef(0);

  // Animation
  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim    = useRef<AnimKey>("idle");

  const [modelObj, setModelObj] = useState<THREE.Group | null>(null);

  const { camera, scene } = useThree();
  const { health, shoot, reload, ammo, isReloading, setInvincible } = useGameStore();

  // ── Parent the camera to the player root ─────────────────────────────────
  //
  // This is the critical fix. Instead of computing world-space camera position
  // every frame (which competes with R3F's scene management), we make the camera
  // a proper Three.js child of rootRef. Then:
  //   • rootRef.rotation.y  = yaw  → camera inherits yaw automatically
  //   • camera.position     = shoulder offset in LOCAL space (constant)
  //   • camera.rotation.x   = pitch in LOCAL space
  //   • camera.rotation.y/z = 0    (yaw handled by parent)
  //
  useEffect(() => {
    // Set stable camera properties
    camera.rotation.order = "YXZ";
    camera.position.set(CAM_X, CAM_Y, CAM_Z);
    camera.rotation.set(0, 0, 0);

    // R3F's camera starts as a child of the scene. We re-parent to rootRef.
    // Three.js auto-removes from current parent when add() is called.
    const root = rootRef.current;
    if (root) root.add(camera);

    return () => {
      // On unmount, return camera to scene so R3F can manage it
      scene.add(camera);
    };
  }, [camera, scene]);

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
          // DO NOT rotate the FBX root — the flip wrapper group in JSX handles orientation.
          // Setting fbx.rotation.y here can be overridden by the animation system.
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

  // ── Crouch ───────────────────────────────────────────────────────────────

  const startCrouch = useCallback(() => {
    if (crouching.current || crouchPending.current) return;
    crouchPending.current = "kneel";
    crouching.current = true;
    transitionTo("standToKneel", 0.1);
    setTimeout(() => {
      if (crouching.current) transitionTo("kneelingIdle", 0.15);
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

  // ── Mouse look ───────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    yaw.current   -= e.movementX * SENSITIVITY;
    pitch.current -= e.movementY * SENSITIVITY;
    pitch.current  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch.current));
  }, []);

  // ── Mouse buttons ────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // LMB: shoot (or acquire pointer lock)
    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }
      if (shootCooldown.current > 0 || isReloading) return;
      const fired = shoot();
      if (fired) {
        shootCooldown.current = 0.12;
        // Bullet direction = exactly where camera is looking = crosshair center
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const origin = new THREE.Vector3();
        camera.getWorldPosition(origin);
        origin.addScaledVector(dir, 0.5);
        onShoot(origin, dir);
      } else if (ammo <= 0) {
        reload();
      }
    }
    // RMB: melee
    if (e.button === 2) {
      if (!locked.current) return;
      if (meleeCooldown.current > 0) return;
      meleeCooldown.current = MELEE_COOLDOWN;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      onMelee(origin, dir);
    }
  }, [shoot, reload, ammo, isReloading, onShoot, onMelee, camera]);

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === "AltLeft" || e.code === "AltRight") e.preventDefault();
    keys.current[e.code] = true;

    if (e.code === "KeyR") reload();

    // Alt = crouch toggle
    if (e.code === "AltLeft" || e.code === "AltRight") {
      crouching.current ? endCrouch() : startCrouch();
    }

    // Ctrl = dodge roll
    if ((e.code === "ControlLeft" || e.code === "ControlRight")
      && grounded.current && !rolling.current && !crouching.current
      && rollCooldown.current <= 0) {

      rolling.current      = true;
      rollTimer.current    = ROLL_DURATION;
      rollCooldown.current = ROLL_COOLDOWN;

      // Roll direction from WASD intent, default forward
      const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const rgt = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      const d = new THREE.Vector3();
      if (keys.current["KeyW"]) d.add(fwd);
      if (keys.current["KeyS"]) d.sub(fwd);
      if (keys.current["KeyA"]) d.sub(rgt);
      if (keys.current["KeyD"]) d.add(rgt);
      if (d.lengthSq() < 0.01) d.copy(fwd);
      rollDir.current.copy(d.normalize());

      if (setInvincible) setInvincible(true);
      setTimeout(() => {
        rolling.current = false;
        if (setInvincible) setInvincible(false);
      }, ROLL_DURATION * 1000);
    }
  }, [reload, startCrouch, endCrouch, setInvincible]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = false;
  }, []);

  const handlePLC = useCallback(() => {
    locked.current = document.pointerLockElement === document.body;
  }, []);

  const handleCtxMenu = useCallback((e: MouseEvent) => e.preventDefault(), []);

  useEffect(() => {
    document.addEventListener("mousemove",         handleMouseMove);
    document.addEventListener("mousedown",         handleMouseDown);
    document.addEventListener("keydown",           handleKeyDown);
    document.addEventListener("keyup",             handleKeyUp);
    document.addEventListener("pointerlockchange", handlePLC);
    document.addEventListener("contextmenu",       handleCtxMenu);
    return () => {
      document.removeEventListener("mousemove",         handleMouseMove);
      document.removeEventListener("mousedown",         handleMouseDown);
      document.removeEventListener("keydown",           handleKeyDown);
      document.removeEventListener("keyup",             handleKeyUp);
      document.removeEventListener("pointerlockchange", handlePLC);
      document.removeEventListener("contextmenu",       handleCtxMenu);
    };
  }, [handleMouseMove, handleMouseDown, handleKeyDown, handleKeyUp, handlePLC, handleCtxMenu]);

  // ── Game loop ────────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    if (!rootRef.current) return;
    if (health <= 0 && !deadFired.current) { deadFired.current = true; onDead(); return; }

    // Countdown timers
    if (shootCooldown.current > 0) shootCooldown.current  -= delta;
    if (meleeCooldown.current > 0) meleeCooldown.current  -= delta;
    if (rollCooldown.current  > 0) rollCooldown.current   -= delta;
    if (rollTimer.current     > 0) rollTimer.current      -= delta;

    mixerRef.current?.update(delta);

    // ── Yaw applied to root — camera inherits it via scene graph ─────────
    rootRef.current.rotation.y = yaw.current;

    // ── Camera pitch in LOCAL space (yaw already inherited from parent) ───
    camera.rotation.x = pitch.current;
    camera.rotation.y = 0;
    camera.rotation.z = 0;

    // ── Movement ─────────────────────────────────────────────────────────

    // Forward/right vectors derived from YAW (not camera pitch)
    const fwdVec = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const rgtVec = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const fwd   = !!(keys.current["KeyW"] || keys.current["ArrowUp"]);
    const bwd   = !!(keys.current["KeyS"] || keys.current["ArrowDown"]);
    const left  = !!(keys.current["KeyA"] || keys.current["ArrowLeft"]);
    const right = !!(keys.current["KeyD"] || keys.current["ArrowRight"]);
    const sprint = (keys.current["ShiftLeft"] || keys.current["ShiftRight"]) && !crouching.current;

    if (rolling.current && rollTimer.current > 0) {
      // Roll dash overrides normal movement
      rootRef.current.position.addScaledVector(rollDir.current, ROLL_SPEED * delta);
    } else {
      const canMove = !crouching.current && crouchPending.current === null;
      if (canMove) {
        const move = new THREE.Vector3();
        if (fwd)   move.add(fwdVec);
        if (bwd)   move.sub(fwdVec);
        if (left)  move.sub(rgtVec);
        if (right) move.add(rgtVec);
        if (move.lengthSq() > 0) {
          const speed = sprint ? RUN_SPEED : WALK_SPEED;
          rootRef.current.position.addScaledVector(move.normalize(), speed * delta);
        }
      }
    }

    // ── Jump / gravity ────────────────────────────────────────────────────

    if (keys.current["Space"] && grounded.current && !crouching.current && !rolling.current) {
      velY.current     = JUMP_FORCE;
      grounded.current = false;
    }
    velY.current += GRAVITY * delta;
    rootRef.current.position.y += velY.current * delta;
    if (rootRef.current.position.y <= 0) {
      rootRef.current.position.y = 0;
      if (!grounded.current) {
        grounded.current = true;
        transitionTo("jumpLand", 0.08);
        setTimeout(() => { if (grounded.current) transitionTo("idle", 0.2); }, 320);
      }
      velY.current = 0;
    }

    // World bounds
    const HALF = 49;
    rootRef.current.position.x = Math.max(-HALF, Math.min(HALF, rootRef.current.position.x));
    rootRef.current.position.z = Math.max(-HALF, Math.min(HALF, rootRef.current.position.z));

    playerPosRef.current.copy(rootRef.current.position);

    // ── Animation state machine ───────────────────────────────────────────

    const inp: MoveInput = {
      fwd, bwd, left, right, sprint,
      grounded: grounded.current,
      crouching: crouching.current,
      jumping: velY.current > 0.5,
      rolling: rolling.current,
    };
    const LOCKED: AnimKey[] = ["standToKneel", "kneelToStand"];
    if (!LOCKED.includes(curAnim.current)) {
      transitionTo(resolveAnim(inp, curAnim.current));
    }
  });

  // ─── JSX ─────────────────────────────────────────────────────────────────
  //
  // rootRef is the player root:
  //   • rotation.y = yaw  (set in useFrame)
  //   • camera is added as a Three.js child in useEffect (not in JSX)
  //
  // The character model lives here with a flip wrapper.
  // The FBX model's original +Z facing becomes -Z (player forward) via the
  // rotation-y={Math.PI} wrapper — applied in JSX so the animation system
  // can't override it (it only affects this wrapper's local transform, not
  // the FBX internal root bone).
  //
  return (
    <group ref={rootRef}>
      {/* Flip wrapper: corrects FBX +Z facing → player's -Z forward.
          Applied to a parent group so animation clips cannot override it. */}
      <group rotation-y={Math.PI}>
        {modelObj ? (
          <primitive object={modelObj} />
        ) : (
          /* Placeholder capsule while model loads */
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
