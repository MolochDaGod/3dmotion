/**
 * Central asset manifest for Motion Training.
 *
 * All public-folder asset paths are declared here.
 * Update paths in ONE place — every consumer imports from this module.
 *
 * Directory layout (under public/models/):
 *   character/           — player character mesh
 *   animations/pistol/   — pistol stance FBX clips
 *   animations/rifle/    — rifle stance FBX clips
 *   animations/melee/    — shared melee / sword / axe clips
 *   animations/staff/    — staff / magic clips
 *   animations/bow/      — bow clips
 *   animations/shield-sword/ — sword + shield combo clips
 *   props/weapons/       — weapon prop meshes
 *   props/weapons/textures/  — weapon texture atlases
 *   environment/         — environmental GLB / texture assets
 *   graveyard/fbx/       — ruin FBX props (21 models)
 *   graveyard/texture/   — shared graveyard texture atlas
 */

// ── Base path helpers ─────────────────────────────────────────────────────────
const M  = "/models";
const CH = `${M}/character`;
const AP = `${M}/animations/pistol`;
const AR = `${M}/animations/rifle`;
const AM = `${M}/animations/melee`;
const AS = `${M}/animations/staff`;
const AB = `${M}/animations/bow`;
const ASS = `${M}/animations/shield-sword`;
const ATV = `${M}/animations/traverse`;
const WP = `${M}/props/weapons`;
const WT = `${M}/props/weapons/textures`;
const ENV = `${M}/environment`;
const GY  = `${M}/graveyard`;

// ── Character ─────────────────────────────────────────────────────────────────
export const CHARACTER = {
  /** Corsair King FBX — includes skeleton and skin */
  mesh: `${CH}/corsair-king.fbx`,
} as const;

// ── Animation clips ───────────────────────────────────────────────────────────

export const ANIM_PISTOL = {
  idle:        `${AP}/pistol idle.fbx`,
  walkFwd:     `${AP}/pistol walk.fbx`,
  walkBwd:     `${AP}/pistol walk backward.fbx`,
  strafeL:     `${AP}/pistol strafe.fbx`,
  strafeR:     `${AP}/pistol strafe (2).fbx`,
  walkArcL:    `${AP}/pistol walk arc.fbx`,
  walkArcR:    `${AP}/pistol walk arc (2).fbx`,
  walkBwdArcL: `${AP}/pistol walk backward arc.fbx`,
  walkBwdArcR: `${AP}/pistol walk backward arc (2).fbx`,
  run:         `${AP}/pistol run.fbx`,
  runArcL:     `${AP}/pistol run arc.fbx`,
  runArcR:     `${AP}/pistol run arc (2).fbx`,
  runBwd:      `${AP}/pistol run backward.fbx`,
  runBwdArcL:  `${AP}/pistol run backward arc.fbx`,
  runBwdArcR:  `${AP}/pistol run backward arc (2).fbx`,
  jump:        `${AP}/pistol jump.fbx`,
  land:        `${AP}/pistol jump (2).fbx`,
  crouchDown:  `${AP}/pistol stand to kneel.fbx`,
  crouchIdle:  `${AP}/pistol kneeling idle.fbx`,
  crouchUp:    `${AP}/pistol kneel to stand.fbx`,
} as const;

export const ANIM_RIFLE = {
  idle:        `${AR}/rifle idle.fbx`,
  walkFwd:     `${AR}/rifle walk forward.fbx`,
  walkBwd:     `${AR}/rifle walk backward.fbx`,
  strafeL:     `${AR}/rifle strafe left.fbx`,
  strafeR:     `${AR}/rifle strafe right.fbx`,
  run:         `${AR}/rifle run.fbx`,
  runBwd:      `${AR}/rifle run backward.fbx`,
  jump:        `${AR}/rifle jump.fbx`,
  fire:        `${AR}/rifle fire.fbx`,
  reload:      `${AR}/rifle reload.fbx`,
  turnL:       `${AR}/rifle turn left.fbx`,
  turnR:       `${AR}/rifle turn right.fbx`,
  /** Hit reaction while holding rifle — already on disk */
  hit:         `${AR}/rifle hit.fbx`,
  /** Grenade-throw special ability — already on disk */
  grenade:     `${AR}/rifle grenade.fbx`,
} as const;

export const ANIM_MELEE = {
  idle:        `${AM}/melee idle.fbx`,
  walkFwd:     `${AM}/melee walk forward.fbx`,
  walkBwd:     `${AM}/melee walk backward.fbx`,
  strafeL:     `${AM}/melee strafe left.fbx`,
  strafeR:     `${AM}/melee strafe right.fbx`,
  runFwd:      `${AM}/melee run.fbx`,
  runBwd:      `${AM}/melee run backward.fbx`,
  attack1:     `${AM}/melee attack 1.fbx`,
  attack2:     `${AM}/melee attack 2.fbx`,
  attack3:     `${AM}/melee attack 3.fbx`,
  combo1:      `${AM}/melee combo 1.fbx`,
  combo2:      `${AM}/melee combo 2.fbx`,
  combo3:      `${AM}/melee combo 3.fbx`,
  jump:        `${AM}/melee jump.fbx`,
  crouch:      `${AM}/melee crouch idle.fbx`,
  block:       `${AM}/melee block.fbx`,
  standFromCrouch: `${AM}/melee stand from crouch.fbx`,
} as const;

export const ANIM_STAFF = {
  idle:         `${AS}/staffIdle.fbx`,
  idle2:        `${AS}/staffIdle2.fbx`,
  hitLarge:     `${AS}/staffHitLarge.fbx`,
  hitSmall:     `${AS}/staffHitSmall.fbx`,
  walkFwd:     `${AS}/staffWalkFwd.fbx`,
  walkBwd:     `${AS}/staffWalkBwd.fbx`,
  runFwd:      `${AS}/staffRunFwd.fbx`,
  runBwd:      `${AS}/staffRunBwd.fbx`,
  cast1:       `${AS}/staffCast1.fbx`,
  cast2:       `${AS}/staffCast2.fbx`,
  jump:        `${AS}/staffJump.fbx`,
  death:       `${AS}/staffDeath.fbx`,
} as const;

export const ANIM_BOW = {
  idle:        `${AB}/bowIdle.fbx`,
  walkFwd:     `${AB}/bowWalkFwd.fbx`,
  walkBwd:     `${AB}/bowWalkBwd.fbx`,
  strafeL:     `${AB}/bowStrafeL.fbx`,
  strafeR:     `${AB}/bowStrafeR.fbx`,
  runFwd:      `${AB}/bowRunFwd.fbx`,
  runBwd:      `${AB}/bowRunBwd.fbx`,
  jump:        `${AB}/bowJump.fbx`,
  draw:        `${AB}/bowDraw.fbx`,
  aim:         `${AB}/bowAim.fbx`,
  fire:        `${AB}/bowFire.fbx`,
  block:       `${AB}/bowBlock.fbx`,
  aimWalkFwd:  `${AB}/bowAimWalkFwd.fbx`,
  aimWalkBwd:  `${AB}/bowAimWalkBwd.fbx`,
  aimStrafeL:  `${AB}/bowAimStrafeL.fbx`,
  aimStrafeR:  `${AB}/bowAimStrafeR.fbx`,
} as const;

export const ANIM_SHIELD_SWORD = {
  idle:        `${ASS}/ssIdle.fbx`,
  runFwd:      `${ASS}/ssRunFwd.fbx`,
  runBwd:      `${ASS}/ssRunBwd.fbx`,
  strafeL:     `${ASS}/ssStrafeL.fbx`,
  strafeR:     `${ASS}/ssStrafeR.fbx`,
  blockIdle:   `${ASS}/ssBlockIdle.fbx`,
  block:       `${ASS}/ssBlock.fbx`,
  blockHit:    `${ASS}/ssBlockHit.fbx`,
  attack1:     `${ASS}/ssAttack1.fbx`,
  attack2:     `${ASS}/ssAttack2.fbx`,
  attack3:     `${ASS}/ssAttack3.fbx`,
  attack4:     `${ASS}/ssAttack4.fbx`,
  drawSword:   `${ASS}/ssDrawSword.fbx`,
} as const;

// ── Shared / universal reaction animations ─────────────────────────────────────
// These files do not exist yet — download from Mixamo and save to the paths below.
// Until they exist, all *HitSmall / *HitLarge / *Death keys fall back to the
// corresponding staff animations.  Pistol firing also needs a dedicated clip.
//
// Download guide (search name → save as):
//   "Pistol Shooting"       → /models/animations/pistol/pistol fire.fbx
//   "Hit Reaction Small"    → /models/animations/shared/flinch-small.fbx
//   "Hit Reaction"          → /models/animations/shared/flinch-large.fbx
//   "Dying Backwards"       → /models/animations/shared/death-pistol.fbx
//   "Rifle Aim"             → /models/animations/shared/death-rifle.fbx  (Warrior Dying variant)
//   "Falling Backwards Dead"→ /models/animations/shared/death-melee.fbx
//   "Silenced Arrow"        → /models/animations/shared/death-bow.fbx
//   "Falling Back Death"    → /models/animations/shared/death-sword.fbx
//   "Sword And Shield Idle" → /models/animations/shared/parry-shield.fbx (Shield Bash variant)
//   "Great Sword Slash"     → /models/animations/shared/special-melee.fbx
//   "Sword And Shield Slash"→ /models/animations/shared/special-sword.fbx
//   "Arrow Trick"           → /models/animations/shared/special-bow.fbx
//   "Forward Roll"          → /models/animations/traverse/roll-forward.fbx (also needed for rollFwd)
const AS_SHARED = `${M}/animations/shared`;
export const ANIM_SHARED = {
  flinchSmall:   `${AS_SHARED}/flinch-small.fbx`,   // light hit reaction (all stances)
  flinchLarge:   `${AS_SHARED}/flinch-large.fbx`,   // heavy stagger (all stances)
  deathPistol:   `${AS_SHARED}/death-pistol.fbx`,   // death — pistol stance
  deathRifle:    `${AS_SHARED}/death-rifle.fbx`,    // death — rifle stance
  deathMelee:    `${AS_SHARED}/death-melee.fbx`,    // death — sword/axe stance
  deathBow:      `${AS_SHARED}/death-bow.fbx`,      // death — bow stance
  deathSword:    `${AS_SHARED}/death-sword.fbx`,    // death — shield+sword stance
  specialMelee:  `${AS_SHARED}/special-melee.fbx`,  // spinning finisher — melee
  specialSword:  `${AS_SHARED}/special-sword.fbx`,  // shield charge / whirlwind — ss
  specialBow:    `${AS_SHARED}/special-bow.fbx`,    // trick shot — bow
} as const;

export const ANIM_TRAVERSE = {
  /** Mixamo "Climbing To Top"  — LoopOnce,   player vaults a ledge */
  climbUp:      `${ATV}/climb-up.fbx`,
  /** Mixamo "Climbing"         — LoopRepeat,  general wall-climb cycle */
  climbing:     `${ATV}/climbing.fbx`,
  /** Mixamo "Climbing Ladder"  — LoopRepeat,  ladder-specific climb cycle */
  climbLadder:  `${ATV}/climb-ladder.fbx`,
  /** Mixamo "Treading Water"   — LoopRepeat,  stationary in water */
  treading:     `${ATV}/treading.fbx`,
  /** Mixamo "Swimming"         — LoopRepeat,  moving through water */
  swimming:     `${ATV}/swimming.fbx`,
  /** Mixamo "Swimming To Edge" — LoopOnce,   transition out of water */
  swimToEdge:   `${ATV}/swim-to-edge.fbx`,
  /**
   * Mixamo "Forward Roll" — LoopOnce, triggered by Ctrl key.
   * Download from Mixamo: search "Forward Roll", export FBX for Three.js (no skin),
   * save as public/models/animations/traverse/roll-forward.fbx
   * Until the file exists the Ctrl roll falls back to the dodge animation.
   */
  rollFwd:      `${ATV}/roll-forward.fbx`,
} as const;

// ── Weapon props ──────────────────────────────────────────────────────────────

export const WEAPON_PROPS = {
  sword:   `${WP}/sword.fbx`,
  axe:     `${WP}/axe.fbx`,
  axe2:    `${WP}/axe2.fbx`,
  pistol:  `${WP}/pistol_prop.fbx`,
  rifle:   `${WP}/rifle_prop.fbx`,
  bow:     `${WP}/bow_prop.fbx`,
  shield:  `${WP}/shield_prop.fbx`,
  /** Staff variants (cane series) */
  staff1:  `${WP}/cane1.fbx`,
  staff5:  `${WP}/cane5.fbx`,
  staff10: `${WP}/cane10.fbx`,
} as const;

export const WEAPON_TEXTURES = {
  sword:   `${WT}/Texture_MAp_sword.png`,
  axe:     `${WT}/Texture_MAp_axe.png`,
  staff:   `${WT}/cane_texture.png`,
  shield:  `${WT}/shield_texture.png`,
} as const;

// ── Environment ───────────────────────────────────────────────────────────────

export const ENVIRONMENT = {
  bossGlb:     `${ENV}/boss.glb`,
  bossTex:     `${ENV}/boss.png`,
} as const;

export const GRAVEYARD = {
  /** Returns the URL for ruin model n (1–21) */
  ruinFbx: (n: number) => `${GY}/fbx/_ruin_${n}.fbx`,
  texture:  `${GY}/texture/Texture_MAp_ruins.png`,
} as const;

// ── WebP texture helper ────────────────────────────────────────────────────────
let _webpSupported: boolean | null = null;

function webpSupported(): boolean {
  if (_webpSupported !== null) return _webpSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    _webpSupported = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    _webpSupported = false;
  }
  return _webpSupported;
}

/** Prefer .webp when the browser supports it; fall back to the original .png. */
export function texPath(pngUrl: string): string {
  return webpSupported() ? pngUrl.replace(/\.png$/i, ".webp") : pngUrl;
}

// ── Collision groups removed ───────────────────────────────────────────────────
// Canonical Rapier collision group constants live in CollisionLayers.ts.
// Import CG_WORLD, CG_PLAYER, CG_ZOMBIE_SENSOR from there.
