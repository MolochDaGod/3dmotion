import { create } from "zustand";
import { GRAVEYARD, WEAPON_PROPS } from "./assets/manifest";
import { CHARACTER_REGISTRY } from "./CharacterRegistry";

export type SpawnCategory = "ruin" | "character" | "weapon" | "primitive";
export type BuildTool = "place" | "select" | "delete";

export interface SpawnedObject {
  id: string;
  label: string;
  meshPath: string;
  category: SpawnCategory;
  position: [number, number, number];
  rotationY: number;
  scale: number;
}

// ── Spawn catalogue ────────────────────────────────────────────────────────────

export const SPAWN_CATALOGUE: { label: string; meshPath: string; category: SpawnCategory; scale: number }[] = [
  // Characters
  ...CHARACTER_REGISTRY.map((c) => ({
    label:    c.name,
    meshPath: c.mesh,
    category: "character" as SpawnCategory,
    scale:    c.scale,
  })),
  // Weapons
  { label: "Sword",   meshPath: WEAPON_PROPS.sword,   category: "weapon", scale: 0.01 },
  { label: "Axe",     meshPath: WEAPON_PROPS.axe,     category: "weapon", scale: 0.01 },
  { label: "Pistol",  meshPath: WEAPON_PROPS.pistol,  category: "weapon", scale: 0.012 },
  { label: "Rifle",   meshPath: WEAPON_PROPS.rifle,   category: "weapon", scale: 0.013 },
  { label: "Bow",     meshPath: WEAPON_PROPS.bow,     category: "weapon", scale: 0.015 },
  { label: "Staff",   meshPath: WEAPON_PROPS.staff1,  category: "weapon", scale: 0.012 },
  { label: "Shield",  meshPath: WEAPON_PROPS.shield,  category: "weapon", scale: 0.01 },
  // Ruin props
  ...Array.from({ length: 21 }, (_, i) => ({
    label:    `Ruin ${i + 1}`,
    meshPath: GRAVEYARD.ruinFbx(i + 1),
    category: "ruin" as SpawnCategory,
    scale:    1.0,
  })),
];

interface AdminState {
  objects:        SpawnedObject[];
  selectedId:     string | null;
  buildTool:      BuildTool;
  activeSpawnIdx: number;
  ghostPosition:  [number, number, number];
  ghostVisible:   boolean;

  spawnObject:    (partial: Omit<SpawnedObject, "id">) => string;
  removeObject:   (id: string) => void;
  selectObject:   (id: string | null) => void;
  moveObject:     (id: string, pos: [number, number, number]) => void;
  rotateObject:   (id: string, dy: number) => void;
  setTool:        (t: BuildTool) => void;
  setActiveSpawn: (idx: number) => void;
  setGhostPos:    (pos: [number, number, number]) => void;
  setGhostVis:    (v: boolean) => void;
  clearAll:       () => void;
}

let nextId = 1;

export const useAdminStore = create<AdminState>((set, get) => ({
  objects:        [],
  selectedId:     null,
  buildTool:      "place",
  activeSpawnIdx: 0,
  ghostPosition:  [0, 0, 0],
  ghostVisible:   false,

  spawnObject: (partial) => {
    const id = `obj_${nextId++}`;
    set((s) => ({ objects: [...s.objects, { ...partial, id }] }));
    return id;
  },

  removeObject: (id) =>
    set((s) => ({
      objects:    s.objects.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  selectObject:  (id) => set({ selectedId: id }),
  setTool:       (t)  => set({ buildTool: t }),
  setActiveSpawn:(idx)=> set({ activeSpawnIdx: idx }),
  setGhostPos:   (pos)=> set({ ghostPosition: pos }),
  setGhostVis:   (v)  => set({ ghostVisible: v }),
  clearAll:      ()   => set({ objects: [], selectedId: null }),

  moveObject: (id, pos) =>
    set((s) => ({
      objects: s.objects.map((o) => o.id === id ? { ...o, position: pos } : o),
    })),

  rotateObject: (id, dy) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, rotationY: o.rotationY + dy } : o
      ),
    })),
}));
