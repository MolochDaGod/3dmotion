import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { RigidBody, CapsuleCollider, useRapier } from "@react-three/rapier";
import { useGameStore } from "./useGameStore";

// ─── Animation keys ───────────────────────────────────────────────────────────

type RangedKey =
  | "idle" | "walkFwd" | "walkBwd" | "strafeL" | "strafeR"
  | "walkArcL" | "walkArcR" | "runFwd"
  | "jump" | "jumpLand"
  | "standToKneel" | "kneelingIdle" | "kneelToStand";

type MeleeKey =
  | "meleeIdle" | "meleeWalkFwd" | "meleeWalkBwd"
  | "meleeStrafeL" | "meleeStrafeR"
  | "meleeRunFwd" | "meleeRunBwd"
  | "meleeAttack1" | "meleeAttack2" | "meleeAttack3"
  | "meleeCombo1" | "meleeCombo2" | "meleeCombo3"
  | "meleeJump"
  | "meleeCrouch" | "meleeBlock";

type AnimKey = RangedKey | MeleeKey;

export interface PlayerProps {
  onShoot: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onMelee: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead:  () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

// ─── Physics capsule ──────────────────────────────────────────────────────────

const CAPSULE_HH = 0.5;
const CAPSULE_R  = 0.35;
const CAPSULE_CY = CAPSULE_HH + CAPSULE_R; // 0.85m — capsule centre above feet

// ─── Movement ─────────────────────────────────────────────────────────────────

const WALK_SPEED    = 4.5;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 9;
const PITCH_MIN     = -Math.PI / 2.5;
const PITCH_MAX_TPS =  Math.PI / 8;
const PITCH_MAX_FPS =  Math.PI / 2 - 0.05;
const EYE_HEIGHT    = 1.70;

// Roll
const ROLL_SPEED    = 14;
const ROLL_DURATION = 0.45;
const ROLL_COOLDOWN = 1.2;

// Melee attack timing (seconds)
const MELEE_ATK_COOLDOWN   = 0.85;  // lock-out between attacks
const MELEE_DMG_DELAY_MS   = 380;   // ms into animation when damage hits
const MELEE_COMBO_WINDOW   = 0.65;  // s after last attack that LMB escalates to combo

// ─── Load queues ──────────────────────────────────────────────────────────────
// Split into two phases so ranged mode is playable before melee loads.

const RANGED_QUEUE: Array<{ key: AnimKey | "__model__"; file: string }> = [
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

const MELEE_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "meleeIdle",     file: "/models/melee idle.fbx" },
  { key: "meleeWalkFwd",  file: "/models/melee walk forward.fbx" },
  { key: "meleeWalkBwd",  file: "/models/melee walk backward.fbx" },
  { key: "meleeStrafeL",  file: "/models/melee strafe left.fbx" },
  { key: "meleeStrafeR",  file: "/models/melee strafe right.fbx" },
  { key: "meleeRunFwd",   file: "/models/melee run.fbx" },
  { key: "meleeRunBwd",   file: "/models/melee run backward.fbx" },
  { key: "meleeAttack1",  file: "/models/melee attack 1.fbx" },
  { key: "meleeAttack2",  file: "/models/melee attack 2.fbx" },
  { key: "meleeAttack3",  file: "/models/melee attack 3.fbx" },
  { key: "meleeCombo1",   file: "/models/melee combo 1.fbx" },
  { key: "meleeCombo2",   file: "/models/melee combo 2.fbx" },
  { key: "meleeCombo3",   file: "/models/melee combo 3.fbx" },
  { key: "meleeJump",     file: "/models/melee jump.fbx" },
  { key: "meleeCrouch",   file: "/models/melee crouch idle.fbx" },
  { key: "meleeBlock",    file: "/models/melee block.fbx" },
];

// ─── Sword attachment offsets (applied after matching the hand bone) ──────────
// The right-hand bone in Mixamo rigs usually has its local X pointing along
// the forearm, Y up the palm.  These offsets make the blade point forward.
const SWORD_POS    = new THREE.Vector3(0, 0, -0.05);      // grip centre in hand space
const SWORD_ROT    = new THREE.Euler(0, 0, Math.PI / 2);  // blade pointing forward

// ─── Animation resolver ───────────────────────────────────────────────────────

interface MoveInput {
  fwd: boolean; bwd: boolean; left: boolean; right: boolean;
  sprint: boolean; grounded: boolean; crouching: boolean;
  jumping: boolean; rolling: boolean; attacking: boolean;
  mode: "ranged" | "melee";
}

function resolveAnim(inp: MoveInput, cur: AnimKey): AnimKey {
  const { mode, attacking } = inp;

  // Attack/combo animations play themselves out
  const ATTACK_ANIMS: AnimKey[] = [
    "meleeAttack1","meleeAttack2","meleeAttack3",
    "meleeCombo1","meleeCombo2","meleeCombo3",
    "standToKneel","kneelToStand",
  ];
  if (ATTACK_ANIMS.includes(cur) && attacking) return cur;

  if (!inp.grounded) {
    return mode === "melee" ? "meleeJump" : (inp.jumping ? "jump" : "jumpLand");
  }

  if (inp.crouching) {
    return mode === "melee" ? "meleeCrouch" : "kneelingIdle";
  }

  if (inp.rolling) return mode === "melee" ? "meleeRunFwd" : "runFwd";

  const { fwd, bwd, left, right, sprint } = inp;
  const moving = fwd || bwd || left || right;

  if (mode === "ranged") {
    if (!moving) return "idle";
    if (fwd && !bwd) {
      if (!left && !right) return sprint ? "runFwd" : "walkFwd";
      if (left)  return "walkArcL";
      if (right) return "walkArcR";
    }
    if (bwd && !fwd) return "walkBwd";
    if (left)  return "strafeL";
    if (right) return "strafeR";
    return "idle";
  } else {
    // melee mode
    if (!moving) return "meleeIdle";
    if (fwd && !bwd) return sprint ? "meleeRunFwd" : "meleeWalkFwd";
    if (bwd && !fwd) return sprint ? "meleeRunBwd" : "meleeWalkBwd";
    if (left)  return "meleeStrafeL";
    if (right) return "meleeStrafeR";
    return "meleeIdle";
  }
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function Player({ onShoot, onMelee, onDead, playerPosRef }: PlayerProps) {
  const rootRef       = useRef<THREE.Group>(null!);
  const modelGroupRef = useRef<THREE.Group>(null!);
  const swordGroupRef = useRef<THREE.Group>(null!); // sword lives in world space
  const playerRBRef   = useRef<any>(null);

  // Physics
  const velY     = useRef(0);
  const grounded = useRef(true);

  // Look
  const yaw   = useRef(0);
  const pitch = useRef(0);

  // Camera roll tilt (decays to 0)
  const rollCamZ = useRef(0);

  // Input
  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  // Cooldowns
  const deadFired      = useRef(false);
  const shootCooldown  = useRef(0);
  const meleeCooldown  = useRef(0);   // shared between ranged-melee(RMB) and sword attacks

  // Crouch
  const crouching     = useRef(false);
  const crouchPending = useRef<"kneel" | "stand" | null>(null);

  // Roll
  const rolling        = useRef(false);
  const rollTimer      = useRef(0);
  const rollDir        = useRef(new THREE.Vector3(0, 0, -1));
  const rollCooldown   = useRef(0);

  // Melee attack state
  const attacking        = useRef(false);
  const attackPhase      = useRef(0);   // cycles 0→1→2 through attack variants
  const comboWindow      = useRef(0);   // time remaining in combo escalation window

  // Animation
  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim    = useRef<AnimKey>("idle");

  // Sword bone tracking
  const handBoneRef  = useRef<THREE.Bone | null>(null);
  const swordQAdj    = useRef(new THREE.Quaternion().setFromEuler(SWORD_ROT));

  const [modelObj, setModelObj] = useState<THREE.Group | null>(null);
  const [swordObj, setSwordObj] = useState<THREE.Group | null>(null);

  const { camera, scene } = useThree();
  const { world }         = useRapier();
  const charCtrl          = useRef<any>(null);

  const {
    health, shoot, reload, ammo, isReloading,
    setInvincible, camera: camSettings,
    setCameraMode, setShowCameraSettings,
    weaponMode, setWeaponMode,
  } = useGameStore();

  // ── Create Rapier character controller ───────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const ctrl = world.createCharacterController(0.05);
    ctrl.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    ctrl.setMinSlopeSlideAngle(30 * Math.PI / 180);
    try { ctrl.enableSnapToGround(0.3); } catch { /* version may differ */ }
    ctrl.setApplyImpulsesToDynamicBodies(false);
    charCtrl.current = ctrl;
    return () => { world.removeCharacterController(ctrl); };
  }, [world]);

  // ── Parent camera to rootRef ──────────────────────────────────────────────
  useEffect(() => {
    camera.rotation.order = "YXZ";
    const root = rootRef.current;
    if (root) root.add(camera);
    camera.position.set(camSettings.shoulderX, camSettings.shoulderY, camSettings.shoulderZ);
    camera.rotation.set(0, 0, 0);
    return () => { scene.add(camera); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, scene]);

  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = camSettings.fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, camSettings.fov]);

  // ── Load character model + ranged animations ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loader  = new FBXLoader();
    let mixer: THREE.AnimationMixer | null = null;

    const loadIndex = (queue: typeof RANGED_QUEUE, i: number) => {
      if (cancelled || i >= queue.length) return;
      const { key, file } = queue[i];

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
            // Attack/combo animations play once then stop
            if ((key as string).includes("melee") && (
              key.toString().includes("Attack") ||
              key.toString().includes("Combo")
            )) {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
            }
            if (key === "standToKneel" || key === "kneelToStand") {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
            }
            actionsRef.current[key as AnimKey] = action;
            if (key === "idle") { action.play(); curAnim.current = "idle"; }
          }
        }
        loadIndex(queue, i + 1);
      }, undefined, () => { if (!cancelled) loadIndex(queue, i + 1); });
    };

    // Phase 1: ranged
    loadIndex(RANGED_QUEUE, 0);

    // Phase 2: melee (starts only after model is loaded — mixer needs to exist)
    // We poll for mixer readiness before kicking off melee loads
    let meleeStarted = false;
    const startMelee = () => {
      if (meleeStarted || !mixerRef.current) return;
      meleeStarted = true;
      loadIndex(MELEE_QUEUE as typeof RANGED_QUEUE, 0);
    };
    const interval = setInterval(() => {
      startMelee();
      if (meleeStarted) clearInterval(interval);
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(interval);
      mixerRef.current?.stopAllAction();
    };
  }, []);

  // ── Find right-hand bone after model loads ────────────────────────────────
  useEffect(() => {
    if (!modelObj) return;
    modelObj.traverse((obj) => {
      if (!(obj instanceof THREE.Bone)) return;
      const n = obj.name.toLowerCase();
      if (n.includes("righthand") || n.includes("hand_r") ||
          n.includes("r_hand")    || n.includes("right hand")) {
        handBoneRef.current = obj as THREE.Bone;
      }
    });
  }, [modelObj]);

  // ── Load sword model ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loader  = new FBXLoader();
    loader.load("/models/sword.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.01);
      // Apply texture if available
      fbx.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) c.castShadow = true;
      });
      fbx.visible = false;
      setSwordObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Animation helper ──────────────────────────────────────────────────────

  const transitionTo = useCallback((next: AnimKey, fade = 0.15) => {
    if (curAnim.current === next) return;
    actionsRef.current[curAnim.current]?.fadeOut(fade);
    const a = actionsRef.current[next];
    if (a) { a.reset().fadeIn(fade).play(); curAnim.current = next; }
  }, []);

  // ── Melee attack trigger ──────────────────────────────────────────────────

  const doSwordAttack = useCallback(() => {
    if (meleeCooldown.current > 0) return;

    // Combo escalation: if in combo window AND already attacked once, use combo anims
    let animKey: AnimKey;
    if (comboWindow.current > 0 && attackPhase.current > 0) {
      const ci = Math.min(attackPhase.current - 1, 2);
      animKey = (["meleeCombo1", "meleeCombo2", "meleeCombo3"] as const)[ci];
    } else {
      const ai = attackPhase.current % 3;
      animKey = (["meleeAttack1", "meleeAttack2", "meleeAttack3"] as const)[ai];
    }

    attackPhase.current++;
    attacking.current    = true;
    meleeCooldown.current = MELEE_ATK_COOLDOWN;
    comboWindow.current   = MELEE_COMBO_WINDOW;

    transitionTo(animKey, 0.05);

    // Deal damage at the impact frame
    setTimeout(() => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      origin.addScaledVector(dir, 0.5);
      onMelee(origin, dir);
    }, MELEE_DMG_DELAY_MS);

    // Return to locomotion after animation finishes
    const duration = MELEE_ATK_COOLDOWN * 1000 + 100;
    setTimeout(() => {
      attacking.current = false;
      if (useGameStore.getState().weaponMode === "melee") {
        transitionTo("meleeIdle", 0.2);
      }
    }, duration);
  }, [camera, onMelee, transitionTo]);

  // ── Crouch ────────────────────────────────────────────────────────────────

  const startCrouch = useCallback(() => {
    if (crouching.current || crouchPending.current) return;
    crouchPending.current = "kneel";
    crouching.current = true;
    transitionTo(weaponMode === "melee" ? "meleeCrouch" : "standToKneel", 0.1);
    setTimeout(() => {
      if (crouching.current) {
        transitionTo(weaponMode === "melee" ? "meleeCrouch" : "kneelingIdle", 0.15);
      }
      crouchPending.current = null;
    }, 650);
  }, [transitionTo, weaponMode]);

  const endCrouch = useCallback(() => {
    if (!crouching.current || crouchPending.current) return;
    crouchPending.current = "stand";
    crouching.current = false;
    transitionTo(weaponMode === "melee" ? "meleeIdle" : "kneelToStand", 0.1);
    setTimeout(() => {
      transitionTo(weaponMode === "melee" ? "meleeIdle" : "idle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo, weaponMode]);

  // ── Mouse look ────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    const { sensitivity, mode } = useGameStore.getState().camera;
    yaw.current   -= e.movementX * sensitivity;
    pitch.current -= e.movementY * sensitivity;
    const pMax = mode === "fps" ? PITCH_MAX_FPS : PITCH_MAX_TPS;
    pitch.current = Math.max(PITCH_MIN, Math.min(pMax, pitch.current));
  }, []);

  // ── Mouse buttons ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const { weaponMode: wm } = useGameStore.getState();

    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }

      if (wm === "ranged") {
        // Shoot
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
      } else {
        // Melee sword attack
        doSwordAttack();
      }
    }

    if (e.button === 2) {
      if (!locked.current) return;
      if (wm === "ranged") {
        // RMB in ranged mode = proximity melee (existing system)
        if (meleeCooldown.current > 0) return;
        meleeCooldown.current = 0.7;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const origin = new THREE.Vector3();
        camera.getWorldPosition(origin);
        onMelee(origin, dir);
      } else {
        // RMB in melee = block
        transitionTo("meleeBlock", 0.1);
      }
    }
  }, [shoot, reload, ammo, isReloading, onShoot, onMelee, camera, doSwordAttack, transitionTo]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (["AltLeft","AltRight","F2","F3","ControlLeft","ControlRight"].includes(e.code)) {
      e.preventDefault();
    }

    keys.current[e.code] = true;

    if (e.code === "KeyR") reload();

    // Q — toggle weapon mode
    if (e.code === "KeyQ") {
      const store = useGameStore.getState();
      const next  = store.weaponMode === "ranged" ? "melee" : "ranged";
      setWeaponMode(next);
      // Transition to the base idle for the new mode
      transitionTo(next === "melee" ? "meleeIdle" : "idle", 0.25);
      attacking.current = false;
      attackPhase.current = 0;
      comboWindow.current = 0;
    }

    // F2 — camera mode toggle
    if (e.code === "F2") {
      const store = useGameStore.getState();
      setCameraMode(store.camera.mode === "tps" ? "fps" : "tps");
    }

    // F3 — settings panel
    if (e.code === "F3") {
      const store = useGameStore.getState();
      const next  = !store.showCameraSettings;
      setShowCameraSettings(next);
      if (next) document.exitPointerLock();
    }

    // Alt — crouch
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

      const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const rgt = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      const d   = new THREE.Vector3();
      if (keys.current["KeyW"]) d.add(fwd);
      if (keys.current["KeyS"]) d.sub(fwd);
      if (keys.current["KeyA"]) d.sub(rgt);
      if (keys.current["KeyD"]) d.add(rgt);
      if (d.lengthSq() < 0.01) d.copy(fwd);
      rollDir.current.copy(d.normalize());

      const rightBias = rollDir.current.dot(rgt);
      rollCamZ.current = -rightBias * 0.18;

      if (setInvincible) setInvincible(true);
    }
  }, [reload, setWeaponMode, setCameraMode, setShowCameraSettings,
      startCrouch, endCrouch, setInvincible, transitionTo]);

  const handleKeyUp    = useCallback((e: KeyboardEvent) => { keys.current[e.code] = false; }, []);
  const handlePLC      = useCallback(() => { locked.current = document.pointerLockElement === document.body; }, []);
  const handleCtxMenu  = useCallback((e: MouseEvent) => e.preventDefault(), []);

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

    // Cooldowns
    if (shootCooldown.current > 0) shootCooldown.current  -= delta;
    if (meleeCooldown.current > 0) meleeCooldown.current  -= delta;
    if (rollCooldown.current  > 0) rollCooldown.current   -= delta;
    if (comboWindow.current   > 0) comboWindow.current    -= delta;

    // Roll timer
    if (rollTimer.current > 0) {
      rollTimer.current -= delta;
      if (rollTimer.current <= 0) {
        rolling.current = false;
        if (setInvincible) setInvincible(false);
      }
    }

    mixerRef.current?.update(delta);

    // ── Camera Z tilt decays ──────────────────────────────────────────────
    rollCamZ.current *= Math.max(0, 1 - 14 * delta);

    // ── Camera mode / position ────────────────────────────────────────────
    const { mode, shoulderX, shoulderY, shoulderZ } = useGameStore.getState().camera;
    camera.position.set(
      mode === "fps" ? 0       : shoulderX,
      mode === "fps" ? EYE_HEIGHT : shoulderY,
      mode === "fps" ? 0.1    : shoulderZ,
    );
    camera.rotation.x = pitch.current;
    camera.rotation.y = 0;
    camera.rotation.z = rollCamZ.current;

    // ── Yaw → rootRef (camera + model both inherit) ───────────────────────
    rootRef.current.rotation.y = yaw.current;

    // ── Model visibility (fps = hide) ─────────────────────────────────────
    if (modelGroupRef.current) {
      modelGroupRef.current.visible = (mode !== "fps");
    }

    // ── Sword tracking via hand-bone world transform ───────────────────────
    // The sword group lives in world space; we move it to the hand bone each frame.
    const swordG = swordGroupRef.current;
    const hand   = handBoneRef.current;
    const sw     = swordObj;
    if (swordG && sw) {
      const isInMelee = useGameStore.getState().weaponMode === "melee" && mode !== "fps";
      sw.visible = isInMelee;

      if (isInMelee && hand) {
        hand.getWorldPosition(swordG.position);
        hand.getWorldQuaternion(swordG.quaternion);
        swordG.quaternion.multiply(swordQAdj.current);
        swordG.position.addScaledVector(
          new THREE.Vector3(SWORD_POS.x, SWORD_POS.y, SWORD_POS.z)
            .applyQuaternion(swordG.quaternion),
          1
        );
      }
    }

    // ── Input ─────────────────────────────────────────────────────────────
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
      move.copy(rollDir.current).multiplyScalar(ROLL_SPEED * delta);
    } else if (!crouching.current && !crouchPending.current && !attacking.current) {
      if (fwd)   move.add(fwdVec);
      if (bwd)   move.sub(fwdVec);
      if (left)  move.sub(rgtVec);
      if (right) move.add(rgtVec);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar((sprint ? RUN_SPEED : WALK_SPEED) * delta);
      }
    }

    // ── Jump ──────────────────────────────────────────────────────────────
    if (keys.current["Space"] && grounded.current && !crouching.current && !rolling.current) {
      velY.current    = JUMP_FORCE;
      grounded.current = false;
    }

    // ── Rapier character controller ───────────────────────────────────────
    const rb   = playerRBRef.current;
    const ctrl = charCtrl.current;

    if (rb && ctrl) {
      velY.current += -22 * delta;
      move.y = velY.current * delta;

      const collider = rb.collider(0);
      if (collider) {
        ctrl.computeColliderMovement(collider, { x: move.x, y: move.y, z: move.z });
        const resolved   = ctrl.computedMovement();
        const isGrounded = ctrl.computedGrounded();

        if (isGrounded && velY.current < 0) {
          velY.current = 0;
          if (!grounded.current) {
            grounded.current = true;
            const wm = useGameStore.getState().weaponMode;
            transitionTo(wm === "melee" ? "meleeIdle" : "jumpLand", 0.08);
            setTimeout(() => {
              if (grounded.current) {
                transitionTo(useGameStore.getState().weaponMode === "melee" ? "meleeIdle" : "idle", 0.2);
              }
            }, 320);
          }
        }
        grounded.current = isGrounded;

        const pos  = rb.translation();
        const next = { x: pos.x + resolved.x, y: pos.y + resolved.y, z: pos.z + resolved.z };
        rb.setNextKinematicTranslation(next);

        rootRef.current.position.set(next.x, next.y - CAPSULE_CY, next.z);
        playerPosRef.current.copy(rootRef.current.position);
      }
    } else {
      // Fallback: manual
      rootRef.current.position.addScaledVector(new THREE.Vector3(move.x, 0, move.z), 1);
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
    const wm = useGameStore.getState().weaponMode;
    const inp: MoveInput = {
      fwd, bwd, left, right, sprint,
      grounded: grounded.current,
      crouching: crouching.current,
      jumping: velY.current > 0.5,
      rolling: rolling.current,
      attacking: attacking.current,
      mode: wm,
    };
    const next = resolveAnim(inp, curAnim.current);
    if (next !== curAnim.current) transitionTo(next);
  });

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Rapier physics capsule */}
      <RigidBody
        ref={playerRBRef}
        type="kinematicPosition"
        position={[0, CAPSULE_CY, 0]}
        colliders={false}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[CAPSULE_HH, CAPSULE_R]} />
      </RigidBody>

      {/* Visual character (model + camera parent) */}
      <group ref={rootRef}>
        {/* Flip wrapper: corrects FBX +Z facing → player -Z forward */}
        <group ref={modelGroupRef} rotation-y={Math.PI}>
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

      {/* Sword — world-space group, tracked to hand bone in useFrame */}
      <group ref={swordGroupRef}>
        {swordObj && <primitive object={swordObj} />}
      </group>
    </>
  );
}
