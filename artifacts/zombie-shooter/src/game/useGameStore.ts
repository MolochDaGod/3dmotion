import { create } from "zustand";

// ─── Camera settings ──────────────────────────────────────────────────────────

// "tps"    = third-person over-shoulder (default / "front" view — character visible)
// "action" = tight cinematic combat cam (closer, lower, more dramatic)
// "fps"    = first-person
export type CameraViewMode = "tps" | "action" | "fps";
export const CAMERA_CYCLE: CameraViewMode[] = ["tps", "action", "fps"];

export interface CameraSettings {
  mode:        CameraViewMode;
  fov:         number;
  sensitivity: number;
  shoulderX:   number;
  shoulderY:   number;
  shoulderZ:   number;
}

export const DEFAULT_CAMERA: CameraSettings = {
  mode:        "tps",
  fov:         70,
  sensitivity: 0.002,
  shoulderX:   0.55,
  shoulderY:   1.55,
  shoulderZ:   2.8,
};

// ─── Weapon modes ─────────────────────────────────────────────────────────────

export type WeaponMode = "pistol" | "rifle" | "sword" | "axe" | "staff" | "bow" | "shield";
export const WEAPON_CYCLE: WeaponMode[] = ["pistol", "rifle", "sword", "axe", "staff", "bow", "shield"];

// ─── Spell system (colors sourced from BinbunVFX MagicProjectiles pack) ──────

export type SpellType = "orb" | "javelin" | "wave" | "nova";

export interface SpellDef {
  id:          SpellType;
  name:        string;
  icon:        string;
  color:       string;        // outer glow / trail
  coreColor:   string;        // bright inner core
  damage:      number;
  speed:       number;        // world units/s; 0 = stationary burst
  radius:      number;        // impact / AoE radius
  manaCost:    number;
  cooldown:    number;        // seconds between casts
  description: string;
}

// Colors directly translated from the Godot .tres material files
export const SPELLS: SpellDef[] = [
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
];

// ─── Magic projectile instances ───────────────────────────────────────────────

export interface MagicProjectileState {
  id:        string;
  spell:     SpellDef;
  position:  [number, number, number];
  direction: [number, number, number];
  spawnedAt: number;          // Date.now()
  maxLife:   number;          // seconds before auto-despawn
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface GameStore {
  health:     number;
  maxHealth:  number;
  mana:       number;
  maxMana:    number;
  ammo:       number;
  maxAmmo:    number;
  score:      number;
  kills:      number;
  isReloading:   boolean;
  isPaused:      boolean;
  isInvincible:  boolean;
  wave:          number;

  // Camera
  camera:             CameraSettings;
  showCameraSettings: boolean;

  // Character Panel
  showCharacterPanel: boolean;

  // Weapon
  weaponMode: WeaponMode;
  setWeaponMode: (m: WeaponMode) => void;
  cycleWeapon:   () => void;

  // Spell system
  selectedSpell:   SpellType;
  showSpellRadial: boolean;
  spellCooldown:   number;   // remaining cooldown in seconds
  magicProjectiles: MagicProjectileState[];

  setSelectedSpell:   (s: SpellType) => void;
  setShowSpellRadial: (v: boolean) => void;
  setSpellCooldown:   (v: number) => void;
  tickSpellCooldown:  (dt: number) => void;
  addMagicProjectile: (p: MagicProjectileState) => void;
  removeMagicProjectile: (id: string) => void;

  // Actions
  takeDamage:  (amount: number) => void;
  heal:        (amount: number) => void;
  shoot:       () => boolean;
  reload:      () => void;
  useMana:     (amount: number) => boolean;
  regenMana:   (amount: number) => void;
  addScore:    (points: number) => void;
  addKill:     () => void;
  setReloading:    (val: boolean) => void;
  setPaused:       (val: boolean) => void;
  setInvincible:   (val: boolean) => void;
  nextWave:        () => void;
  reset:           () => void;

  // Camera
  setCameraMode:        (m: CameraViewMode) => void;
  cycleCameraMode:      () => void;
  setCameraFOV:         (v: number) => void;
  setCameraSensitivity: (v: number) => void;
  setCameraShoulderX:   (v: number) => void;
  setCameraShoulderY:   (v: number) => void;
  setCameraShoulderZ:   (v: number) => void;
  setShowCameraSettings:(v: boolean) => void;

  // Character panel
  setShowCharacterPanel:(v: boolean) => void;
  toggleCharacterPanel: () => void;

  // Melee block (RMB held while sword/axe) — read by HUD for crosshair
  meleeBlocking:    boolean;
  setMeleeBlocking: (v: boolean) => void;

  // Skill cooldowns (keyed by skill id)
  skillCooldowns:     Record<string, number>;
  setSkillCooldown:   (id: string, cd: number) => void;
  tickSkillCooldowns: (dt: number) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  health:        100,
  maxHealth:     100,
  mana:          100,
  maxMana:       100,
  ammo:          15,
  maxAmmo:       15,
  score:         0,
  kills:         0,
  isReloading:   false,
  isPaused:      true,   // starts paused so overlay shows on first load
  isInvincible:  false,
  wave:          1,
  camera:        { ...DEFAULT_CAMERA },
  showCameraSettings:  false,
  showCharacterPanel:  false,
  weaponMode:    "pistol",

  // Skill cooldowns
  skillCooldowns: {},

  // Spell defaults
  selectedSpell:    "orb",
  showSpellRadial:  false,
  spellCooldown:    0,
  magicProjectiles: [],

  setSelectedSpell:   (s) => set({ selectedSpell: s }),
  setShowSpellRadial: (v) => set({ showSpellRadial: v }),
  setSpellCooldown:   (v) => set({ spellCooldown: v }),
  tickSpellCooldown:  (dt) => set((s) => ({ spellCooldown: Math.max(0, s.spellCooldown - dt) })),

  addMagicProjectile: (p) =>
    set((s) => ({ magicProjectiles: [...s.magicProjectiles, p] })),

  removeMagicProjectile: (id) =>
    set((s) => ({ magicProjectiles: s.magicProjectiles.filter((p) => p.id !== id) })),

  takeDamage: (amount) => {
    if (get().isInvincible) return;
    set((s) => ({ health: Math.max(0, s.health - amount) }));
  },

  heal: (amount) => {
    set((s) => ({ health: Math.min(s.maxHealth, s.health + amount) }));
  },

  shoot: () => {
    const { ammo, isReloading } = get();
    if (ammo <= 0 || isReloading) return false;
    set((s) => ({ ammo: s.ammo - 1 }));
    return true;
  },

  reload: () => {
    const state = get();
    if (state.isReloading) return;
    set({ isReloading: true });
    setTimeout(() => {
      set({ ammo: get().maxAmmo, isReloading: false });
    }, 2000);
  },

  useMana: (amount) => {
    const { mana } = get();
    if (mana < amount) return false;
    set((s) => ({ mana: Math.max(0, s.mana - amount) }));
    return true;
  },

  regenMana: (amount) => {
    set((s) => ({ mana: Math.min(s.maxMana, s.mana + amount) }));
  },

  addScore: (points) => set((s) => ({ score: s.score + points })),
  addKill:  ()       => set((s) => ({ kills: s.kills + 1 })),

  setReloading:  (val) => set({ isReloading: val }),
  setPaused:     (val) => set({ isPaused: val }),
  setInvincible: (val) => set({ isInvincible: val }),
  nextWave:      ()    => set((s) => ({ wave: s.wave + 1 })),

  reset: () =>
    set({
      health: 100, mana: 100, ammo: 15, score: 0, kills: 0,
      isReloading: false, isPaused: true, isInvincible: false, wave: 1,
      camera: { ...DEFAULT_CAMERA }, showCameraSettings: false,
      showCharacterPanel: false, weaponMode: "pistol",
      selectedSpell: "orb", showSpellRadial: false,
      spellCooldown: 0, magicProjectiles: [],
    }),

  setWeaponMode: (m) => set({ weaponMode: m }),

  cycleWeapon: () => {
    const cur = get().weaponMode;
    const idx = WEAPON_CYCLE.indexOf(cur);
    const next = WEAPON_CYCLE[(idx + 1) % WEAPON_CYCLE.length];
    set({ weaponMode: next });
  },

  setCameraMode:        (m) => set((s) => ({ camera: { ...s.camera, mode: m } })),
  cycleCameraMode: () => {
    const cur = get().camera.mode;
    const idx  = CAMERA_CYCLE.indexOf(cur);
    const next = CAMERA_CYCLE[(idx + 1) % CAMERA_CYCLE.length];
    set((s) => ({ camera: { ...s.camera, mode: next } }));
  },
  setCameraFOV:         (v) => set((s) => ({ camera: { ...s.camera, fov:         v } })),
  setCameraSensitivity: (v) => set((s) => ({ camera: { ...s.camera, sensitivity: v } })),
  setCameraShoulderX:   (v) => set((s) => ({ camera: { ...s.camera, shoulderX:   v } })),
  setCameraShoulderY:   (v) => set((s) => ({ camera: { ...s.camera, shoulderY:   v } })),
  setCameraShoulderZ:   (v) => set((s) => ({ camera: { ...s.camera, shoulderZ:   v } })),
  setShowCameraSettings:(v) => set({ showCameraSettings: v }),

  setShowCharacterPanel:(v) => set({ showCharacterPanel: v }),
  toggleCharacterPanel: ()  => set((s) => ({ showCharacterPanel: !s.showCharacterPanel })),

  meleeBlocking:    false,
  setMeleeBlocking: (v) => set({ meleeBlocking: v }),

  setSkillCooldown: (id, cd) => set((s) => ({
    skillCooldowns: { ...s.skillCooldowns, [id]: cd },
  })),
  tickSkillCooldowns: (dt) => set((s) => {
    const next: Record<string, number> = {};
    let changed = false;
    for (const [id, cd] of Object.entries(s.skillCooldowns)) {
      const v = Math.max(0, cd - dt);
      next[id] = v;
      if (v !== cd) changed = true;
    }
    return changed ? { skillCooldowns: next } : s;
  }),
}));
