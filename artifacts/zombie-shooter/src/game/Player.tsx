import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { RigidBody, CapsuleCollider, useRapier } from "@react-three/rapier";
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

// ─── Physics capsule constants ────────────────────────────────────────────────
// The Rapier CapsuleCollider: halfHeight = cylinder half, radius = cap radius.
// Total height = 2*HH + 2*R = 1.7m.  Centre above feet = HH + R = 0.85m.

const CAPSULE_HH = 0.5;   // half-height of cylinder part
const CAPSULE_R  = 0.35;  // cap radius
const CAPSULE_CY = CAPSULE_HH + CAPSULE_R; // capsule centre Y from feet = 0.85

// ─── Movement constants ───────────────────────────────────────────────────────

const WALK_SPEED    = 4.5;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 9;
const PITCH_MIN     = -Math.PI / 2.5;
const PITCH_MAX_TPS =  Math.PI / 8;
const PITCH_MAX_FPS =  Math.PI / 2 - 0.05;

// Roll
const ROLL_SPEED    = 14;
const ROLL_DURATION = 0.45;
const ROLL_COOLDOWN = 1.2;

// Melee
const MELEE_COOLDOWN = 0.7;

// FPS eye height (local to rootRef — visual feet origin)
const EYE_HEIGHT = 1.70;

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
  // rootRef = visual group (model + camera parent). Position = player's feet in world space.
  const rootRef       = useRef<THREE.Group>(null!);
  const modelGroupRef = useRef<THREE.Group>(null!);

  // playerRBRef = the Rapier kinematic rigid body that drives collision resolution.
  // Its translation Y = CAPSULE_CY above the visual feet.
  const playerRBRef = useRef<any>(null);

  // Physics
  const velY        = useRef(0);
  const grounded    = useRef(true);

  // Look
  const yaw   = useRef(0);
  const pitch = useRef(0);

  // Camera roll tilt (set at roll start, decays to 0)
  const rollCamZ = useRef(0);

  // Input
  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  // Action timers
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
  const { world } = useRapier();

  // Character controller ref — created once physics world is available
  const charCtrl = useRef<any>(null);

  const {
    health, shoot, reload, ammo, isReloading,
    setInvincible, camera: camSettings,
    setCameraMode, setShowCameraSettings,
  } = useGameStore();

  // ── Create Rapier character controller ───────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const ctrl = world.createCharacterController(0.05); // 5cm skin offset
    ctrl.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    ctrl.setMinSlopeSlideAngle(30 * Math.PI / 180);
    // Snap to ground if within 0.3m (handles small steps and ramps)
    try { ctrl.enableSnapToGround(0.3); } catch { /* API may differ by version */ }
    ctrl.setApplyImpulsesToDynamicBodies(false);
    charCtrl.current = ctrl;

    return () => {
      world.removeCharacterController(ctrl);
    };
  }, [world]);

  // ── Parent camera to rootRef via scene graph ──────────────────────────────
  //
  // rootRef drives: position (feet), rotation.y (yaw)
  // camera is a CHILD of rootRef so it inherits yaw automatically.
  // Camera only needs local position + pitch (x rotation).
  //
  useEffect(() => {
    camera.rotation.order = "YXZ";
    const root = rootRef.current;
    if (root) root.add(camera);

    // Initial camera position (overridden each frame based on mode)
    camera.position.set(camSettings.shoulderX, camSettings.shoulderY, camSettings.shoulderZ);
    camera.rotation.set(0, 0, 0);

    return () => {
      scene.add(camera); // return to scene on unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, scene]);

  // ── Sync FOV when it changes in settings ─────────────────────────────────
  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = camSettings.fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, camSettings.fov]);

  // ── Sequential FBX loader ─────────────────────────────────────────────────

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
          fbx.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) {
              c.castShadow    = true;
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

  // ── Animation helper ──────────────────────────────────────────────────────

  const transitionTo = useCallback((next: AnimKey, fade = 0.15) => {
    if (curAnim.current === next) return;
    actionsRef.current[curAnim.current]?.fadeOut(fade);
    const a = actionsRef.current[next];
    if (a) { a.reset().fadeIn(fade).play(); curAnim.current = next; }
  }, []);

  // ── Crouch ────────────────────────────────────────────────────────────────

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

  // ── Mouse look ────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    const sens = useGameStore.getState().camera.sensitivity;
    yaw.current   -= e.movementX * sens;
    pitch.current -= e.movementY * sens;

    const pMax = useGameStore.getState().camera.mode === "fps"
      ? PITCH_MAX_FPS : PITCH_MAX_TPS;
    pitch.current = Math.max(PITCH_MIN, Math.min(pMax, pitch.current));
  }, []);

  // ── Mouse buttons ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }
      if (shootCooldown.current > 0 || isReloading) return;
      const fired = shoot();
      if (fired) {
        shootCooldown.current = 0.12;
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

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent browser defaults for game keys
    if (["AltLeft","AltRight","F2","F3","ControlLeft","ControlRight"].includes(e.code)) {
      e.preventDefault();
    }

    keys.current[e.code] = true;

    if (e.code === "KeyR") reload();

    // F2 — toggle camera mode (TPS ↔ FPS)
    if (e.code === "F2") {
      const store = useGameStore.getState();
      const next  = store.camera.mode === "tps" ? "fps" : "tps";
      setCameraMode(next);
    }

    // F3 — toggle camera settings panel
    if (e.code === "F3") {
      const store = useGameStore.getState();
      const next  = !store.showCameraSettings;
      setShowCameraSettings(next);
      if (next) {
        // Releasing pointer lock so the user can click the sliders
        document.exitPointerLock();
      }
    }

    // Alt — crouch toggle
    if (e.code === "AltLeft" || e.code === "AltRight") {
      crouching.current ? endCrouch() : startCrouch();
    }

    // Ctrl — dodge roll
    if ((e.code === "ControlLeft" || e.code === "ControlRight")
      && grounded.current && !rolling.current && !crouching.current
      && rollCooldown.current <= 0) {

      rolling.current      = true;
      rollTimer.current    = ROLL_DURATION;
      rollCooldown.current = ROLL_COOLDOWN;

      // Roll direction from WASD intent, default to camera forward
      const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const rgt = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      const d = new THREE.Vector3();
      if (keys.current["KeyW"]) d.add(fwd);
      if (keys.current["KeyS"]) d.sub(fwd);
      if (keys.current["KeyA"]) d.sub(rgt);
      if (keys.current["KeyD"]) d.add(rgt);
      if (d.lengthSq() < 0.01) d.copy(fwd);
      rollDir.current.copy(d.normalize());

      // Camera tilt in the roll direction (left/right bias)
      const rightBias = rollDir.current.dot(rgt);
      rollCamZ.current = -rightBias * 0.18;

      if (setInvincible) setInvincible(true);
    }
  }, [reload, startCrouch, endCrouch, setInvincible, setCameraMode, setShowCameraSettings]);

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

  // ── Game loop ─────────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    if (!rootRef.current) return;
    if (health <= 0 && !deadFired.current) { deadFired.current = true; onDead(); return; }

    // Countdown cooldowns
    if (shootCooldown.current > 0) shootCooldown.current  -= delta;
    if (meleeCooldown.current > 0) meleeCooldown.current  -= delta;
    if (rollCooldown.current  > 0) rollCooldown.current   -= delta;

    // Roll timer (drives movement + invincibility)
    if (rollTimer.current > 0) {
      rollTimer.current -= delta;
      if (rollTimer.current <= 0) {
        rolling.current = false;
        if (setInvincible) setInvincible(false);
      }
    }

    mixerRef.current?.update(delta);

    // ── Camera Z tilt decays to 0 after roll ─────────────────────────────
    rollCamZ.current *= Math.max(0, 1 - 14 * delta);

    // ── Camera mode-dependent local position ─────────────────────────────
    const { mode, shoulderX, shoulderY, shoulderZ } = useGameStore.getState().camera;
    if (mode === "fps") {
      camera.position.set(0, EYE_HEIGHT, 0.1);
    } else {
      camera.position.set(shoulderX, shoulderY, shoulderZ);
    }

    // ── Apply yaw/pitch/tilt to camera (yaw is inherited from rootRef) ───
    camera.rotation.x = pitch.current;
    camera.rotation.y = 0;
    camera.rotation.z = rollCamZ.current;

    // ── Yaw on rootRef — camera + model both inherit it ──────────────────
    rootRef.current.rotation.y = yaw.current;

    // ── Hide/show model in FPS mode ───────────────────────────────────────
    if (modelGroupRef.current) {
      modelGroupRef.current.visible = (mode !== "fps");
    }

    // ── Input vectors (yaw-aligned, horizontal plane only) ───────────────
    const fwdVec = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const rgtVec = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const fwd   = !!(keys.current["KeyW"] || keys.current["ArrowUp"]);
    const bwd   = !!(keys.current["KeyS"] || keys.current["ArrowDown"]);
    const left  = !!(keys.current["KeyA"] || keys.current["ArrowLeft"]);
    const right = !!(keys.current["KeyD"] || keys.current["ArrowRight"]);
    const sprint = !!(keys.current["ShiftLeft"] || keys.current["ShiftRight"]) && !crouching.current;

    // ── Desired horizontal movement ───────────────────────────────────────
    const move = new THREE.Vector3();

    if (rolling.current && rollTimer.current > 0) {
      // Roll dash: fixed direction, high speed, no steering
      move.copy(rollDir.current).multiplyScalar(ROLL_SPEED * delta);
    } else if (!crouching.current && crouchPending.current === null) {
      if (fwd)   move.add(fwdVec);
      if (bwd)   move.sub(fwdVec);
      if (left)  move.sub(rgtVec);
      if (right) move.add(rgtVec);
      if (move.lengthSq() > 0) {
        const speed = sprint ? RUN_SPEED : WALK_SPEED;
        move.normalize().multiplyScalar(speed * delta);
      }
    }

    // ── Jump input (consumed once per grounded landing) ───────────────────
    if (keys.current["Space"] && grounded.current && !crouching.current && !rolling.current) {
      velY.current    = JUMP_FORCE;
      grounded.current = false;
    }

    // ── Rapier character controller ───────────────────────────────────────
    const rb   = playerRBRef.current;
    const ctrl = charCtrl.current;

    if (rb && ctrl) {
      // Gravity
      velY.current += -22 * delta;
      move.y = velY.current * delta;

      // Compute collision-resolved movement
      const collider = rb.collider(0);
      if (collider) {
        ctrl.computeColliderMovement(collider, { x: move.x, y: move.y, z: move.z });
        const resolved = ctrl.computedMovement();
        const isGrounded = ctrl.computedGrounded();

        // Landing
        if (isGrounded && velY.current < 0) {
          velY.current = 0;
          if (!grounded.current) {
            grounded.current = true;
            transitionTo("jumpLand", 0.08);
            setTimeout(() => { if (grounded.current) transitionTo("idle", 0.2); }, 320);
          }
        }
        grounded.current = isGrounded;

        // Advance the physics body
        const pos = rb.translation();
        const next = {
          x: pos.x + resolved.x,
          y: pos.y + resolved.y,
          z: pos.z + resolved.z,
        };
        rb.setNextKinematicTranslation(next);

        // Sync visual group (rootRef) to feet position
        // Physics body Y = capsule centre = feet + CAPSULE_CY
        rootRef.current.position.set(next.x, next.y - CAPSULE_CY, next.z);
        playerPosRef.current.copy(rootRef.current.position);
      }
    } else {
      // Physics not ready yet — fallback manual movement
      rootRef.current.position.addScaledVector(
        new THREE.Vector3(move.x, 0, move.z), 1
      );
      velY.current += -22 * delta;
      rootRef.current.position.y += velY.current * delta;
      if (rootRef.current.position.y <= 0) {
        rootRef.current.position.y = 0;
        velY.current = 0;
        grounded.current = true;
      }
      playerPosRef.current.copy(rootRef.current.position);
    }

    // ── Animation state machine ───────────────────────────────────────────
    const inp: MoveInput = {
      fwd, bwd, left, right, sprint,
      grounded: grounded.current,
      crouching: crouching.current,
      jumping: velY.current > 0.5,
      rolling: rolling.current,
    };
    const LOCKED_ANIMS: AnimKey[] = ["standToKneel", "kneelToStand"];
    if (!LOCKED_ANIMS.includes(curAnim.current)) {
      transitionTo(resolveAnim(inp, curAnim.current));
    }
  });

  // ── JSX ───────────────────────────────────────────────────────────────────
  //
  // Two separate scene objects:
  //   1. <RigidBody>  — the invisible Rapier physics capsule. Starts at
  //      (0, CAPSULE_CY, 0) so its base sits exactly on the ground.
  //      Rotations locked — yaw handled by rootRef, not physics.
  //
  //   2. <group ref={rootRef}>  — the visible character + camera parent.
  //      Position is synced to the physics body each frame (feet = body.y - CY).
  //      Camera is added as a child via useEffect so it inherits yaw from rootRef.

  return (
    <>
      {/* ── Physics capsule ── */}
      <RigidBody
        ref={playerRBRef}
        type="kinematicPosition"
        position={[0, CAPSULE_CY, 0]}
        colliders={false}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[CAPSULE_HH, CAPSULE_R]} />
      </RigidBody>

      {/* ── Visual group (model + camera) ── */}
      <group ref={rootRef}>
        {/* FBX flip wrapper — applied here so animation system can't undo it */}
        <group ref={modelGroupRef} rotation-y={Math.PI}>
          {modelObj ? (
            <primitive object={modelObj} />
          ) : (
            /* Loading placeholder */
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
    </>
  );
}
