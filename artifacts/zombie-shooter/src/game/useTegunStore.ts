/**
 * useTegunStore — state for the TEGUN terrain-editor weapon.
 *
 * The TEGUN has 7 paint modes, each painting a different layer onto the world.
 * Paint strokes are recorded as world-space colored discs.
 * "spawner" mode places an enemy/resource spawner marker instead of painting.
 */

import { create } from "zustand";

// ─── Mode definitions ─────────────────────────────────────────────────────────

export type TegunPaintMode =
  | "land"
  | "ground"
  | "harvest"
  | "stone"
  | "water"
  | "tree"
  | "spawner";

export interface TegunModeConfig {
  id:      TegunPaintMode;
  label:   string;
  icon:    string;
  color:   string;
  desc:    string;
}

export const TEGUN_MODES: readonly TegunModeConfig[] = [
  {
    id: "land",    label: "PAINT LAND",           icon: "🏔",
    color: "#f5a623",
    desc:  "Mark terrain for land modification",
  },
  {
    id: "ground",  label: "TEXTURE GROUND",       icon: "🌿",
    color: "#8b6030",
    desc:  "Paint ground / dirt texture",
  },
  {
    id: "harvest", label: "TEXTURE HARVESTABLES", icon: "🌾",
    color: "#e8d020",
    desc:  "Mark harvestable resource zones",
  },
  {
    id: "stone",   label: "TEXTURE STONE",        icon: "🪨",
    color: "#9a9a9a",
    desc:  "Paint stone / rock texture",
  },
  {
    id: "water",   label: "TEXTURE WATER",        icon: "💧",
    color: "#2080ff",
    desc:  "Paint water / shoreline areas",
  },
  {
    id: "tree",    label: "TEXTURE TREE",         icon: "🌴",
    color: "#22aa44",
    desc:  "Mark tree / jungle zones",
  },
  {
    id: "spawner", label: "PLACE SPAWNER",        icon: "☠",
    color: "#ff2222",
    desc:  "Place an enemy / loot spawner",
  },
] as const;

// ─── Paint stroke record ──────────────────────────────────────────────────────

export interface PaintStroke {
  id:       string;
  mode:     TegunPaintMode;
  position: [number, number, number];
  radius:   number;
  color:    string;
}

// ─── Spawner record ───────────────────────────────────────────────────────────

export interface SpawnerMarker {
  id:       string;
  position: [number, number, number];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface TegunState {
  activeModeIdx: number;
  brushRadius:   number;
  ghostPos:      [number, number, number];
  ghostVis:      boolean;
  strokes:       PaintStroke[];
  spawners:      SpawnerMarker[];

  setModeIdx:    (i: number) => void;
  setBrushRadius:(r: number) => void;
  setGhostPos:   (p: [number, number, number]) => void;
  setGhostVis:   (v: boolean) => void;
  addStroke:     (s: Omit<PaintStroke,  "id">) => void;
  addSpawner:    (s: Omit<SpawnerMarker,"id">) => void;
  clearAll:      () => void;
}

let _sid = 0;

export const useTegunStore = create<TegunState>((set) => ({
  activeModeIdx: 0,
  brushRadius:   6,
  ghostPos:      [0, 0, 0],
  ghostVis:      false,
  strokes:       [],
  spawners:      [],

  setModeIdx:    (i) => set({ activeModeIdx: i }),
  setBrushRadius:(r) => set({ brushRadius: r }),
  setGhostPos:   (p) => set({ ghostPos: p }),
  setGhostVis:   (v) => set({ ghostVis: v }),

  addStroke: (s) => set((st) => ({
    strokes: [...st.strokes, { ...s, id: `tg_${++_sid}` }],
  })),

  addSpawner: (s) => set((st) => ({
    spawners: [...st.spawners, { ...s, id: `sp_${++_sid}` }],
  })),

  clearAll: () => set({ strokes: [], spawners: [] }),
}));
