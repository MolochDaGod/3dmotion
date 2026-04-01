/**
 * data/quality.ts — single source of truth for render quality presets.
 *
 * Owns:
 *   QualityPreset   — the four quality tiers
 *   QualityConfig   — per-preset renderer settings interface
 *   QUALITY_PRESETS — canonical map from tier → settings
 *
 * Zero Zustand imports — pure static config.
 * Runtime quality selection lives in useSettingsStore (quality: QualityPreset).
 *
 * NOTE: pixelRatio for "high"/"ultra" calls window.devicePixelRatio at module
 * evaluation time. This is safe in a browser-only Vite app — the module is
 * never imported during SSR.
 */

// ─── Quality tier identifier ──────────────────────────────────────────────────

export type QualityPreset = "low" | "medium" | "high" | "ultra";

// ─── Per-preset renderer config ───────────────────────────────────────────────

export interface QualityConfig {
  pixelRatio:     number;
  shadowMapSize:  number;
  shadowsEnabled: boolean;
  antialias:      boolean;
  bloomIntensity: number;
  dofEnabled:     boolean;
}

// ─── Canonical preset table ───────────────────────────────────────────────────

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  low: {
    pixelRatio:     0.75,
    shadowMapSize:  512,
    shadowsEnabled: false,
    antialias:      false,
    bloomIntensity: 0,
    dofEnabled:     false,
  },
  medium: {
    pixelRatio:     1.0,
    shadowMapSize:  1024,
    shadowsEnabled: true,
    antialias:      true,
    bloomIntensity: 0.3,
    dofEnabled:     false,
  },
  high: {
    pixelRatio:     Math.min(window.devicePixelRatio, 1.5),
    shadowMapSize:  2048,
    shadowsEnabled: true,
    antialias:      true,
    bloomIntensity: 0.5,
    dofEnabled:     false,
  },
  ultra: {
    pixelRatio:     Math.min(window.devicePixelRatio, 2.0),
    shadowMapSize:  4096,
    shadowsEnabled: true,
    antialias:      true,
    bloomIntensity: 0.8,
    dofEnabled:     true,
  },
};
