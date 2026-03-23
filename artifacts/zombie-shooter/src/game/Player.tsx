import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { useGameStore } from "./useGameStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnimKey =
  | "idle"
  | "walkFwd"  | "walkBwd"
  | "strafeL"  | "strafeR"
  | "walkArcL" | "walkArcR"
  | "runFwd"
  | "jump"     | "jumpLand"
  | "standToKneel" | "kneelingIdle" | "kneelToStand";

interface PlayerProps {
  onShoot: (position: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead: () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WALK_SPEED   = 4;
const RUN_SPEED    = 8.5;
const JUMP_FORCE   = 8;
const GRAVITY      = -20;
const SENSITIVITY  = 0.002;

// Over-shoulder: right, up, back (in local player space)
const SHOULDER = new THREE.Vector3(0.55, 1.6, 3.2);

// 13 essential animations loaded sequentially (model first) to prevent GPU OOM
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

// ─── Animation state machine ──────────────────────────────────────────────────

interface MoveInput {
  fwd: boolean; bwd: boolean; left: boolean; right: boolean;
  sprint: boolean; grounded: boolean; crouching: boolean; jumping: boolean;
}

function resolveAnim(inp: MoveInput, prevAnim: AnimKey): AnimKey {
  // Crouch transitions are non-interruptible until complete
  if (prevAnim === "standToKneel" || prevAnim === "kneelToStand") return prevAnim;

  if (!inp.grounded) return inp.jumping ? "jump" : "jumpLand";

  if (inp.crouching) return "kneelingIdle";

  const { fwd, bwd, left, right, sprint } = inp;
  const moving = fwd || bwd || left || right;
  if (!moving) return "idle";

  // Forward arcs use diagonal blending
  if (fwd && !bwd) {
    if (!left && !right) return sprint ? "runFwd" : "walkFwd";
    if (left)            return "walkArcL";  // no separate run arcs — reuse walk
    if (right)           return "walkArcR";
  }
  // Backward — always use walkBwd (no run-backward in trimmed set)
  if (bwd && !fwd) return "walkBwd";

  // Pure strafe (no fwd/bwd)
  if (left)  return "strafeL";
  if (right) return "strafeR";

  return "idle";
}

// ─── Player component ─────────────────────────────────────────────────────────

export function Player({ onShoot, onDead, playerPosRef }: PlayerProps) {
  const rootRef = useRef<THREE.Group>(null!);

  // Physics
  const velY         = useRef(0);
  const grounded     = useRef(true);
  const wasGrounded  = useRef(true);

  // Look
  const yaw   = useRef(0);
  const pitch = useRef(0);

  // Inputs
  const keys = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  // Game state
  const deadFired     = useRef(false);
  const shootCooldown = useRef(0);
  const crouching     = useRef(false);
  const crouchPending = useRef<"kneel" | "stand" | null>(null);

  // Animation
  const mixerRef      = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef    = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim       = useRef<AnimKey>("idle");
  const [modelObj, setModelObj] = useState<THREE.Group | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const totalCount = LOAD_QUEUE.length;

  const { camera } = useThree();
  const { health, shoot, reload, ammo, isReloading } = useGameStore();

  // ── 3D crosshair attached to camera ─────────────────────────────────────
  useEffect(() => {
    const g = new THREE.Group();
    const mat = (col: number) =>
      new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide });

    g.add(new THREE.Mesh(new THREE.RingGeometry(0.013, 0.025, 32), mat(0xffffff)));
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.005, 16), mat(0xff3333)));

    // Gap tick-marks
    const tick = (x: number, y: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(0xffffff));
      m.position.set(x, y, 0);
      return m;
    };
    g.add(tick(0, 0.045, 0.003, 0.018));
    g.add(tick(0, -0.045, 0.003, 0.018));
    g.add(tick(0.045, 0, 0.018, 0.003));
    g.add(tick(-0.045, 0, 0.018, 0.003));

    g.position.set(0, 0, -5);
    g.renderOrder = 999;
    camera.add(g);
    return () => { camera.remove(g); };
  }, [camera]);

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
        setLoadedCount(i + 1);

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

  // Transition helper
  const transitionTo = useCallback((next: AnimKey, fadeDur = 0.18) => {
    const prev = curAnim.current;
    if (prev === next) return;
    actionsRef.current[prev]?.fadeOut(fadeDur);
    const a = actionsRef.current[next];
    if (a) {
      a.reset().fadeIn(fadeDur).play();
      curAnim.current = next;
    }
  }, []);

  // ── Input listeners ──────────────────────────────────────────────────────
  const getDir = useCallback(() =>
    new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ")),
  []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    yaw.current   -= e.movementX * SENSITIVITY;
    pitch.current -= e.movementY * SENSITIVITY;
    pitch.current  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 6, pitch.current));
  }, []);

  const handleClick = useCallback(() => {
    if (!locked.current) { document.body.requestPointerLock(); return; }
    if (shootCooldown.current > 0 || isReloading) return;
    const fired = shoot();
    if (fired) {
      shootCooldown.current = 0.12;
      onShoot(rootRef.current.position.clone().add(new THREE.Vector3(0, 1.4, 0)), getDir());
    } else if (ammo <= 0) reload();
  }, [shoot, reload, ammo, isReloading, onShoot, getDir]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = true;
    if (e.code === "KeyR") reload();

    // Crouch toggle (C)
    if (e.code === "KeyC") {
      if (!crouching.current && !crouchPending.current) {
        crouchPending.current = "kneel";
        crouching.current = true;
        transitionTo("standToKneel", 0.1);
        // After transition is done, switch to kneeling idle
        setTimeout(() => {
          if (crouching.current) transitionTo("kneelingIdle", 0.15);
        }, 700);
      } else if (crouching.current && !crouchPending.current) {
        crouchPending.current = "stand";
        crouching.current = false;
        transitionTo("kneelToStand", 0.1);
        setTimeout(() => {
          if (!crouching.current) {
            transitionTo("idle", 0.15);
            crouchPending.current = null;
          }
        }, 700);
      }
    }
  }, [reload, transitionTo]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = false;
  }, []);

  const handlePLC = useCallback(() => {
    locked.current = document.pointerLockElement === document.body;
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove",         handleMouseMove);
    document.addEventListener("click",             handleClick);
    document.addEventListener("keydown",           handleKeyDown);
    document.addEventListener("keyup",             handleKeyUp);
    document.addEventListener("pointerlockchange", handlePLC);
    return () => {
      document.removeEventListener("mousemove",         handleMouseMove);
      document.removeEventListener("click",             handleClick);
      document.removeEventListener("keydown",           handleKeyDown);
      document.removeEventListener("keyup",             handleKeyUp);
      document.removeEventListener("pointerlockchange", handlePLC);
    };
  }, [handleMouseMove, handleClick, handleKeyDown, handleKeyUp, handlePLC]);

  // ── Game loop ────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!rootRef.current) return;

    if (health <= 0 && !deadFired.current) { deadFired.current = true; onDead(); return; }
    if (shootCooldown.current > 0) shootCooldown.current -= delta;

    mixerRef.current?.update(delta);

    // ── Movement ───────────────────────────────────────────────────────────
    const sprint = (keys.current["ShiftLeft"] || keys.current["ShiftRight"]) && !crouching.current;
    const speed  = sprint ? RUN_SPEED : WALK_SPEED;

    const fwdVec   = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const rightVec = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const fwd   = !!(keys.current["KeyW"] || keys.current["ArrowUp"]);
    const bwd   = !!(keys.current["KeyS"] || keys.current["ArrowDown"]);
    const left  = !!(keys.current["KeyA"] || keys.current["ArrowLeft"]);
    const right = !!(keys.current["KeyD"] || keys.current["ArrowRight"]);

    const move = new THREE.Vector3();
    if (fwd)   move.add(fwdVec);
    if (bwd)   move.sub(fwdVec);
    if (left)  move.sub(rightVec);
    if (right) move.add(rightVec);

    // No movement while crouching (authentic pistol pack behaviour)
    const canMove = !crouching.current && crouchPending.current === null;
    if (canMove && move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * delta);
      rootRef.current.position.add(move);
    }

    // Jump (no jump while crouching)
    if (keys.current["Space"] && grounded.current && canMove) {
      velY.current = JUMP_FORCE;
      grounded.current = false;
    }
    velY.current += GRAVITY * delta;
    rootRef.current.position.y += velY.current * delta;
    if (rootRef.current.position.y <= 0) {
      rootRef.current.position.y = 0;
      velY.current = 0;
      grounded.current = true;
    }

    // Bounds
    const half = 49;
    rootRef.current.position.x = Math.max(-half, Math.min(half, rootRef.current.position.x));
    rootRef.current.position.z = Math.max(-half, Math.min(half, rootRef.current.position.z));

    playerPosRef.current.copy(rootRef.current.position);
    rootRef.current.rotation.y = yaw.current;

    // ── Animation state machine ────────────────────────────────────────────
    const goingUp = velY.current > 1;

    const inp: MoveInput = {
      fwd, bwd, left, right, sprint,
      grounded: grounded.current,
      crouching: crouching.current,
      jumping: goingUp,
    };

    // Handle jump/land transitions
    if (!wasGrounded.current && grounded.current) {
      // Just landed — play land then idle
      transitionTo("jumpLand", 0.1);
      setTimeout(() => { if (grounded.current) transitionTo("idle", 0.2); }, 350);
    }
    wasGrounded.current = grounded.current;

    // Only resolve new anim if no locked crouch transition running
    const lockedAnims: AnimKey[] = ["standToKneel", "kneelToStand"];
    if (!lockedAnims.includes(curAnim.current)) {
      const next = resolveAnim(inp, curAnim.current);
      transitionTo(next);
    }

    // ── Over-shoulder camera ───────────────────────────────────────────────
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitch.current * 0.6, yaw.current, 0, "YXZ")
    );
    const camTarget = rootRef.current.position.clone()
      .add(new THREE.Vector3(0, 1.0, 0))
      .add(SHOULDER.clone().applyQuaternion(q));
    camera.position.lerp(camTarget, 0.14);

    const aimPt = rootRef.current.position.clone()
      .add(new THREE.Vector3(0, 1.4, 0))
      .add(getDir().multiplyScalar(15));
    const curDir  = new THREE.Vector3();
    camera.getWorldDirection(curDir);
    const wantDir = aimPt.clone().sub(camera.position).normalize();
    camera.lookAt(
      camera.position.clone().add(curDir.lerp(wantDir, 0.14).normalize().multiplyScalar(10))
    );
  });

  // ─── Render ──────────────────────────────────────────────────────────────
  const pct = Math.round((loadedCount / totalCount) * 100);

  return (
    <group ref={rootRef}>
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
      {/* Loading indicator in world space above player */}
      {!modelObj && (
        <mesh position={[0, 3, 0]}>
          <planeGeometry args={[1.2, 0.15]} />
          <meshBasicMaterial color="#111" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}
