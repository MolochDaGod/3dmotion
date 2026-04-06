/**
 * data/characters.ts — single source of truth for character definitions.
 *
 * To add a new Mixamo / Meshy / GLB character:
 *   1. Drop the mesh file into public/models/character/<your-id>.fbx|glb|gltf
 *   2. Copy a template entry below and fill in id / name / mesh / scale / format.
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
 *   leftHandBoneRef). Weapon props follow the hand bone every frame — no setup needed.
 *   Foot IK (terrain-planting) uses mixamorigLeftFoot / mixamorigRightFoot with a
 *   downward raycast each frame. Set footIK: false (default) to disable.
 *
 * Zero Zustand imports — pure static config.
 */

// ─── Character definition ─────────────────────────────────────────────────────

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
  /**
   * When set, this character uses animations embedded in the GLB itself rather
   * than loading the separate Mixamo FBX animation packs.
   * Keys are AnimKey strings (from Player.tsx); values are the GLB clip names.
   * Player.tsx will skip all external FBX animation loading and instead register
   * these clips directly from the GLTF result.
   */
  embeddedAnims?: Record<string, string>;
}

// ─── Built-in roster ──────────────────────────────────────────────────────────

export const CHARACTER_REGISTRY: CharacterDef[] = [
  {
    // Racalvin the Pirate King — Meshy AI Corsair King, Mixamo FBX
    // Exported from Meshy in centimetres (default).
    // 60 in = 152.4 cm → scale 0.01 → 1.524 Three.js metres ✓
    // Capsule: 2·HH + 2·R = 1.44 m — snug fit for a 1.524 m character.
    id: "corsair-king",
    name: "Racalvin the Pirate King",
    mesh: "/models/character/corsair-king.fbx",
    format: "fbx",
    scale: 0.01,
    capsuleHH: 0.42,
    capsuleR:  0.30,
    color: "#e8b84b",
  },

  {
    // Adventurer — standard humanoid (~1.80 m), GLB self-contained, Mixamo rig
    // Capsule: 2·0.45 + 2·0.32 = 1.54 m
    id: "adventurer",
    name: "Adventurer",
    mesh: "/models/character/adventurer.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.45,
    capsuleR:  0.32,
    color: "#4fc3f7",
  },

  {
    // Animated Base Character — generic base mesh (~1.80 m), GLB, Mixamo rig
    // Capsule: 2·0.45 + 2·0.32 = 1.54 m
    id: "animated-base",
    name: "Base Fighter",
    mesh: "/models/character/animated-base.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.45,
    capsuleR:  0.32,
    color: "#81c784",
  },

  {
    // Animated Wizard — staff-wielding mage archetype (~1.78 m), GLB, Mixamo rig
    // Capsule: 2·0.44 + 2·0.30 = 1.48 m
    id: "animated-wizard",
    name: "Wizard",
    mesh: "/models/character/animated-wizard.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.44,
    capsuleR:  0.30,
    color: "#ce93d8",
  },

  {
    // Anne — agile rogue / archer archetype (~1.70 m), GLB, Mixamo rig
    // Capsule: 2·0.43 + 2·0.28 = 1.42 m
    id: "anne",
    name: "Anne",
    mesh: "/models/character/anne.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.43,
    capsuleR:  0.28,
    color: "#f48fb1",
  },

  {
    // Armored Character — heavy tank archetype (~1.85 m), self-contained GLTF, Mixamo rig
    // Capsule: 2·0.47 + 2·0.34 = 1.62 m (slightly larger for armour bulk)
    id: "armored-character",
    name: "Iron Guard",
    mesh: "/models/character/armored-character.gltf",
    format: "gltf",
    scale: 1.0,
    capsuleHH: 0.47,
    capsuleR:  0.34,
    color: "#b0bec5",
  },

  {
    // Astronaut — self-contained GLB with 24 embedded animations.
    // Uses CharacterArmature rig (NOT Mixamo) so external FBX packs are skipped.
    // All gameplay AnimKeys are mapped below to embedded clip names.
    // GLB is in metres; character is ~1.80 m tall → scale 1.0.
    id: "astronaut",
    name: "Astronaut",
    mesh: "/models/character/astronaut.glb",
    format: "glb",
    scale: 1.0,
    capsuleHH: 0.44,
    capsuleR:  0.30,
    color: "#78c8ff",
    embeddedAnims: {
      // ── Pistol / gun stance ────────────────────────────────────────────────
      pistolIdle:        "CharacterArmature|Idle_Gun",
      pistolWalkFwd:     "CharacterArmature|Walk",
      pistolWalkBwd:     "CharacterArmature|Run_Back",
      pistolStrafeL:     "CharacterArmature|Run_Left",
      pistolStrafeR:     "CharacterArmature|Run_Right",
      pistolWalkArcL:    "CharacterArmature|Run_Left",
      pistolWalkArcR:    "CharacterArmature|Run_Right",
      pistolWalkBwdArcL: "CharacterArmature|Run_Back",
      pistolWalkBwdArcR: "CharacterArmature|Run_Back",
      pistolRun:         "CharacterArmature|Run",
      pistolRunArcL:     "CharacterArmature|Run_Left",
      pistolRunArcR:     "CharacterArmature|Run_Right",
      pistolRunBwd:      "CharacterArmature|Run_Back",
      pistolRunBwdArcL:  "CharacterArmature|Run_Back",
      pistolRunBwdArcR:  "CharacterArmature|Run_Back",
      pistolJump:        "CharacterArmature|Run",
      pistolLand:        "CharacterArmature|Idle_Gun",
      pistolCrouchDown:  "CharacterArmature|Idle_Neutral",
      pistolCrouchIdle:  "CharacterArmature|Idle_Neutral",
      pistolCrouchUp:    "CharacterArmature|Idle_Gun",
      // ── Rifle stance (reuse gun anims) ────────────────────────────────────
      rifleIdle:    "CharacterArmature|Idle_Gun",
      rifleWalkFwd: "CharacterArmature|Walk",
      rifleWalkBwd: "CharacterArmature|Run_Back",
      rifleStrafeL: "CharacterArmature|Run_Left",
      rifleStrafeR: "CharacterArmature|Run_Right",
      rifleRun:     "CharacterArmature|Run",
      rifleRunBwd:  "CharacterArmature|Run_Back",
      rifleJump:    "CharacterArmature|Run",
      rifleFire:    "CharacterArmature|Gun_Shoot",
      rifleReload:  "CharacterArmature|Interact",
      rifleTurnL:   "CharacterArmature|Run_Left",
      rifleTurnR:   "CharacterArmature|Run_Right",
      // ── Melee stance ──────────────────────────────────────────────────────
      meleeIdle:           "CharacterArmature|Idle",
      meleeWalkFwd:        "CharacterArmature|Walk",
      meleeWalkBwd:        "CharacterArmature|Run_Back",
      meleeStrafeL:        "CharacterArmature|Run_Left",
      meleeStrafeR:        "CharacterArmature|Run_Right",
      meleeRunFwd:         "CharacterArmature|Run",
      meleeRunBwd:         "CharacterArmature|Run_Back",
      meleeAttack1:        "CharacterArmature|Punch_Left",
      meleeAttack2:        "CharacterArmature|Punch_Right",
      meleeAttack3:        "CharacterArmature|Kick_Left",
      meleeCombo1:         "CharacterArmature|Kick_Right",
      meleeCombo2:         "CharacterArmature|Sword_Slash",
      meleeCombo3:         "CharacterArmature|Punch_Left",
      meleeJump:           "CharacterArmature|Run",
      meleeCrouch:         "CharacterArmature|Idle_Neutral",
      meleeBlock:          "CharacterArmature|Idle_Sword",
      meleeStandFromCrouch:"CharacterArmature|Idle",
      // ── Staff / magic stance ──────────────────────────────────────────────
      staffIdle:     "CharacterArmature|Idle",
      staffIdle2:    "CharacterArmature|Wave",
      staffWalkFwd:  "CharacterArmature|Walk",
      staffWalkBwd:  "CharacterArmature|Run_Back",
      staffRunFwd:   "CharacterArmature|Run",
      staffRunBwd:   "CharacterArmature|Run_Back",
      staffCast1:    "CharacterArmature|Interact",
      staffCast2:    "CharacterArmature|Wave",
      staffJump:     "CharacterArmature|Run",
      staffHitLarge: "CharacterArmature|HitRecieve",
      staffHitSmall: "CharacterArmature|HitRecieve_2",
      staffDeath:    "CharacterArmature|Death",
      // ── Bow stance ────────────────────────────────────────────────────────
      bowIdle:       "CharacterArmature|Idle_Gun_Pointing",
      bowWalkFwd:    "CharacterArmature|Walk",
      bowWalkBwd:    "CharacterArmature|Run_Back",
      bowStrafeL:    "CharacterArmature|Run_Left",
      bowStrafeR:    "CharacterArmature|Run_Right",
      bowRunFwd:     "CharacterArmature|Run",
      bowRunBwd:     "CharacterArmature|Run_Back",
      bowJump:       "CharacterArmature|Run",
      bowDraw:       "CharacterArmature|Idle_Gun_Shoot",
      bowAim:        "CharacterArmature|Idle_Gun_Pointing",
      bowFire:       "CharacterArmature|Gun_Shoot",
      bowBlock:      "CharacterArmature|Idle",
      bowAimWalkFwd: "CharacterArmature|Walk",
      bowAimWalkBwd: "CharacterArmature|Run_Back",
      bowAimStrafeL: "CharacterArmature|Run_Left",
      bowAimStrafeR: "CharacterArmature|Run_Right",
      // ── Sword + Shield stance ─────────────────────────────────────────────
      ssIdle:      "CharacterArmature|Idle_Sword",
      ssRunFwd:    "CharacterArmature|Run",
      ssRunBwd:    "CharacterArmature|Run_Back",
      ssStrafeL:   "CharacterArmature|Run_Left",
      ssStrafeR:   "CharacterArmature|Run_Right",
      ssBlockIdle: "CharacterArmature|Idle_Sword",
      ssBlock:     "CharacterArmature|Idle_Sword",
      ssBlockHit:  "CharacterArmature|HitRecieve",
      ssAttack1:   "CharacterArmature|Sword_Slash",
      ssAttack2:   "CharacterArmature|Punch_Right",
      ssAttack3:   "CharacterArmature|Kick_Right",
      ssAttack4:   "CharacterArmature|Kick_Left",
      ssDrawSword: "CharacterArmature|Interact",
      // ── Traverse / movement specials ──────────────────────────────────────
      dodgeFwd:    "CharacterArmature|Roll",
      dodgeBwd:    "CharacterArmature|Roll",
      dodgeL:      "CharacterArmature|Roll",
      dodgeR:      "CharacterArmature|Roll",
      rollFwd:     "CharacterArmature|Roll",
      climbUp:     "CharacterArmature|Interact",
      climbing:    "CharacterArmature|Run",
      climbLadder: "CharacterArmature|Run",
      treading:    "CharacterArmature|Idle",
      swimming:    "CharacterArmature|Run",
      swimToEdge:  "CharacterArmature|Run",
    },
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

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
