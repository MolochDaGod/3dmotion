/**
 * PirateIsland — Racalvin the Pirate King's starting island.
 *
 * Scene elements:
 *   • GLB terrain mesh (terrain_island.glb) — visual surface
 *   • HeightfieldCollider   — fast physics, drives zombie + player grounding
 *   • Animated ocean surface surrounding the island
 *   • 10 palm trees scattered around the beach ring
 *   • Wooden dock on the eastern shore
 *   • Invisible ocean boundary walls (prevent walking to infinity)
 *
 * Coordinate system: 1 Three.js unit = 1 metre.
 * Island radius: 26 m.  FBX source was in cm → scale 0.00015 → 120 m wide.
 */

import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { RigidBody, CuboidCollider, HeightfieldCollider } from "@react-three/rapier";
import * as THREE from "three";
import {
  getIslandHeight,
  buildIslandHeightArray,
  TERRAIN_SIZE,
  TERRAIN_SEGS,
} from "./terrain";
import { CG_WORLD } from "./CollisionLayers";
import type { NavObstacle } from "./NavGrid";

// ── Scale + offset for the converted GLB (FBX was authored in cm) ─────────────
// FBX bounding box (cm units): X [-390005, 409991], Z [-410004, 389961]
// Width ≈ 800 000 cm → scale = 120 m / 800 000 = 0.000150 (matches TERRAIN_SIZE)
// Centre offsets after scaling: X ≈ +1.5 m, Z ≈ -1.5 m  →  negate for position.
const GLB_SCALE    = 0.000150;
const GLB_OFFSET_X = -((409991 + (-390005)) / 2) * GLB_SCALE;  //  ≈ -1.5
const GLB_OFFSET_Z = -((389961 + (-410004)) / 2) * GLB_SCALE;  //  ≈  1.5
// Y: terrain ground is near FBX Y = 0; position 0 puts the surface at game y ≈ 0.
const GLB_OFFSET_Y = 0;

// ─── Nav obstacles (A* avoidance) ─────────────────────────────────────────────
interface PalmConfig { x: number; z: number; h: number; ry: number }

const PALM_PLACEMENTS: PalmConfig[] = [
  { x:  18, z:  5,   h: 7.0, ry:  0.30 },
  { x: -16, z:  8,   h: 6.5, ry:  1.10 },
  { x:   5, z:  20,  h: 8.0, ry: -0.50 },
  { x: -12, z: -18,  h: 7.0, ry:  2.10 },
  { x:  22, z: -10,  h: 6.5, ry: -1.20 },
  { x: -20, z:  12,  h: 7.5, ry:  0.80 },
  { x:   8, z: -22,  h: 7.0, ry:  3.00 },
  { x: -22, z:  -8,  h: 6.5, ry:  1.50 },
  { x:  14, z:  18,  h: 7.0, ry: -0.20 },
  { x: -10, z:  20,  h: 6.0, ry:  2.50 },
];

export const NAV_OBSTACLES: NavObstacle[] = [
  ...PALM_PLACEMENTS.map((p) => ({ x: p.x, z: p.z, radius: 1.4 })),
  { x: 25, z: 0, radius: 5.0 },
];

// ─── Palm tree ─────────────────────────────────────────────────────────────────
const LEAF_ANGLES = [0, 51, 103, 154, 205, 257, 308];

function PalmTree({ x, z, h = 6.5, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY = getIslandHeight(x, z);
  const trunkH  = h * 0.82;

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.11, 0.23, trunkH, 8]} />
          <meshStandardMaterial color="#7a5523" roughness={0.96} metalness={0} />
        </mesh>
      </RigidBody>

      {LEAF_ANGLES.map((deg, i) => (
        <mesh
          key={i}
          position={[0, trunkH + 0.05, 0]}
          rotation={[0.58, (deg * Math.PI) / 180, 0]}
          castShadow
        >
          <planeGeometry args={[0.36, 3.1]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#2d7a32" : "#3d9940"}
            side={THREE.DoubleSide}
            roughness={0.75}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Wooden dock ──────────────────────────────────────────────────────────────
const PLANK_COUNT   = 10;
const DOCK_START_X  = 21.5;
const PLANK_SPACING = 0.90;
const OCEAN_Y       = -0.35;

function Dock() {
  const planks = useMemo(() => {
    return Array.from({ length: PLANK_COUNT }, (_, i) => {
      const px       = DOCK_START_X + i * PLANK_SPACING;
      const terrainY = Math.max(OCEAN_Y + 0.08, getIslandHeight(px, 0));
      const t  = i / (PLANK_COUNT - 1);
      const py = terrainY * (1 - t) + (OCEAN_Y + 0.08) * t;
      return { px, py };
    });
  }, []);

  const posts = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const px = DOCK_START_X + i * 1.8;
      return { px };
    });
  }, []);

  return (
    <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
      <group>
        {planks.map(({ px, py }, i) => (
          <mesh key={i} position={[px, py, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.78, 0.12, 2.6]} />
            <meshStandardMaterial color="#8B6914" roughness={0.98} metalness={0} />
          </mesh>
        ))}

        {posts.map(({ px }, i) => {
          const terrainY = Math.max(OCEAN_Y + 0.08, getIslandHeight(px, 0));
          const t  = (px - DOCK_START_X) / ((PLANK_COUNT - 1) * PLANK_SPACING);
          const py = terrainY * (1 - t) + (OCEAN_Y + 0.08) * t + 0.55;
          return (
            <group key={i}>
              <mesh position={[px, py, -1.25]} castShadow>
                <cylinderGeometry args={[0.055, 0.07, 1.1, 6]} />
                <meshStandardMaterial color="#5a3a14" roughness={1} />
              </mesh>
              <mesh position={[px, py,  1.25]} castShadow>
                <cylinderGeometry args={[0.055, 0.07, 1.1, 6]} />
                <meshStandardMaterial color="#5a3a14" roughness={1} />
              </mesh>
            </group>
          );
        })}

        <mesh position={[DOCK_START_X + (PLANK_COUNT / 2) * PLANK_SPACING, 0.55 + OCEAN_Y, -1.25]}>
          <boxGeometry args={[PLANK_COUNT * PLANK_SPACING, 0.06, 0.06]} />
          <meshStandardMaterial color="#6b4a1a" roughness={1} />
        </mesh>
        <mesh position={[DOCK_START_X + (PLANK_COUNT / 2) * PLANK_SPACING, 0.55 + OCEAN_Y,  1.25]}>
          <boxGeometry args={[PLANK_COUNT * PLANK_SPACING, 0.06, 0.06]} />
          <meshStandardMaterial color="#6b4a1a" roughness={1} />
        </mesh>

        {[-1.0, 1.0].map((side, i) => (
          <mesh
            key={i}
            position={[DOCK_START_X + PLANK_COUNT * PLANK_SPACING, OCEAN_Y + 0.5, side]}
            castShadow
          >
            <cylinderGeometry args={[0.10, 0.12, 1.4, 7]} />
            <meshStandardMaterial color="#3d2209" roughness={1} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
}

// ─── GLB terrain visual ────────────────────────────────────────────────────────
function TerrainModel() {
  const { scene } = useGLTF("/models/terrain_island.glb") as any;

  // Clone once so the scene can be used independently of the cached GLTF
  const clone = useMemo(() => {
    const c = scene.clone(true);
    // Apply MeshStandardMaterial to all meshes so they receive lighting
    c.traverse((obj: THREE.Object3D) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      // If the original material is not PBR-compatible, replace it
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m: THREE.Material) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.roughness  = Math.max(m.roughness,  0.6);
          m.metalness  = Math.min(m.metalness,  0.1);
          return m;
        }
        // Fallback: convert to MeshStandardMaterial with a sandy palette
        return new THREE.MeshStandardMaterial({
          color:     (m as any).color ?? new THREE.Color("#c8a96e"),
          roughness: 0.88,
          metalness: 0.02,
        });
      }) as any;
    });
    return c;
  }, [scene]);

  return (
    <group
      position={[GLB_OFFSET_X, GLB_OFFSET_Y, GLB_OFFSET_Z]}
      scale={[GLB_SCALE, GLB_SCALE, GLB_SCALE]}
    >
      <primitive object={clone} />
    </group>
  );
}

// ─── Island terrain ────────────────────────────────────────────────────────────
function IslandGround() {
  const { heights, skirtGeo } = useMemo(() => {
    const heights  = buildIslandHeightArray();
    const skirtGeo = new THREE.BoxGeometry(TERRAIN_SIZE, 12, TERRAIN_SIZE);
    return { heights, skirtGeo };
  }, []);

  return (
    <>
      {/* Physics collision — unchanged so zombie A* and spawn positions stay valid */}
      <RigidBody type="fixed" colliders={false} friction={0.88} restitution={0.05}>
        <HeightfieldCollider
          args={[
            TERRAIN_SEGS,
            TERRAIN_SEGS,
            Array.from(heights),
            { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE },
          ]}
          collisionGroups={CG_WORLD}
        />
      </RigidBody>

      {/* Earth skirt — hides any gap between the GLB terrain and the ocean */}
      <mesh geometry={skirtGeo} position={[0, -7.5, 0]}>
        <meshStandardMaterial color="#b8955a" roughness={1} metalness={0} />
      </mesh>

      {/* Safety net far below — catches anything that falls through */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[80, 0.5, 80]} position={[0, -25, 0]} collisionGroups={CG_WORLD} />
      </RigidBody>

      {/* Invisible ocean boundary walls */}
      <RigidBody type="fixed" colliders={false} friction={0.05} restitution={0}>
        <CuboidCollider args={[34, 10, 0.5]} position={[  0, 2, -34]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[34, 10, 0.5]} position={[  0, 2,  34]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 10, 34]} position={[-34, 2,   0]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 10, 34]} position={[ 34, 2,   0]} collisionGroups={CG_WORLD} />
      </RigidBody>
    </>
  );
}

// ─── Animated ocean surface ────────────────────────────────────────────────────
function Ocean() {
  const matRef  = useRef<THREE.MeshStandardMaterial>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (matRef.current) matRef.current.roughness = 0.07 + Math.sin(t * 0.35) * 0.03;
    if (meshRef.current) meshRef.current.position.y = OCEAN_Y + Math.sin(t * 0.28) * 0.01;
  });

  return (
    <>
      <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, OCEAN_Y, 0]} receiveShadow>
        <planeGeometry args={[240, 240, 1, 1]} />
        <meshStandardMaterial ref={matRef} color="#005f73" metalness={0.28} roughness={0.08} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, OCEAN_Y + 0.01, 0]}>
        <ringGeometry args={[22, 32, 64]} />
        <meshStandardMaterial color="#0a8f9e" transparent opacity={0.55} metalness={0.1} roughness={0.15} />
      </mesh>
    </>
  );
}

// ─── Pirate Island — main export ───────────────────────────────────────────────
export function PirateIsland() {
  return (
    <group>
      {/* Physics terrain + boundary walls */}
      <IslandGround />

      {/* GLB terrain visual — loaded from converted FBX */}
      <Suspense fallback={null}>
        <TerrainModel />
      </Suspense>

      {/* Ocean */}
      <Ocean />

      {/* Palm trees */}
      <Suspense fallback={null}>
        {PALM_PLACEMENTS.map((p, i) => (
          <PalmTree key={i} x={p.x} z={p.z} h={p.h} ry={p.ry} />
        ))}
      </Suspense>

      {/* Dock */}
      <Suspense fallback={null}>
        <Dock />
      </Suspense>
    </group>
  );
}

useGLTF.preload("/models/terrain_island.glb");
