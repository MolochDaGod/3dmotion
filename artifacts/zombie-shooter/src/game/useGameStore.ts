import { create } from "zustand";

// ── Static definitions live in data/ — re-exported here for backward compat ───
// Prefer importing directly from "data/camera", "data/weapons", etc.
export type { CameraViewMode, CameraSettings } from "./data/camera";
export { CAMERA_CYCLE, DEFAULT_CAMERA } from "./data/camera";
export type { WeaponMode } from "./data/weapons";
export { WEAPON_CYCLE } from "./data/weapons";
export type { SpellType, SpellDef, MagicProjectileState } from "./data/spells";
export { SPELLS } from "./data/spells";

import type { CameraViewMode, CameraSettings } from "./data/camera";
import { CAMERA_CYCLE, DEFAULT_CAMERA } from "./data/camera";
import type { WeaponMode } from "./data/weapons";
import { WEAPON_CYCLE } from "./data/weapons";
import type { SpellType, MagicProjectileState } from "./data/spells";

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

  // ── God Mode + Admin Panel ─────────────────────────────────────────────────
  godMode:           boolean;
  adminPanelOpen:    boolean;
  toggleGodMode:     () => void;
  toggleAdminPanel:  () => void;
  setGodMode:        (v: boolean) => void;

  // Skill cooldowns (keyed by skill id)
  skillCooldowns:     Record<string, number>;
  setSkillCooldown:   (id: string, cd: number) => void;
  tickSkillCooldowns: (dt: number) => void;

  // ── Battle-royale drop phase ───────────────────────────────────────────────
  onShipPhase:      boolean;          // true while countdown ticks before drop
  dropPhase:        boolean;
  playerAltitude:   number;
  setOnShipPhase:   (v: boolean) => void;
  setDropPhase:     (v: boolean) => void;
  setPlayerAltitude:(v: number) => void;

  // ── Minimap ────────────────────────────────────────────────────────────────
  showMinimap:            boolean;
  setShowMinimap:         (v: boolean) => void;
  playerWorldPos:         [number, number];
  setPlayerWorldPos:      (p: [number, number]) => void;
  zombieWorldPositions:   [number, number][];
  setZombieWorldPositions:(p: [number, number][]) => void;
  customSpawners:         [number, number][];
  addCustomSpawner:       (p: [number, number]) => void;
  removeCustomSpawner:    (i: number) => void;
  pendingTeleport:        [number, number, number] | null;
  teleportTo:             (p: [number, number, number]) => void;
  clearTeleport:          () => void;

  // ── Feedback FX ────────────────────────────────────────────────────────────
  lastDamageTime:    number;   // performance.now() stamp of last damage taken
  hitMarkerActive:   boolean;  // true for ~180 ms after a hit lands
  activateHitMarker: () => void;

  // ── Hotkey legend overlay ──────────────────────────────────────────────────
  showHotkeys:       boolean;
  toggleHotkeys:     () => void;
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
  isPaused:      false,
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
    if (get().isInvincible || get().godMode) return;
    set((s) => ({ health: Math.max(0, s.health - amount), lastDamageTime: performance.now() }));
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
      isReloading: false, isPaused: false, isInvincible: false, wave: 1,
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

  godMode:          false,
  adminPanelOpen:   false,
  toggleGodMode:    () => set((s) => ({ godMode: !s.godMode })),
  toggleAdminPanel: () => set((s) => ({ adminPanelOpen: !s.adminPanelOpen })),
  setGodMode:       (v) => set({ godMode: v }),

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

  // ── Battle-royale drop phase ─────────────────────────────────────────────────
  onShipPhase:       false,
  dropPhase:         false,
  playerAltitude:    0,
  setOnShipPhase:    (v) => set({ onShipPhase: v }),
  setDropPhase:      (v) => set({ dropPhase: v }),
  setPlayerAltitude: (v) => set({ playerAltitude: v }),

  // ── Minimap ─────────────────────────────────────────────────────────────────
  showMinimap:            false,
  playerWorldPos:         [0, 0],
  zombieWorldPositions:   [],
  customSpawners:         [],
  pendingTeleport:        null,

  setShowMinimap:          (v) => set({ showMinimap: v }),
  setPlayerWorldPos:       (p) => set({ playerWorldPos: p }),
  setZombieWorldPositions: (p) => set({ zombieWorldPositions: p }),
  addCustomSpawner:        (p) => set((s) => ({ customSpawners: [...s.customSpawners, p] })),
  removeCustomSpawner:     (i) => set((s) => ({ customSpawners: s.customSpawners.filter((_, idx) => idx !== i) })),
  teleportTo:              (p) => set({ pendingTeleport: p }),
  clearTeleport:           ()  => set({ pendingTeleport: null }),

  // ── Feedback FX ────────────────────────────────────────────────────────────
  lastDamageTime:  0,
  hitMarkerActive: false,
  activateHitMarker: () => {
    set({ hitMarkerActive: true });
    setTimeout(() => set({ hitMarkerActive: false }), 180);
  },

  // ── Hotkey legend overlay ──────────────────────────────────────────────────
  showHotkeys:   false,
  toggleHotkeys: () => set((s) => ({ showHotkeys: !s.showHotkeys })),
}));
