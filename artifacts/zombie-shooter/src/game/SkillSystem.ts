import type { WeaponMode } from "./useGameStore";

// ─── Effect visual category ───────────────────────────────────────────────────
export type SkillEffectType = "slash" | "blast" | "volley" | "buff";

// ─── Hit geometry shape for Rapier / geometric sweep ─────────────────────────
export type HitShape = "capsule" | "sphere" | "ray";

// ─── One skill definition ─────────────────────────────────────────────────────
export interface SkillDef {
  id:           string;
  name:         string;
  icon:         string;
  description:  string;
  // Animation played when skill activates
  animation:    string;    // AnimKey as string to avoid circular import
  timeScale:    number;
  // Resource costs
  cooldown:     number;    // seconds
  manaCost:     number;
  // Damage parameters
  damage:       number;
  range:        number;    // world-unit reach / sphere radius
  arcDeg:       number;    // sweep arc width (360 = full sphere/aoe)
  dmgDelayMs:   number;    // ms after activation before first hit check
  hitShape:     HitShape;
  hitCount:     number;    // number of sequential damage instances
  // Visual effect
  effect:       SkillEffectType;
  effectColor:  string;
  effectRadius: number;    // radius of the spawned ring/disc effect
}

// ─── 4 skills per weapon, mapped by mode ──────────────────────────────────────
export const WEAPON_SKILLS: Record<WeaponMode, [SkillDef, SkillDef, SkillDef, SkillDef]> = {

  // ── Pistol ────────────────────────────────────────────────────────────────
  pistol: [
    {
      id: "pistol_1", name: "Fan the Hammer", icon: "🔫",
      description: "3 rapid shots in quick succession",
      animation: "pistolRun", timeScale: 1.5,
      cooldown: 3, manaCost: 0,
      damage: 28, range: 40, arcDeg: 6, dmgDelayMs: 60,
      hitShape: "ray", hitCount: 3,
      effect: "volley", effectColor: "#ffcc44", effectRadius: 0.4,
    },
    {
      id: "pistol_2", name: "Snapshot", icon: "🎯",
      description: "Precision aimed shot — 2× damage",
      animation: "pistolCrouchIdle", timeScale: 1.2,
      cooldown: 5, manaCost: 0,
      damage: 65, range: 55, arcDeg: 3, dmgDelayMs: 280,
      hitShape: "ray", hitCount: 1,
      effect: "slash", effectColor: "#80cfff", effectRadius: 0.5,
    },
    {
      id: "pistol_3", name: "Pistol Whip", icon: "👊",
      description: "Melee butt strike — knockback",
      animation: "meleeAttack1", timeScale: 1.3,
      cooldown: 6, manaCost: 0,
      damage: 45, range: 2.5, arcDeg: 90, dmgDelayMs: 300,
      hitShape: "capsule", hitCount: 1,
      effect: "blast", effectColor: "#ffaa44", effectRadius: 1.5,
    },
    {
      id: "pistol_4", name: "Smoke & Fire", icon: "💨",
      description: "Dodge back + 2-shot burst mid-roll",
      animation: "dodgeBwd", timeScale: 1.0,
      cooldown: 8, manaCost: 5,
      damage: 24, range: 32, arcDeg: 20, dmgDelayMs: 200,
      hitShape: "ray", hitCount: 2,
      effect: "blast", effectColor: "#88aaff", effectRadius: 2.0,
    },
  ],

  // ── Rifle ─────────────────────────────────────────────────────────────────
  rifle: [
    {
      id: "rifle_1", name: "Full Auto", icon: "⚡",
      description: "5-round rapid burst",
      animation: "rifleFire", timeScale: 1.5,
      cooldown: 4, manaCost: 0,
      damage: 22, range: 48, arcDeg: 5, dmgDelayMs: 70,
      hitShape: "ray", hitCount: 5,
      effect: "volley", effectColor: "#aaffaa", effectRadius: 0.3,
    },
    {
      id: "rifle_2", name: "Precision Shot", icon: "🎯",
      description: "Single devastating shot — 3× damage",
      animation: "rifleReload", timeScale: 0.7,
      cooldown: 6, manaCost: 0,
      damage: 95, range: 60, arcDeg: 2, dmgDelayMs: 700,
      hitShape: "ray", hitCount: 1,
      effect: "slash", effectColor: "#ff4444", effectRadius: 0.5,
    },
    {
      id: "rifle_3", name: "Suppressive Fire", icon: "🌊",
      description: "Wide 50° arc spray — stagger zone",
      animation: "rifleFire", timeScale: 1.6,
      cooldown: 7, manaCost: 0,
      damage: 18, range: 16, arcDeg: 50, dmgDelayMs: 90,
      hitShape: "capsule", hitCount: 4,
      effect: "blast", effectColor: "#aaffaa", effectRadius: 4.0,
    },
    {
      id: "rifle_4", name: "Rifle Butt", icon: "💥",
      description: "Close-range melee butt strike",
      animation: "meleeAttack2", timeScale: 1.2,
      cooldown: 5, manaCost: 0,
      damage: 55, range: 2.0, arcDeg: 80, dmgDelayMs: 340,
      hitShape: "capsule", hitCount: 1,
      effect: "blast", effectColor: "#ccddff", effectRadius: 1.2,
    },
  ],

  // ── Sword ─────────────────────────────────────────────────────────────────
  sword: [
    {
      id: "sword_1", name: "Cleave", icon: "⚔️",
      description: "Wide 150° arc slash",
      animation: "meleeAttack1", timeScale: 1.0,
      cooldown: 3, manaCost: 0,
      damage: 75, range: 3.2, arcDeg: 150, dmgDelayMs: 320,
      hitShape: "capsule", hitCount: 1,
      effect: "slash", effectColor: "#ffaa55", effectRadius: 3.2,
    },
    {
      id: "sword_2", name: "Whirlwind", icon: "🌀",
      description: "360° spinning combo — 3 hits",
      animation: "meleeCombo1", timeScale: 1.2,
      cooldown: 8, manaCost: 10,
      damage: 45, range: 3.5, arcDeg: 360, dmgDelayMs: 180,
      hitShape: "sphere", hitCount: 3,
      effect: "slash", effectColor: "#ff6600", effectRadius: 3.5,
    },
    {
      id: "sword_3", name: "Lunge", icon: "⚡",
      description: "Forward dash + overhead strike",
      animation: "meleeAttack2", timeScale: 1.0,
      cooldown: 5, manaCost: 5,
      damage: 90, range: 4.5, arcDeg: 55, dmgDelayMs: 400,
      hitShape: "capsule", hitCount: 1,
      effect: "blast", effectColor: "#ffdd88", effectRadius: 2.2,
    },
    {
      id: "sword_4", name: "Execute", icon: "💀",
      description: "Devastating finisher — massive damage",
      animation: "meleeAttack3", timeScale: 0.9,
      cooldown: 12, manaCost: 15,
      damage: 145, range: 2.8, arcDeg: 90, dmgDelayMs: 600,
      hitShape: "capsule", hitCount: 1,
      effect: "blast", effectColor: "#ff3300", effectRadius: 2.5,
    },
  ],

  // ── Axe ──────────────────────────────────────────────────────────────────
  axe: [
    {
      id: "axe_1", name: "Overhead Chop", icon: "🪓",
      description: "Heavy downward chop — massive damage",
      animation: "meleeAttack1", timeScale: 0.9,
      cooldown: 4, manaCost: 0,
      damage: 105, range: 2.8, arcDeg: 90, dmgDelayMs: 500,
      hitShape: "capsule", hitCount: 1,
      effect: "blast", effectColor: "#ff7777", effectRadius: 2.0,
    },
    {
      id: "axe_2", name: "Axe Throw", icon: "🌀",
      description: "Hurl the axe as a ranged projectile",
      animation: "meleeAttack2", timeScale: 1.1,
      cooldown: 7, manaCost: 0,
      damage: 70, range: 30, arcDeg: 7, dmgDelayMs: 380,
      hitShape: "ray", hitCount: 1,
      effect: "volley", effectColor: "#ff5555", effectRadius: 0.7,
    },
    {
      id: "axe_3", name: "Ground Slam", icon: "💥",
      description: "AoE shockwave radiating from feet",
      animation: "meleeCombo1", timeScale: 1.0,
      cooldown: 9, manaCost: 10,
      damage: 60, range: 4.5, arcDeg: 360, dmgDelayMs: 380,
      hitShape: "sphere", hitCount: 1,
      effect: "blast", effectColor: "#ff4400", effectRadius: 4.5,
    },
    {
      id: "axe_4", name: "Berserker Fury", icon: "😡",
      description: "Rapid 4-hit frenzy attack",
      animation: "meleeCombo3", timeScale: 1.5,
      cooldown: 10, manaCost: 20,
      damage: 38, range: 2.5, arcDeg: 120, dmgDelayMs: 110,
      hitShape: "capsule", hitCount: 4,
      effect: "slash", effectColor: "#ff0000", effectRadius: 2.5,
    },
  ],

  // ── Staff ─────────────────────────────────────────────────────────────────
  staff: [
    {
      id: "staff_1", name: "Arcane Bolt", icon: "🔮",
      description: "Fast orb of arcane energy",
      animation: "staffCast1", timeScale: 1.0,
      cooldown: 1, manaCost: 20,
      damage: 40, range: 30, arcDeg: 5, dmgDelayMs: 430,
      hitShape: "ray", hitCount: 1,
      effect: "blast", effectColor: "#FFE600", effectRadius: 1.2,
    },
    {
      id: "staff_2", name: "Chain Lightning", icon: "⚡",
      description: "Fork lightning — hits up to 3 targets",
      animation: "staffCast2", timeScale: 1.2,
      cooldown: 5, manaCost: 40,
      damage: 35, range: 10, arcDeg: 360, dmgDelayMs: 300,
      hitShape: "sphere", hitCount: 3,
      effect: "blast", effectColor: "#aaccff", effectRadius: 10,
    },
    {
      id: "staff_3", name: "Arcane Beam", icon: "🌟",
      description: "Sustained beam — 6 damage ticks",
      animation: "staffCast1", timeScale: 0.4,
      cooldown: 8, manaCost: 50,
      damage: 18, range: 15, arcDeg: 5, dmgDelayMs: 100,
      hitShape: "ray", hitCount: 6,
      effect: "slash", effectColor: "#cc88ff", effectRadius: 0.5,
    },
    {
      id: "staff_4", name: "Mana Surge", icon: "💫",
      description: "Massive nova burst — full mana cost",
      animation: "staffCast2", timeScale: 0.8,
      cooldown: 15, manaCost: 75,
      damage: 100, range: 8, arcDeg: 360, dmgDelayMs: 680,
      hitShape: "sphere", hitCount: 1,
      effect: "blast", effectColor: "#ff88ff", effectRadius: 8.0,
    },
  ],

  // ── Bow ───────────────────────────────────────────────────────────────────
  bow: [
    {
      id: "bow_1", name: "Rapid Volley", icon: "🏹",
      description: "3 quick arrows in rapid succession",
      animation: "bowFire", timeScale: 1.5,
      cooldown: 4, manaCost: 0,
      damage: 30, range: 42, arcDeg: 12, dmgDelayMs: 90,
      hitShape: "ray", hitCount: 3,
      effect: "volley", effectColor: "#aed67a", effectRadius: 0.4,
    },
    {
      id: "bow_2", name: "Power Shot", icon: "💪",
      description: "Full draw — 3× damage, extreme range",
      animation: "bowDraw", timeScale: 0.7,
      cooldown: 6, manaCost: 5,
      damage: 110, range: 70, arcDeg: 2, dmgDelayMs: 920,
      hitShape: "ray", hitCount: 1,
      effect: "slash", effectColor: "#88ff44", effectRadius: 0.7,
    },
    {
      id: "bow_3", name: "Spread Shot", icon: "🌊",
      description: "5 arrows in a wide 40° fan",
      animation: "bowFire", timeScale: 1.0,
      cooldown: 5, manaCost: 5,
      damage: 22, range: 18, arcDeg: 40, dmgDelayMs: 300,
      hitShape: "capsule", hitCount: 5,
      effect: "volley", effectColor: "#ccff88", effectRadius: 3.2,
    },
    {
      id: "bow_4", name: "Rain of Arrows", icon: "☔",
      description: "8-arrow barrage over a wide area",
      animation: "bowDraw", timeScale: 0.9,
      cooldown: 12, manaCost: 20,
      damage: 28, range: 5.5, arcDeg: 360, dmgDelayMs: 500,
      hitShape: "sphere", hitCount: 8,
      effect: "blast", effectColor: "#88cc44", effectRadius: 5.0,
    },
  ],

  // ── Shield ────────────────────────────────────────────────────────────────
  shield: [
    {
      id: "shield_1", name: "Shield Bash", icon: "🛡️",
      description: "Stun and push back nearby enemies",
      animation: "ssAttack1", timeScale: 1.0,
      cooldown: 4, manaCost: 0,
      damage: 40, range: 2.5, arcDeg: 90, dmgDelayMs: 290,
      hitShape: "capsule", hitCount: 1,
      effect: "blast", effectColor: "#c0c8d8", effectRadius: 2.5,
    },
    {
      id: "shield_2", name: "Riposte", icon: "⚔️",
      description: "Counter-attack after blocking — bonus dmg",
      animation: "ssAttack2", timeScale: 1.3,
      cooldown: 5, manaCost: 0,
      damage: 95, range: 2.8, arcDeg: 60, dmgDelayMs: 340,
      hitShape: "capsule", hitCount: 1,
      effect: "slash", effectColor: "#80aaff", effectRadius: 2.0,
    },
    {
      id: "shield_3", name: "Spinning Strike", icon: "🌀",
      description: "360° whirlwind with sword and shield",
      animation: "ssAttack3", timeScale: 1.1,
      cooldown: 8, manaCost: 10,
      damage: 55, range: 3.5, arcDeg: 360, dmgDelayMs: 250,
      hitShape: "sphere", hitCount: 2,
      effect: "slash", effectColor: "#8899ff", effectRadius: 3.5,
    },
    {
      id: "shield_4", name: "Rally", icon: "✨",
      description: "Draw on resilience — restore 30 HP",
      animation: "ssDrawSword", timeScale: 0.8,
      cooldown: 20, manaCost: 20,
      damage: 0, range: 0, arcDeg: 0, dmgDelayMs: 0,
      hitShape: "sphere", hitCount: 0,
      effect: "buff", effectColor: "#44ffaa", effectRadius: 2.0,
    },
  ],
};
