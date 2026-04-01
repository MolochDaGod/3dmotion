import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Static definitions live in data/quality — re-exported here for backward compat
export type { QualityPreset, QualityConfig } from "./data/quality";
export { QUALITY_PRESETS } from "./data/quality";

import type { QualityPreset, QualityConfig } from "./data/quality";
import { QUALITY_PRESETS } from "./data/quality";

// ─── Store ────────────────────────────────────────────────────────────────────

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
