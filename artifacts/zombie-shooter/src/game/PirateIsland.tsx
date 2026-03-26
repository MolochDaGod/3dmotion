/**
 * PirateIsland — Racalvin the Pirate King's starting island.
 *
 * Scene elements (all procedural, no external assets required):
 *   • Sandy island terrain — Rapier HeightfieldCollider + visual mesh
 *   • Animated ocean surface surrounding the island
 *   • 10 palm trees scattered around the beach ring
 *   • Wooden dock on the eastern shore
 *   • Invisible ocean boundary walls (prevent walking to infinity)
 *
 * Coordinate system: 1 Three.js unit = 1 metre.
 * Island radius: 26 m. Island peak: ~2.1 m above ocean (y = 0).
 */

import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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

// ─── Palm tree layout ──────────────────────────────────────────────────────────
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

// ─── Nav obstacles (A* avoidance) ────────────────────────────────────────────
export const NAV_OBSTACLES: NavObstacle[] = [
  ...PALM_PLACEMENTS.map((p) => ({ x: p.x, z: p.z, radius: 1.4 })),
  { x: 25, z: 0, radius: 5.0 }, // dock footprint
];

// ─── Palm tree ─────────────────────────────────────────────────────────────────
const LEAF_ANGLES = [0, 51, 103, 154, 205, 257, 308];

function PalmTree({ x, z, h = 6.5, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY = getIslandHeight(x, z);
  const trunkH  = h * 0.82;

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      {/* Trunk — with physics so zombies / player can bump against it */}
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.11, 0.23, trunkH, 8]} />
          <meshStandardMaterial color="#7a5523" roughness={0.96} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Leaf crown — no physics, purely visual */}
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
const OCEAN_Y       = -0.35; // y of ocean surface plane

function Dock() {
  const planks = useMemo(() => {
    return Array.from({ length: PLANK_COUNT }, (_, i) => {
      const px       = DOCK_START_X + i * PLANK_SPACING;
      const terrainY = Math.max(OCEAN_Y + 0.08, getIslandHeight(px, 0));
      // Lerp dock height: beach end → water level
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
        {/* Planks */}
        {planks.map(({ px, py }, i) => (
          <mesh key={i} position={[px, py, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.78, 0.12, 2.6]} />
            <meshStandardMaterial color="#8B6914" roughness={0.98} metalness={0} />
          </mesh>
        ))}

        {/* Side railing posts */}
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

        {/* Horizontal railing beams */}
        <mesh position={[DOCK_START_X + (PLANK_COUNT / 2) * PLANK_SPACING, 0.55 + OCEAN_Y, -1.25]}>
          <boxGeometry args={[PLANK_COUNT * PLANK_SPACING, 0.06, 0.06]} />
          <meshStandardMaterial color="#6b4a1a" roughness={1} />
        </mesh>
        <mesh position={[DOCK_START_X + (PLANK_COUNT / 2) * PLANK_SPACING, 0.55 + OCEAN_Y,  1.25]}>
          <boxGeometry args={[PLANK_COUNT * PLANK_SPACING, 0.06, 0.06]} />
          <meshStandardMaterial color="#6b4a1a" roughness={1} />
        </mesh>

        {/* Mooring posts at the far end */}
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

// ─── Island terrain ────────────────────────────────────────────────────────────
function IslandGround() {
  const { heights, terrainGeo, skirtGeo } = useMemo(() => {
    const heights   = buildIslandHeightArray();
    const V         = TERRAIN_SEGS + 1; // 64
    const positions = new Float32Array(V * V * 3);
    const half      = TERRAIN_SIZE / 2;
    const step      = TERRAIN_SIZE / TERRAIN_SEGS;

    for (let row = 0; row <= TERRAIN_SEGS; row++) {
      for (let col = 0; col <= TERRAIN_SEGS; col++) {
        const i = row * V + col;
        positions[i * 3]     = -half + col * step;   // X
        positions[i * 3 + 1] = heights[i];            // Y
        positions[i * 3 + 2] = -half + row * step;   // Z
      }
    }

    const indices: number[] = [];
    for (let row = 0; row < TERRAIN_SEGS; row++) {
      for (let col = 0; col < TERRAIN_SEGS; col++) {
        const tl = row * V + col;
        const tr = tl + 1;
        const bl = tl + V;
        const br = bl + 1;
        indices.push(tl, bl, tr, tr, bl, br);
      }
    }

    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    terrainGeo.setIndex(indices);
    terrainGeo.computeVertexNormals();

    const skirtGeo = new THREE.BoxGeometry(TERRAIN_SIZE, 12, TERRAIN_SIZE);

    return { heights, terrainGeo, skirtGeo };
  }, []);

  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={0.88} restitution={0.05}>
        {/*
          HeightfieldCollider — same vertex layout as the visual mesh.
          scale.y=1 means the height values are used 1:1 (no extra vertical scaling).
        */}
        <HeightfieldCollider
          args={[
            TERRAIN_SEGS,
            TERRAIN_SEGS,
            Array.from(heights),
            { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE },
          ]}
          collisionGroups={CG_WORLD}
        />

        {/* Sandy island surface — warm tan */}
        <mesh geometry={terrainGeo} receiveShadow>
          <meshStandardMaterial color="#d4b483" roughness={0.94} metalness={0} />
        </mesh>

        {/* Skirt — visible earth below the surface (hides cliff edges) */}
        <mesh geometry={skirtGeo} position={[0, -7.5, 0]}>
          <meshStandardMaterial color="#b8955a" roughness={1} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Safety net far below — catches anything that falls through */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[80, 0.5, 80]} position={[0, -25, 0]} collisionGroups={CG_WORLD} />
      </RigidBody>

      {/* Invisible ocean boundary walls — keeps the player on the island */}
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
    // Gentle roughness pulse — simulates light diffusion on rippling water
    if (matRef.current) {
      matRef.current.roughness = 0.07 + Math.sin(t * 0.35) * 0.03;
    }
    // Very subtle bob of the whole plane (±1 cm) to suggest wave swell
    if (meshRef.current) {
      meshRef.current.position.y = OCEAN_Y + Math.sin(t * 0.28) * 0.01;
    }
  });

  return (
    <>
      {/* Deep ocean */}
      <mesh
        ref={meshRef}
        rotation-x={-Math.PI / 2}
        position={[0, OCEAN_Y, 0]}
        receiveShadow
      >
        <planeGeometry args={[240, 240, 1, 1]} />
        <meshStandardMaterial
          ref={matRef}
          color="#005f73"
          metalness={0.28}
          roughness={0.08}
        />
      </mesh>

      {/* Shallow beach-fringe — lighter turquoise strip near the island */}
      <mesh rotation-x={-Math.PI / 2} position={[0, OCEAN_Y + 0.01, 0]}>
        <ringGeometry args={[22, 32, 64]} />
        <meshStandardMaterial
          color="#0a8f9e"
          transparent
          opacity={0.55}
          metalness={0.1}
          roughness={0.15}
        />
      </mesh>
    </>
  );
}

// ─── Pirate Island — main export ───────────────────────────────────────────────
export function PirateIsland() {
  return (
    <group>
      {/* Terrain + boundary physics */}
      <IslandGround />

      {/* Ocean visual (outside Physics — no collision needed) */}
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
