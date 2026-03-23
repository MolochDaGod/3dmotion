import { create } from "zustand";

interface GameStore {
  health: number;
  maxHealth: number;
  ammo: number;
  maxAmmo: number;
  score: number;
  kills: number;
  isReloading: boolean;
  isPaused: boolean;
  isInvincible: boolean;
  wave: number;

  takeDamage: (amount: number) => void;
  heal: (amount: number) => void;
  shoot: () => boolean;
  reload: () => void;
  addScore: (points: number) => void;
  addKill: () => void;
  setReloading: (val: boolean) => void;
  setPaused: (val: boolean) => void;
  setInvincible: (val: boolean) => void;
  nextWave: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  health: 100,
  maxHealth: 100,
  ammo: 15,
  maxAmmo: 15,
  score: 0,
  kills: 0,
  isReloading: false,
  isPaused: false,
  isInvincible: false,
  wave: 1,

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

  addScore: (points) => {
    set((s) => ({ score: s.score + points }));
  },

  addKill: () => {
    set((s) => ({ kills: s.kills + 1 }));
  },

  setReloading: (val) => set({ isReloading: val }),
  setPaused:    (val) => set({ isPaused: val }),
  setInvincible:(val) => set({ isInvincible: val }),

  nextWave: () => set((s) => ({ wave: s.wave + 1 })),

  reset: () =>
    set({
      health: 100,
      ammo: 15,
      score: 0,
      kills: 0,
      isReloading: false,
      isPaused: false,
      isInvincible: false,
      wave: 1,
    }),
}));
