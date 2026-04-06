/**
 * data/weapons.ts — single source of truth for weapon definitions.
 *
 * Owns:
 *   WeaponMode        — the string union of all weapon identifiers
 *   WEAPON_CYCLE      — ordered array used for cycling (Tab key)
 *   WeaponDef         — per-weapon display + combat metadata interface
 *   WEAPON_DEFS       — canonical array of all weapon definitions
 *   getWeaponDef()    — safe lookup helper
 *
 * Zero Zustand imports — this is pure static config.
 * Animation packs and prop mesh paths live in assets/manifest.ts.
 * Skill sets per weapon live in data/skills.ts.
 */

// ─── Weapon mode identifier ───────────────────────────────────────────────────

export type WeaponMode =
  | "pistol"
  | "rifle"
  | "sword"
  | "axe"
  | "staff"
  | "bow"
  | "shield"
  | "tegun";

export const WEAPON_CYCLE: readonly WeaponMode[] = [
  "pistol", "rifle", "sword", "axe", "staff", "bow", "shield", "tegun",
] as const;

// ─── Per-weapon definition ────────────────────────────────────────────────────

/**
 * All static metadata describing a single weapon slot.
 * Runtime state (ammo count, reload, etc.) lives in useGameStore.
 */
export interface WeaponDef {
  mode:          WeaponMode;
  /** HUD badge label (all-caps) */
  label:         string;
  /** Emoji icon for quick identification */
  icon:          string;
  /** Primary text / glow color (CSS string) */
  color:         string;
  /** HUD badge border color */
  border:        string;
  /** HUD badge fill background */
  bg:            string;
  /**
   * Seconds between consecutive basic attacks.
   * 0 = melee / managed separately in Player.tsx.
   * Bow uses its own 0.9 s draw-release timer — also 0 here.
   */
  shootCooldown: number;
  /**
   * Magazine/clip size for ranged weapons.
   * 0 = infinite / no ammo concept (melee, staff, bow uses mana).
   */
  ammoCapacity:  number;
  isMelee:       boolean;
  isRanged:      boolean;
}

// ─── Canonical weapon roster ──────────────────────────────────────────────────
// Order matches WEAPON_CYCLE — do not reorder without updating both arrays.

export const WEAPON_DEFS: readonly WeaponDef[] = [
  {
    mode: "pistol", label: "PISTOL", icon: "🔫",
    color: "#80cfff", border: "rgba(100,180,255,0.9)", bg: "rgba(40,110,200,0.55)",
    shootCooldown: 0.12, ammoCapacity: 15,
    isMelee: false, isRanged: true,
  },
  {
    mode: "rifle", label: "RIFLE", icon: "🎯",
    color: "#aaffaa", border: "rgba(100,220,100,0.9)", bg: "rgba(20,130,20,0.55)",
    shootCooldown: 0.18, ammoCapacity: 30,
    isMelee: false, isRanged: true,
  },
  {
    mode: "sword", label: "SWORD", icon: "⚔️",
    color: "#ffaa55", border: "rgba(255,150,60,0.9)", bg: "rgba(200,80,20,0.55)",
    shootCooldown: 0, ammoCapacity: 0,
    isMelee: true, isRanged: false,
  },
  {
    mode: "axe", label: "AXE", icon: "🪓",
    color: "#ff7777", border: "rgba(255,80,80,0.9)", bg: "rgba(180,20,20,0.55)",
    shootCooldown: 0, ammoCapacity: 0,
    isMelee: true, isRanged: false,
  },
  {
    mode: "staff", label: "STAFF", icon: "🔮",
    color: "#cc88ff", border: "rgba(180,100,255,0.9)", bg: "rgba(100,20,200,0.55)",
    shootCooldown: 0, ammoCapacity: 0,
    isMelee: false, isRanged: true,
  },
  {
    mode: "bow", label: "BOW", icon: "🏹",
    color: "#aed67a", border: "rgba(140,210,80,0.9)", bg: "rgba(60,130,20,0.55)",
    shootCooldown: 0, ammoCapacity: 0,
    isMelee: false, isRanged: true,
  },
  {
    mode: "shield", label: "SHIELD", icon: "🛡️",
    color: "#c0c8d8", border: "rgba(180,200,230,0.9)", bg: "rgba(60,80,120,0.55)",
    shootCooldown: 0.45, ammoCapacity: 0,
    isMelee: true, isRanged: false,
  },
  {
    mode: "tegun", label: "TEGUN", icon: "🖌",
    color: "#ff9922", border: "rgba(255,160,40,0.9)", bg: "rgba(160,80,10,0.55)",
    shootCooldown: 0.08, ammoCapacity: 0,
    isMelee: false, isRanged: false,
  },
] as const;

// ─── Lookup helper ────────────────────────────────────────────────────────────

/** Returns the WeaponDef for the given mode. Falls back to pistol if not found. */
export function getWeaponDef(mode: WeaponMode): WeaponDef {
  return WEAPON_DEFS.find((w) => w.mode === mode) ?? WEAPON_DEFS[0];
}
