import { create } from "zustand";

// ─── Camera settings ──────────────────────────────────────────────────────────

export interface CameraSettings {
  mode:        "tps" | "fps";
  fov:         number;   // degrees
  sensitivity: number;   // radians per pixel
  shoulderX:   number;   // TPS shoulder offset right
  shoulderY:   number;   // TPS shoulder offset up
  shoulderZ:   number;   // TPS shoulder offset back
}

export const DEFAULT_CAMERA: CameraSettings = {
  mode:        "tps",
  fov:         70,
  sensitivity: 0.002,
  shoulderX:   0.55,
  shoulderY:   1.55,
  shoulderZ:   2.8,
};

// ─── Store ────────────────────────────────────────────────────────────────────

interface GameStore {
  health:     number;
  maxHealth:  number;
  ammo:       number;
  maxAmmo:    number;
  score:      number;
  kills:      number;
  isReloading:   boolean;
  isPaused:      boolean;
  isInvincible:  boolean;
  wave:          number;

  // Camera
  camera:           CameraSettings;
  showCameraSettings: boolean;

  // Weapon
  weaponMode: "ranged" | "melee";
  setWeaponMode: (m: "ranged" | "melee") => void;

  // Actions
  takeDamage: (amount: number) => void;
  heal:       (amount: number) => void;
  shoot:      () => boolean;
  reload:     () => void;
  addScore:   (points: number) => void;
  addKill:    () => void;
  setReloading:   (val: boolean) => void;
  setPaused:      (val: boolean) => void;
  setInvincible:  (val: boolean) => void;
  nextWave:       () => void;
  reset:          () => void;

  // Camera
  setCameraMode:        (m: "tps" | "fps") => void;
  setCameraFOV:         (v: number) => void;
  setCameraSensitivity: (v: number) => void;
  setCameraShoulderX:   (v: number) => void;
  setCameraShoulderY:   (v: number) => void;
  setCameraShoulderZ:   (v: number) => void;
  setShowCameraSettings:(v: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  health:     100,
  maxHealth:  100,
  ammo:       15,
  maxAmmo:    15,
  score:      0,
  kills:      0,
  isReloading:   false,
  isPaused:      false,
  isInvincible:  false,
  wave:          1,
  camera:        { ...DEFAULT_CAMERA },
  showCameraSettings: false,
  weaponMode:    "ranged",

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

  addScore: (points) => set((s) => ({ score: s.score + points })),
  addKill:  ()       => set((s) => ({ kills: s.kills + 1 })),

  setReloading:  (val) => set({ isReloading: val }),
  setPaused:     (val) => set({ isPaused: val }),
  setInvincible: (val) => set({ isInvincible: val }),
  nextWave:      ()    => set((s) => ({ wave: s.wave + 1 })),

  reset: () =>
    set({
      health: 100, ammo: 15, score: 0, kills: 0,
      isReloading: false, isPaused: false, isInvincible: false, wave: 1,
      camera: { ...DEFAULT_CAMERA }, showCameraSettings: false,
      weaponMode: "ranged" as const,
    }),

  setWeaponMode:        (m) => set({ weaponMode: m }),

  setCameraMode:        (m) => set((s) => ({ camera: { ...s.camera, mode:        m } })),
  setCameraFOV:         (v) => set((s) => ({ camera: { ...s.camera, fov:         v } })),
  setCameraSensitivity: (v) => set((s) => ({ camera: { ...s.camera, sensitivity: v } })),
  setCameraShoulderX:   (v) => set((s) => ({ camera: { ...s.camera, shoulderX:   v } })),
  setCameraShoulderY:   (v) => set((s) => ({ camera: { ...s.camera, shoulderY:   v } })),
  setCameraShoulderZ:   (v) => set((s) => ({ camera: { ...s.camera, shoulderZ:   v } })),
  setShowCameraSettings:(v) => set({ showCameraSettings: v }),
}));
