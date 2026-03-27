/**
 * CharacterRegistry — scriptable character definition system.
 *
 * To add a new Mixamo / Meshy / GLB character:
 *   1. Drop the mesh file into public/models/character/<your-id>.fbx|glb|gltf
 *   2. Copy a template slot below and fill in id / name / mesh / scale / format.
 *   3. That's it — all Mixamo animation packs are automatically reused.
 *
 * Bone names must follow the Mixamo standard (mixamorig:*).
 * Meshy AI FBX exports and standard Mixamo downloads match this verbatim.
 * Player.tsx's fuzzy bone traversal handles minor name variations.
 *
 * SUPPORTED MESH FORMATS
 *   "fbx"  — Three.js FBXLoader  (default when format is omitted)
 *   "glb"  — Three.js GLTFLoader, binary self-contained GLB
 *   "gltf" — Three.js GLTFLoader, JSON GLTF (must be self-contained / no external .bin)
 *
 * IK NOTES
 *   Hand IK is handled automatically via bone tracking in Player.tsx (handBoneRef /
 *   leftHandBoneRef).  Weapon props follow the hand bone every frame — no setup needed.
 *   Foot IK (terrain-planting) is wired to footIK: true and uses the two foot bones
 *   (mixamorigLeftFoot / mixamorigRightFoot) with a downward raycast each frame.
 *   Set footIK: false (default) to disable until the terrain surface normals are tuned.
 */

export interface CharacterDef {
  id: string;
  name: string;
  /** Path to the base-mesh file under /public, or an absolute https:// CDN URL */
  mesh: string;
  /** Mesh format — Player.tsx picks the correct loader automatically */
  format?: "fbx" | "glb" | "gltf";
  /** Uniform scale applied to the loaded mesh group */
  scale: number;
  /** Rapier kinematic capsule half-height (m) */
  capsuleHH: number;
  /** Rapier kinematic capsule radius (m) */
  capsuleR: number;
  /** CSS color shown next to the name in the HUD character picker */
  color: string;
  /** Enable per-frame foot-IK terrain planting (experimental) */
  footIK?: boolean;
  /** "meshy" for AI-generated characters, undefined for built-in roster */
  source?: "meshy";
}

export const CHARACTER_REGISTRY: CharacterDef[] = [
  // ── Built-in roster ────────────────────────────────────────────────────────

  {
    // Racalvin the Pirate King — Meshy AI Corsair King, Mixamo FBX
    // Exported from Meshy in centimetres (default).
    // 60 in = 152.4 cm → scale 0.01 → 1.524 Three.js metres ✓
    id: "corsair-king",
    name: "Racalvin the Pirate King",
    mesh: "/models/character/corsair-king.fbx",
    format: "fbx",
    scale: 0.01,
    capsuleHH: 0.50,
    capsuleR:  0.35,
    color: "#e8b84b",
  },

  {
    // Adventurer — standard humanoid, GLB self-contained, Mixamo rig
    id: "adventurer",
    name: "Adventurer",
    mesh: "/models/character/adventurer.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.50,
    capsuleR:  0.35,
    color: "#4fc3f7",
  },

  {
    // Animated Base Character — generic base mesh, GLB, Mixamo rig
    id: "animated-base",
    name: "Base Fighter",
    mesh: "/models/character/animated-base.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.50,
    capsuleR:  0.35,
    color: "#81c784",
  },

  {
    // Animated Wizard — staff-wielding mage archetype, GLB, Mixamo rig
    id: "animated-wizard",
    name: "Wizard",
    mesh: "/models/character/animated-wizard.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.50,
    capsuleR:  0.32,
    color: "#ce93d8",
  },

  {
    // Anne — agile rogue / archer archetype, GLB, Mixamo rig
    id: "anne",
    name: "Anne",
    mesh: "/models/character/anne.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.50,
    capsuleR:  0.30,
    color: "#f48fb1",
  },

  {
    // Armored Character — heavy tank archetype, self-contained GLTF, Mixamo rig
    id: "armored-character",
    name: "Iron Guard",
    mesh: "/models/character/armored-character.gltf",
    format: "gltf",
    scale: 1.0,
    capsuleHH: 0.52,
    capsuleR:  0.38,
    color: "#b0bec5",
  },
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
