import { useEffect } from "react";
import { useControls, folder } from "leva";
import { useEditorStore, SceneId } from "./useEditorStore";

// ─── EditorPanel ──────────────────────────────────────────────────────────────
// Always mounted (so Leva controls always exist in its store).
// Visibility of the Leva panel is controlled by <Leva hidden={...} /> in App.tsx.
// Reads initial defaults from useEditorStore; syncs Leva → store on every change.

export function EditorPanel() {
  const patch = useEditorStore((s) => s.patch);

  // ── Scene selector ────────────────────────────────────────────────────────
  const sceneCtrl = useControls(
    "🗺️  Scene Select",
    {
      activeScene: {
        value: "pirate-island",
        options: {
          "🏝️  Pirate Island": "pirate-island",
          "⚰️  Graveyard":     "graveyard",
        },
        label: "Active scene",
      },
    },
    { collapsed: false }
  );

  // ── Post-FX ───────────────────────────────────────────────────────────────
  const postFX = useControls(
    "🎨  Post-FX",
    {
      bloomIntensity:   { value: 0.50, min: 0, max: 4,   step: 0.05, label: "Bloom intensity" },
      bloomThreshold:   { value: 0.75, min: 0, max: 1,   step: 0.05, label: "Bloom threshold" },
      bloomSmoothing:   { value: 0.50, min: 0, max: 1,   step: 0.05, label: "Bloom smoothing" },
      vignetteDarkness: { value: 0.55, min: 0, max: 1.5, step: 0.05, label: "Vignette dark" },
      vignetteOffset:   { value: 0.35, min: 0, max: 1,   step: 0.05, label: "Vignette offset" },
    },
    { collapsed: false }
  );

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = useControls(
    "🌅  Scene",
    {
      ambientIntensity: { value: 0.55, min: 0, max: 3,   step: 0.05, label: "Ambient light" },
      sunIntensity:     { value: 2.80, min: 0, max: 6,   step: 0.1,  label: "Sun intensity" },
      fogNear:          { value: 90,   min: 10, max: 300, step: 5,    label: "Fog near" },
      fogFar:           { value: 230,  min: 50, max: 800, step: 10,   label: "Fog far" },
    },
    { collapsed: true }
  );

  // ── Gameplay ──────────────────────────────────────────────────────────────
  const gameplay = useControls(
    "🧟  Gameplay",
    {
      zombieSpeedMult:       { value: 1.0, min: 0.1, max: 4,   step: 0.1, label: "Zombie speed ×" },
      zombieDetectionRadius: { value: 22,  min: 5,   max: 60,  step: 1,   label: "Zombie detect radius" },
      zombieAttackDamage:    { value: 10,  min: 1,   max: 100, step: 1,   label: "Zombie damage/hit" },
      maxZombies:            { value: 18,  min: 1,   max: 50,  step: 1,   label: "Max zombies" },
    },
    { collapsed: true }
  );

  // ── Performance ───────────────────────────────────────────────────────────
  const perf = useControls(
    "⚡  Performance",
    {
      showPerf: { value: false, label: "Show perf overlay (F2)" },
    },
    { collapsed: true }
  );

  // ── Sync all Leva values → Zustand store ──────────────────────────────────
  useEffect(() => { patch({ activeScene: sceneCtrl.activeScene as SceneId }); }, [sceneCtrl.activeScene, patch]);
  useEffect(() => { patch(postFX);   }, [postFX,   patch]);
  useEffect(() => { patch(scene);    }, [scene,    patch]);
  useEffect(() => { patch(gameplay); }, [gameplay, patch]);
  useEffect(() => { patch(perf);     }, [perf,     patch]);

  return null;
}
