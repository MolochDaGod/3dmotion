import type { SceneConfig, WeaponDef, SkillDef, WeaponId } from "./types";

export const SCENES: Record<string, SceneConfig> = {
  lost_portal: {
    id: "lost_portal",
    name: "The Lost Portal",
    description: "Ancient ruins hide gateways to other realms. Choose your path wisely.",
    fogColor: [0.05, 0.03, 0.12],
    fogDensity: 0.022,
    ambientColor: [0.08, 0.05, 0.18],
    skyColor: [0.04, 0.02, 0.1],
    groundColor: [0.12, 0.1, 0.08],
    lightColor: [0.5, 0.4, 0.9],
    lightAngle: [40, 30, 0],
    accentColor: [0.3, 0.0, 1.0],
    portalTargets: ["combat_arena", "dark_dungeon", "open_world"],
  },
  combat_arena: {
    id: "combat_arena",
    name: "Combat Arena",
    description: "A fiery battleground where warriors prove their worth.",
    fogColor: [0.15, 0.04, 0.01],
    fogDensity: 0.015,
    ambientColor: [0.2, 0.06, 0.02],
    skyColor: [0.12, 0.03, 0.01],
    groundColor: [0.18, 0.08, 0.04],
    lightColor: [1.0, 0.45, 0.1],
    lightAngle: [60, 0, 0],
    accentColor: [1.0, 0.3, 0.0],
    portalTargets: ["lost_portal", "dark_dungeon", "open_world"],
  },
  dark_dungeon: {
    id: "dark_dungeon",
    name: "Dark Dungeon",
    description: "Endless corridors of stone, crawling with ancient horrors.",
    fogColor: [0.01, 0.01, 0.03],
    fogDensity: 0.04,
    ambientColor: [0.04, 0.04, 0.08],
    skyColor: [0.01, 0.01, 0.02],
    groundColor: [0.06, 0.06, 0.08],
    lightColor: [0.2, 0.3, 0.6],
    lightAngle: [30, 60, 0],
    accentColor: [0.0, 0.4, 1.0],
    portalTargets: ["lost_portal", "combat_arena", "open_world"],
  },
  open_world: {
    id: "open_world",
    name: "Open World",
    description: "Vast landscapes of mystery await beyond the horizon.",
    fogColor: [0.4, 0.6, 0.8],
    fogDensity: 0.008,
    ambientColor: [0.4, 0.5, 0.6],
    skyColor: [0.3, 0.55, 0.85],
    groundColor: [0.15, 0.35, 0.1],
    lightColor: [1.0, 0.95, 0.85],
    lightAngle: [50, 200, 0],
    accentColor: [0.1, 0.8, 0.3],
    portalTargets: ["lost_portal", "combat_arena", "dark_dungeon"],
  },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol", name: "Pistol",
    color: [0.5, 0.5, 0.55], emissiveColor: [0.2, 0.4, 0.8],
    shape: "box", scale: [0.12, 0.14, 0.45], offset: [0.28, 0.6, 0.1],
    attackAnim: "lunge",
  },
  rifle: {
    id: "rifle", name: "Rifle",
    color: [0.35, 0.3, 0.25], emissiveColor: [0.5, 0.2, 0.1],
    shape: "box", scale: [0.1, 0.12, 0.8], offset: [0.3, 0.65, 0.0],
    attackAnim: "lunge",
  },
  sword: {
    id: "sword", name: "Sword",
    color: [0.85, 0.88, 0.95], emissiveColor: [0.2, 0.4, 1.0],
    shape: "box", scale: [0.08, 0.8, 0.08], offset: [0.3, 0.9, 0.0],
    attackAnim: "swing",
  },
  axe: {
    id: "axe", name: "Axe",
    color: [0.6, 0.55, 0.5], emissiveColor: [1.0, 0.3, 0.1],
    shape: "box", scale: [0.4, 0.4, 0.08], offset: [0.3, 0.95, 0.0],
    attackAnim: "swing",
  },
  staff: {
    id: "staff", name: "Staff",
    color: [0.4, 0.25, 0.15], emissiveColor: [0.5, 0.0, 1.0],
    shape: "cylinder", scale: [0.07, 1.1, 0.07], offset: [0.3, 1.0, 0.0],
    attackAnim: "cast",
  },
  bow: {
    id: "bow", name: "Bow",
    color: [0.45, 0.3, 0.15], emissiveColor: [0.1, 0.8, 0.3],
    shape: "cylinder", scale: [0.06, 0.9, 0.06], offset: [0.3, 0.9, 0.0],
    attackAnim: "draw",
  },
  shield: {
    id: "shield", name: "Shield",
    color: [0.4, 0.4, 0.5], emissiveColor: [0.3, 0.6, 1.0],
    shape: "box", scale: [0.5, 0.6, 0.1], offset: [-0.38, 0.8, 0.05],
    attackAnim: "bash",
  },
};

export const WEAPON_ORDER: WeaponId[] = ["pistol", "rifle", "sword", "axe", "staff", "bow", "shield"];

export const SKILLS: Record<WeaponId, SkillDef[]> = {
  pistol: [
    { name: "Fan the Hammer", icon: "🔥", cooldown: 3, color: "#f97316", effectType: "projectile" },
    { name: "Pistol Whip",    icon: "💥", cooldown: 5, color: "#ef4444", effectType: "nova" },
    { name: "Quick Reload",   icon: "⚡", cooldown: 8, color: "#eab308", effectType: "aoe" },
    { name: "Deadeye",        icon: "🎯", cooldown: 12, color: "#a855f7", effectType: "beam" },
  ],
  rifle: [
    { name: "Burst Fire",     icon: "🔫", cooldown: 4, color: "#f97316", effectType: "projectile" },
    { name: "Frag Grenade",   icon: "💣", cooldown: 8, color: "#ef4444", effectType: "aoe" },
    { name: "Suppressive",    icon: "🌀", cooldown: 6, color: "#22c55e", effectType: "beam" },
    { name: "Armor Pierce",   icon: "⚡", cooldown: 10, color: "#a855f7", effectType: "nova" },
  ],
  sword: [
    { name: "Whirlwind",      icon: "🌪️", cooldown: 6, color: "#60a5fa", effectType: "aoe" },
    { name: "Blade Dash",     icon: "⚡", cooldown: 4, color: "#a855f7", effectType: "projectile" },
    { name: "Cross Slash",    icon: "✂️", cooldown: 3, color: "#f43f5e", effectType: "nova" },
    { name: "Void Cleave",    icon: "🌑", cooldown: 15, color: "#7c3aed", effectType: "beam" },
  ],
  axe: [
    { name: "Raging Strike",  icon: "🪓", cooldown: 5, color: "#ef4444", effectType: "nova" },
    { name: "War Cry",        icon: "😤", cooldown: 10, color: "#f97316", effectType: "aoe" },
    { name: "Cleave",         icon: "💢", cooldown: 3, color: "#dc2626", effectType: "projectile" },
    { name: "Rampage",        icon: "🔥", cooldown: 20, color: "#b91c1c", effectType: "beam" },
  ],
  staff: [
    { name: "Chain Lightning", icon: "⚡", cooldown: 4, color: "#facc15", effectType: "beam" },
    { name: "Arcane Orb",     icon: "🔮", cooldown: 6, color: "#a855f7", effectType: "projectile" },
    { name: "Frost Nova",     icon: "❄️", cooldown: 8, color: "#38bdf8", effectType: "aoe" },
    { name: "Meteor",         icon: "☄️", cooldown: 20, color: "#f97316", effectType: "nova" },
  ],
  bow: [
    { name: "Rain of Arrows", icon: "🏹", cooldown: 6, color: "#22c55e", effectType: "aoe" },
    { name: "Poison Shot",    icon: "☠️", cooldown: 4, color: "#84cc16", effectType: "projectile" },
    { name: "Eagle Eye",      icon: "🦅", cooldown: 8, color: "#eab308", effectType: "beam" },
    { name: "Volley",         icon: "🎯", cooldown: 5, color: "#a3e635", effectType: "nova" },
  ],
  shield: [
    { name: "Shield Bash",    icon: "🛡️", cooldown: 4, color: "#60a5fa", effectType: "nova" },
    { name: "Fortify",        icon: "🏰", cooldown: 8, color: "#94a3b8", effectType: "aoe" },
    { name: "Reflect",        icon: "🔄", cooldown: 6, color: "#38bdf8", effectType: "beam" },
    { name: "Taunt",          icon: "😈", cooldown: 12, color: "#f43f5e", effectType: "projectile" },
  ],
};
