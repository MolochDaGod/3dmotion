import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { RigidBody, CapsuleCollider, useRapier } from "@react-three/rapier";
import { useGameStore, WeaponMode, WEAPON_CYCLE, SPELLS } from "./useGameStore";

// ─── Capsule ──────────────────────────────────────────────────────────────────
const CAPSULE_HH = 0.5;
const CAPSULE_R  = 0.35;
const CAPSULE_CY = CAPSULE_HH + CAPSULE_R;

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

// ─── Shooting cooldowns (ranged only) ─────────────────────────────────────────
const SHOOT_CD: Record<WeaponMode, number> = {
  pistol: 0.12,
  rifle:  0.18,
  sword:  0,
  axe:    0,
  staff:  0,
  bow:    0,    // bow cooldown is managed directly in handleMouseDown (0.9 s per arrow)
};

// ─── Melee timings ────────────────────────────────────────────────────────────
const MELEE_DMG_DELAY  = 350;   // ms after animation start when hit fires
const MELEE_COMBO_WIN  = 0.70;  // s — window after anim ends to chain combo

// ─── Weapon hand-bone rotations ───────────────────────────────────────────────
// For Mixamo-compatible rigs (Meshy AI Corsair King) the right-hand bone's
// local +X axis points toward the fingertips (along the arm extension).
// Most weapon packs (craftpix etc.) model the blade/head along +Y and the
// handle toward -Y. To align handle with grip (bone +X) and blade forward:
//   Euler(0, 0, -π/2)  rotates the weapon's +Y blade → bone +X (correct grip)
//   Euler(0, π, -π/2)  additionally flips blade end vs handle if needed
// The staff (cane) is held vertically — π/2 on X tilts it to stand upright.
// Gun props (Pixel Guns 3D): barrel along +Z, grip along -Y.
//   Pistol: Euler(π/2, 0, 0) tilts barrel to face +X (bone forward dir)
//   Rifle:  same default; scale up since rifle is 2-handed
// Bow prop (craftpix): stave along +Y → left-hand bone, tilt to match draw pose
const SWORD_ROT  = new THREE.Euler(0, 0, -Math.PI / 2);
const AXE_ROT    = new THREE.Euler(0, 0, -Math.PI / 2);
const STAFF_ROT  = new THREE.Euler(Math.PI / 2, 0, 0);
const PISTOL_ROT = new THREE.Euler(Math.PI / 2, 0, 0);
const RIFLE_ROT  = new THREE.Euler(Math.PI / 2, 0, 0);
// Bow is held in LEFT hand — left hand bone +X also points fingertip-ward but
// inverted relative to body. π/2 on X + π on Y gives a reasonable bow pose.
const BOW_ROT    = new THREE.Euler(Math.PI / 2, Math.PI, 0);

// ─── Staff mana costs ─────────────────────────────────────────────────────────
const STAFF_CAST1_COST = 20;
const STAFF_CAST2_COST = 40;
const STAFF_CAST1_DMS  = 480;   // ms — damage moment in Cast1 animation
const STAFF_CAST2_DMS  = 700;   // ms — damage moment in Cast2 animation
const MANA_REGEN_RATE  = 5;     // per second

// ─── Crossfade timings ────────────────────────────────────────────────────────
const FADE_ATK_START = 0.08;   // locomotion → attack initiation
const FADE_ATK_CHAIN = 0.04;   // attack done → queued attack (crisp cut)
const FADE_ATK_REST  = 0.18;   // attack done → return to idle
const FADE_LOCO      = 0.14;   // locomotion ↔ locomotion blend

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

type BowKey =
  | "bowIdle" | "bowWalkFwd" | "bowWalkBwd"
  | "bowStrafeL" | "bowStrafeR"
  | "bowRunFwd" | "bowRunBwd"
  | "bowJump"
  | "bowDraw" | "bowAim" | "bowFire" | "bowBlock"
  | "bowAimWalkFwd" | "bowAimWalkBwd"
  | "bowAimStrafeL" | "bowAimStrafeR";

type AnimKey = PistolKey | RifleKey | MeleeKey | StaffKey | BowKey;

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

const BOW_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "bowIdle",        file: "/models/bowIdle.fbx" },
  { key: "bowWalkFwd",     file: "/models/bowWalkFwd.fbx" },
  { key: "bowWalkBwd",     file: "/models/bowWalkBwd.fbx" },
  { key: "bowStrafeL",     file: "/models/bowStrafeL.fbx" },
  { key: "bowStrafeR",     file: "/models/bowStrafeR.fbx" },
  { key: "bowRunFwd",      file: "/models/bowRunFwd.fbx" },
  { key: "bowRunBwd",      file: "/models/bowRunBwd.fbx" },
  { key: "bowJump",        file: "/models/bowJump.fbx" },
  { key: "bowDraw",        file: "/models/bowDraw.fbx" },
  { key: "bowAim",         file: "/models/bowAim.fbx" },
  { key: "bowFire",        file: "/models/bowFire.fbx" },
  { key: "bowBlock",       file: "/models/bowBlock.fbx" },
  { key: "bowAimWalkFwd",  file: "/models/bowAimWalkFwd.fbx" },
  { key: "bowAimWalkBwd",  file: "/models/bowAimWalkBwd.fbx" },
  { key: "bowAimStrafeL",  file: "/models/bowAimStrafeL.fbx" },
  { key: "bowAimStrafeR",  file: "/models/bowAimStrafeR.fbx" },
];

// ─── LoopOnce animations (non-looping) ────────────────────────────────────────
// These clamp at last frame. Attacks are a subset: BLOCKING_ONCE.
const ONCE_ANIMS = new Set<AnimKey>([
  "meleeAttack1","meleeAttack2","meleeAttack3",
  "meleeCombo1","meleeCombo2","meleeCombo3",
  "pistolCrouchDown","pistolCrouchUp",
  "rifleFire",
  "staffCast1","staffCast2",
  "bowDraw","bowFire",
]);

// ─── Blocking animations — must play fully before queue can run ───────────────
// These are the animations managed by the 1-slot queue system.
const BLOCKING_ONCE = new Set<AnimKey>([
  "meleeAttack1","meleeAttack2","meleeAttack3",
  "meleeCombo1","meleeCombo2","meleeCombo3",
  "staffCast1","staffCast2",
  "rifleFire",
  "bowDraw","bowFire",
]);

// ─── Idle for each weapon mode ────────────────────────────────────────────────
function idleForMode(wm: WeaponMode): AnimKey {
  if (wm === "sword" || wm === "axe") return "meleeIdle";
  if (wm === "rifle") return "rifleIdle";
  if (wm === "staff") return "staffIdle";
  if (wm === "bow")   return "bowIdle";
  return "pistolIdle";
}

// ─── Animation resolver (locomotion only — not called during blocking) ─────────
function resolveAnim(
  wm: WeaponMode,
  fwd: boolean, bwd: boolean, left: boolean, right: boolean,
  sprint: boolean, grounded: boolean, crouching: boolean,
  aiming: boolean,
): AnimKey {

  const isMelee = wm === "sword" || wm === "axe";
  const isRifle = wm === "rifle";
  const isStaff = wm === "staff";
  const isBow   = wm === "bow";
  const moving  = fwd || bwd || left || right;

  if (!grounded) {
    if (isStaff)  return "staffJump";
    if (isMelee)  return "meleeJump";
    if (isRifle)  return "rifleJump";
    if (isBow)    return "bowJump";
    return "pistolJump";
  }

  if (crouching) return isMelee ? "meleeCrouch" : "pistolCrouchIdle";

  if (isStaff) {
    if (!moving) return "staffIdle";
    if (fwd && !bwd) return sprint ? "staffRunFwd" : "staffWalkFwd";
    if (bwd && !fwd) return sprint ? "staffRunBwd" : "staffWalkBwd";
    return "staffIdle";
  }

  if (isBow) {
    if (!moving) return aiming ? "bowAim" : "bowIdle";
    if (aiming) {
      if (fwd && !bwd) return "bowAimWalkFwd";
      if (bwd && !fwd) return "bowAimWalkBwd";
      if (left)  return "bowAimStrafeL";
      if (right) return "bowAimStrafeR";
      return "bowAim";
    }
    if (fwd && !bwd) return sprint ? "bowRunFwd" : "bowWalkFwd";
    if (bwd && !fwd) return sprint ? "bowRunBwd" : "bowWalkBwd";
    if (left)  return "bowStrafeL";
    if (right) return "bowStrafeR";
    return "bowIdle";
  }

  if (isMelee) {
    if (!moving) return "meleeIdle";
    if (fwd && !bwd) return sprint ? "meleeRunFwd" : "meleeWalkFwd";
    if (bwd && !fwd) return sprint ? "meleeRunBwd" : "meleeWalkBwd";
    if (left)  return "meleeStrafeL";
    if (right) return "meleeStrafeR";
    return "meleeIdle";
  }

  if (isRifle) {
    if (!moving) return "rifleIdle";
    if (fwd && !bwd) return sprint ? "rifleRun" : "rifleWalkFwd";
    if (bwd && !fwd) return sprint ? "rifleRunBwd" : "rifleWalkBwd";
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
  if (bwd && !fwd) return "pistolWalkBwd";
  if (left)  return "pistolStrafeL";
  if (right) return "pistolStrafeR";
  return "pistolIdle";
}

// ─── Queue slot type ──────────────────────────────────────────────────────────
type QueueSlot = {
  key:       AnimKey;
  fade:      number;
  manaCost?: number;   // mana consumed when this animation STARTS playing
  dmgMs?:    number;   // ms after start to fire damage
} | null;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlayerProps {
  onShoot: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onMelee: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead:  () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function Player({ onShoot, onMelee, onDead, playerPosRef }: PlayerProps) {
  // ── Scene refs ────────────────────────────────────────────────────────────
  const rootRef       = useRef<THREE.Group>(null!);
  const modelGroupRef       = useRef<THREE.Group>(null!);
  const swordGroupRef       = useRef<THREE.Group>(null!);
  const axeGroupRef         = useRef<THREE.Group>(null!);
  const caneGroupRef        = useRef<THREE.Group>(null!);
  const pistolPropGroupRef  = useRef<THREE.Group>(null!);
  const riflePropGroupRef   = useRef<THREE.Group>(null!);
  const bowPropGroupRef     = useRef<THREE.Group>(null!);
  const playerRBRef   = useRef<any>(null);

  // ── Movement refs ─────────────────────────────────────────────────────────
  const velY     = useRef(0);
  const grounded = useRef(true);
  const yaw      = useRef(0);
  const pitch    = useRef(0);
  const rollCamZ = useRef(0);

  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  const deadFired     = useRef(false);
  const shootCooldown = useRef(0);

  const crouching     = useRef(false);
  const crouchPending = useRef<"kneel" | "stand" | null>(null);

  const rolling      = useRef(false);
  const rollTimer    = useRef(0);
  const rollDir      = useRef(new THREE.Vector3(0, 0, -1));
  const rollCooldown = useRef(0);

  // ── Attack / combo refs ───────────────────────────────────────────────────
  const attackPhase = useRef(0);
  const comboWindow = useRef(0);

  // ── Animation queue system ────────────────────────────────────────────────
  // blockingOnce: true while a BLOCKING_ONCE animation is playing to completion
  // animQueue:    single slot holding the NEXT blocking anim to play (editable until it starts)
  const blockingOnce     = useRef(false);
  const animQueue        = useRef<QueueSlot>(null);
  // These refs are updated every render so mixer callbacks always call the latest version
  const onBlockingDoneRef = useRef<((key: AnimKey) => void) | null>(null);
  const fireDamageRef     = useRef<(() => void) | null>(null);

  // ── THREE animation state ─────────────────────────────────────────────────
  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim    = useRef<AnimKey>("pistolIdle");

  // ── Hand-bone tracking ────────────────────────────────────────────────────
  const handBoneRef      = useRef<THREE.Bone | null>(null);    // right hand
  const leftHandBoneRef  = useRef<THREE.Bone | null>(null);    // left hand (bow)
  const swordQAdj        = useRef(new THREE.Quaternion().setFromEuler(SWORD_ROT));
  const axeQAdj          = useRef(new THREE.Quaternion().setFromEuler(AXE_ROT));
  const caneQAdj         = useRef(new THREE.Quaternion().setFromEuler(STAFF_ROT));
  const pistolPropQAdj   = useRef(new THREE.Quaternion().setFromEuler(PISTOL_ROT));
  const riflePropQAdj    = useRef(new THREE.Quaternion().setFromEuler(RIFLE_ROT));
  const bowQAdj          = useRef(new THREE.Quaternion().setFromEuler(BOW_ROT));

  // ── Model state ───────────────────────────────────────────────────────────
  const [modelObj,      setModelObj]      = useState<THREE.Group | null>(null);
  const [swordObj,      setSwordObj]      = useState<THREE.Group | null>(null);
  const [axeObj,        setAxeObj]        = useState<THREE.Group | null>(null);
  const [caneObj,       setCaneObj]       = useState<THREE.Group | null>(null);
  const [pistolPropObj, setPistolPropObj] = useState<THREE.Group | null>(null);
  const [riflePropObj,  setRiflePropObj]  = useState<THREE.Group | null>(null);
  const [bowPropObj,    setBowPropObj]    = useState<THREE.Group | null>(null);

  // ── Bow aiming state ─────────────────────────────────────────────────────
  const bowAiming = useRef(false);   // RMB held while in bow mode

  const { camera, scene } = useThree();
  const { world }         = useRapier();
  const charCtrl          = useRef<any>(null);

  const {
    health, shoot, reload, ammo, isReloading,
    setInvincible, camera: camSettings,
    setCameraMode, setShowCameraSettings,
    cycleWeapon,
    useMana, regenMana, toggleCharacterPanel,
    selectedSpell, setShowSpellRadial,
    spellCooldown, tickSpellCooldown,
    addMagicProjectile,
  } = useGameStore();

  // ── Always-fresh damage / queue-done callbacks (updated every render) ─────
  // These use refs internally so there's no stale closure issue when called
  // from the mixer's 'finished' event which was set up in a useEffect.

  fireDamageRef.current = () => {
    const dir    = new THREE.Vector3();
    const origin = new THREE.Vector3();
    camera.getWorldDirection(dir);
    camera.getWorldPosition(origin);
    origin.addScaledVector(dir, 0.5);
    onMelee(origin, dir);
  };

  onBlockingDoneRef.current = (_finishedKey: AnimKey) => {
    blockingOnce.current = false;

    const slot = animQueue.current;
    animQueue.current = null;

    if (slot) {
      // ── Play queued animation ──────────────────────────────────────────
      if (slot.manaCost !== undefined) {
        const ok = useMana(slot.manaCost);
        if (!ok) {
          // Not enough mana — fall through to idle
          const wm = useGameStore.getState().weaponMode;
          _rawPlay(idleForMode(wm), FADE_ATK_REST);
          return;
        }
      }
      blockingOnce.current = true;
      _rawPlay(slot.key, slot.fade);
      if (slot.dmgMs) {
        const ms = slot.dmgMs;
        setTimeout(() => fireDamageRef.current?.(), ms);
      }
    } else {
      // ── No queue — return to locomotion idle ───────────────────────────
      const wm = useGameStore.getState().weaponMode;
      _rawPlay(idleForMode(wm), FADE_ATK_REST);
      // Re-open combo window for melee
      if (wm === "sword" || wm === "axe") {
        comboWindow.current = MELEE_COMBO_WIN;
      }
    }
  };

  // ── Raw play helper (direct, no skip-if-same) ─────────────────────────────
  // Used by the queue system where repeating the same anim (e.g. meleeAttack1
  // twice in a row) must start fresh.
  function _rawPlay(key: AnimKey, fade: number) {
    const prev = actionsRef.current[curAnim.current];
    if (prev && curAnim.current !== key) prev.fadeOut(fade);
    const a = actionsRef.current[key];
    if (a) {
      a.reset().fadeIn(fade).play();
      curAnim.current = key;
    }
  }

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
  // Phase 1: model + pistol (serial, model must exist before clips).
  // Phase 2: rifle, melee, staff loaded in parallel (3 serial chains).
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
      if (key === "pistolIdle") {
        action.play();
        curAnim.current = "pistolIdle";
      }
    }

    function loadSeq(
      queue: typeof PISTOL_QUEUE,
      i: number,
      done?: () => void,
    ) {
      if (cancelled || i >= queue.length) { done?.(); return; }
      const { key, file } = queue[i];
      loader.load(
        file,
        (fbx) => {
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

            // ── Animation queue: finished event ──────────────────────────
            // When a BLOCKING_ONCE animation finishes, the always-fresh
            // onBlockingDoneRef.current is called. It either starts the
            // queued animation or fades back to locomotion.
            mixer.addEventListener("finished", (e: any) => {
              const name = e.action.getClip().name as AnimKey;
              if (BLOCKING_ONCE.has(name)) {
                onBlockingDoneRef.current?.(name);
              }
            });

            setModelObj(fbx);
          } else {
            registerClip(key as AnimKey, fbx);
          }
          loadSeq(queue, i + 1, done);
        },
        undefined,
        () => { if (!cancelled) loadSeq(queue, i + 1, done); },
      );
    }

    loadSeq(PISTOL_QUEUE, 0, () => {
      loadSeq(RIFLE_QUEUE  as typeof PISTOL_QUEUE, 0);
      loadSeq(MELEE_QUEUE  as typeof PISTOL_QUEUE, 0);
      loadSeq(STAFF_QUEUE  as typeof PISTOL_QUEUE, 0);
      loadSeq(BOW_QUEUE    as typeof PISTOL_QUEUE, 0);
    });

    return () => {
      cancelled = true;
      mixerRef.current?.stopAllAction();
    };
  }, []);

  // ── Find right-hand and left-hand bones ───────────────────────────────────
  useEffect(() => {
    if (!modelObj) return;
    modelObj.traverse((o) => {
      if (!(o instanceof THREE.Bone)) return;
      const n = o.name.toLowerCase();
      if (n.includes("righthand") || n.includes("hand_r") || n === "right hand") {
        handBoneRef.current = o as THREE.Bone;
      }
      if (n.includes("lefthand") || n.includes("hand_l") || n === "left hand") {
        leftHandBoneRef.current = o as THREE.Bone;
      }
    });
  }, [modelObj]);

  // ── Load weapon models ────────────────────────────────────────────────────
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

  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load("/models/cane1.fbx", (fbx) => {
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

  // ── Load gun prop models (Pixel Guns 3D) ─────────────────────────────────
  // These are static FBX meshes; apply a MeshStandardMaterial since Unity
  // .mat files are not importable in Three.js.
  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load("/models/pistol_prop.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.012);
      fbx.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true;
          (c as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            color: 0x303030, metalness: 0.85, roughness: 0.25,
          });
        }
      });
      fbx.visible = false;
      setPistolPropObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load("/models/rifle_prop.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.013);
      fbx.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true;
          (c as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            color: 0x222222, metalness: 0.9, roughness: 0.2,
          });
        }
      });
      fbx.visible = false;
      setRiflePropObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load bow prop model (craftpix) ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load("/models/bow_prop.fbx", (fbx) => {
      if (cancelled) return;
      fbx.scale.setScalar(0.015);
      fbx.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true;
          (c as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            color: 0x7a4a1a, metalness: 0.1, roughness: 0.8,
          });
        }
      });
      fbx.visible = false;
      setBowPropObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ── ANIMATION HELPERS ────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  // transitionTo — for locomotion only.
  // Skips if same animation. Does NOT interrupt a blocking-once attack.
  const transitionTo = useCallback((next: AnimKey, fade = FADE_LOCO) => {
    if (blockingOnce.current) return;         // never interrupt an attack
    if (curAnim.current === next) return;
    actionsRef.current[curAnim.current]?.fadeOut(fade);
    const a = actionsRef.current[next];
    if (a) {
      a.reset().fadeIn(fade).play();
      curAnim.current = next;
    }
  }, []);

  // requestBlockingAnim — the core of the 1-slot queue system.
  // • If nothing is blocking: starts the animation immediately.
  // • If blocking: replaces (or sets) the queue slot.
  //   The queued animation is "editable" until the current one finishes.
  // • Mana is consumed when the animation actually starts (not on request).
  const requestBlockingAnim = useCallback((slot: NonNullable<QueueSlot>) => {
    if (blockingOnce.current) {
      // Queue it — replaces any existing queued animation
      animQueue.current = slot;
    } else {
      // Play immediately — consume mana now if required
      if (slot.manaCost !== undefined) {
        const ok = useMana(slot.manaCost);
        if (!ok) return;
      }
      blockingOnce.current = true;
      _rawPlay(slot.key, slot.fade);
      if (slot.dmgMs) {
        const ms = slot.dmgMs;
        setTimeout(() => fireDamageRef.current?.(), ms);
      }
    }
  // _rawPlay uses component-level refs, stable enough with empty deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMana]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── ATTACK ACTIONS ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  // Melee swing — selects the right combo animation and queues/plays it.
  const doMeleeAttack = useCallback(() => {
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

    requestBlockingAnim({
      key:   anim,
      // Chain attacks are a sharp cut; first attack blends from locomotion
      fade:  blockingOnce.current ? FADE_ATK_CHAIN : FADE_ATK_START,
      dmgMs: MELEE_DMG_DELAY,
    });
  }, [requestBlockingAnim]);

  // Staff cast — queues/plays a magic cast animation with mana cost.
  const doStaffCast = useCallback((
    castAnim: "staffCast1" | "staffCast2",
    manaCost: number,
    dmgMs:    number,
  ) => {
    requestBlockingAnim({
      key:      castAnim,
      fade:     blockingOnce.current ? FADE_ATK_CHAIN : FADE_ATK_START,
      manaCost,
      dmgMs,
    });
  }, [requestBlockingAnim]);

  // ── Fire selected magic spell (F key) ────────────────────────────────────
  // Works regardless of weapon mode — a separate ability system.
  const doFireSpell = useCallback(() => {
    const store    = useGameStore.getState();
    if (store.spellCooldown > 0) return;

    const spellDef = SPELLS.find((s) => s.id === store.selectedSpell);
    if (!spellDef) return;

    const ok = useMana(spellDef.manaCost);
    if (!ok) return;

    // Set cooldown
    useGameStore.getState().setSpellCooldown(spellDef.cooldown);

    // Capture spawn position and direction from camera
    const dir    = new THREE.Vector3();
    const origin = new THREE.Vector3();
    camera.getWorldDirection(dir);
    camera.getWorldPosition(origin);
    origin.addScaledVector(dir, 0.8);   // spawn slightly in front of player

    addMagicProjectile({
      id:        `spell-${Date.now()}-${Math.random()}`,
      spell:     spellDef,
      position:  [origin.x, origin.y, origin.z],
      direction: [dir.x, dir.y, dir.z],
      spawnedAt: Date.now(),
      maxLife:   spellDef.speed > 0 ? 3.5 : 1.2,
    });

    // Play cast animation if in staff mode
    const wm = store.weaponMode;
    if (wm === "staff") {
      requestBlockingAnim({
        key:  "staffCast1",
        fade: blockingOnce.current ? FADE_ATK_CHAIN : FADE_ATK_START,
      });
    }
  }, [camera, useMana, addMagicProjectile, requestBlockingAnim]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── CROUCH ───────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // ── INPUT HANDLERS ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    const { sensitivity, mode } = useGameStore.getState().camera;
    yaw.current   -= e.movementX * sensitivity;
    pitch.current -= e.movementY * sensitivity;
    const pMax = mode === "fps" ? PITCH_MAX_FPS : PITCH_MAX_TPS;
    pitch.current = Math.max(PITCH_MIN, Math.min(pMax, pitch.current));
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }
      const wm      = useGameStore.getState().weaponMode;
      const isMelee = wm === "sword" || wm === "axe";
      const isStaff = wm === "staff";
      const isBow   = wm === "bow";

      if (isStaff) {
        doStaffCast("staffCast1", STAFF_CAST1_COST, STAFF_CAST1_DMS);
      } else if (isMelee) {
        doMeleeAttack();
      } else if (isBow) {
        // Bow LMB — draw and release arrow
        if (shootCooldown.current > 0) return;
        shootCooldown.current = 0.9;   // ~900 ms between arrows
        requestBlockingAnim({ key: "bowDraw", fade: FADE_ATK_START, dmgMs: 450 });
        // Queue the fire/recoil to play right after draw
        animQueue.current = { key: "bowFire", fade: FADE_ATK_CHAIN };
      } else {
        // Ranged (pistol / rifle)
        if (shootCooldown.current > 0 || isReloading) return;
        const fired = shoot();
        if (fired) {
          shootCooldown.current = SHOOT_CD[wm as "pistol" | "rifle"] ?? 0.15;
          const dir    = new THREE.Vector3();
          const origin = new THREE.Vector3();
          camera.getWorldDirection(dir);
          camera.getWorldPosition(origin);
          origin.addScaledVector(dir, 0.5);
          onShoot(origin, dir);
          if (wm === "rifle") {
            requestBlockingAnim({ key: "rifleFire", fade: FADE_ATK_START });
          }
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
      const isBow   = wm === "bow";

      if (isStaff) {
        doStaffCast("staffCast2", STAFF_CAST2_COST, STAFF_CAST2_DMS);
      } else if (isMelee) {
        transitionTo("meleeBlock", 0.1);
      } else if (isBow) {
        // RMB bow = hold to aim (toggle aim state)
        bowAiming.current = true;
      } else {
        // RMB ranged = quick melee butt
        if (blockingOnce.current) return;
        const dir    = new THREE.Vector3();
        const origin = new THREE.Vector3();
        camera.getWorldDirection(dir);
        camera.getWorldPosition(origin);
        onMelee(origin, dir);
      }
    }
  }, [
    shoot, reload, ammo, isReloading, onShoot, onMelee, camera,
    doMeleeAttack, doStaffCast, requestBlockingAnim, transitionTo,
  ]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 2) {
      bowAiming.current = false;
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (["AltLeft","AltRight","F2","F3","ControlLeft","ControlRight"].includes(e.code)) {
      e.preventDefault();
    }
    keys.current[e.code] = true;

    if (e.code === "KeyR") {
      // R = reload for ranged weapons, open spell radial for staff/magic
      const wm = useGameStore.getState().weaponMode;
      if (wm === "pistol" || wm === "rifle") {
        reload();
      } else {
        setShowSpellRadial(true);
      }
    }

    // F — fire the selected magic spell from the radial wheel
    if (e.code === "KeyF") doFireSpell();

    // Q — cycle weapon
    if (e.code === "KeyQ") {
      cycleWeapon();
      const newWm = useGameStore.getState().weaponMode;
      // Clear queue and blocking state on weapon switch
      blockingOnce.current  = false;
      animQueue.current     = null;
      attackPhase.current   = 0;
      comboWindow.current   = 0;
      transitionTo(idleForMode(newWm), 0.25);
    }

    // C — character panel
    if (e.code === "KeyC") {
      const show = !useGameStore.getState().showCharacterPanel;
      toggleCharacterPanel();
      if (show) document.exitPointerLock();
      else document.body.requestPointerLock();
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
  }, [
    reload, cycleWeapon, transitionTo,
    setCameraMode, setShowCameraSettings,
    startCrouch, endCrouch, setInvincible,
    toggleCharacterPanel,
    setShowSpellRadial, doFireSpell,
  ]);

  const handleKeyUp   = useCallback((e: KeyboardEvent) => { keys.current[e.code] = false; }, []);
  const handlePLC     = useCallback(() => { locked.current = document.pointerLockElement === document.body; }, []);
  const handleCtxMenu = useCallback((e: MouseEvent) => e.preventDefault(), []);

  useEffect(() => {
    document.addEventListener("mousemove",         handleMouseMove);
    document.addEventListener("mousedown",         handleMouseDown);
    document.addEventListener("mouseup",           handleMouseUp);
    document.addEventListener("keydown",           handleKeyDown);
    document.addEventListener("keyup",             handleKeyUp);
    document.addEventListener("pointerlockchange", handlePLC);
    document.addEventListener("contextmenu",       handleCtxMenu);
    return () => {
      document.removeEventListener("mousemove",         handleMouseMove);
      document.removeEventListener("mousedown",         handleMouseDown);
      document.removeEventListener("mouseup",           handleMouseUp);
      document.removeEventListener("keydown",           handleKeyDown);
      document.removeEventListener("keyup",             handleKeyUp);
      document.removeEventListener("pointerlockchange", handlePLC);
      document.removeEventListener("contextmenu",       handleCtxMenu);
    };
  }, [handleMouseMove, handleMouseDown, handleMouseUp, handleKeyDown, handleKeyUp, handlePLC, handleCtxMenu]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── GAME LOOP ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    if (!rootRef.current) return;
    if (health <= 0 && !deadFired.current) { deadFired.current = true; onDead(); return; }

    // ── Timers ─────────────────────────────────────────────────────────────
    if (shootCooldown.current > 0) shootCooldown.current -= delta;
    if (rollCooldown.current  > 0) rollCooldown.current  -= delta;
    if (comboWindow.current   > 0) comboWindow.current   -= delta;
    tickSpellCooldown(delta);

    // Staff mana regen
    if (useGameStore.getState().weaponMode === "staff") {
      regenMana(MANA_REGEN_RATE * delta);
    }

    // ── Roll timer ─────────────────────────────────────────────────────────
    if (rollTimer.current > 0) {
      rollTimer.current -= delta;
      if (rollTimer.current <= 0) {
        rolling.current = false;
        if (setInvincible) setInvincible(false);
      }
    }

    mixerRef.current?.update(delta);
    rollCamZ.current *= Math.max(0, 1 - 14 * delta);

    // ── Camera ─────────────────────────────────────────────────────────────
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

    // ── Weapon model + hand-bone tracking ──────────────────────────────────
    const wm        = useGameStore.getState().weaponMode;
    const isMelee   = wm === "sword" || wm === "axe";
    const isStaffWm = wm === "staff";
    const isBowWm   = wm === "bow";
    const hand      = handBoneRef.current;
    const leftHand  = leftHandBoneRef.current;

    function trackWeapon(
      grp: THREE.Group,
      obj: THREE.Group | null,
      show: boolean,
      qAdj: THREE.Quaternion,
      boneOverride?: THREE.Bone | null,
    ) {
      if (!obj) return;
      obj.visible = show;
      const bone = boneOverride !== undefined ? boneOverride : hand;
      if (show && bone && mode !== "fps") {
        bone.getWorldPosition(grp.position);
        bone.getWorldQuaternion(grp.quaternion);
        grp.quaternion.multiply(qAdj);
      }
    }

    if (swordGroupRef.current && swordObj)
      trackWeapon(swordGroupRef.current, swordObj, isMelee && wm === "sword" && mode !== "fps", swordQAdj.current);
    if (axeGroupRef.current && axeObj)
      trackWeapon(axeGroupRef.current, axeObj, isMelee && wm === "axe" && mode !== "fps", axeQAdj.current);
    if (caneGroupRef.current && caneObj)
      trackWeapon(caneGroupRef.current, caneObj, isStaffWm && mode !== "fps", caneQAdj.current);
    if (pistolPropGroupRef.current && pistolPropObj)
      trackWeapon(pistolPropGroupRef.current, pistolPropObj, wm === "pistol" && mode !== "fps", pistolPropQAdj.current);
    if (riflePropGroupRef.current && riflePropObj)
      trackWeapon(riflePropGroupRef.current, riflePropObj, wm === "rifle" && mode !== "fps", riflePropQAdj.current);
    if (bowPropGroupRef.current && bowPropObj)
      trackWeapon(bowPropGroupRef.current, bowPropObj, isBowWm && mode !== "fps", bowQAdj.current, leftHand);

    // ── Movement input ──────────────────────────────────────────────────────
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
    } else if (!crouching.current && !crouchPending.current) {
      if (fwd)   move.add(fwdVec);
      if (bwd)   move.sub(fwdVec);
      if (left)  move.sub(rgtVec);
      if (right) move.add(rgtVec);
      if (move.lengthSq() > 0)
        move.normalize().multiplyScalar((sprint ? RUN_SPEED : WALK_SPEED) * delta);
    }

    if (keys.current["Space"] && grounded.current && !crouching.current && !rolling.current) {
      velY.current     = JUMP_FORCE;
      grounded.current = false;
    }

    // ── Rapier physics ──────────────────────────────────────────────────────
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
            // Land animation (only if not mid-attack)
            if (!blockingOnce.current) {
              const cwm      = useGameStore.getState().weaponMode;
              const landAnim = cwm === "staff"  ? "staffIdle"
                : (cwm === "sword" || cwm === "axe") ? "meleeIdle"
                : cwm === "rifle" ? "rifleIdle" : "pistolLand";
              transitionTo(landAnim, 0.08);
              setTimeout(() => {
                if (grounded.current && !blockingOnce.current) {
                  transitionTo(idleForMode(useGameStore.getState().weaponMode), 0.2);
                }
              }, 320);
            }
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

    // ── Locomotion animation state machine ─────────────────────────────────
    // Only runs when NO blocking attack is playing — attacks drive themselves
    // through the queue system (finished event → next slot or idle).
    if (!blockingOnce.current) {
      const next = resolveAnim(
        wm, fwd, bwd, left, right, sprint,
        grounded.current, crouching.current,
        bowAiming.current,
      );
      if (next !== curAnim.current) transitionTo(next);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ── JSX ──────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

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

      <group ref={swordGroupRef}>
        {swordObj && <primitive object={swordObj} />}
      </group>
      <group ref={axeGroupRef}>
        {axeObj && <primitive object={axeObj} />}
      </group>
      <group ref={caneGroupRef}>
        {caneObj && <primitive object={caneObj} />}
      </group>
      <group ref={pistolPropGroupRef}>
        {pistolPropObj && <primitive object={pistolPropObj} />}
      </group>
      <group ref={riflePropGroupRef}>
        {riflePropObj && <primitive object={riflePropObj} />}
      </group>
      <group ref={bowPropGroupRef}>
        {bowPropObj && <primitive object={bowPropObj} />}
      </group>
    </>
  );
}
