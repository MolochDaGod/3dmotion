/**
 * data/camera.ts — single source of truth for camera configuration.
 *
 * Owns:
 *   CameraViewMode   — the three available camera perspectives
 *   CAMERA_CYCLE     — ordered array used by the cycle-camera action
 *   CameraSettings   — full camera state interface
 *   DEFAULT_CAMERA   — initial / reset values
 *
 * Zero Zustand imports — pure static config.
 * Runtime camera state lives in useGameStore (camera: CameraSettings).
 */

// ─── Camera perspective modes ─────────────────────────────────────────────────
//
//   "tps"    = third-person over-shoulder (default; character visible)
//   "action" = tight cinematic combat cam (closer, lower, more dramatic)
//   "arpg"   = isometric follow cam — Diablo/PoE style, fixed ~-45° world angle

export type CameraViewMode = "tps" | "action" | "arpg";

export const CAMERA_CYCLE: readonly CameraViewMode[] = [
  "tps", "action", "arpg",
] as const;

// ─── Camera settings interface ────────────────────────────────────────────────

export interface CameraSettings {
  mode:        CameraViewMode;
  fov:         number;
  sensitivity: number;
  shoulderX:   number;
  shoulderY:   number;
  shoulderZ:   number;
}

// ─── Factory defaults ─────────────────────────────────────────────────────────

export const DEFAULT_CAMERA: CameraSettings = {
  mode:        "tps",
  fov:         72,
  sensitivity: 0.0022,
  shoulderX:   0.60,   // more over-shoulder → cinematic right-bias
  shoulderY:   1.16,   // slightly lower eye-level → ground immersion
  shoulderZ:   2.80,   // a bit further back → more field-of-view context
};
