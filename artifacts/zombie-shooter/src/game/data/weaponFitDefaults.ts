/**
 * data/weaponFitDefaults.ts
 *
 * Canonical bone-relative fit defaults for every weapon prop.
 * These values are used when no server-saved fit exists.
 *
 * UNIT CONVENTION
 * ──────────────
 * `scale` is now the DESIRED longest bounding-box dimension in metres,
 * NOT a raw unit-conversion factor.
 *
 * At load time each FBX has its longest bounding-box dimension recorded in
 * `fbx.userData.rawLongestDim` (native units, scale=1).  When the weapon is
 * parented to a bone the final object scale is computed as:
 *
 *   obj.scale.setScalar( desiredMetres / rawLongestDim )
 *
 * This makes every weapon unit-agnostic: centimetre-authored models and
 * inch-authored models end up the same physical size in game.
 */

export interface WeaponFitOffset {
  position: [number, number, number];
  rotation: [number, number, number];
  /**
   * [desiredM, desiredM, desiredM] — desired longest bounding-box dimension
   * in metres.  All three components are always equal (uniform scale).
   */
  scale:    [number, number, number];
  boneName?: string;
}

export const RIGHT_HAND_BONE = "mixamorigRightHand";
export const LEFT_HAND_BONE  = "mixamorigLeftHand";

/**
 * Desired in-game size (metres, longest bounding-box axis) per weapon key.
 * Both Player.tsx and ModelViewer.tsx use this to normalise any FBX regardless
 * of its native authoring unit (cm, inches, metres, …).
 */
export const WEAPON_TARGET_M: Record<string, number> = {
  sword:   0.90,   // 90 cm longsword
  axe:     0.65,   // 65 cm hand-axe
  axe2:    0.65,
  staff1:  1.60,   // 1.6 m walking staff
  staff5:  1.60,
  staff10: 1.60,
  pistol:  0.28,   // 28 cm pistol
  rifle:   0.85,   // 85 cm assault rifle
  bow:     1.00,   // 1 m bow
  shield:  0.65,   // 65 cm shield
};

/** Default target for any unknown weapon key. */
export const DEFAULT_WEAPON_TARGET_M = 0.80;

/**
 * Bone-relative fit defaults per weapon key.
 * `scale` = [desiredM, desiredM, desiredM] — see header comment.
 */
export const WEAPON_FIT_DEFAULTS: Record<string, WeaponFitOffset> = {
  sword:   {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    scale:    [WEAPON_TARGET_M.sword,  WEAPON_TARGET_M.sword,  WEAPON_TARGET_M.sword],
    boneName: RIGHT_HAND_BONE,
  },
  axe:     {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    scale:    [WEAPON_TARGET_M.axe,    WEAPON_TARGET_M.axe,    WEAPON_TARGET_M.axe],
    boneName: RIGHT_HAND_BONE,
  },
  axe2:    {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    scale:    [WEAPON_TARGET_M.axe2,   WEAPON_TARGET_M.axe2,   WEAPON_TARGET_M.axe2],
    boneName: RIGHT_HAND_BONE,
  },
  staff1:  {
    position: [0, -0.5, 0],
    rotation: [-Math.PI * 0.35, 0, Math.PI / 2],
    scale:    [WEAPON_TARGET_M.staff1, WEAPON_TARGET_M.staff1, WEAPON_TARGET_M.staff1],
    boneName: RIGHT_HAND_BONE,
  },
  staff5:  {
    position: [0, -0.5, 0],
    rotation: [-Math.PI * 0.35, 0, Math.PI / 2],
    scale:    [WEAPON_TARGET_M.staff5, WEAPON_TARGET_M.staff5, WEAPON_TARGET_M.staff5],
    boneName: RIGHT_HAND_BONE,
  },
  staff10: {
    position: [0, -0.5, 0],
    rotation: [-Math.PI * 0.35, 0, Math.PI / 2],
    scale:    [WEAPON_TARGET_M.staff10, WEAPON_TARGET_M.staff10, WEAPON_TARGET_M.staff10],
    boneName: RIGHT_HAND_BONE,
  },
  pistol:  {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    scale:    [WEAPON_TARGET_M.pistol, WEAPON_TARGET_M.pistol, WEAPON_TARGET_M.pistol],
    boneName: RIGHT_HAND_BONE,
  },
  rifle:   {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    scale:    [WEAPON_TARGET_M.rifle,  WEAPON_TARGET_M.rifle,  WEAPON_TARGET_M.rifle],
    boneName: RIGHT_HAND_BONE,
  },
  bow:     {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, Math.PI, 0],
    scale:    [WEAPON_TARGET_M.bow,    WEAPON_TARGET_M.bow,    WEAPON_TARGET_M.bow],
    boneName: LEFT_HAND_BONE,
  },
  shield:  {
    position: [0, 0, 0],
    rotation: [-Math.PI / 4, Math.PI / 2, 0],
    scale:    [WEAPON_TARGET_M.shield, WEAPON_TARGET_M.shield, WEAPON_TARGET_M.shield],
    boneName: LEFT_HAND_BONE,
  },
};

/** Safe lookup — returns a sensible fallback if the key is unknown. */
export function getWeaponFitDefault(key: string): WeaponFitOffset {
  return WEAPON_FIT_DEFAULTS[key] ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    [DEFAULT_WEAPON_TARGET_M, DEFAULT_WEAPON_TARGET_M, DEFAULT_WEAPON_TARGET_M],
    boneName: RIGHT_HAND_BONE,
  };
}
