import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RigidBody, CapsuleCollider, useRapier } from "@react-three/rapier";
import { CG_PLAYER } from "./CollisionLayers";
import { getIslandHeight, getTerrainHeight } from "./terrain";
import { useGameStore, WeaponMode, WEAPON_CYCLE, SPELLS } from "./useGameStore";
import { useCharacterStore } from "./useCharacterStore";
import { WEAPON_SKILLS, type SkillDef } from "./SkillSystem";
import { SkillEffects, type SkillEffectsHandle } from "./SkillEffects";
import type { SkillHitPayload } from "./Game";
import {
  CHARACTER, ANIM_PISTOL, ANIM_RIFLE, ANIM_MELEE,
  ANIM_STAFF, ANIM_BOW, ANIM_SHIELD_SWORD, ANIM_TRAVERSE,
  WEAPON_PROPS, WEAPON_TEXTURES, texPath,
} from "./assets/manifest";
import { useWeaponFit } from "./useWeaponFit";

// ─── Weapon-scale normalisation ───────────────────────────────────────────────
// FBX files may be authored in centimetres, inches, or metres.
// We record the longest bounding-box dimension of each prop at load time
// (userData.rawLongestDim, in native units, scale=1) then compute the final
// bone-relative scale at attach time as:
//   obj.scale.setScalar( desiredMetres / rawLongestDim )
// This makes every model unit-agnostic: a 90 cm sword is 90 cm regardless of
// whether the FBX was authored in cm or inches.
function storeFbxRawSize(fbx: THREE.Group): void {
  const box  = new THREE.Box3().setFromObject(fbx);
  const size = new THREE.Vector3();
  box.getSize(size);
  fbx.userData.rawLongestDim = Math.max(size.x, size.y, size.z) || 1;
}

// ─── Capsule ──────────────────────────────────────────────────────────────────
// Racalvin is 60 in = 1.524 m.  Capsule total = 2·HH + 2·R = 1.44 m (snug fit).
// CY = HH + R = distance from feet to the capsule centre-of-mass.
const CAPSULE_HH = 0.42;   // half-height of cylinder  (was 0.50 → 1.70 m body)
const CAPSULE_R  = 0.30;   // hemisphere radius         (was 0.35)
const CAPSULE_CY = CAPSULE_HH + CAPSULE_R;   // 0.72 m

// ─── Movement ─────────────────────────────────────────────────────────────────
const WALK_SPEED    = 4.5;
const RUN_SPEED     = 9.0;
const JUMP_FORCE    = 9;
const PITCH_MIN        = -Math.PI / 2.5;
const PITCH_MAX_TPS    =  Math.PI / 8;
const PITCH_MAX_ACTION =  Math.PI / 5;   // action cam — slight downward look freedom
// ARPG isometric camera — Diablo / Path of Exile feel.
// -45° pitch + equal height/depth → classic "diamond" isometric angle.
// Closer to the player than a pure overhead RTS cam so the world feels
// immersive and character details are legible.
const ARPG_PITCH       = -Math.PI / 4;  // -45° — true isometric downward angle
const ARPG_CAM_Y       = 9.5;           // units above player (was 14 in RTS mode)
const ARPG_CAM_Z       = 9.5;           // units behind player → arctan(9.5/9.5)=45°
const EYE_HEIGHT    = 1.42;   // eye level ≈ 93% of 1.524 m (was 1.70, matched old oversized capsule)
const ROLL_SPEED     = 14;
const ROLL_DURATION  = 0.45;
const ROLL_COOLDOWN  = 1.2;
const DODGE_SPEED    = 10;          // directional dodge (double-tap or Ctrl)
const DODGE_DURATION = 0.38;        // physics window for the dodge impulse
const DOUBLE_TAP_MS  = 280;         // max gap between two taps to register a dodge
const CROUCH_WALK_TS = 0.55;        // timeScale for locomotion anims while crouching

// ─── Shooting cooldowns (ranged only) ─────────────────────────────────────────
const SHOOT_CD: Record<WeaponMode, number> = {
  pistol: 0.12,
  rifle:  0.18,
  sword:  0,
  axe:    0,
  staff:  0,
  bow:    0,    // bow cooldown is managed directly in handleMouseDown (0.9 s per arrow)
  shield: 0.45, // per-swing cooldown (4 attacks have their own blocking once)
};

// ─── Melee timings ────────────────────────────────────────────────────────────
const MELEE_DMG_DELAY  = 350;   // ms after animation start when hit fires
const MELEE_COMBO_WIN  = 0.70;  // s — window after anim ends to chain combo

// ─── Weapon-fit pipeline ──────────────────────────────────────────────────────
// Fit data (bone-relative position, rotation, scale) is fetched from the API
// via useWeaponFit() and applied once in a useEffect that parents each weapon
// mesh directly to the appropriate hand bone.  No per-frame world-transform
// copy is needed — Three.js propagates the bone's world matrix to all children
// automatically before the renderer draws each frame.

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

// ─── Water + Climbing constants ───────────────────────────────────────────────
const WATER_GRAV      = -5;     // reduced gravity while submerged (buoyancy)
const SWIM_SPEED      = 3.0;    // horizontal speed in water (m/s)
const SWIM_UP_FORCE   = 3.5;    // velY added per second while Space is held
const SWIM_MAX_VEL    = 2.5;    // max absolute velY in water
const SWIM_SURFACE_Y  = 0.4;    // metres above waterY the player floats at
const CLIMB_UP_DUR    = 1.4;    // seconds — matches Mixamo "Climbing Up Wall" clip
const CLIMB_VAULT_Y   = 2.0;    // how high (m) the player teleports on a vault
const WALL_BLOCK_FRAC = 0.25;   // resolved/attempted ratio below this → "wall blocked"

// ─── Animation keys ───────────────────────────────────────────────────────────

type PistolKey =
  | "pistolIdle" | "pistolWalkFwd" | "pistolWalkBwd"
  | "pistolStrafeL" | "pistolStrafeR"
  | "pistolWalkArcL" | "pistolWalkArcR"
  | "pistolWalkBwdArcL" | "pistolWalkBwdArcR"
  | "pistolRun" | "pistolRunArcL" | "pistolRunArcR"
  | "pistolRunBwd" | "pistolRunBwdArcL" | "pistolRunBwdArcR"
  | "pistolJump" | "pistolLand"
  | "pistolCrouchDown" | "pistolCrouchIdle" | "pistolCrouchUp";

type RifleKey =
  | "rifleIdle" | "rifleWalkFwd" | "rifleWalkBwd"
  | "rifleStrafeL" | "rifleStrafeR"
  | "rifleRun" | "rifleRunBwd"
  | "rifleJump"
  | "rifleFire" | "rifleReload"
  | "rifleTurnL" | "rifleTurnR";

type MeleeKey =
  | "meleeIdle" | "meleeWalkFwd" | "meleeWalkBwd"
  | "meleeStrafeL" | "meleeStrafeR"
  | "meleeRunFwd" | "meleeRunBwd"
  | "meleeAttack1" | "meleeAttack2" | "meleeAttack3"
  | "meleeCombo1"  | "meleeCombo2"  | "meleeCombo3"
  | "meleeJump" | "meleeCrouch" | "meleeBlock"
  | "meleeStandFromCrouch";

type StaffKey =
  | "staffIdle" | "staffIdle2"
  | "staffWalkFwd" | "staffWalkBwd"
  | "staffRunFwd" | "staffRunBwd"
  | "staffCast1" | "staffCast2"
  | "staffJump" | "staffHitLarge" | "staffHitSmall"
  | "staffDeath";

type BowKey =
  | "bowIdle" | "bowWalkFwd" | "bowWalkBwd"
  | "bowStrafeL" | "bowStrafeR"
  | "bowRunFwd" | "bowRunBwd"
  | "bowJump"
  | "bowDraw" | "bowAim" | "bowFire" | "bowBlock"
  | "bowAimWalkFwd" | "bowAimWalkBwd"
  | "bowAimStrafeL" | "bowAimStrafeR";

type DodgeKey =
  | "dodgeFwd" | "dodgeBwd" | "dodgeL" | "dodgeR";

// ── Sword + Shield set ────────────────────────────────────────────────────────
type SwordShieldKey =
  | "ssIdle" | "ssRunFwd" | "ssRunBwd"
  | "ssStrafeL" | "ssStrafeR"
  | "ssBlockIdle" | "ssBlock" | "ssBlockHit"
  | "ssAttack1" | "ssAttack2" | "ssAttack3" | "ssAttack4"
  | "ssDrawSword";

type TraverseKey =
  | "climbUp"      // Climbing To Top  — LoopOnce,   vaults a ledge
  | "climbing"     // Climbing         — LoopRepeat,  general wall-climb cycle
  | "climbLadder"  // Climbing Ladder  — LoopRepeat,  ladder-specific cycle
  | "treading"     // Treading Water   — LoopRepeat,  stationary in water
  | "swimming"     // Swimming         — LoopRepeat,  moving in water
  | "swimToEdge";  // Swimming To Edge — LoopOnce,    exiting water

type AnimKey = PistolKey | RifleKey | MeleeKey | StaffKey | BowKey | DodgeKey | SwordShieldKey | TraverseKey;

// ─── Load queues (paths sourced from assets/manifest.ts) ──────────────────────

const PISTOL_QUEUE: Array<{ key: AnimKey | "__model__"; file: string }> = [
  { key: "__model__",           file: CHARACTER.mesh },
  { key: "pistolIdle",          file: ANIM_PISTOL.idle },
  { key: "pistolWalkFwd",       file: ANIM_PISTOL.walkFwd },
  { key: "pistolWalkBwd",       file: ANIM_PISTOL.walkBwd },
  { key: "pistolStrafeL",       file: ANIM_PISTOL.strafeL },
  { key: "pistolStrafeR",       file: ANIM_PISTOL.strafeR },
  { key: "pistolWalkArcL",      file: ANIM_PISTOL.walkArcL },
  { key: "pistolWalkArcR",      file: ANIM_PISTOL.walkArcR },
  { key: "pistolWalkBwdArcL",   file: ANIM_PISTOL.walkBwdArcL },
  { key: "pistolWalkBwdArcR",   file: ANIM_PISTOL.walkBwdArcR },
  { key: "pistolRun",           file: ANIM_PISTOL.run },
  { key: "pistolRunArcL",       file: ANIM_PISTOL.runArcL },
  { key: "pistolRunArcR",       file: ANIM_PISTOL.runArcR },
  { key: "pistolRunBwd",        file: ANIM_PISTOL.runBwd },
  { key: "pistolRunBwdArcL",    file: ANIM_PISTOL.runBwdArcL },
  { key: "pistolRunBwdArcR",    file: ANIM_PISTOL.runBwdArcR },
  { key: "pistolJump",          file: ANIM_PISTOL.jump },
  { key: "pistolLand",          file: ANIM_PISTOL.land },
  { key: "pistolCrouchDown",    file: ANIM_PISTOL.crouchDown },
  { key: "pistolCrouchIdle",    file: ANIM_PISTOL.crouchIdle },
  { key: "pistolCrouchUp",      file: ANIM_PISTOL.crouchUp },
  // Dodge — reuse melee FBX clips; loaded at startup so dodge works without melee equip.
  { key: "dodgeFwd", file: ANIM_MELEE.runFwd },
  { key: "dodgeBwd", file: ANIM_MELEE.runBwd },
  { key: "dodgeL",   file: ANIM_MELEE.strafeL },
  { key: "dodgeR",   file: ANIM_MELEE.strafeR },
];

const RIFLE_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "rifleIdle",    file: ANIM_RIFLE.idle },
  { key: "rifleWalkFwd", file: ANIM_RIFLE.walkFwd },
  { key: "rifleWalkBwd", file: ANIM_RIFLE.walkBwd },
  { key: "rifleStrafeL", file: ANIM_RIFLE.strafeL },
  { key: "rifleStrafeR", file: ANIM_RIFLE.strafeR },
  { key: "rifleRun",     file: ANIM_RIFLE.run },
  { key: "rifleRunBwd",  file: ANIM_RIFLE.runBwd },
  { key: "rifleJump",    file: ANIM_RIFLE.jump },
  { key: "rifleFire",    file: ANIM_RIFLE.fire },
  { key: "rifleReload",  file: ANIM_RIFLE.reload },
  { key: "rifleTurnL",   file: ANIM_RIFLE.turnL },
  { key: "rifleTurnR",   file: ANIM_RIFLE.turnR },
];

const MELEE_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "meleeIdle",    file: ANIM_MELEE.idle },
  { key: "meleeWalkFwd", file: ANIM_MELEE.walkFwd },
  { key: "meleeWalkBwd", file: ANIM_MELEE.walkBwd },
  { key: "meleeStrafeL", file: ANIM_MELEE.strafeL },
  { key: "meleeStrafeR", file: ANIM_MELEE.strafeR },
  { key: "meleeRunFwd",  file: ANIM_MELEE.runFwd },
  { key: "meleeRunBwd",  file: ANIM_MELEE.runBwd },
  { key: "meleeAttack1", file: ANIM_MELEE.attack1 },
  { key: "meleeAttack2", file: ANIM_MELEE.attack2 },
  { key: "meleeAttack3", file: ANIM_MELEE.attack3 },
  { key: "meleeCombo1",  file: ANIM_MELEE.combo1 },
  { key: "meleeCombo2",  file: ANIM_MELEE.combo2 },
  { key: "meleeCombo3",  file: ANIM_MELEE.combo3 },
  { key: "meleeJump",           file: ANIM_MELEE.jump },
  { key: "meleeCrouch",         file: ANIM_MELEE.crouch },
  { key: "meleeBlock",          file: ANIM_MELEE.block },
  { key: "meleeStandFromCrouch",file: ANIM_MELEE.standFromCrouch },
];

const STAFF_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "staffIdle",     file: ANIM_STAFF.idle },
  { key: "staffIdle2",    file: ANIM_STAFF.idle2 },
  { key: "staffWalkFwd",  file: ANIM_STAFF.walkFwd },
  { key: "staffWalkBwd",  file: ANIM_STAFF.walkBwd },
  { key: "staffRunFwd",   file: ANIM_STAFF.runFwd },
  { key: "staffRunBwd",   file: ANIM_STAFF.runBwd },
  { key: "staffCast1",    file: ANIM_STAFF.cast1 },
  { key: "staffCast2",    file: ANIM_STAFF.cast2 },
  { key: "staffJump",     file: ANIM_STAFF.jump },
  { key: "staffHitLarge", file: ANIM_STAFF.hitLarge },
  { key: "staffHitSmall", file: ANIM_STAFF.hitSmall },
  { key: "staffDeath",    file: ANIM_STAFF.death },
];

const BOW_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "bowIdle",       file: ANIM_BOW.idle },
  { key: "bowWalkFwd",    file: ANIM_BOW.walkFwd },
  { key: "bowWalkBwd",    file: ANIM_BOW.walkBwd },
  { key: "bowStrafeL",    file: ANIM_BOW.strafeL },
  { key: "bowStrafeR",    file: ANIM_BOW.strafeR },
  { key: "bowRunFwd",     file: ANIM_BOW.runFwd },
  { key: "bowRunBwd",     file: ANIM_BOW.runBwd },
  { key: "bowJump",       file: ANIM_BOW.jump },
  { key: "bowDraw",       file: ANIM_BOW.draw },
  { key: "bowAim",        file: ANIM_BOW.aim },
  { key: "bowFire",       file: ANIM_BOW.fire },
  { key: "bowBlock",      file: ANIM_BOW.block },
  { key: "bowAimWalkFwd", file: ANIM_BOW.aimWalkFwd },
  { key: "bowAimWalkBwd", file: ANIM_BOW.aimWalkBwd },
  { key: "bowAimStrafeL", file: ANIM_BOW.aimStrafeL },
  { key: "bowAimStrafeR", file: ANIM_BOW.aimStrafeR },
];

// ── Sword + Shield load queue ─────────────────────────────────────────────────
// Locomotion layer (looping):
//   ssIdle · ssRunFwd/Bwd · ssStrafeL/R · ssBlockIdle (RMB held)
// Action layer (ONCE / BLOCKING_ONCE):
//   ssAttack1-4 (LMB combo) · ssBlock/BlockHit (shield impact) · ssDrawSword
const SS_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "ssIdle",      file: ANIM_SHIELD_SWORD.idle },
  { key: "ssRunFwd",    file: ANIM_SHIELD_SWORD.runFwd },
  { key: "ssRunBwd",    file: ANIM_SHIELD_SWORD.runBwd },
  { key: "ssStrafeL",   file: ANIM_SHIELD_SWORD.strafeL },
  { key: "ssStrafeR",   file: ANIM_SHIELD_SWORD.strafeR },
  { key: "ssBlockIdle", file: ANIM_SHIELD_SWORD.blockIdle },
  { key: "ssBlock",     file: ANIM_SHIELD_SWORD.block },
  { key: "ssBlockHit",  file: ANIM_SHIELD_SWORD.blockHit },
  { key: "ssAttack1",   file: ANIM_SHIELD_SWORD.attack1 },
  { key: "ssAttack2",   file: ANIM_SHIELD_SWORD.attack2 },
  { key: "ssAttack3",   file: ANIM_SHIELD_SWORD.attack3 },
  { key: "ssAttack4",   file: ANIM_SHIELD_SWORD.attack4 },
  { key: "ssDrawSword", file: ANIM_SHIELD_SWORD.drawSword },
];

// ─── Traverse animations (climbing + swimming) ────────────────────────────────
// Loaded eagerly alongside the pistol pack so they work from any weapon mode.
const TRAVERSE_QUEUE: Array<{ key: AnimKey; file: string }> = [
  { key: "climbUp",     file: ANIM_TRAVERSE.climbUp     },
  { key: "climbing",    file: ANIM_TRAVERSE.climbing    },
  { key: "climbLadder", file: ANIM_TRAVERSE.climbLadder },
  { key: "treading",    file: ANIM_TRAVERSE.treading    },
  { key: "swimming",    file: ANIM_TRAVERSE.swimming    },
  { key: "swimToEdge",  file: ANIM_TRAVERSE.swimToEdge  },
];

// ─── LoopOnce animations (non-looping) ────────────────────────────────────────
// These clamp at last frame. Attacks are a subset: BLOCKING_ONCE.
// ── LAYER 1: "base layer" — locomotion animations (idle/walk/run/crouch/jump).
//    These always run unless a LAYER 2 animation is active.
//
// ── LAYER 2: "weapon/action layer" — attacks, spells, and dodges.
//    While any BLOCKING_ONCE animation plays, blockingOnce.current = true
//    and the locomotion state machine is suspended until it finishes.

const ONCE_ANIMS = new Set<AnimKey>([
  // attacks / spells
  "meleeAttack1","meleeAttack2","meleeAttack3",
  "meleeCombo1","meleeCombo2","meleeCombo3",
  "pistolCrouchDown","pistolCrouchUp",
  "rifleFire",
  "staffCast1","staffCast2",
  "staffHitLarge","staffHitSmall",
  "staffIdle2",        // idle variety — plays once then returns to staffIdle
  "staffDeath",        // death animation — plays once, then onDead() fires
  "rifleTurnL","rifleTurnR", // non-blocking in-place turn animations
  "bowDraw","bowFire","bowBlock",
  // melee transitions
  "meleeStandFromCrouch",  // crouch → stand get-up animation
  // sword + shield actions
  "ssAttack1","ssAttack2","ssAttack3","ssAttack4",
  "ssBlock","ssBlockHit","ssDrawSword",
  // directional dodges (play once, then snap back to locomotion)
  "dodgeFwd","dodgeBwd","dodgeL","dodgeR",
  // traverse — one-shot transitions
  "climbUp", "swimToEdge",
]);

// ─── Blocking animations — must play fully before queue can run ───────────────
const BLOCKING_ONCE = new Set<AnimKey>([
  "meleeAttack1","meleeAttack2","meleeAttack3",
  "meleeCombo1","meleeCombo2","meleeCombo3",
  "staffCast1","staffCast2",
  "rifleFire",
  "bowDraw","bowFire","bowBlock",
  "ssAttack1","ssAttack2","ssAttack3","ssAttack4",
  "ssBlock","ssBlockHit",
  "dodgeFwd","dodgeBwd","dodgeL","dodgeR",
  // traverse
  "climbUp", "swimToEdge",
]);

// ─── Idle for each weapon mode ────────────────────────────────────────────────
function idleForMode(wm: WeaponMode): AnimKey {
  if (wm === "sword" || wm === "axe") return "meleeIdle";
  if (wm === "rifle")  return "rifleIdle";
  if (wm === "staff")  return "staffIdle";
  if (wm === "bow")    return "bowIdle";
  if (wm === "shield") return "ssIdle";
  return "pistolIdle";
}

// ─── Animation resolver (locomotion only — not called during blocking) ─────────
function resolveAnim(
  wm: WeaponMode,
  fwd: boolean, bwd: boolean, left: boolean, right: boolean,
  sprint: boolean, grounded: boolean, crouching: boolean,
  aiming: boolean,        // bow RMB aim
  blocking: boolean,      // shield RMB block
  meleeBlocking: boolean, // sword/axe RMB block
): AnimKey {

  const isMelee  = wm === "sword" || wm === "axe";
  const isRifle  = wm === "rifle";
  const isStaff  = wm === "staff";
  const isBow    = wm === "bow";
  const isShield = wm === "shield";
  const moving   = fwd || bwd || left || right;

  if (!grounded) {
    if (isStaff)  return "staffJump";
    if (isMelee)  return "meleeJump";
    if (isRifle)  return "rifleJump";
    if (isBow)    return "bowJump";
    return "pistolJump";
  }

  // ── Crouching ─────────────────────────────────────────────────────────────
  // Stationary → dedicated crouch-idle; Moving → reuse the walk/strafe anims
  // (useFrame will apply CROUCH_WALK_TS so the character shuffles, not runs).
  if (crouching) {
    if (!moving) return isMelee ? "meleeCrouch" : "pistolCrouchIdle";
    if (isMelee) {
      if (fwd && !bwd) return "meleeWalkFwd";
      if (bwd && !fwd) return "meleeWalkBwd";
      if (left)        return "meleeStrafeL";
      if (right)       return "meleeStrafeR";
      return "meleeCrouch";
    }
    if (isRifle) {
      if (fwd && !bwd) return "rifleWalkFwd";
      if (bwd && !fwd) return "rifleWalkBwd";
      if (left)        return "rifleStrafeL";
      if (right)       return "rifleStrafeR";
      return "rifleIdle";
    }
    if (isStaff) {
      if (fwd && !bwd) return "staffWalkFwd";
      if (bwd && !fwd) return "staffWalkBwd";
      return "staffIdle";
    }
    if (isBow) {
      if (fwd && !bwd) return "bowWalkFwd";
      if (bwd && !fwd) return "bowWalkBwd";
      if (left)        return "bowStrafeL";
      if (right)       return "bowStrafeR";
      return "bowIdle";
    }
    // Pistol (default)
    if (fwd && !bwd) return "pistolWalkFwd";
    if (bwd && !fwd) return "pistolWalkBwd";
    if (left)        return "pistolStrafeL";
    if (right)       return "pistolStrafeR";
    return "pistolCrouchIdle";
  }

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
    // RMB held → stay in block pose (loops) regardless of movement direction
    if (meleeBlocking) return "meleeBlock";
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

  // ── Sword + Shield ──────────────────────────────────────────────────────────
  // RMB held → raise shield (ssBlockIdle); movement keeps the raised-shield pose
  // while physics still moves the character.
  if (isShield) {
    if (!moving) return blocking ? "ssBlockIdle" : "ssIdle";
    if (blocking) return "ssBlockIdle";   // block-walk: hold the shield up while moving
    if (fwd && !bwd) return sprint ? "ssRunFwd" : "ssRunFwd";  // no walk anim — run at 0.6× for walk
    if (bwd && !fwd) return "ssRunBwd";
    if (left)  return "ssStrafeL";
    if (right) return "ssStrafeR";
    return "ssIdle";
  }

  // Pistol — full 8-directional animation set
  if (!moving) return "pistolIdle";
  if (fwd && !bwd) {
    if (!left && !right) return sprint ? "pistolRun"      : "pistolWalkFwd";
    if (left)            return sprint ? "pistolRunArcL"  : "pistolWalkArcL";
    if (right)           return sprint ? "pistolRunArcR"  : "pistolWalkArcR";
  }
  if (bwd && !fwd) {
    if (!left && !right) return sprint ? "pistolRunBwd"      : "pistolWalkBwd";
    if (left)            return sprint ? "pistolRunBwdArcL"  : "pistolWalkBwdArcL";
    if (right)           return sprint ? "pistolRunBwdArcR"  : "pistolWalkBwdArcR";
  }
  if (left)  return "pistolStrafeL";
  if (right) return "pistolStrafeR";
  return "pistolIdle";
}

// ─── Animation speed references ───────────────────────────────────────────────
// These are the speeds (m/s) that the FBX locomotion clips "look right" at —
// i.e. timeScale=1 produces no foot-slide at exactly these speeds.
// Computed once so we can scale timeScale proportionally to actual move speed.
const ANIM_WALK_REF = 1.5;    // Mixamo/similar walk clips authored at ~1.5 m/s
const ANIM_RUN_REF  = 4.0;    // run clips authored at ~4.0 m/s

// ─── Module-level math helpers (avoids per-frame allocation) ─────────────────
// Scratch vectors reused every frame — never hold references across frames.
const _UP_AXIS      = new THREE.Vector3(0, 1, 0);
const _FWD_BODY     = new THREE.Vector3(0, 0, -1);  // body-frame forward (rootRef local -Z)
const _yawQ         = new THREE.Quaternion();
const _leanQ        = new THREE.Quaternion();
// Movement scratch vectors (hot path — allocated once, set each frame)
const _fwdVec       = new THREE.Vector3();   // camera-relative forward
const _rgtVec       = new THREE.Vector3();   // camera-relative right
const _moveVec      = new THREE.Vector3();   // resolved movement applied to physics this frame
const _targetVel    = new THREE.Vector3();   // desired velocity (m/s) from input — smoothed toward
// Camera smooth-follow scratch (world-space, reused every frame)
const _camIdeal     = new THREE.Vector3();   // desired camera world pos
const _camOffset    = new THREE.Vector3();   // shoulder offset rotated by yaw
// God-mode scratch
const _flyDir       = new THREE.Vector3();
const _flyFwd       = new THREE.Vector3();
const _flyRgt       = new THREE.Vector3();

// ─── Queue slot type ──────────────────────────────────────────────────────────
type QueueSlot = {
  key:        AnimKey;
  fade:       number;
  timeScale?: number;  // playback speed (default 1.0)
  manaCost?:  number;  // mana consumed when this animation STARTS playing
  dmgMs?:     number;  // ms after start to fire damage
} | null;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlayerProps {
  onShoot:     (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onMelee:     (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  onSkillHit:  (payload: SkillHitPayload) => void;
  onDead:      () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  /** Y level (world space) below which the character is considered submerged.
   *  Omit or pass Infinity to disable water for a scene (e.g. Graveyard). */
  waterY?:     number;
  /** World-space feet position for the initial capsule spawn.
   *  Defaults to the island beach (0, beach_height, 50) if omitted. */
  spawnPos?:   [number, number, number];
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function Player({ onShoot, onMelee, onSkillHit, onDead, playerPosRef, waterY, spawnPos }: PlayerProps) {
  // ── Active character definition (read once on mount; Game.tsx remounts via key) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const charDef = useCharacterStore.getState().def;

  // Per-character capsule dims — sourced from the CharacterDef so each character
  // gets the correct physics body.  Module-level CAPSULE_HH/R are the Racalvin defaults.
  const capHH = charDef.capsuleHH;               // half-height of cylinder
  const capR  = charDef.capsuleR;                // hemisphere radius
  const capCY = capHH + capR;                    // feet → capsule centre-of-mass

  // ── Scene refs ────────────────────────────────────────────────────────────
  const rootRef             = useRef<THREE.Group>(null!);
  const leanGroupRef        = useRef<THREE.Group>(null!);  // procedural body lean
  const modelGroupRef       = useRef<THREE.Group>(null!);
  const swordGroupRef       = useRef<THREE.Group>(null!);
  const axeGroupRef         = useRef<THREE.Group>(null!);
  const caneGroupRef        = useRef<THREE.Group>(null!);
  const pistolPropGroupRef  = useRef<THREE.Group>(null!);
  const riflePropGroupRef   = useRef<THREE.Group>(null!);
  const bowPropGroupRef     = useRef<THREE.Group>(null!);
  const shieldPropGroupRef  = useRef<THREE.Group>(null!);
  const playerRBRef         = useRef<any>(null);

  // ── Movement refs ─────────────────────────────────────────────────────────
  const velY     = useRef(0);
  const grounded = useRef(true);
  const yaw      = useRef(0);
  const pitch    = useRef(0);
  const rollCamZ = useRef(0);

  const keys   = useRef<Record<string, boolean>>({});
  const locked = useRef(false);

  const deadFired     = useRef(false);
  const dyingRef      = useRef(false);  // true while death animation is playing
  const shootCooldown = useRef(0);

  const crouching     = useRef(false);
  const crouchPending = useRef<"kneel" | "stand" | null>(null);

  const rolling      = useRef(false);
  const rollTimer    = useRef(0);
  const rollDir      = useRef(new THREE.Vector3(0, 0, -1));
  const rollCooldown = useRef(0);

  // ── Traverse (water + climbing) refs ─────────────────────────────────────
  const inWater       = useRef(false);  // true while player foot Y < waterY
  const prevInWater   = useRef(false);  // previous-frame inWater (edge detection)
  const isClimbing    = useRef(false);  // true while climbUp anim is playing
  const climbTimer    = useRef(0);      // elapsed seconds since climbUp started
  // wallBlocked: set to true when Rapier reports horizontal movement fully blocked
  // while pressing forward — used to trigger the climb on Space press.
  const wallBlocked   = useRef(false);

  // Velocity smoothing — eliminates rubber-band jitter on start/stop/direction change.
  // Stores the current smoothed horizontal velocity (m/s); updated via exponential decay.
  const smoothVelRef = useRef(new THREE.Vector3(0, 0, 0));

  // Smooth camera world-space position — lerped toward the ideal shoulder offset
  // each frame so physics jitter / Rapier corrections never snap the view.
  const cameraWorldPosRef = useRef(new THREE.Vector3());

  // ── Procedural animation refs ─────────────────────────────────────────────
  const leanRef          = useRef(0);    // current body lean angle (radians)
  const bobTimerRef      = useRef(0);    // head-bob phase accumulator
  const staffIdleTimer   = useRef(0);    // seconds spent in staffIdle → triggers staffIdle2
  const prevYaw          = useRef(0);    // yaw from previous frame (rifle turn detection)

  // ── Double-tap dodge detection ────────────────────────────────────────────
  // Stores the timestamp of the last keydown for W / A / S / D.
  const doubleTapTimers  = useRef<Partial<Record<string, number>>>({});
  // Always-fresh callback so handleKeyDown can trigger a dodge without needing
  // _rawPlay in its closure (refs-only pattern, same as onBlockingDoneRef).
  const triggerDodgeRef  = useRef<((dir: "fwd"|"bwd"|"left"|"right") => void) | null>(null);

  // ── Attack / combo refs ───────────────────────────────────────────────────
  const attackPhase = useRef(0);
  const comboWindow = useRef(0);

  // ── Animation queue system ────────────────────────────────────────────────
  // blockingOnce: true while a BLOCKING_ONCE animation is playing to completion
  // animQueue:    single slot holding the NEXT blocking anim to play (editable until it starts)
  const blockingOnce     = useRef(false);
  const animQueue        = useRef<QueueSlot>(null);
  // These refs are updated every render so mixer callbacks always call the latest version
  const onBlockingDoneRef    = useRef<((key: AnimKey) => void) | null>(null);
  const onNonBlockingDoneRef = useRef<((key: AnimKey) => void) | null>(null);
  const nonBlockingOnce      = useRef(false);   // true while staffIdle2/rifleTurnL/R plays
  const fireDamageRef     = useRef<(() => void) | null>(null);

  // ── THREE animation state ─────────────────────────────────────────────────
  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<AnimKey, THREE.AnimationAction>>>({});
  const curAnim    = useRef<AnimKey>("pistolIdle");

  // ── Lazy weapon-pack loading ───────────────────────────────────────────────
  const loadPackRef       = useRef<((mode: WeaponMode) => void) | null>(null);
  const packLoadedRef     = useRef(new Set<string>(["pistol"]));
  const prevWeaponModeRef = useRef<WeaponMode>("pistol");

  // ── Weapon-fit API ────────────────────────────────────────────────────────
  // getFit(key) → bone-relative { position, rotation, scale } from API / localStorage / defaults.
  // saveFit(key, offset) → persists to API + localStorage.
  const { getFit, saveFit: _saveFit } = useWeaponFit();
  // Expose saveFit via ref so ModelViewer can call it without going through props.
  // (Not currently wired — ModelViewer talks directly to the API.  Here for future use.)
  void _saveFit;

  // ── Hand-bone refs ────────────────────────────────────────────────────────
  const handBoneRef      = useRef<THREE.Bone | null>(null);    // right hand
  const leftHandBoneRef  = useRef<THREE.Bone | null>(null);    // left hand (bow)

  // ── Model state ───────────────────────────────────────────────────────────
  const [modelObj,      setModelObj]      = useState<THREE.Group | null>(null);
  const [swordObj,      setSwordObj]      = useState<THREE.Group | null>(null);
  const [axeObj,        setAxeObj]        = useState<THREE.Group | null>(null);
  const [caneObj,       setCaneObj]       = useState<THREE.Group | null>(null);
  const [pistolPropObj, setPistolPropObj] = useState<THREE.Group | null>(null);
  const [riflePropObj,  setRiflePropObj]  = useState<THREE.Group | null>(null);
  const [bowPropObj,    setBowPropObj]    = useState<THREE.Group | null>(null);
  const [shieldPropObj, setShieldPropObj] = useState<THREE.Group | null>(null);

  // ── Bow aiming / Shield blocking state ───────────────────────────────────
  const bowAiming      = useRef(false);   // RMB held while in bow mode
  const ssBlocking     = useRef(false);   // RMB held while in shield mode
  const meleeBlocking  = useRef(false);   // RMB held while in sword/axe mode
  const ssAttackPhase = useRef(0);      // cycles ssAttack1-4

  // ── Skill system refs ─────────────────────────────────────────────────────
  const effectsRef         = useRef<SkillEffectsHandle>(null!);
  const skillCooldownsRef  = useRef<Record<string, number>>({});
  // Skills currently mid-animation (not yet on cooldown)
  const activeSkillsRef    = useRef<Set<string>>(new Set());
  // Always-fresh skill executor — updated every render like fireDamageRef
  const executeSkillRef    = useRef<((slotIdx: number) => void) | null>(null);

  // ── Pending skill-hit queue ───────────────────────────────────────────────
  // Skill hits are deferred and drained inside useFrame using pure JS geometry.
  // We deliberately avoid ALL Rapier WASM API calls (intersectionsWithShape,
  // new rapier.Ball, new rapier.Capsule) from this path — any Rapier call that
  // races with the internal physics step triggers the borrow-checker panic
  // ("recursive use of an object detected") which cascades and destroys the
  // WebGL context.  Game.tsx's handleSkillHit already does a fast arc+range
  // check that correctly handles sphere (arcDeg=360) and capsule (arcDeg<360).
  interface PendingHit {
    fireAt:       number;   // performance.now() timestamp in ms
    damage:       number;
    range:        number;
    arcDeg:       number;
    effectColor:  string;
    effectRadius: number;
  }
  const pendingHitsRef = useRef<PendingHit[]>([]);

  const { camera, scene } = useThree();
  const { world } = useRapier() as any;
  const charCtrl          = useRef<any>(null);
  // Latch set on first Rapier WASM panic; clears on next clean mount.
  // Prevents the cascade of hundreds of panics that destroy the WebGL context.
  const rapierPanicked    = useRef(false);

  const {
    health, shoot, reload, ammo, isReloading,
    setInvincible, camera: camSettings,
    setCameraMode, cycleCameraMode, setShowCameraSettings,
    cycleWeapon,
    useMana, regenMana, heal, toggleCharacterPanel,
    selectedSpell, setShowSpellRadial,
    spellCooldown, tickSpellCooldown,
    addMagicProjectile,
    setPaused,
    setSkillCooldown, tickSkillCooldowns,
    setMeleeBlocking,
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
      _rawPlay(slot.key, slot.fade, slot.timeScale ?? 1);
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

  // Restore locomotion idle after a non-blocking ONCE anim (staffIdle2, rifleTurnL/R)
  onNonBlockingDoneRef.current = (_finishedKey: AnimKey) => {
    nonBlockingOnce.current = false;
    const wm = useGameStore.getState().weaponMode;
    _rawPlay(idleForMode(wm), FADE_LOCO);
  };

  // ── Raw play helper (direct, no skip-if-same) ─────────────────────────────
  // Used by the queue system where repeating the same anim (e.g. meleeAttack1
  // twice in a row) must start fresh.
  // ── timeScale = 1 by default; pass <1 to slow (crouch-walk), >1 to speed up ─
  function _rawPlay(key: AnimKey, fade: number, timeScale = 1) {
    const a = actionsRef.current[key];
    // Guard: if the animation clip isn't registered yet (lazy pack still loading)
    // do NOT fade out the current anim — keep it playing so we never hit T-pose.
    if (!a) return;
    const prev = actionsRef.current[curAnim.current];
    if (prev && curAnim.current !== key) prev.fadeOut(fade);
    a.timeScale = timeScale;
    a.reset().fadeIn(fade).play();
    curAnim.current = key;
  }

  // ── Always-fresh skill executor ───────────────────────────────────────────
  // All skill types (ray, capsule, sphere) push to pendingHitsRef and are
  // drained in useFrame with pure JS geometry — no Rapier WASM calls.
  executeSkillRef.current = (slotIdx: number) => {
    const wm     = useGameStore.getState().weaponMode;
    const skills = WEAPON_SKILLS[wm];
    if (!skills) return;
    const skill: SkillDef = skills[slotIdx];
    if (!skill) return;

    // ── Cooldown / active check (local ref — no store read) ─────────────
    if ((skillCooldownsRef.current[skill.id] ?? 0) > 0) return;
    if (activeSkillsRef.current.has(skill.id)) return;

    // ── Mana check ───────────────────────────────────────────────────────
    if (skill.manaCost > 0 && !useMana(skill.manaCost)) return;

    // ── Mark skill as active (cooldown starts after animation ends) ──────
    activeSkillsRef.current.add(skill.id);

    // ── Resolve animation duration so we know when to start the cooldown ─
    const animKey    = skill.animation as AnimKey;
    const action     = actionsRef.current[animKey];
    const clipSec    = action ? action.getClip().duration : 0.6;
    const animMs     = Math.max(200, (clipSec / skill.timeScale) * 1000);

    setTimeout(() => {
      activeSkillsRef.current.delete(skill.id);
      skillCooldownsRef.current[skill.id] = skill.cooldown;
      setSkillCooldown(skill.id, skill.cooldown);
    }, animMs);

    // ── Buff skill (Rally — no hit, just heal) ───────────────────────────
    if (skill.effect === "buff") {
      heal(30);
      if (!blockingOnce.current) {
        _rawPlay(skill.animation as AnimKey, FADE_ATK_START, skill.timeScale);
        blockingOnce.current = true;
      }
      // Spawn heal ring
      const pp = playerPosRef.current;
      effectsRef.current?.spawnRing(
        new THREE.Vector3(pp.x, 0.1, pp.z),
        skill.effectColor, skill.effectRadius, 0.7,
      );
      return;
    }

    // ── Play animation ───────────────────────────────────────────────────
    if (!blockingOnce.current) {
      _rawPlay(animKey, FADE_ATK_START, skill.timeScale);
      if (BLOCKING_ONCE.has(animKey)) blockingOnce.current = true;
    } else {
      // Queue it for after current blocking anim
      if (BLOCKING_ONCE.has(animKey)) {
        animQueue.current = { key: animKey, fade: FADE_ATK_CHAIN };
      }
    }

    // ── Schedule damage tick(s) ──────────────────────────────────────────
    // IMPORTANT: Do NOT call any Rapier world API from setTimeout — those
    // callbacks can fire mid-physics-step and cause the WASM borrow-checker
    // panic ("recursive use of an object detected").
    // Instead, push a descriptor into pendingHitsRef and let useFrame drain
    // it at a guaranteed-safe point relative to the physics step.
    const hitCount = Math.max(1, skill.hitCount);
    const interval = hitCount > 1 ? Math.max(80, Math.floor(skill.dmgDelayMs / hitCount)) : 0;

    for (let h = 0; h < hitCount; h++) {
      const delay = skill.dmgDelayMs + h * interval;
      pendingHitsRef.current.push({
        fireAt:       performance.now() + delay,
        damage:       skill.damage,
        range:        skill.range,
        arcDeg:       skill.arcDeg,
        effectColor:  skill.effectColor,
        effectRadius: skill.effectRadius,
      });
    }
  };

  // ── Always-fresh dodge trigger ─────────────────────────────────────────────
  // Updated every render so the closure always sees the current refs/_rawPlay.
  triggerDodgeRef.current = (dir) => {
    if (!grounded.current || rolling.current || crouching.current || rollCooldown.current > 0) return;
    rolling.current      = true;
    rollTimer.current    = DODGE_DURATION;
    rollCooldown.current = ROLL_COOLDOWN;
    blockingOnce.current = true;     // suspend locomotion layer during dodge

    const fwdV = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const rgtV = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    if      (dir === "fwd")  rollDir.current.copy(fwdV);
    else if (dir === "bwd")  rollDir.current.copy(fwdV).negate();
    else if (dir === "left") rollDir.current.copy(rgtV).negate();
    else                     rollDir.current.copy(rgtV);

    rollDir.current.multiplyScalar(DODGE_SPEED / ROLL_SPEED); // scale to DODGE_SPEED ratio

    const key: AnimKey = dir === "fwd" ? "dodgeFwd"
                       : dir === "bwd" ? "dodgeBwd"
                       : dir === "left" ? "dodgeL"
                       : "dodgeR";
    // Play at 1.5× so the full dodge fits within DODGE_DURATION
    _rawPlay(key, 0.08, 1.5);
    if (setInvincible) setInvincible(true);
  };

  // ── Rapier character controller ───────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const ctrl = world.createCharacterController(0.05);
    ctrl.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    ctrl.setMinSlopeSlideAngle(30 * Math.PI / 180);
    try { ctrl.enableSnapToGround(0.3); } catch { /* version variance */ }
    ctrl.setApplyImpulsesToDynamicBodies(false);
    charCtrl.current = ctrl;
    return () => {
      // Null charCtrl BEFORE freeing so any racing useFrame sees null and
      // skips rather than calling methods on a freed WASM controller object.
      charCtrl.current = null;
      world.removeCharacterController(ctrl);
    };
  }, [world]);

  // ── Camera setup — WORLD SPACE (not parented to character) ───────────────
  // The camera is kept as a direct child of the Three.js scene so that the
  // smooth-follow logic in useFrame can lerp its world-space position without
  // fighting a parent transform. Previously the camera was parented to rootRef,
  // meaning every Rapier position correction (wall collision, slope snap, etc.)
  // instantly yanked the camera — visible as "rubber-banding".
  useEffect(() => {
    camera.rotation.order = "YXZ";
    // Prime the smooth-pos tracker from the character's current world position
    // so the camera doesn't fly in from the origin on mount.
    const spawn = rootRef.current?.position;
    if (spawn) {
      camera.position.set(
        spawn.x + camSettings.shoulderX,
        spawn.y + camSettings.shoulderY,
        spawn.z + camSettings.shoulderZ,
      );
      cameraWorldPosRef.current.copy(camera.position);
    }
    camera.rotation.set(0, 0, 0);
    // Ensure camera is in scene space (R3F may have moved it)
    scene.add(camera);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, scene]);

  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = camSettings.fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, camSettings.fov]);

  // ── Sequential FBX loader ─────────────────────────────────────────────────
  // Phase 1: model + pistol (serial, model must exist before clips).
  // Phase 2: melee loaded in parallel with pistol (needed for dodge anims).
  // All other packs (rifle/staff/bow/shield) lazy-load on first weapon equip.
  useEffect(() => {
    let cancelled = false;
    const loader     = new FBXLoader();
    const gltfLoader = new GLTFLoader();
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

    // ── Shared model-setup after any mesh format is loaded ───────────────────
    function setupModel(modelGroup: THREE.Group) {
      if (cancelled || !modelGroup) return;
      modelGroup.scale.setScalar(charDef.scale);
      modelGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow    = true;
          c.receiveShadow = true;
        }
      });
      mixer = new THREE.AnimationMixer(modelGroup);
      mixerRef.current = mixer;

      // When a BLOCKING_ONCE animation finishes, call the always-fresh handler.
      // It either starts the queued animation or fades back to locomotion.
      mixer.addEventListener("finished", (e: any) => {
        const name = e.action.getClip().name as AnimKey;
        if (BLOCKING_ONCE.has(name)) {
          onBlockingDoneRef.current?.(name);
        } else if (ONCE_ANIMS.has(name)) {
          // Non-blocking ONCE anim (staffIdle2, rifleTurnL/R) — restore idle
          onNonBlockingDoneRef.current?.(name);
        }
      });

      setModelObj(modelGroup);

      // Start loading traverse animations (climb, swim) now that the mixer exists.
      // These MUST start after setupModel so mixer is non-null when registerClip runs.
      // Running them in parallel earlier caused a race where mixer === null → silent drop.
      loadSeq(TRAVERSE_QUEUE as typeof PISTOL_QUEUE, 0);
    }

    function loadSeq(
      queue: typeof PISTOL_QUEUE,
      i: number,
      done?: () => void,
    ) {
      if (cancelled || i >= queue.length) { done?.(); return; }
      const { key, file } = queue[i];
      // For the base-mesh slot, honour the active CharacterDef.
      const loadFile = key === "__model__" ? charDef.mesh : file;

      // GLB / GLTF character meshes use GLTFLoader; all animation clips use FBXLoader.
      const isGltfMesh =
        key === "__model__" &&
        (charDef.format === "glb" || charDef.format === "gltf");

      if (isGltfMesh) {
        gltfLoader.load(
          loadFile,
          (gltf) => {
            if (cancelled) return;
            // gltf.scene is the root THREE.Group (equivalent to the FBX group)
            setupModel(gltf.scene as THREE.Group);
            loadSeq(queue, i + 1, done);
          },
          undefined,
          () => { if (!cancelled) loadSeq(queue, i + 1, done); },
        );
      } else {
        loader.load(
          loadFile,
          (fbx) => {
            if (cancelled) return;
            if (key === "__model__") {
              setupModel(fbx);
            } else {
              registerClip(key as AnimKey, fbx);
            }
            loadSeq(queue, i + 1, done);
          },
          undefined,
          () => { if (!cancelled) loadSeq(queue, i + 1, done); },
        );
      }
    }

    // ── Lazy pack loader — called from useFrame on weapon switch ────────────
    const packQueues: Record<string, typeof PISTOL_QUEUE> = {
      melee:  MELEE_QUEUE as typeof PISTOL_QUEUE,
      rifle:  RIFLE_QUEUE  as typeof PISTOL_QUEUE,
      staff:  STAFF_QUEUE  as typeof PISTOL_QUEUE,
      bow:    BOW_QUEUE    as typeof PISTOL_QUEUE,
      shield: SS_QUEUE     as typeof PISTOL_QUEUE,
    };

    loadPackRef.current = (mode: WeaponMode) => {
      // sword/axe → melee pack; shield → shield/SS pack
      const key = (mode === "sword" || mode === "axe") ? "melee"
                : mode === "shield" ? "shield"
                : (mode as string);
      if (packLoadedRef.current.has(key) || !(key in packQueues)) return;
      packLoadedRef.current.add(key);
      loadSeq(packQueues[key], 0);
    };

    loadSeq(PISTOL_QUEUE, 0);
    // NOTE: traverse animations (climb/swim) are started inside setupModel once the
    // mixer exists — see loadSeq(TRAVERSE_QUEUE) call there. Starting them here
    // caused a race: traverse FBX files are small and often finish before the character
    // model, hitting registerClip while mixer === null → silent drop.

    return () => {
      cancelled = true;
      loadPackRef.current = null;
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

  // ── Bone-parent all weapon meshes ─────────────────────────────────────────
  // Best-practice Mixamo pipeline: weapon props are children of the hand bone
  // in the scene graph.  Three.js propagates the bone's world matrix to every
  // child automatically — no per-frame world-position copy needed.
  // This effect re-runs whenever a weapon finishes loading OR when the API
  // delivers updated fit data, keeping transforms in sync without reloading.
  useEffect(() => {
    if (!modelObj) return;

    // Re-discover bones here so the effect doesn't depend on refs.
    let handBone: THREE.Bone | null = null;
    let leftHandBone: THREE.Bone | null = null;
    modelObj.traverse((o) => {
      if (!(o instanceof THREE.Bone)) return;
      const n = o.name.toLowerCase();
      if (!handBone && (n.includes("righthand") || n.includes("hand_r") || n === "right hand"))
        handBone = o as THREE.Bone;
      if (!leftHandBone && (n.includes("lefthand") || n.includes("hand_l") || n === "left hand"))
        leftHandBone = o as THREE.Bone;
    });

    const attachToBone = (
      obj: THREE.Group | null,
      bone: THREE.Bone | null,
      fitKey: string,
    ) => {
      if (!obj || !bone) return;
      // Move from whatever parent (scene root / previous bone) → target bone.
      if (obj.parent !== bone) {
        obj.parent?.remove(obj);
        bone.add(obj);
      }
      const fit   = getFit(fitKey);
      const rawLD = (obj.userData.rawLongestDim as number) || 1;
      obj.position.set(...fit.position);
      obj.setRotationFromEuler(new THREE.Euler(...fit.rotation));
      // fit.scale[0] = desired longest-dimension in metres (unit-agnostic)
      obj.scale.setScalar(fit.scale[0] / rawLD);
    };

    // Right-hand weapons
    attachToBone(swordObj,      handBone,     "sword");
    attachToBone(axeObj,        handBone,     "axe");
    attachToBone(caneObj,       handBone,     "staff1");
    attachToBone(pistolPropObj, handBone,     "pistol");
    attachToBone(riflePropObj,  handBone,     "rifle");
    // Left-hand weapons
    attachToBone(bowPropObj,    leftHandBone, "bow");
    attachToBone(shieldPropObj, leftHandBone, "shield");
  }, [modelObj, swordObj, axeObj, caneObj, pistolPropObj, riflePropObj, bowPropObj, shieldPropObj, getFit]);

  // ── Load weapon models ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load(WEAPON_PROPS.sword, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
      fbx.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      fbx.visible = false;
      setSwordObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load(WEAPON_PROPS.axe, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
      fbx.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      fbx.visible = false;
      setAxeObj(fbx);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    new FBXLoader().load(WEAPON_PROPS.staff1, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
      // Position/scale/rotation applied by bone attachment effect (useWeaponFit).
      const texLoader = new THREE.TextureLoader();
      texLoader.load(texPath(WEAPON_TEXTURES.staff), (tex) => {
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
    new FBXLoader().load(WEAPON_PROPS.pistol, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
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
    new FBXLoader().load(WEAPON_PROPS.rifle, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
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
    new FBXLoader().load(WEAPON_PROPS.bow, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
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

    // Shield prop — left hand, metallic face
    new FBXLoader().load(WEAPON_PROPS.shield, (fbx) => {
      if (cancelled) return;
      storeFbxRawSize(fbx);
      fbx.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow    = true;
          c.receiveShadow = true;
          (c as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            color:     0x8a7b5c,
            metalness: 0.6,
            roughness: 0.4,
          });
        }
      });
      fbx.visible = false;
      setShieldPropObj(fbx);
    });

    return () => { cancelled = true; };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ── ANIMATION HELPERS ────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  // transitionTo — for locomotion only.
  // Skips if same animation. Does NOT interrupt a blocking-once attack.
  // Avoids reset() on already-running loop animations so the cycle phase is
  // preserved — prevents the pop/stutter visible when changing direction.
  const transitionTo = useCallback((next: AnimKey, fade = FADE_LOCO) => {
    if (blockingOnce.current) return;         // never interrupt an attack
    if (curAnim.current === next) return;
    const a = actionsRef.current[next];
    // Guard: if the target clip hasn't been registered yet (lazy pack still loading)
    // do NOT fade out the current animation — keep it playing until the new one is ready.
    // This is the primary defence against T-pose on weapon switch or traverse entry.
    if (!a) return;
    actionsRef.current[curAnim.current]?.fadeOut(fade);
    if (!a.isRunning()) {
      // Not playing yet — start cleanly from the top
      a.reset().fadeIn(fade).play();
    } else {
      // Already playing (e.g. returning to walk from sprint mid-stride)
      // — just cross-fade in without restarting the phase.
      a.fadeIn(fade);
    }
    curAnim.current = next;
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
      // Guard: if the attack clip isn't loaded yet, bail out completely.
      // Never set blockingOnce = true without a clip to play — doing so locks
      // the locomotion state machine permanently (the "finished" event never fires).
      if (!actionsRef.current[slot.key]) return;
      // Play immediately — consume mana now if required
      if (slot.manaCost !== undefined) {
        const ok = useMana(slot.manaCost);
        if (!ok) return;
      }
      blockingOnce.current = true;
      _rawPlay(slot.key, slot.fade, slot.timeScale ?? 1);
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

  // Sword-and-Shield LMB attack — cycles through ssAttack1..ssAttack4.
  const doSSAttack = useCallback(() => {
    const phase = ssAttackPhase.current % 4;
    const anim  = (["ssAttack1","ssAttack2","ssAttack3","ssAttack4"] as const)[phase];
    ssAttackPhase.current++;
    requestBlockingAnim({
      key:   anim,
      fade:  blockingOnce.current ? FADE_ATK_CHAIN : FADE_ATK_START,
      dmgMs: MELEE_DMG_DELAY,
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

    // Play cast animation if in staff mode — each spell gets its own anim + speed
    const wm = store.weaponMode;
    if (wm === "staff") {
      // Spell → animation mapping: gives each spell a distinct feel
      const SPELL_ANIM: Record<string, { key: "staffCast1" | "staffCast2"; timeScale: number }> = {
        orb:     { key: "staffCast1", timeScale: 0.85 }, // slow floating orb gesture
        javelin: { key: "staffCast2", timeScale: 1.45 }, // fast piercing thrust
        wave:    { key: "staffCast1", timeScale: 0.50 }, // wide, sweeping wave cast
        nova:    { key: "staffCast2", timeScale: 1.00 }, // full-weight explosion push
      };
      const spellAnim = SPELL_ANIM[store.selectedSpell] ?? { key: "staffCast1" as const, timeScale: 1 };
      requestBlockingAnim({
        key:       spellAnim.key,
        fade:      blockingOnce.current ? FADE_ATK_CHAIN : FADE_ATK_START,
        timeScale: spellAnim.timeScale,
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
    const isMeleeOrShield = wm === "sword" || wm === "axe" || wm === "shield";
    transitionTo(isMeleeOrShield ? "meleeCrouch" : "pistolCrouchDown", 0.1);
    setTimeout(() => {
      if (crouching.current) transitionTo(isMeleeOrShield ? "meleeCrouch" : "pistolCrouchIdle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo]);

  const endCrouch = useCallback(() => {
    if (!crouching.current || crouchPending.current) return;
    crouchPending.current = "stand";
    crouching.current     = false;
    const wm = useGameStore.getState().weaponMode;
    const isMeleeOrShield = wm === "sword" || wm === "axe" || wm === "shield";
    // Melee/shield uses a dedicated stand-from-crouch animation if it's loaded;
    // fall back to meleeIdle if the FBX hasn't finished loading yet.
    const standKey: AnimKey = (isMeleeOrShield && actionsRef.current["meleeStandFromCrouch"])
      ? "meleeStandFromCrouch"
      : isMeleeOrShield ? "meleeIdle"
      : "pistolCrouchUp";
    transitionTo(standKey, 0.1);
    setTimeout(() => {
      transitionTo(isMeleeOrShield ? "meleeIdle" : "pistolIdle", 0.15);
      crouchPending.current = null;
    }, 650);
  }, [transitionTo]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── INPUT HANDLERS ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!locked.current) return;
    const { sensitivity, mode } = useGameStore.getState().camera;
    // ARPG camera has a fixed world angle — mouse look is disabled
    if (mode === "arpg") return;
    yaw.current   -= e.movementX * sensitivity;
    pitch.current -= e.movementY * sensitivity;
    const pMax = mode === "action" ? PITCH_MAX_ACTION : PITCH_MAX_TPS;
    pitch.current = Math.max(PITCH_MIN, Math.min(pMax, pitch.current));
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      if (!locked.current) { document.body.requestPointerLock(); return; }
      const wm       = useGameStore.getState().weaponMode;
      const isMelee  = wm === "sword" || wm === "axe";
      const isStaff  = wm === "staff";
      const isBow    = wm === "bow";
      const isShield = wm === "shield";

      if (isStaff) {
        doStaffCast("staffCast1", STAFF_CAST1_COST, STAFF_CAST1_DMS);
      } else if (isShield) {
        doSSAttack();
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
      const wm       = useGameStore.getState().weaponMode;
      const isMelee  = wm === "sword" || wm === "axe";
      const isStaff  = wm === "staff";
      const isBow    = wm === "bow";
      const isShield = wm === "shield";

      if (isStaff) {
        doStaffCast("staffCast2", STAFF_CAST2_COST, STAFF_CAST2_DMS);
      } else if (isShield) {
        // RMB shield = hold to raise shield (blocking locomotion state)
        ssBlocking.current = true;
        transitionTo("ssBlockIdle", 0.12);
      } else if (isMelee) {
        // RMB melee = heavy hit (power strike — plays the hardest combo animation once)
        if (blockingOnce.current) return;
        requestBlockingAnim({ key: "meleeCombo3", fade: FADE_ATK_START, dmgMs: 520 });
      } else if (isBow) {
        // RMB bow: moving = quick parry deflect; stationary = enter aim mode
        const moving = keys.current["KeyW"] || keys.current["KeyA"]
                    || keys.current["KeyS"] || keys.current["KeyD"];
        if (moving) {
          requestBlockingAnim({ key: "bowBlock", fade: FADE_ATK_START });
        } else {
          bowAiming.current = true;
        }
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
    doMeleeAttack, doSSAttack, doStaffCast, requestBlockingAnim, transitionTo,
  ]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 2) {
      bowAiming.current  = false;
      ssBlocking.current = false;
      // Note: melee RMB is now a heavy hit (not a hold-block), so no blocking cleanup needed.
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (["AltLeft","AltRight","F1","F2","F3","F9","ControlLeft","ControlRight","Escape"].includes(e.code)) {
      e.preventDefault();
    }
    keys.current[e.code] = true;

    // ESC — pause game, release pointer lock
    if (e.code === "Escape") {
      setPaused(true);
      document.exitPointerLock();
      return;
    }

    // F1 — toggle God Mode (noclip, free-fly, T-pose)
    if (e.code === "F1") {
      useGameStore.getState().toggleGodMode();
      return;
    }

    // F9 — toggle Admin Panel
    if (e.code === "F9") {
      useGameStore.getState().toggleAdminPanel();
      return;
    }

    // R — skill slot 4 (5th skill, 0-indexed)
    if (e.code === "KeyR") { e.preventDefault(); executeSkillRef.current?.(4); }

    // E — interact with the nearest interactable object
    if (e.code === "KeyE") {
      document.dispatchEvent(new CustomEvent("game:interact"));
    }

    // F — fire the selected magic spell from the radial wheel
    if (e.code === "KeyF") doFireSpell();

    // Q — cycle weapon
    if (e.code === "KeyQ") {
      cycleWeapon();
      const newWm = useGameStore.getState().weaponMode;
      // Clear queue and blocking state on weapon switch
      blockingOnce.current    = false;
      nonBlockingOnce.current = false;
      staffIdleTimer.current  = 0;
      animQueue.current       = null;
      attackPhase.current     = 0;
      comboWindow.current     = 0;
      bowAiming.current       = false;
      ssBlocking.current      = false;
      if (meleeBlocking.current) { meleeBlocking.current = false; setMeleeBlocking(false); }
      ssAttackPhase.current   = 0;
      transitionTo(idleForMode(newWm), 0.25);
    }

    // C — character panel
    if (e.code === "KeyC") {
      const show = !useGameStore.getState().showCharacterPanel;
      toggleCharacterPanel();
      if (show) document.exitPointerLock();
      else document.body.requestPointerLock();
    }

    // P — cycle camera modes: tps → action → arpg → tps
    if (e.code === "KeyP") {
      cycleCameraMode();
    }

    // F2 — direct tps ↔ arpg jump (quick toggle between third-person and isometric)
    if (e.code === "F2") {
      const store = useGameStore.getState();
      setCameraMode(store.camera.mode === "arpg" ? "tps" : "arpg");
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

    // ── Skill hotkeys 1-4 ─────────────────────────────────────────────────
    if (e.code === "Digit1") { e.preventDefault(); executeSkillRef.current?.(0); }
    if (e.code === "Digit2") { e.preventDefault(); executeSkillRef.current?.(1); }
    if (e.code === "Digit3") { e.preventDefault(); executeSkillRef.current?.(2); }
    if (e.code === "Digit4") { e.preventDefault(); executeSkillRef.current?.(3); }

    // ── Double-tap W/A/S/D → directional dodge ────────────────────────────
    // If the same direction key is pressed twice within DOUBLE_TAP_MS, fire a
    // quick dodge in that direction.  The roll-cooldown prevents spam.
    if (e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD") {
      const now  = performance.now();
      const last = doubleTapTimers.current[e.code] ?? 0;
      doubleTapTimers.current[e.code] = now;
      if (now - last < DOUBLE_TAP_MS) {
        const dir: "fwd"|"bwd"|"left"|"right" =
          e.code === "KeyW" ? "fwd" :
          e.code === "KeyS" ? "bwd" :
          e.code === "KeyA" ? "left" : "right";
        triggerDodgeRef.current?.(dir);
      }
    }

    // Ctrl — committed roll (same physics but full ROLL_SPEED/ROLL_DURATION;
    //         direction is decided by held WASD, defaulting to forward)
    if ((e.code === "ControlLeft" || e.code === "ControlRight")
      && grounded.current && !rolling.current && !crouching.current
      && rollCooldown.current <= 0) {

      rolling.current      = true;
      rollTimer.current    = ROLL_DURATION;
      rollCooldown.current = ROLL_COOLDOWN;
      blockingOnce.current = true;

      const fwdV = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const rgtV = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      const d    = new THREE.Vector3();
      if (keys.current["KeyW"]) d.add(fwdV);
      if (keys.current["KeyS"]) d.sub(fwdV);
      if (keys.current["KeyA"]) d.sub(rgtV);
      if (keys.current["KeyD"]) d.add(rgtV);
      if (d.lengthSq() < 0.01) d.copy(fwdV);
      rollDir.current.copy(d.normalize());

      const rightBias = rollDir.current.dot(rgtV);
      rollCamZ.current = -rightBias * 0.18;

      // Determine dominant direction for animation selection
      const dotFwd  = rollDir.current.dot(fwdV);
      const dotRgt  = rollDir.current.dot(rgtV);
      const rollKey: AnimKey =
        Math.abs(dotFwd) >= Math.abs(dotRgt)
          ? (dotFwd >= 0 ? "dodgeFwd" : "dodgeBwd")
          : (dotRgt >= 0 ? "dodgeR"   : "dodgeL");
      _rawPlay(rollKey, 0.08, 1.3);
      if (setInvincible) setInvincible(true);
    }
  }, [
    setPaused, cycleWeapon, transitionTo,
    setCameraMode, cycleCameraMode, setShowCameraSettings,
    startCrouch, endCrouch, setInvincible,
    toggleCharacterPanel,
    setShowSpellRadial, doFireSpell,
  ]);

  const handleKeyUp   = useCallback((e: KeyboardEvent) => { keys.current[e.code] = false; }, []);
  const handlePLC = useCallback(() => {
    locked.current = document.pointerLockElement === document.body;
    // Gaining pointer lock always resumes the game.
    // Losing it (alt-tab, window blur) pauses until the player clicks back in.
    if (locked.current) setPaused(false);
    else                setPaused(true);
  }, [setPaused]);
  const handleCtxMenu = useCallback((e: MouseEvent) => e.preventDefault(), []);

  useEffect(() => {
    document.addEventListener("mousemove",         handleMouseMove);
    document.addEventListener("mousedown",         handleMouseDown);
    document.addEventListener("mouseup",           handleMouseUp);
    document.addEventListener("keydown",           handleKeyDown);
    document.addEventListener("keyup",             handleKeyUp);
    document.addEventListener("pointerlockchange", handlePLC);
    document.addEventListener("contextmenu",       handleCtxMenu);
    // Sync locked ref immediately (pointer lock may already be active on re-mount)
    locked.current = document.pointerLockElement === document.body;
    // Do NOT force-pause on mount — game starts unpaused; ESC / pointer-lock-loss pauses.
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

    // ── Single store snapshot per frame — avoids repeated getState() calls ──
    const gs = useGameStore.getState();

    // ── Death system: play death animation before handing off to game-over ───
    // We must NOT return immediately here — the mixer still needs to update so
    // the death clip plays. dyingRef gates setup to one frame only.
    if (gs.health <= 0) {
      if (!dyingRef.current && !deadFired.current) {
        dyingRef.current     = true;
        blockingOnce.current = true;   // freeze locomotion layer
        animQueue.current    = null;   // discard any queued action
        const deathWm = gs.weaponMode;
        // Play a weapon-specific death clip when available
        const deathKey: AnimKey | null =
          (deathWm === "staff" && actionsRef.current["staffDeath"]) ? "staffDeath" : null;
        if (deathKey) _rawPlay(deathKey, 0.15);
        // Let the animation run for 1.4 s then trigger game-over
        setTimeout(() => { deadFired.current = true; onDead(); }, 1400);
      }
      // Keep the mixer ticking so the death animation plays through
      mixerRef.current?.update(delta);
      return;
    }

    // ── Timers ─────────────────────────────────────────────────────────────
    if (shootCooldown.current > 0) shootCooldown.current -= delta;
    if (rollCooldown.current  > 0) rollCooldown.current  -= delta;
    if (comboWindow.current   > 0) comboWindow.current   -= delta;
    tickSpellCooldown(delta);

    // ── Skill cooldown tick (local ref + store for HUD) ──────────────────
    tickSkillCooldowns(delta);
    for (const id of Object.keys(skillCooldownsRef.current)) {
      skillCooldownsRef.current[id] = Math.max(0, skillCooldownsRef.current[id] - delta);
    }

    // Staff mana regen
    if (gs.weaponMode === "staff") {
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

    // ── Drain pending skill hits (pure JS — zero Rapier calls) ─────────────
    // Game.tsx handleSkillHit does arc+range geometry on zombie positions.
    // sphere  (arcDeg=360): cos(π)=-1 → dot≥-1 always → omnidirectional
    // capsule (arcDeg<360): arc-limited forward cone
    // ray     (arcDeg≤20):  narrow beam
    // All cases use the same { origin, dir } payload — no Rapier WASM needed.
    if (pendingHitsRef.current.length > 0 && !rapierPanicked.current) {
      const now = performance.now();
      const remaining: typeof pendingHitsRef.current = [];
      for (const hit of pendingHitsRef.current) {
        if (hit.fireAt > now) { remaining.push(hit); continue; }

        const ppos   = playerPosRef.current;
        const hitFwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
        const origin = ppos.clone().add(new THREE.Vector3(0, 1.1, 0));

        // Fire hit — Game.tsx resolves which zombies are in range + arc
        onSkillHit({ origin, dir: hitFwd, damage: hit.damage, range: hit.range, arcDeg: hit.arcDeg });

        // ── Visual effect (based on arc width, not shape) ─────────────────
        if (hit.arcDeg >= 180) {
          // Sphere / wide AoE — burst + spark ring at player feet
          effectsRef.current?.spawnBurst(
            new THREE.Vector3(ppos.x, 0.08, ppos.z),
            hit.effectColor, hit.effectRadius,
          );
          effectsRef.current?.spawnSpark(
            new THREE.Vector3(ppos.x, 0.1, ppos.z),
            hit.effectColor, hit.effectRadius * 0.6, 6,
          );
        } else if (hit.arcDeg <= 20) {
          // Narrow ray — burst in the direction of aim
          effectsRef.current?.spawnBurst(
            new THREE.Vector3(ppos.x, 0.08, ppos.z),
            hit.effectColor, 1.2 + hit.effectRadius * 0.2, 0.3,
          );
        } else {
          // Capsule / medium arc — ring in front of player
          const fx = ppos.clone().addScaledVector(hitFwd, Math.min(hit.range * 0.5, 3));
          effectsRef.current?.spawnRing(
            new THREE.Vector3(fx.x, 0.08, fx.z),
            hit.effectColor, hit.effectRadius,
          );
        }
      }
      pendingHitsRef.current = remaining;
    }

    mixerRef.current?.update(delta);

    // ── Input state (hoisted — used by bob, lean, camera, and locomotion) ──
    const fwd    = !!(keys.current["KeyW"] || keys.current["ArrowUp"]);
    const bwd    = !!(keys.current["KeyS"] || keys.current["ArrowDown"]);
    const left   = !!(keys.current["KeyA"] || keys.current["ArrowLeft"]);
    const right  = !!(keys.current["KeyD"] || keys.current["ArrowRight"]);
    const sprint = !!(keys.current["ShiftLeft"] || keys.current["ShiftRight"]) && !crouching.current;

    // ── Camera — smooth world-space follow ─────────────────────────────────
    // Camera lives in SCENE space (not parented to rootRef) so that Rapier
    // physics corrections never snap it.  Each frame we compute the IDEAL
    // camera world position, then exponentially lerp the actual camera toward
    // it (k=18 → ~95 % settled in ≈ 0.17 s, feels responsive but never jerky).
    //
    // tps    = user-configured over-shoulder (shoulderX/Y/Z)
    // action = tight cinematic combat cam: closer, lower, more dramatic
    // arpg   = isometric follow cam — Diablo/PoE style, fixed world angle
    const { mode, shoulderX, shoulderY, shoulderZ } = gs.camera;
    const camX = mode === "arpg"   ? 0
               : mode === "action" ? 0.28
               : shoulderX;
    const camY = mode === "arpg"   ? ARPG_CAM_Y
               : mode === "action" ? 0.80
               : shoulderY;
    const camZ = mode === "arpg"   ? ARPG_CAM_Z
               : mode === "action" ? 1.55
               : shoulderZ;

    // Head bob — procedural oscillation while moving; fades out on stop.
    // Suppressed in ARPG mode (fixed camera — bob looks odd from isometric angle).
    const isMovingNow = (fwd || bwd || left || right) && grounded.current;
    const bobFreq = sprint ? 13 : 9;
    bobTimerRef.current += delta * bobFreq * (isMovingNow ? 1 : -Math.min(1, bobTimerRef.current));
    bobTimerRef.current  = Math.max(0, bobTimerRef.current);
    const bobAmp  = sprint ? 0.025 : 0.014;
    const enableBob = mode !== "arpg";
    const bobY    = enableBob && (isMovingNow || bobTimerRef.current > 0.01) ? Math.sin(bobTimerRef.current) * bobAmp : 0;
    const bobX    = enableBob && (isMovingNow || bobTimerRef.current > 0.01) ? Math.sin(bobTimerRef.current * 0.5) * bobAmp * 0.35 : 0;

    const pPos = rootRef.current.position; // character world position

    if (mode === "arpg") {
      // ARPG isometric: fixed world-space offset, no yaw rotation.
      // Camera always looks from the same world direction (like Diablo).
      // Position: directly behind (+Z) and above (+Y) the player — the
      // resulting angle is arctan(ARPG_CAM_Y / ARPG_CAM_Z) ≈ -45°.
      _camIdeal.set(pPos.x, pPos.y + ARPG_CAM_Y, pPos.z + ARPG_CAM_Z);
    } else {
      // TPS / action: shoulder offset rotated by character yaw
      // Compute yawQ once (also reused for rootRef rotation below)
      _yawQ.setFromAxisAngle(_UP_AXIS, yaw.current);
      _camOffset.set(camX, camY, camZ).applyQuaternion(_yawQ);
      _camIdeal.copy(pPos).add(_camOffset);
      // Bob applied in world space along global Y and strafe-right
      _camIdeal.y += bobY;
      // Lateral bob along the right vector (cos yaw, 0, -sin yaw)
      _camIdeal.x += bobX * Math.cos(yaw.current);
      _camIdeal.z += bobX * -Math.sin(yaw.current);
    }

    // Smooth lerp toward ideal — k=18: responsive, never snappy
    const camT = 1 - Math.exp(-18 * delta);
    cameraWorldPosRef.current.lerp(_camIdeal, camT);
    camera.position.copy(cameraWorldPosRef.current);

    // Camera rotation — world space (no parent transform to inherit yaw from)
    camera.rotation.x = mode === "arpg" ? ARPG_PITCH : pitch.current;
    camera.rotation.y = mode === "arpg" ? 0          : yaw.current;
    camera.rotation.z = mode === "arpg" ? 0          : rollCamZ.current;

    // ── FOV zoom — smooth lerp for melee block (1.5×) and bow aim ────────────
    // Uses exponential decay (1 - e^(-k·dt)) for true frame-rate independence —
    // a fixed lerp factor (delta * k) undershoots at low fps and overshoots at high fps.
    {
      const baseFov   = gs.camera.fov;
      const isZoomed  = meleeBlocking.current || ssBlocking.current;
      const targetFov = isZoomed ? baseFov / 1.5 : baseFov;
      const cam       = camera as THREE.PerspectiveCamera;
      const t         = 1 - Math.exp(-10 * delta);   // frame-rate-independent decay
      cam.fov         = THREE.MathUtils.lerp(cam.fov, targetFov, t);
      cam.updateProjectionMatrix();
    }

    // ── Roll cam-Z decay — exponential, frame-rate-independent ───────────────
    rollCamZ.current *= Math.exp(-14 * delta);

    // ── Yaw on rootRef — lean kept on leanGroupRef only ──────────────────────
    // rootRef gets ONLY the yaw so the character body faces the right direction.
    // The body-lean quaternion is applied to the child leanGroupRef so only
    // the character mesh tilts; the world-space camera tracks separately.
    const strafe = !sprint && grounded.current && !rolling.current;
    const targetLean = (left && !right && strafe) ?  0.07
                     : (right && !left && strafe) ? -0.07 : 0;
    // Exponential decay — same reasoning as FOV zoom above
    leanRef.current += (targetLean - leanRef.current) * (1 - Math.exp(-10 * delta));
    _yawQ.setFromAxisAngle(_UP_AXIS, yaw.current);
    _leanQ.setFromAxisAngle(_FWD_BODY, leanRef.current);
    rootRef.current.quaternion.copy(_yawQ);        // camera parent: yaw only
    if (leanGroupRef.current) {
      leanGroupRef.current.quaternion.copy(_leanQ); // body mesh: lean only
    }

    if (modelGroupRef.current) modelGroupRef.current.visible = true; // always visible (no fps mode)

    // ── Weapon model + hand-bone tracking ──────────────────────────────────
    const wm        = gs.weaponMode;
    // Lazy-load the weapon animation pack the first time that weapon is equipped
    if (wm !== prevWeaponModeRef.current) {
      prevWeaponModeRef.current = wm;
      loadPackRef.current?.(wm);
    }
    const isMelee   = wm === "sword" || wm === "axe";
    const isStaffWm = wm === "staff";
    const isBowWm   = wm === "bow";
    const isSSWm    = wm === "shield";

    // Weapon visibility — props are already bone-parented so no world-transform
    // copy is needed here.  Bones animate; children follow automatically.
    if (swordObj)      swordObj.visible      = isMelee && wm === "sword";
    if (axeObj)        axeObj.visible        = isMelee && wm === "axe";
    if (caneObj)       caneObj.visible       = isStaffWm;
    if (pistolPropObj) pistolPropObj.visible = wm === "pistol";
    if (riflePropObj)  riflePropObj.visible  = wm === "rifle";
    if (bowPropObj)    bowPropObj.visible    = isBowWm;
    if (shieldPropObj) shieldPropObj.visible = isSSWm;

    // ── GOD MODE: noclip free-fly (T-pose) ─────────────────────────────────
    const godModeActive = gs.godMode;
    // Freeze the animation mixer in T-pose (timeScale=0) when god mode is on
    if (mixerRef.current) mixerRef.current.timeScale = godModeActive ? 0 : 1;

    if (godModeActive && playerRBRef.current && !rapierPanicked.current) {
      const gSpeed = (keys.current["ShiftLeft"] || keys.current["ShiftRight"]) ? 30 : 12;
      // Reuse module-level scratch vectors — no heap allocation
      _flyFwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      _flyRgt.set( Math.cos(yaw.current), 0, -Math.sin(yaw.current));
      _flyDir.set(0, 0, 0);
      if (fwd)   _flyDir.add(_flyFwd);
      if (bwd)   _flyDir.sub(_flyFwd);
      if (left)  _flyDir.sub(_flyRgt);
      if (right) _flyDir.add(_flyRgt);
      if (_flyDir.lengthSq() > 0) _flyDir.normalize().multiplyScalar(gSpeed * delta);
      if (keys.current["Space"])                                           _flyDir.y += gSpeed * delta;
      if (keys.current["ControlLeft"] || keys.current["ControlRight"])    _flyDir.y -= gSpeed * delta;
      // Copy WASM translation to plain scalars before calling setNextKinematicTranslation
      // — same pattern as the ground-physics block to prevent potential borrow aliasing.
      const pos  = playerRBRef.current.translation();
      const px = pos.x, py = pos.y, pz = pos.z;
      const next = { x: px + _flyDir.x, y: py + _flyDir.y, z: pz + _flyDir.z };
      playerRBRef.current.setNextKinematicTranslation(next);
      rootRef.current.position.set(next.x, next.y - capCY, next.z);
      playerPosRef.current.copy(rootRef.current.position);
      return; // skip normal physics + locomotion state machine
    }

    // ── Movement input — reuse module-level scratch vectors (zero heap alloc) ──
    // _fwdVec / _rgtVec: camera-relative axes derived from yaw only (no pitch),
    // so movement stays on the ground plane regardless of where the player is looking.
    _fwdVec.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    _rgtVec.set( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    // ── Desired velocity from input (m/s, no delta yet) ──────────────────────
    if (rolling.current && rollTimer.current > 0) {
      // Roll: bypass smoothing for an instant snap — keeps dodge feeling crisp
      _targetVel.copy(rollDir.current).multiplyScalar(ROLL_SPEED);
    } else if (!crouching.current && !crouchPending.current) {
      _targetVel.set(0, 0, 0);
      if (fwd)   _targetVel.add(_fwdVec);
      if (bwd)   _targetVel.sub(_fwdVec);
      if (left)  _targetVel.sub(_rgtVec);
      if (right) _targetVel.add(_rgtVec);
      if (_targetVel.lengthSq() > 0)
        _targetVel.normalize().multiplyScalar(sprint ? RUN_SPEED : WALK_SPEED);
    } else {
      // Crouching or mid-transition — ramp velocity to zero smoothly
      _targetVel.set(0, 0, 0);
    }

    // Exponential-decay smoothing (k=14 → ~95 % settled in ≈ 0.21 s at 60 fps).
    // Removes the rubber-band snap that occurs on instant start / stop / direction
    // reversal, giving the character organic acceleration and deceleration.
    const velDecay = 1 - Math.exp(-14 * delta);
    smoothVelRef.current.lerp(_targetVel, velDecay);

    // Apply time step to produce the per-frame displacement sent to Rapier
    _moveVec.copy(smoothVelRef.current).multiplyScalar(delta);

    if (keys.current["Space"] && grounded.current && !crouching.current && !rolling.current && !inWater.current) {
      if (wallBlocked.current && !isClimbing.current && actionsRef.current["climbUp"]) {
        // Vault over the wall: play blocking climb-up anim and apply upward physics
        isClimbing.current = true;
        climbTimer.current = 0;
        transitionTo("climbUp", 0.08);
        // After vault finishes, return to idle
        setTimeout(() => {
          isClimbing.current = false;
          climbTimer.current = 0;
          if (!blockingOnce.current) {
            transitionTo(idleForMode(useGameStore.getState().weaponMode), 0.2);
          }
        }, Math.round(CLIMB_UP_DUR * 1000) + 200);
      } else if (!isClimbing.current) {
        velY.current     = JUMP_FORCE;
        grounded.current = false;
      }
    }

    // ── Rapier physics ──────────────────────────────────────────────────────
    // SAFETY: all Rapier API calls are wrapped in try-catch.
    // computeColliderMovement borrows the world for its entire sweep; if any
    // live Rapier WASM object already holds a borrow on the same RefCell the
    // WASM runtime panics with "recursive use / unsafe aliasing".
    // Guard: always pass `collider` as filterExcludeCollider so the sweep
    // never re-borrows the same capsule it was given, and copy rb.translation()
    // into plain scalars before calling setNextKinematicTranslation (two
    // sequential borrows on the bodies store are safe; simultaneous ones are not).
    //
    // rapierPanicked: once the first panic fires, the WASM RefCell is corrupted.
    // Every subsequent call will also panic, causing a cascade that destroys the
    // React component tree and the WebGL context.  Skip ALL Rapier calls after
    // the first panic until the component remounts with a fresh world.
    const rb   = playerRBRef.current;
    const ctrl = charCtrl.current;

    // ── Water detection ──────────────────────────────────────────────────────
    // Compare foot-level Y (rootRef position = foot level) against waterY prop.
    const footY      = rootRef.current.position.y;
    const effectiveWaterY = (typeof waterY === "number" && isFinite(waterY)) ? waterY : -Infinity;
    const nowInWater = footY < effectiveWaterY;

    // Edge: entering water — kill downward momentum so there's no hard splash
    if (nowInWater && !prevInWater.current) {
      velY.current = Math.min(velY.current, 0.5);
    }

    // Edge: exiting water onto shore (grounded while previously in water)
    if (!nowInWater && prevInWater.current && grounded.current && !blockingOnce.current) {
      if (actionsRef.current["swimToEdge"]) {
        transitionTo("swimToEdge", 0.08);
        // After clip (~1.3 s) return to weapon idle
        setTimeout(() => {
          if (!inWater.current && !blockingOnce.current) {
            transitionTo(idleForMode(useGameStore.getState().weaponMode), 0.25);
          }
        }, 1350);
      }
    }

    prevInWater.current = nowInWater;
    inWater.current     = nowInWater;

    // Clamp horizontal speed in water
    if (nowInWater) {
      const hLen = Math.sqrt(_moveVec.x * _moveVec.x + _moveVec.z * _moveVec.z);
      if (hLen > SWIM_SPEED * delta) {
        const s = (SWIM_SPEED * delta) / hLen;
        _moveVec.x *= s;
        _moveVec.z *= s;
      }
    }

    if (rb && ctrl && !rapierPanicked.current) {
      // ── Gravity (context-aware) ─────────────────────────────────────────
      if (nowInWater) {
        // Buoyancy: gently float toward surface (waterY - SWIM_SURFACE_Y)
        const targetY  = effectiveWaterY - SWIM_SURFACE_Y;
        const diff     = targetY - footY;
        const buoyancy = THREE.MathUtils.clamp(diff * 4, -2, 4);
        velY.current   = THREE.MathUtils.clamp(
          velY.current + (WATER_GRAV + buoyancy) * delta,
          -SWIM_MAX_VEL, SWIM_MAX_VEL
        );
        // Space = swim up
        if (keys.current["Space"]) {
          velY.current = THREE.MathUtils.clamp(
            velY.current + SWIM_UP_FORCE * delta,
            -SWIM_MAX_VEL, SWIM_MAX_VEL
          );
        }
      } else {
        velY.current += -22 * delta;
        if (velY.current < -30) velY.current = -30;

        // ── Climbing vault ───────────────────────────────────────────────
        // If pressing W into a blocked wall and Space is pressed, vault up.
        if (isClimbing.current) {
          climbTimer.current += delta;
          // Apply upward velocity during the animation (first CLIMB_UP_DUR sec)
          if (climbTimer.current < CLIMB_UP_DUR) {
            velY.current = 5.5;   // steady upward push
          } else {
            // Vault complete — apply a final boost and exit climbing
            isClimbing.current = false;
            climbTimer.current = 0;
            velY.current       = 3;   // small hop at the crest
          }
        }
      }
      _moveVec.y = velY.current * delta;

      try {
        const collider = rb.collider(0);
        if (collider) {
          // Pass collider as filterExcludeCollider so Rapier never tries to
          // re-borrow the same WASM object during the internal sweep — this
          // was the aliasing source at wasm-function[539] / [1020].
          ctrl.computeColliderMovement(
            collider,
            { x: _moveVec.x, y: _moveVec.y, z: _moveVec.z },
            undefined,   // filterFlags
            CG_PLAYER,   // filterGroups
            collider,    // filterExcludeCollider — exclude our own capsule
          );
          const resolved   = ctrl.computedMovement();
          const isGrounded = ctrl.computedGrounded();

          // ── Wall-block detection (for climb trigger) ─────────────────
          // Compare intended horizontal displacement with what Rapier resolved.
          if (!nowInWater && grounded.current && fwd) {
            const attempted = Math.sqrt(_moveVec.x * _moveVec.x + _moveVec.z * _moveVec.z);
            const actual    = Math.sqrt(resolved.x * resolved.x + resolved.z * resolved.z);
            wallBlocked.current = attempted > 0.002 && actual < attempted * WALL_BLOCK_FRAC;
          } else {
            wallBlocked.current = false;
          }

          if (isGrounded && velY.current < 0) {
            velY.current = 0;
            if (!grounded.current) {
              grounded.current = true;
              // Land animation (only if not mid-attack and not water-exit)
              if (!blockingOnce.current && !prevInWater.current) {
                const landAnim: AnimKey =
                    wm === "staff"   ? "staffIdle"
                  : (wm === "sword" || wm === "axe") ? "meleeIdle"
                  : wm === "rifle"  ? "rifleIdle"
                  : wm === "bow"    ? "bowIdle"
                  : wm === "shield" ? "ssIdle"
                  : "pistolLand";
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

          // Copy translation to plain scalars immediately so the world borrow
          // from rb.translation() is released before setNextKinematicTranslation.
          const pos  = rb.translation();
          const px = pos.x, py = pos.y, pz = pos.z;
          const nx = px + resolved.x, ny = py + resolved.y, nz = pz + resolved.z;
          rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
          rootRef.current.position.set(nx, ny - capCY, nz);
          playerPosRef.current.copy(rootRef.current.position);
        }
      } catch (_rapierErr) {
        // Rapier WASM borrow panic — latch the flag so we never call Rapier
        // again from this component instance.  Without the latch, every
        // subsequent frame fires the same panic (the WASM RefCell remains
        // corrupted after the first panic), producing a cascade of hundreds
        // of errors that destroys the React tree and the WebGL context.
        // The component will fully remount on the next character-switch or
        // scene reload, giving a fresh Rapier world.
        rapierPanicked.current = true;
      }
    } else {
      // Fallback: no Rapier rigidbody yet — apply horizontal movement directly
      rootRef.current.position.x += _moveVec.x;
      rootRef.current.position.z += _moveVec.z;
      velY.current += nowInWater ? WATER_GRAV * delta : -22 * delta;
      rootRef.current.position.y += velY.current * delta;
      if (rootRef.current.position.y <= 0) {
        rootRef.current.position.y = 0;
        velY.current = 0;
        grounded.current = true;
      }
      playerPosRef.current.copy(rootRef.current.position);
    }

    // ── LAYER 0: Traverse animation state machine (water + climbing) ──────────
    // Takes full priority over weapon locomotion whenever the player is in water
    // or actively climbing.  Climbing uses blockingOnce so LAYER 1 is already
    // suspended by the standard mechanism; water needs an explicit early-return.
    if (inWater.current) {
      const moving = fwd || bwd || left || right;
      const target: AnimKey = moving ? "swimming" : "treading";
      if (curAnim.current !== target && actionsRef.current[target]) {
        transitionTo(target, FADE_LOCO);
      }
      // Skip weapon locomotion SM entirely while underwater
      return;
    }

    // ── LAYER 1: Locomotion animation state machine ────────────────────────
    // Suspended whenever a LAYER 2 (weapon/dodge) animation is blocking.
    if (!blockingOnce.current) {
      const next = resolveAnim(
        wm, fwd, bwd, left, right, sprint,
        grounded.current, crouching.current,
        bowAiming.current,
        ssBlocking.current,
        meleeBlocking.current,
      );
      // Don't override a cosmetic non-blocking ONCE anim with the idle it
      // originated from — let it finish naturally.  Movement always breaks out.
      const isIdleVariantActive = nonBlockingOnce.current && next === idleForMode(wm);
      if (next !== curAnim.current && !isIdleVariantActive) {
        transitionTo(next);
        nonBlockingOnce.current = false; // movement/state change cancels any idle variant
      }

      // ── Staff idle variety ─────────────────────────────────────────────────
      // After 7 s of continuous staffIdle, play staffIdle2 once then reset.
      if (curAnim.current === "staffIdle" && !nonBlockingOnce.current) {
        staffIdleTimer.current += delta;
        if (staffIdleTimer.current >= 7) {
          staffIdleTimer.current = 0;
          nonBlockingOnce.current = true;
          _rawPlay("staffIdle2", FADE_LOCO);
        }
      } else if (!nonBlockingOnce.current) {
        staffIdleTimer.current = 0;
      }

      // ── Rifle in-place turn animations ────────────────────────────────────
      // While standing idle with the rifle, detect camera yaw rotation and
      // play a quarter-turn animation.  Only fires when no ONCE anim is live
      // and the player is actually idle (no movement keys).
      const yawDelta = yaw.current - prevYaw.current;
      if (
        wm === "rifle" &&
        curAnim.current === "rifleIdle" &&
        !nonBlockingOnce.current &&
        Math.abs(yawDelta) > 0.025   // ≈ 1.4° — filters mouse micro-jitter
      ) {
        nonBlockingOnce.current = true;
        _rawPlay(yawDelta > 0 ? "rifleTurnR" : "rifleTurnL", FADE_LOCO);
      }
      prevYaw.current = yaw.current;

      // ── Speed-matched animation timeScale — prevents foot sliding ───────────
      // Best-practice: drive timeScale from the ACTUAL smoothed physics velocity
      // (smoothVelRef.current.length()), not the instantaneous input target.
      //
      // Using input-derived speed (the old approach) caused foot sliding because
      // the animation snapped to full speed the moment a key was pressed while
      // the physics body was still accelerating from rest, and snapped back to
      // idle-speed the moment keys were released while momentum was still decaying.
      //
      // Using smoothVelRef.length() makes the animation speed track the real
      // movement — the walk/run cycles naturally accelerate and decelerate in
      // lockstep with the physics body, eliminating foot sliding at both ends.
      //
      // Only walk/run/strafe clips get timeScale correction.  Idle, attack,
      // dodge, swim, and special clips always play at their authored speed (1.0
      // or whatever was passed to _rawPlay) so we don't accidentally slow/speed
      // a carefully timed attack swing or idle variety clip.
      const isCrouchMoving = crouching.current && (fwd || bwd || left || right) && grounded.current;
      const cur = actionsRef.current[curAnim.current];
      if (cur) {
        if (isCrouchMoving) {
          cur.timeScale = CROUCH_WALK_TS;
        } else {
          const ak = curAnim.current as string;
          const isRunAnim   = ak.includes("Run")   || ak.includes("run");
          const isWalkAnim  = ak.includes("Walk")  || ak.includes("walk");
          const isStrafAnim = ak.includes("Straf") || ak.includes("straf");
          if (isRunAnim || isWalkAnim || isStrafAnim) {
            // Use actual smoothed horizontal speed — tracks real physics velocity.
            // Rolling uses a fixed speed because smoothVelRef isn't updated during rolls.
            const actualSpeed = rolling.current
              ? ROLL_SPEED
              : smoothVelRef.current.length();
            const refSpeed = isRunAnim ? ANIM_RUN_REF : ANIM_WALK_REF;
            // Lower clamp: 0.05 lets the cycle slow to nearly-stopped during
            // deceleration so feet don't slide when the character comes to rest.
            cur.timeScale = Math.max(0.05, Math.min(3.0, actualSpeed / refSpeed));
          }
          // Non-locomotion anims: leave timeScale untouched — _rawPlay already
          // set it to the correct value (skill.timeScale, 1.0, etc.).
        }
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ── JSX ──────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Skill visual effects (3-D rings, bursts, sparks) ─────────── */}
      <SkillEffects ref={effectsRef} />

      <RigidBody
        ref={playerRBRef}
        type="kinematicPosition"
        position={spawnPos
          ? [spawnPos[0], spawnPos[1] + capCY, spawnPos[2]]
          : [0, (getIslandHeight(0, 50) || getTerrainHeight(0, 0) || 3) + capCY, 50]}
        colliders={false}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[capHH, capR]} collisionGroups={CG_PLAYER} />
      </RigidBody>

      <group ref={rootRef}>
        {/* leanGroupRef — intermediate group for procedural body lean.
            Rotation applied every frame in useFrame (quaternion around body-forward). */}
        <group ref={leanGroupRef}>
          <group ref={modelGroupRef} rotation-y={Math.PI}>
            {modelObj ? (
              <primitive object={modelObj} />
            ) : (
              // Fallback capsule+head — proportioned for 60 in (1.524 m) character.
              // Body: R=0.28, L=0.84 → total 1.40 m (torso + legs)
              // Head: R=0.20, centre at 1.44 m
              <group>
                <mesh position={[0, 0.70, 0]} castShadow>
                  <capsuleGeometry args={[0.28, 0.84, 4, 8]} />
                  <meshStandardMaterial color="#4a90d9" />
                </mesh>
                <mesh position={[0, 1.44, 0]} castShadow>
                  <sphereGeometry args={[0.20, 8, 8]} />
                  <meshStandardMaterial color="#f4c896" />
                </mesh>
              </group>
            )}
          </group>
        </group>
      </group>

      {/* Weapon props are bone-parented imperatively (handBone.add) in the
          bone attachment useEffect.  These empty groups are kept as stable refs
          so downstream code that references swordGroupRef etc. doesn't break. */}
      <group ref={swordGroupRef} />
      <group ref={axeGroupRef} />
      <group ref={caneGroupRef} />
      <group ref={pistolPropGroupRef} />
      <group ref={riflePropGroupRef} />
      <group ref={bowPropGroupRef} />
      <group ref={shieldPropGroupRef} />
    </>
  );
}
