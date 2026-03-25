import { create } from "zustand";
import { persist } from "zustand/middleware";

export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface QualityConfig {
  pixelRatio: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  antialias: boolean;
  bloomIntensity: number;
  dofEnabled: boolean;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  low: {
    pixelRatio: 0.75,
    shadowMapSize: 512,
    shadowsEnabled: false,
    antialias: false,
    bloomIntensity: 0,
    dofEnabled: false,
  },
  medium: {
    pixelRatio: 1.0,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    antialias: true,
    bloomIntensity: 0.3,
    dofEnabled: false,
  },
  high: {
    pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    shadowMapSize: 2048,
    shadowsEnabled: true,
    antialias: true,
    bloomIntensity: 0.5,
    dofEnabled: false,
  },
  ultra: {
    pixelRatio: Math.min(window.devicePixelRatio, 2.0),
    shadowMapSize: 4096,
    shadowsEnabled: true,
    antialias: true,
    bloomIntensity: 0.8,
    dofEnabled: true,
  },
};

interface SettingsState {
  quality: QualityPreset;
  fov: number;
  sensitivity: number;
  showGrid: boolean;
  showStats: boolean;

  setQuality: (q: QualityPreset) => void;
  setFov: (v: number) => void;
  setSensitivity: (v: number) => void;
  setShowGrid: (v: boolean) => void;
  setShowStats: (v: boolean) => void;

  getConfig: () => QualityConfig;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      quality: "high",
      fov: 70,
      sensitivity: 1.0,
      showGrid: false,
      showStats: false,

      setQuality: (quality) => set({ quality }),
      setFov: (fov) => set({ fov }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setShowStats: (showStats) => set({ showStats }),

      getConfig: () => QUALITY_PRESETS[get().quality],
    }),
    { name: "motion-training-settings" }
  )
);
