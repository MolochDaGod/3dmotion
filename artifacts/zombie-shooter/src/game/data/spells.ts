/**
 * data/spells.ts — single source of truth for the spell system.
 *
 * Owns:
 *   SpellType             — the four castable spell identifiers
 *   SpellDef              — per-spell display + physics config interface
 *   SPELLS                — canonical array of all spell definitions
 *   MagicProjectileState  — runtime projectile instance descriptor
 *
 * Colors are translated from the BinbunVFX MagicProjectiles Godot .tres files.
 * Zero Zustand imports — pure static config + a runtime state interface.
 */

// ─── Spell identifier ─────────────────────────────────────────────────────────

export type SpellType = "orb" | "javelin" | "wave" | "nova";

// ─── Spell definition ─────────────────────────────────────────────────────────

export interface SpellDef {
  id:          SpellType;
  name:        string;
  icon:        string;
  /** Outer glow / projectile trail color */
  color:       string;
  /** Bright inner core color */
  coreColor:   string;
  damage:      number;
  /** World units per second. 0 = stationary burst (nova). */
  speed:       number;
  /** Impact / AoE radius in world units */
  radius:      number;
  manaCost:    number;
  /** Minimum seconds between casts */
  cooldown:    number;
  description: string;
}

// ─── Canonical spell roster ───────────────────────────────────────────────────

export const SPELLS: readonly SpellDef[] = [
  {
    id: "orb", name: "Arcane Orb", icon: "🔮",
    color: "#FFE600",     // secondary_color basic_01
    coreColor: "#FFEACC", // primary_color basic_01
    damage: 40, speed: 14, radius: 0.6,
    manaCost: 25, cooldown: 0.8,
    description: "Slow orb of arcane energy",
  },
  {
    id: "javelin", name: "Frost Javelin", icon: "❄",
    color: "#69C0FF",     // secondary_color basic_02
    coreColor: "#CCE0FF", // primary_color basic_02
    damage: 20, speed: 38, radius: 0.2,
    manaCost: 15, cooldown: 0.25,
    description: "Fast piercing bolt of frost",
  },
  {
    id: "wave", name: "Void Wave", icon: "〰",
    color: "#7783FF",     // secondary_color basic_03
    coreColor: "#FFE1DF", // primary_color basic_03
    damage: 25, speed: 16, radius: 4.0,
    manaCost: 35, cooldown: 1.4,
    description: "Expanding ring of void energy",
  },
  {
    id: "nova", name: "Fire Nova", icon: "💥",
    color: "#F15B00",     // secondary_color basic_04
    coreColor: "#FDEAB2", // primary_color basic_04
    damage: 70, speed: 0, radius: 7.0,
    manaCost: 55, cooldown: 2.2,
    description: "Explosive burst of fire",
  },
] as const;

// ─── Runtime projectile instance ──────────────────────────────────────────────
// Lives here (not in useGameStore) because it references SpellDef.
// useGameStore holds the live array of MagicProjectileState[].

export interface MagicProjectileState {
  id:        string;
  spell:     SpellDef;
  position:  [number, number, number];
  direction: [number, number, number];
  /** Date.now() at spawn time */
  spawnedAt: number;
  /** Seconds before auto-despawn */
  maxLife:   number;
}
