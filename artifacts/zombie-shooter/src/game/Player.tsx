import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { RigidBody, CapsuleCollider, useRapier } from "@react-three/rapier";
import { useGameStore, WeaponMode, WEAPON_CYCLE } from "./useGameStore";

// ─── Capsule ──────────────────────────────────────────────────────────────────
const CAPSULE_HH = 0.5;
const CAPSULE_R  = 0.35;
const CAPSULE_CY = CAPSULE_HH + CAPSULE_R;   // 0.85 m — centre above feet

// ─── Movement ─────────────────────────────────────────────────────────────────
const WALK_SPEED    = 4.5;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 9;
const PITCH_MIN     = -Math.PI / 2.5;
const PITCH_MAX_TPS =  Math.PI / 8;
const PITCH_MAX_FPS =  Math.PI / 2 - 0.05;
const EYE_HEIGHT    = 1.70;

const ROLL_SPEED    = 14;
const ROLL_DURATION = 0.45;
const ROLL_COOLDOWN = 1.2;

// ─── Shooting cooldowns per weapon ───────────────────────────────────────────
const SHOOT_CD: Record<WeaponMode, number> = {
  pistol: 0.12,
  rifle:  0.18,  // semi-auto cadence
  sword:  0,
  axe:    0,
  staff:  0,
};

// ─── Melee timings ────────────────────────────────────────────────────────────
const MELEE_ATK_CD      = 0.85;
const MELEE_DMG_DELAY   = 380;   // ms
const MELEE_COMBO_WIN   = 0.65;  // s

// ─── Weapon hand-bone attachment rotations ────────────────────────────────────
const SWORD_ROT = new THREE.Euler(0, 0, Math.PI / 2);
const AXE_ROT   = new THREE.Euler(0, 0, Math.PI / 2);
const STAFF_ROT = new THREE.Euler(Math.PI / 2, 0, 0);

// ─── Staff mana costs ─────────────────────────────────────────────────────────
const STAFF_CAST1_COST = 20;
const STAFF_CAST2_COST = 40;
const STAFF_CAST1_CD   = 0.7;
const STAFF_CAST2_CD   = 1.4;
const MANA_REGEN_RATE  = 5;  // per second

// ─── Animation keys ───────────────────────────────────────────────────────────

type PistolKey =
  | "pistolIdle" | "pistolWalkFwd" | "pistolWalkBwd"
  | "pistolStrafeL" | "pistolStrafeR"
  | "pistolWalkArcL" | "pistolWalkArcR"
  | "pistolRun"
  | "pistolJump" | "pistolLand"
  | "pistolCrouchDown" | "pistolCrouchIdle" | "pistolCrouchUp";

type RifleKey =
  | "rifleIdle" | "rifleWalkFwd" | "rifleWalkBwd"
  | "rifleStrafeL" | "rifleStrafeR"
  | "rifleRun" | "rifleRunBwd"
  | "rifleJump"
  | "rifleFire" | "rifleReload";

type MeleeKey =
  | "meleeIdle" | "meleeWalkFwd" | "meleeWalkBwd"
  | "meleeStrafeL" | "meleeStrafeR"
  | "meleeRunFwd" | "meleeRunBwd"
  | "meleeAttack1" | "meleeAttack2" | "meleeAttack3"
  | "meleeCombo1"  | "meleeCombo2"  | "meleeCombo3"
  | "meleeJump" | "meleeCrouch" | "meleeBlock";

type StaffKey =
  | "staffIdle" | "staffWalkFwd" | "staffWalkBwd"
  | "staffRunFwd" | "staffRunBwd"
  | "staffCast1" | "staffCast2"
  | "staffJump";

type AnimKey = PistolKey | RifleKey | MeleeKey | StaffKey;

// ─── Load queues ──────────────────────────────────────────────────────────────

const PISTOL_QUEUE: Array<{ key: AnimKey | "__model__"; file: string }> = [
  { key: "__model__",      file: "/models/Meshy_AI_Corsair_King_0323082850_texture_fbx.fbx" },
  { key: "pistolIdle",     file: "/models/pistol idle.fbx" },
  { key: "pistolWalkFwd",  file: "/models/pistol walk.fbx" },
  { key: "pistolWalkBwd",  file: "/models/pistol walk backward.fbx" },
  { key: "pistolStrafeL",  file: "/models/pistol strafe.fbx" },
  { key: "pistolStrafeR",  file: "/models/pistol strafe (2).fbx" },
  { key: "pistolWalkArcL", file: "/models/pistol walk arc.fbx" },
  { key: "pistolWalkArcR", file: "/models/pistol walk arc (2).fbx" },
  { key: "pistolRun",      file: "/models/pistol run.fbx" },
  { key: "pistolJump",     file: "/models/pistol jump.fbx" },
  { key: "pistolLand",     file: "/models/pistol jump (2).fbx" },
  { key: "pistolCrouchDown", file: "/models/pistol stand to kneel.fbx" },
  { key: "pistolCrouchIdle", file: "/models/pistol kneeling idle.fbx" },
  { key: "pistolCrouchUp",   file: "/models/pistol kneel to stand.fbx" },
];

const RIFLE_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "rifleIdle",     file: "/models/rifle idle.fbx" },
  { key: "rifleWalkFwd",  file: "/models/rifle walk forward.fbx" },
  { key: "rifleWalkBwd",  file: "/models/rifle walk backward.fbx" },
  { key: "rifleStrafeL",  file: "/models/rifle strafe left.fbx" },
  { key: "rifleStrafeR",  file: "/models/rifle strafe right.fbx" },
  { key: "rifleRun",      file: "/models/rifle run.fbx" },
  { key: "rifleRunBwd",   file: "/models/rifle run backward.fbx" },
  { key: "rifleJump",     file: "/models/rifle jump.fbx" },
  { key: "rifleFire",     file: "/models/rifle fire.fbx" },
  { key: "rifleReload",   file: "/models/rifle reload.fbx" },
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

const STAFF_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "staffIdle",    file: "/models/staffIdle.fbx" },
  { key: "staffWalkFwd", file: "/models/staffWalkFwd.fbx" },
  { key: "staffWalkBwd", file: "/models/staffWalkBwd.fbx" },
  { key: "staffRunFwd",  file: "/models/staffRunFwd.fbx" },
  { key: "staffRunBwd",  file: "/models/staffRunBwd.fbx" },
  { key: "staffCast1",   file: "/models/staffCast1.fbx" },
  { key: "staffCast2",   file: "/models/staffCast2.fbx" },
  { key: "staffJump",    file: "/models/staffJump.fbx" },
];

// ─── One-time attack / utility animations (LoopOnce) ─────────────────────────
const ONCE_ANIMS = new Set<AnimKey>([
  "meleeAttack1","meleeAttack2","meleeAttack3",
  "meleeCombo1","meleeCombo2","meleeCombo3",
  "pistolCrouchDown","pistolCrouchUp",
  "rifleFire",
  "staffCast1","staffCast2",
]);

// ─── Animation resolver ───────────────────────────────────────────────────────

function resolveAnim(
  wm: WeaponMode,
  fwd: boolean, bwd: boolean, left: boolean, right: boolean,
  sprint: boolean, grounded: boolean, crouching: boolean,
  attacking: boolean, curAnim: AnimKey,
): AnimKey {

  // Sustain attack / transition animations until they self-complete
  if (ONCE_ANIMS.has(curAnim) && attacking) return curAnim;

  const isMelee  = wm === "sword" || wm === "axe";
  const isRifle  = wm === "rifle";
  const isStaff  = wm === "staff";
  const moving   = fwd || bwd || left || right;

  if (!grounded) {
    if (isStaff) return "staffJump";
    return isMelee ? "meleeJump" : isRifle ? "rifleJump" : "pistolJump";
  }

  if (crouching) return isMelee ? "meleeCrouch" : "pistolCrouchIdle";

  if (isStaff) {
    if (!moving) return "staffIdle";
    if (fwd  && !bwd) return sprint ? "staffRunFwd" : "staffWalkFwd";
    if (bwd  && !fwd) return sprint ? "staffRunBwd" : "staffWalkBwd";
    return "staffIdle";
  }

  if (isMelee) {
    if (!moving) return "meleeIdle";
    if (fwd  && !bwd) return sprint ? "meleeRunFwd" : "meleeWalkFwd";
    if (bwd  && !fwd) return sprint ? "meleeRunBwd" : "meleeWalkBwd";
    if (left)  return "meleeStrafeL";
    if (right) return "meleeStrafeR";
    return "meleeIdle";
  }

  if (isRifle) {
    if (!moving) return "rifleIdle";
    if (fwd  && !bwd) return sprint ? "rifleRun" : "rifleWalkFwd";
    if (bwd  && !fwd) return sprint ? "rifleRunBwd" : "rifleWalkBwd";
    if (left)  return "rifleStrafeL";
    if (right) return "rifleStrafeR";
    return "rifleIdle";
  }

  // Pistol
  if (!moving) return "pistolIdle";
  if (fwd && !bwd) {
    if (!left && !right) return sprint ? "pistolRun" : "pistolWalkFwd";
    if (left)  return "pistolWalkArcL";
    if (right) return "pistolWalkArcR";
  }
  if (bwd  && !fwd) return "pistolWalkBwd";
  if (left)  return "pistolStrafeL";
  if (right) return "pistolStrafeR";
  return "pistolIdle";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlayerProps {
  onShoot: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onMelee: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead:  () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function Player({ onShoot, onMelee, onDead, playerPosRef }: PlayerProps) {
  const rootRef       = useRef<THREE.Group>(null!);
  const modelGroupRef = useRef<THREE.Group>(null!);
  const swordGroupRef = useRef<THREE.Group>(null!);  // world-space sword
  const axeGroupRef   = useRef<THREE.Group>(null!);  // world-space axe
  const caneGroupRef  = useRef<THREE.Group>(null!);  // world-space cane
  const playerRBRef   = useRef<any>(null);

  const velY     = useRef(0);
  const grounded = useRef(true);
  const yaw      = useRef(0);
  const pitch    = useRef(0);
  const rollCamZ = useRef(0);

  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  const deadFired     = useRef(false);
  const shootCooldown = useRef(0);
  const meleeCooldown = useRef(0);

  const crouching      = useRef(false);
  const crouchPending  = useRef<"kneel" | "stand" | null>(null);

  const rolling       = useRef(false);
  const rollTimer     = useRef(0);
  const rollDir       = useRef(new THREE.Vector3(0, 0, -1));
  const rollCooldown  = useRef(0);

  const attacking    = useRef(false);
  const attackPhase  = useRef(0);
  const comboWindow  = useRef(0);
  const staffCastCD  = useRef(0);

  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim    = useRef<AnimKey>("pistolIdle");

  const handBoneRef = useRef<THREE.Bone | null>(null);
  const swordQAdj   = useRef(new THREE.Quaternion().setFromEuler(SWORD_ROT));
  const axeQAdj     = useRef(new THREE.Quaternion().setFromEuler(AXE_ROT));
  const caneQAdj    = useRef(new THREE.Quaternion().setFromEuler(STAFF_ROT));

  const [modelObj, setModelObj] = useState<THREE.Group | null>(null);
  const [swordObj, setSwordObj] = useState<THREE.Group | null>(null);
  const [axeObj,   setAxeObj]   = useState<THREE.Group | null>(null);
  const [caneObj,  setCaneObj]  = useState<THREE.Group | null>(null);

  const { camera, scene } = useThree();
  const { world }         = useRapier();
  const charCtrl          = useRef<any>(null);

  const {
    health, shoot, reload, ammo, isReloading,
    setInvincible, camera: camSettings,
    setCameraMode, setShowCameraSettings,
    cycleWeapon,
    useMana, regenMana, toggleCharacterPanel,
  } = useGameStore();

  // ── Rapier character controller ───────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const ctrl = world.createCharacterController(0.05);
    ctrl.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    ctrl.setMinSlopeSlideAngle(30 * Math.PI / 180);
    try { ctrl.enableSnapToGround(0.3); } catch { /* version variance */ }
    ctrl.setApplyImpulsesToDynamicBodies(false);
    charCtrl.current = ctrl;
    return () => { world.removeCharacterController(ctrl); };
  }, [world]);

  // ── Camera parenting ──────────────────────────────────────────────────────
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

  // ── Sequential FBX loader ─────────────────────────────────────────────────
  // Loads items one by one to avoid GPU/memory spikes.
  useEffect(() => {
    let cancelled = false;
    const loader  = new FBXLoader();
    let mixer: THREE.AnimationMixer | null = null;

    function registerClip(key: AnimKey, fbx: THREE.Group) {
      const clip = fbx.animations[0];
      if (!clip || !mixer) return;
      clip.name = key as string;
      const action = mixer.clipAction(clip);
      if (ONCE_ANIMS.has(key)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actionsRef.current[key] = action;
      if (key === "pistolIdle") { action.play(); curAnim.current = "pistolIdle"; }
    }

    function loadSeq(
      queue: typeof PISTOL_QUEUE,
      i: number,
      done?: () => void,
    ) {
      if (cancelled || i >= queue.length) { done?.(); return; }
      const { key, file } = queue[i];
      loader.load(file, (fbx) => {
        if (cancelled) return;
        if (key === "__model__") {
          fbx.scale.setScalar(0.01);
          fbx.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; }
          });
          mixer = new THREE.AnimationMixer(fbx);
          mixerRef.current = mixer;
          setModelObj(fbx);
        } else {
          registerClip(key as AnimKey, fbx);
        }
        loadSeq(queue, i + 1, done);
      }, undefined, () => { if (!cancelled) loadSeq(queue, i + 1, done); });
    }

    // Phase 1 – model + pistol; then rifle, melee, and staff in parallel phases
    loadSeq(PISTOL_QUEUE, 0, () => {
      loadSeq(RIFLE_QUEUE  as typeof PISTOL_QUEUE, 0);
      loadSeq(MELEE_QUEUE  as typeof PISTOL_QUEUE, 0);
      loadSeq(STAFF_QUEUE  as typeof PISTOL_QUEUE, 0);
    });

    return () => {
      cancelled = true;
      mixerRef.current?.stopAllAction();
    };
  }, []);

  // ── Find right-hand bone ──────────────────────────────────────────────────
  useEffect(() => {
    if (!modelObj) return;
    modelObj.traverse((o) => {
      if (!(o instanceof THREE.Bone)) return;
      const n = o.name.toLowerCase();
      if (n.includes("righthand") || n.includes("hand_r") || n.includes("right hand")) {
        handBoneRef.current = o as THREE.Bone;
      }
    });
  }, [modelObj]);

  // ── Load sword ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load("/models/sword.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.01);
      fbx.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      fbx.visible = false;
      setSwordObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load axe ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load("/models/axe.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.01);
      fbx.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      fbx.visible = false;
      setAxeObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load cane (magic staff) ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loader  = new FBXLoader();
    loader.load("/models/cane1.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.012);
      const texLoader = new THREE.TextureLoader();
      texLoader.load("/models/cane_texture.png", (tex) => {
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        fbx.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            c.castShadow = true;
            (c as THREE.Mesh).material = new THREE.MeshStandardMaterial({ map: tex });
          }
        });
      });
      fbx.visible = false;
      setCaneObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Animation helper ──────────────────────────────────────────────────────
  const transitionTo = useCallback((next: AnimKey, fade = 0.15) => {
    if (curAnim.current === next) return;
    actionsRef.current[curAnim.current]?.fadeOut(fade);
    const a = actionsRef.current[next];
    if (a) {
      a.reset().fadeIn(fade).play();
      curAnim.current = next;
    }
  }, []);

  // ── Melee swing ───────────────────────────────────────────────────────────
  const doMeleeAttack = useCallback(() => {
    if (meleeCooldown.current > 0) return;

    let anim: AnimKey;
    if (comboWindow.current > 0 && attackPhase.current > 0) {
      anim = (["meleeCombo1","meleeCombo2","meleeCombo3"] as const)[
        Math.min(attackPhase.current - 1, 2)
      ];
    } else {
      anim = (["meleeAttack1","meleeAttack2","meleeAttack3"] as const)[
        attackPhase.current % 3
      ];
    }

    attackPhase.current++;
    attacking.current     = true;
    meleeCooldown.current = MELEE_ATK_CD;
    comboWindow.current   = MELEE_COMBO_WIN;

    transitionTo(anim, 0.05);

    setTimeout(() => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      origin.addScaledVector(dir, 0.5);
      onMelee(origin, dir);
    }, MELEE_DMG_DELAY);

    setTimeout(() => {
      attacking.current = false;
      const wm = useGameStore.getState().weaponMode;
      if (wm === "sword" || wm === "axe") transitionTo("meleeIdle", 0.2);
    }, MELEE_ATK_CD * 1000 + 80);
  }, [camera, onMelee, transitionTo]);

  // ── Crouch ────────────────────────────────────────────────────────────────
  const startCrouch = useCallback(() => {
    if (crouching.current || crouchPending.current) return;
    crouchPending.current = "kneel";
    crouching.current     = true;
    const wm = useGameStore.getState().weaponMode;
    const isMelee = wm === "sword" || wm === "axe";
    transitionTo(isMelee ? "meleeCrouch" : "pistolCrouchDown", 0.1);
    setTimeout(() => {
      if (crouching.current) transitionTo(isMelee ? "meleeCrouch" : "pistolCrouchIdle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo]);

  const endCrouch = useCallback(() => {
    if (!crouching.current || crouchPending.current) return;
    crouchPending.current = "stand";
    crouching.current     = false;
    const wm = useGameStore.getState().weaponMode;
    const isMelee = wm === "sword" || wm === "axe";
    transitionTo(isMelee ? "meleeIdle" : "pistolCrouchUp", 0.1);
    setTimeout(() => {
      transitionTo(isMelee ? "meleeIdle" : "pistolIdle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo]);

  // ── Mouse move ────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    const { sensitivity, mode } = useGameStore.getState().camera;
    yaw.current   -= e.movementX * sensitivity;
    pitch.current -= e.movementY * sensitivity;
    const pMax = mode === "fps" ? PITCH_MAX_FPS : PITCH_MAX_TPS;
    pitch.current = Math.max(PITCH_MIN, Math.min(pMax, pitch.current));
  }, []);

  // ── Staff casts ────────────────────────────────────────────────────────────
  const doStaffCast = useCallback((castAnim: "staffCast1" | "staffCast2", manaCost: number, cd: number) => {
    if (staffCastCD.current > 0) return;
    const spent = useMana(manaCost);
    if (!spent) return;
    attacking.current   = true;
    staffCastCD.current = cd;
    transitionTo(castAnim, 0.08);

    const delay = castAnim === "staffCast1" ? 480 : 700;
    setTimeout(() => {
      const dir    = new THREE.Vector3();
      const origin = new THREE.Vector3();
      camera.getWorldDirection(dir);
      camera.getWorldPosition(origin);
      origin.addScaledVector(dir, 0.5);
      onMelee(origin, dir);
    }, delay);

    setTimeout(() => {
      attacking.current = false;
      if (useGameStore.getState().weaponMode === "staff") transitionTo("staffIdle", 0.25);
    }, cd * 1000 + 100);
  }, [camera, onMelee, useMana, transitionTo]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }
      const wm = useGameStore.getState().weaponMode;
      const isMelee = wm === "sword" || wm === "axe";
      const isStaff = wm === "staff";

      if (isStaff) {
        doStaffCast("staffCast1", STAFF_CAST1_COST, STAFF_CAST1_CD);
      } else if (isMelee) {
        doMeleeAttack();
      } else {
        // Ranged — pistol or rifle
        if (shootCooldown.current > 0 || isReloading) return;
        const fired = shoot();
        if (fired) {
          shootCooldown.current = SHOOT_CD[wm as "pistol" | "rifle"];
          const dir    = new THREE.Vector3();
          const origin = new THREE.Vector3();
          camera.getWorldDirection(dir);
          camera.getWorldPosition(origin);
          origin.addScaledVector(dir, 0.5);
          onShoot(origin, dir);
          if (wm === "rifle") transitionTo("rifleFire", 0.05);
        } else if (ammo <= 0) {
          reload();
        }
      }
    }

    if (e.button === 2) {
      if (!locked.current) return;
      const wm      = useGameStore.getState().weaponMode;
      const isMelee = wm === "sword" || wm === "axe";
      const isStaff = wm === "staff";
      if (isStaff) {
        doStaffCast("staffCast2", STAFF_CAST2_COST, STAFF_CAST2_CD);
      } else if (isMelee) {
        transitionTo("meleeBlock", 0.1);
      } else {
        if (meleeCooldown.current > 0) return;
        meleeCooldown.current = 0.7;
        const dir    = new THREE.Vector3();
        const origin = new THREE.Vector3();
        camera.getWorldDirection(dir);
        camera.getWorldPosition(origin);
        onMelee(origin, dir);
      }
    }
  }, [shoot, reload, ammo, isReloading, onShoot, onMelee, camera, doMeleeAttack, doStaffCast, transitionTo]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (["AltLeft","AltRight","F2","F3","ControlLeft","ControlRight"].includes(e.code)) {
      e.preventDefault();
    }
    keys.current[e.code] = true;

    if (e.code === "KeyR") reload();

    // Q — cycle through pistol → rifle → sword → axe → staff
    if (e.code === "KeyQ") {
      cycleWeapon();                                      // updates store synchronously
      const newWm = useGameStore.getState().weaponMode;   // read the new mode
      const toIdle: Record<WeaponMode, AnimKey> = {
        pistol: "pistolIdle",
        rifle:  "rifleIdle",
        sword:  "meleeIdle",
        axe:    "meleeIdle",
        staff:  "staffIdle",
      };
      transitionTo(toIdle[newWm] ?? "pistolIdle", 0.25);
      attacking.current   = false;
      attackPhase.current = 0;
      comboWindow.current = 0;
      staffCastCD.current = 0;
    }

    // C — toggle character panel
    if (e.code === "KeyC") {
      const store = useGameStore.getState();
      const show  = !store.showCharacterPanel;
      toggleCharacterPanel();
      if (show) document.exitPointerLock();
      else      document.body.requestPointerLock();
    }

    // F2 — camera mode toggle
    if (e.code === "F2") {
      const store = useGameStore.getState();
      setCameraMode(store.camera.mode === "tps" ? "fps" : "tps");
    }

    // F3 — settings panel
    if (e.code === "F3") {
      const store = useGameStore.getState();
      const show  = !store.showCameraSettings;
      setShowCameraSettings(show);
      if (show) document.exitPointerLock();
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
  }, [reload, cycleWeapon, setCameraMode, setShowCameraSettings,
      startCrouch, endCrouch, setInvincible, transitionTo,
      toggleCharacterPanel]);

  const handleKeyUp   = useCallback((e: KeyboardEvent) => { keys.current[e.code] = false; }, []);
  const handlePLC     = useCallback(() => { locked.current = document.pointerLockElement === document.body; }, []);
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

    if (shootCooldown.current > 0) shootCooldown.current -= delta;
    if (meleeCooldown.current > 0) meleeCooldown.current -= delta;
    if (rollCooldown.current  > 0) rollCooldown.current  -= delta;
    if (comboWindow.current   > 0) comboWindow.current   -= delta;
    if (staffCastCD.current   > 0) staffCastCD.current   -= delta;

    // Staff mana regen
    const wmNow = useGameStore.getState().weaponMode;
    if (wmNow === "staff") regenMana(MANA_REGEN_RATE * delta);

    if (rollTimer.current > 0) {
      rollTimer.current -= delta;
      if (rollTimer.current <= 0) {
        rolling.current = false;
        if (setInvincible) setInvincible(false);
      }
    }

    mixerRef.current?.update(delta);
    rollCamZ.current *= Math.max(0, 1 - 14 * delta);

    // Camera position
    const { mode, shoulderX, shoulderY, shoulderZ } = useGameStore.getState().camera;
    camera.position.set(
      mode === "fps" ? 0         : shoulderX,
      mode === "fps" ? EYE_HEIGHT : shoulderY,
      mode === "fps" ? 0.1       : shoulderZ,
    );
    camera.rotation.x = pitch.current;
    camera.rotation.y = 0;
    camera.rotation.z = rollCamZ.current;

    rootRef.current.rotation.y = yaw.current;
    if (modelGroupRef.current) modelGroupRef.current.visible = (mode !== "fps");

    // ── Weapon model visibility + hand-bone tracking ───────────────────────
    const wm      = useGameStore.getState().weaponMode;
    const isMelee = wm === "sword" || wm === "axe";
    const isStaffWm = wm === "staff";
    const hand    = handBoneRef.current;

    function trackWeapon(grp: THREE.Group, obj: THREE.Group | null, show: boolean, qAdj: THREE.Quaternion) {
      if (!obj) return;
      obj.visible = show;
      if (show && hand && mode !== "fps") {
        hand.getWorldPosition(grp.position);
        hand.getWorldQuaternion(grp.quaternion);
        grp.quaternion.multiply(qAdj);
      }
    }

    if (swordGroupRef.current && swordObj)
      trackWeapon(swordGroupRef.current, swordObj, isMelee && wm === "sword" && mode !== "fps", swordQAdj.current);
    if (axeGroupRef.current && axeObj)
      trackWeapon(axeGroupRef.current, axeObj, isMelee && wm === "axe" && mode !== "fps", axeQAdj.current);
    if (caneGroupRef.current && caneObj)
      trackWeapon(caneGroupRef.current, caneObj, isStaffWm && mode !== "fps", caneQAdj.current);

    // ── Movement input ─────────────────────────────────────────────────────
    const fwdVec = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const rgtVec = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const fwd    = !!(keys.current["KeyW"] || keys.current["ArrowUp"]);
    const bwd    = !!(keys.current["KeyS"] || keys.current["ArrowDown"]);
    const left   = !!(keys.current["KeyA"] || keys.current["ArrowLeft"]);
    const right  = !!(keys.current["KeyD"] || keys.current["ArrowRight"]);
    const sprint = !!(keys.current["ShiftLeft"] || keys.current["ShiftRight"]) && !crouching.current;

    const move = new THREE.Vector3();
    if (rolling.current && rollTimer.current > 0) {
      move.copy(rollDir.current).multiplyScalar(ROLL_SPEED * delta);
    } else if (!crouching.current && !crouchPending.current && !attacking.current) {
      if (fwd)   move.add(fwdVec);
      if (bwd)   move.sub(fwdVec);
      if (left)  move.sub(rgtVec);
      if (right) move.add(rgtVec);
      if (move.lengthSq() > 0)
        move.normalize().multiplyScalar((sprint ? RUN_SPEED : WALK_SPEED) * delta);
    }

    if (keys.current["Space"] && grounded.current && !crouching.current && !rolling.current) {
      velY.current    = JUMP_FORCE;
      grounded.current = false;
    }

    // ── Rapier physics ─────────────────────────────────────────────────────
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
            const cwm = useGameStore.getState().weaponMode;
            const landAnim: AnimKey = (cwm === "sword" || cwm === "axe") ? "meleeIdle"
              : cwm === "rifle" ? "rifleIdle"
              : cwm === "staff" ? "staffIdle"
              : "pistolLand";
            transitionTo(landAnim, 0.08);
            setTimeout(() => {
              if (grounded.current) {
                const cwm2 = useGameStore.getState().weaponMode;
                const idleAnim: AnimKey = (cwm2 === "sword" || cwm2 === "axe") ? "meleeIdle"
                  : cwm2 === "rifle" ? "rifleIdle"
                  : cwm2 === "staff" ? "staffIdle"
                  : "pistolIdle";
                transitionTo(idleAnim, 0.2);
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

    // ── Animation state machine ────────────────────────────────────────────
    const next = resolveAnim(
      wm, fwd, bwd, left, right, sprint,
      grounded.current, crouching.current, attacking.current, curAnim.current,
    );
    if (next !== curAnim.current) transitionTo(next);
  });

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      <RigidBody
        ref={playerRBRef}
        type="kinematicPosition"
        position={[0, CAPSULE_CY, 0]}
        colliders={false}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[CAPSULE_HH, CAPSULE_R]} />
      </RigidBody>

      {/* Visual root — camera + character model */}
      <group ref={rootRef}>
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

      {/* Melee weapon models — world-space, tracked to hand bone in useFrame */}
      <group ref={swordGroupRef}>
        {swordObj && <primitive object={swordObj} />}
      </group>
      <group ref={axeGroupRef}>
        {axeObj && <primitive object={axeObj} />}
      </group>
      {/* Magic staff — world-space, tracked to hand bone in useFrame */}
      <group ref={caneGroupRef}>
        {caneObj && <primitive object={caneObj} />}
      </group>
    </>
  );
}
