/**
 * data/weaponFitDefaults.ts
 *
 * Canonical bone-relative fit defaults for every weapon prop.
 * These values are used when no server-saved fit exists.
 * They match the historical hard-coded constants in Player.tsx and
 * the WEAPON_GAME_DEFAULTS object that previously lived in ModelViewer.tsx.
 *
 * Format: position [x,y,z] in bone-local metres, rotation [x,y,z] Euler XYZ
 * in radians, scale [x,y,z] uniform.
 */

export interface WeaponFitOffset {
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
  /** Which bone this weapon attaches to (defaults to right hand). */
  boneName?: string;
}

export const RIGHT_HAND_BONE = "mixamorigRightHand";
export const LEFT_HAND_BONE  = "mixamorigLeftHand";

/**
 * Defaults per weapon key.  These match the rotation constants previously
 * scattered across Player.tsx (SWORD_ROT, STAFF_ROT, PISTOL_ROT, etc.)
 * and the position/scale defaults used on each weapon load.
 */
export const WEAPON_FIT_DEFAULTS: Record<string, WeaponFitOffset> = {
  sword:   {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    scale:    [0.010, 0.010, 0.010],
    boneName: RIGHT_HAND_BONE,
  },
  axe:     {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    scale:    [0.010, 0.010, 0.010],
    boneName: RIGHT_HAND_BONE,
  },
  axe2:    {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    scale:    [0.010, 0.010, 0.010],
    boneName: RIGHT_HAND_BONE,
  },
  staff1:  {
    position: [0, -0.5, 0],
    rotation: [-Math.PI * 0.35, 0, Math.PI / 2],
    scale:    [0.012, 0.012, 0.012],
    boneName: RIGHT_HAND_BONE,
  },
  staff5:  {
    position: [0, -0.5, 0],
    rotation: [-Math.PI * 0.35, 0, Math.PI / 2],
    scale:    [0.012, 0.012, 0.012],
    boneName: RIGHT_HAND_BONE,
  },
  staff10: {
    position: [0, -0.5, 0],
    rotation: [-Math.PI * 0.35, 0, Math.PI / 2],
    scale:    [0.012, 0.012, 0.012],
    boneName: RIGHT_HAND_BONE,
  },
  pistol:  {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    scale:    [0.012, 0.012, 0.012],
    boneName: RIGHT_HAND_BONE,
  },
  rifle:   {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    scale:    [0.013, 0.013, 0.013],
    boneName: RIGHT_HAND_BONE,
  },
  bow:     {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, Math.PI, 0],
    scale:    [0.015, 0.015, 0.015],
    boneName: LEFT_HAND_BONE,
  },
  shield:  {
    position: [0, 0, 0],
    rotation: [-Math.PI / 4, Math.PI / 2, 0],
    scale:    [0.012, 0.012, 0.012],
    boneName: LEFT_HAND_BONE,
  },
};

/** Safe lookup — returns the default if the key is unknown. */
export function getWeaponFitDefault(key: string): WeaponFitOffset {
  return WEAPON_FIT_DEFAULTS[key] ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    [0.010, 0.010, 0.010],
    boneName: RIGHT_HAND_BONE,
  };
}
