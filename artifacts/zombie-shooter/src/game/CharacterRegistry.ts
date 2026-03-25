/**
 * CharacterRegistry — scriptable character definition system.
 *
 * To add a new Meshy AI / Mixamo character:
 *   1. Export your model from Meshy as FBX with Mixamo skeleton.
 *   2. Drop the .fbx into  public/models/character/<your-id>.fbx
 *   3. Copy the template slot below, fill in id/name/mesh/scale.
 *   4. That's it — all Mixamo animation packs are automatically reused.
 *
 * Bone names follow the Mixamo standard (mixamorig:*) which Meshy's
 * FBX export matches verbatim. Fuzzy traversal in Player.tsx handles
 * minor name variations automatically.
 */

export interface CharacterDef {
  id: string;
  name: string;
  /** Path to the base-mesh FBX under /public */
  mesh: string;
  /** Uniform scale applied to the loaded FBX group (Mixamo default ≈ 0.01) */
  scale: number;
  /** Rapier kinematic capsule half-height (m) */
  capsuleHH: number;
  /** Rapier kinematic capsule radius (m) */
  capsuleR: number;
  /** CSS color shown next to the name in the HUD character picker */
  color: string;
}

export const CHARACTER_REGISTRY: CharacterDef[] = [
  {
    id: "corsair-king",
    name: "Corsair King",
    mesh: "/models/character/corsair-king.fbx",
    scale: 0.01,
    capsuleHH: 0.5,
    capsuleR: 0.35,
    color: "#e8b84b",
  },

  // ── Template: drop in any Mixamo-compatible FBX and update these fields ──
  // {
  //   id:        "my-hero",
  //   name:      "My Hero",
  //   mesh:      "/models/character/my-hero.fbx",
  //   scale:     0.01,
  //   capsuleHH: 0.5,
  //   capsuleR:  0.35,
  //   color:     "#4fc3f7",
  // },
];

/** Look up a def by id; falls back to the first entry if not found. */
export function getCharDef(id: string): CharacterDef {
  return CHARACTER_REGISTRY.find((c) => c.id === id) ?? CHARACTER_REGISTRY[0];
}

/** Get the next character id in the registry (wraps around). */
export function nextCharId(currentId: string): string {
  const ids = CHARACTER_REGISTRY.map((c) => c.id);
  const idx = ids.indexOf(currentId);
  return CHARACTER_REGISTRY[(idx + 1) % CHARACTER_REGISTRY.length].id;
}
