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

// ── Collision / interaction groups ────────────────────────────────────────────
/**
 * Rapier collision group bitmasks.
 * Each group is a 16-bit membership + 16-bit filter packed into a 32-bit int.
 *
 * Groups:
 *   0 — world / terrain (ground, walls, ruin props)
 *   1 — player character controller capsule
 *   2 — zombie sensor bodies
 *   3 — projectiles (bullets, arrows, magic)
 *
 * Rules:
 *   terrain   → collides with player + zombie (NOT with other terrain or projectiles)
 *   player    → collides with terrain + zombie
 *   zombie    → collides with terrain + player (sensor; no player-zombie collision needed)
 *   projectile → collides with terrain + zombie (NOT player)
 */
export const GROUP_TERRAIN    = 0b0001;
export const GROUP_PLAYER     = 0b0010;
export const GROUP_ZOMBIE     = 0b0100;
export const GROUP_PROJECTILE = 0b1000;

/** Pack membership + filter into the interactionGroups u32 */
export function interactionGroups(membership: number, filter: number): number {
  return (membership << 16) | filter;
}

export const COLLIDE_TERRAIN    = interactionGroups(GROUP_TERRAIN,    GROUP_PLAYER | GROUP_ZOMBIE);
export const COLLIDE_PLAYER     = interactionGroups(GROUP_PLAYER,     GROUP_TERRAIN);
export const COLLIDE_ZOMBIE     = interactionGroups(GROUP_ZOMBIE,     GROUP_TERRAIN | GROUP_PLAYER);
export const COLLIDE_PROJECTILE = interactionGroups(GROUP_PROJECTILE, GROUP_TERRAIN | GROUP_ZOMBIE);
