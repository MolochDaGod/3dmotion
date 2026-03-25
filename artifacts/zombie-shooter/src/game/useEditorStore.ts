import { create } from "zustand";

// ─── Editor / Admin store ─────────────────────────────────────────────────────
// All live-tweakable game settings.  Leva controls write here; game reads here.
// Using .getState() inside useFrame is intentional — avoids per-zombie subscribe.

export interface EditorSettings {
  // UI
  editorVisible: boolean;
  showPerf:      boolean;

  // Post-FX
  bloomIntensity:    number;
  bloomThreshold:    number;
  bloomSmoothing:    number;
  vignetteDarkness:  number;
  vignetteOffset:    number;
  dofFocusDistance:  number;
  dofFocalLength:    number;
  dofBokehScale:     number;
  chromaticStrength: number;

  // Scene
  ambientIntensity: number;
  sunIntensity:     number;
  fogNear:          number;
  fogFar:           number;

  // Gameplay
  zombieSpeedMult:        number;
  zombieDetectionRadius:  number;
  zombieAttackDamage:     number;
  maxZombies:             number;

  // Actions
  toggleEditor: () => void;
  togglePerf:   () => void;
  patch: (p: Partial<Omit<EditorSettings, "toggleEditor" | "togglePerf" | "patch">>) => void;
}

export const useEditorStore = create<EditorSettings>((set) => ({
  editorVisible: false,
  showPerf:      false,

  bloomIntensity:    0.50,
  bloomThreshold:    0.75,
  bloomSmoothing:    0.50,
  vignetteDarkness:  0.55,
  vignetteOffset:    0.35,
  dofFocusDistance:  0.00,
  dofFocalLength:    0.02,
  dofBokehScale:     1.50,
  chromaticStrength: 0.00,

  ambientIntensity: 0.55,
  sunIntensity:     2.80,
  fogNear:          90,
  fogFar:           230,

  zombieSpeedMult:       1.00,
  zombieDetectionRadius: 22,
  zombieAttackDamage:    10,
  maxZombies:            18,

  toggleEditor: () => set((s) => ({ editorVisible: !s.editorVisible })),
  togglePerf:   () => set((s) => ({ showPerf:      !s.showPerf      })),
  patch: (p) => set(p as any),
}));
