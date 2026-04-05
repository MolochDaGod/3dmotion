/**
 * PirateIsland — Genesis Island map for Racalvin the Pirate King.
 *
 * Visual terrain: genesis_island.glb (converted from Terrain_1774999201051.fbx)
 * Physics:        Rapier HeightfieldCollider built from baked mesh heights
 * Pathfinding:    NavGrid 100×100 cells @ 2 m/cell over 200 m footprint
 *
 * Coordinate system: 1 Three.js unit = 1 metre.
 * Island footprint: 200 m × 200 m (centred on origin).
 * Height range: 0 m (shoreline / ocean level) → ~128 m (peak).
 *
 * Conversion constants (FBX cm → game metres):
 *   GLB_SCALE    = 2.5e-4   (800 000 cm → 200 m)
 *   GLB_OFFSET_Y = 72.105   (aligns visual mesh min with physics ground = 0)
 */

import { Suspense, useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { RigidBody, CuboidCollider, HeightfieldCollider } from "@react-three/rapier";
import * as THREE from "three";
import {
  getIslandHeight,
  buildIslandHeightArray,
  preloadGenesisHeights,
  isGenesisHeightsLoaded,
  GENESIS_TERRAIN_SIZE,
  GENESIS_TERRAIN_SEGS,
} from "./terrain";
import { CG_WORLD } from "./CollisionLayers";
import type { NavObstacle } from "./NavGrid";

// ── GLB alignment constants ────────────────────────────────────────────────────
// The GLB was authored at 200 m (2.5e-4 × 800 000 cm).
// We keep Y scale identical so the mountain stays ~128 m tall, but stretch
// X and Z by 10× to make the playable footprint 2000 m × 2000 m.
const GLB_SCALE    = 2.5e-4;             // Y (height) scale — unchanged
const GLB_SCALE_XZ = GLB_SCALE * 10;    // X/Z (horizontal) scale — 10×
const GLB_OFFSET_X = -25.000;           // 10× the original −2.5
const GLB_OFFSET_Y =  72.105;           // lifts mesh so ground vertex sits at y=0
const GLB_OFFSET_Z =  25.000;           // 10× the original +2.5

// ── Start fetching the height binary as soon as this module loads ─────────────
preloadGenesisHeights();

// ─── Nav obstacles (A* avoidance) ─────────────────────────────────────────────
interface PalmConfig { x: number; z: number; h: number; ry: number }

// Palms scattered over the 2000 m island — positions are 10× the original values.
// Heights stay at real-world scale (9–10 m trunks) since the island is horizontally
// stretched, not vertically.
const PALM_PLACEMENTS: PalmConfig[] = [
  { x:  600, z:  150, h: 9.0, ry:  0.30 },
  { x: -550, z:  250, h: 8.5, ry:  1.10 },
  { x:  150, z:  650, h:10.0, ry: -0.50 },
  { x: -400, z: -580, h: 9.0, ry:  2.10 },
  { x:  700, z: -300, h: 8.5, ry: -1.20 },
  { x: -650, z:  380, h:10.0, ry:  0.80 },
  { x:  280, z: -700, h: 9.0, ry:  3.00 },
  { x: -720, z: -220, h: 8.5, ry:  1.50 },
  { x:  450, z:  580, h: 9.0, ry: -0.20 },
  { x: -320, z:  620, h: 8.0, ry:  2.50 },
  { x:  750, z:  100, h: 9.5, ry:  0.90 },
  { x: -180, z: -680, h: 8.0, ry: -0.80 },
  // Extra palms to fill the larger shoreline
  { x:  480, z: -600, h: 9.5, ry:  0.60 },
  { x: -500, z: -550, h: 8.5, ry: -0.40 },
  { x:  200, z:  750, h: 9.0, ry:  1.80 },
  { x: -250, z:  720, h: 8.5, ry: -1.00 },
  { x:  820, z:  200, h: 9.0, ry:  2.20 },
  { x: -800, z:  150, h: 8.5, ry:  0.40 },
  { x:  380, z:  800, h: 9.5, ry: -0.90 },
  { x: -420, z:  780, h: 8.0, ry:  1.30 },
];

export const NAV_OBSTACLES: NavObstacle[] = [
  ...PALM_PLACEMENTS.map((p) => ({ x: p.x, z: p.z, radius: 20.0 })),
  // ── Mountain — island peak at (0,0), steep cliffs extend to ~450 m radius.
  { x:    0, z:    0, radius: 420.0 },  // main summit + upper cliffs
  { x:  150, z:  -50, radius:  80.0 },  // south-east cliff spur
  { x: -150, z:  -50, radius:  80.0 },  // south-west cliff spur
  { x:  800, z:    0, radius:  80.0 },  // dock area
  { x:    0, z:  800, radius:  60.0 },  // northern shore rocky area
];

// ─── Palm tree ─────────────────────────────────────────────────────────────────
const LEAF_ANGLES = [0, 51, 103, 154, 205, 257, 308];

function PalmTree({ x, z, h = 8.0, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY = getIslandHeight(x, z);
  const trunkH  = h * 0.82;

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.14, 0.28, trunkH, 8]} />
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
          <planeGeometry args={[0.45, 3.8]} />
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

// ─── Wooden dock (east shore, ~x=680 on the 2000 m island) ──────────────────
const PLANK_COUNT   = 14;
const DOCK_START_X  = 680;
const PLANK_SPACING = 11.0;
const OCEAN_Y       = -0.40;

function Dock() {
  const planks = useMemo(() => {
    return Array.from({ length: PLANK_COUNT }, (_, i) => {
      const px       = DOCK_START_X + i * PLANK_SPACING;
      const terrainY = Math.max(OCEAN_Y + 0.10, getIslandHeight(px, 0));
      const t  = i / (PLANK_COUNT - 1);
      const py = terrainY * (1 - t) + (OCEAN_Y + 0.10) * t;
      return { px, py };
    });
  }, []);

  const posts = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({ px: DOCK_START_X + i * 2.2 }));
  }, []);

  return (
    <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
      <group>
        {planks.map(({ px, py }, i) => (
          <mesh key={i} position={[px, py, 0]} castShadow receiveShadow>
            <boxGeometry args={[9.0, 1.4, 32.0]} />
            <meshStandardMaterial color="#8B6914" roughness={0.98} metalness={0} />
          </mesh>
        ))}

        {posts.map(({ px }, i) => {
          const terrainY = Math.max(OCEAN_Y + 0.10, getIslandHeight(px, 0));
          const t  = (px - DOCK_START_X) / ((PLANK_COUNT - 1) * PLANK_SPACING);
          const py = terrainY * (1 - t) + (OCEAN_Y + 0.10) * t + 6.5;
          return (
            <group key={i}>
              <mesh position={[px, py, -15.5]} castShadow>
                <cylinderGeometry args={[0.7, 0.9, 13.0, 6]} />
                <meshStandardMaterial color="#5a3a14" roughness={1} />
              </mesh>
              <mesh position={[px, py,  15.5]} castShadow>
                <cylinderGeometry args={[0.7, 0.9, 13.0, 6]} />
                <meshStandardMaterial color="#5a3a14" roughness={1} />
              </mesh>
            </group>
          );
        })}

        {/* Dock rails */}
        {[-15.5, 15.5].map((side, i) => (
          <mesh
            key={i}
            position={[DOCK_START_X + (PLANK_COUNT / 2) * PLANK_SPACING, 6.5 + OCEAN_Y, side]}
          >
            <boxGeometry args={[PLANK_COUNT * PLANK_SPACING, 0.7, 0.7]} />
            <meshStandardMaterial color="#6b4a1a" roughness={1} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
}

// ─── GLB terrain visual ────────────────────────────────────────────────────────
function TerrainModel() {
  const { scene } = useGLTF("/models/genesis_island.glb") as any;

  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj: THREE.Object3D) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow    = true;
      mesh.receiveShadow = true;

      // Replace any material that survived conversion with a multi-texture PBR look.
      // We blend sand, grass, and rock based on height and slope procedurally in JS
      // by assigning different materials per mesh (FBX often separates by material slot).
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m: THREE.Material) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          // Terrain was exported with vertex colours stripped; give it a lush palette
          const col = (m as THREE.MeshStandardMaterial).color;
          const lum = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
          if (lum < 0.25) {
            // Dark material → rocky peak / cliff
            return new THREE.MeshStandardMaterial({ color: "#6b5c4a", roughness: 0.95, metalness: 0.02 });
          }
          // Mid-range → tropical forest / grass
          return new THREE.MeshStandardMaterial({ color: "#4a7c40", roughness: 0.88, metalness: 0.01 });
        }
        // Default fallback → sandy beach
        return new THREE.MeshStandardMaterial({ color: "#c8a96e", roughness: 0.90, metalness: 0.01 });
      }) as any;
      if (mats.length === 1) mesh.material = (mesh.material as THREE.Material[])[0];
    });
    return c;
  }, [scene]);

  return (
    <group
      position={[GLB_OFFSET_X, GLB_OFFSET_Y, GLB_OFFSET_Z]}
      scale={[GLB_SCALE_XZ, GLB_SCALE, GLB_SCALE_XZ]}
    >
      <primitive object={clone} />
    </group>
  );
}

// ─── Island terrain + physics ─────────────────────────────────────────────────
function IslandGround() {
  // Defer HeightfieldCollider until the 16 KB binary is fetched.
  // On localhost it loads in <50 ms — on CDN < 150 ms.
  const [heightsReady, setHeightsReady] = useState(isGenesisHeightsLoaded);

  useEffect(() => {
    if (heightsReady) return;
    const id = setInterval(() => {
      if (isGenesisHeightsLoaded()) { setHeightsReady(true); clearInterval(id); }
    }, 80);
    return () => clearInterval(id);
  }, [heightsReady]);

  // Rebuild heights array once binary is loaded; stays stable thereafter
  const { heights, skirtGeo } = useMemo(() => {
    const heights  = buildIslandHeightArray();
    const skirtGeo = new THREE.BoxGeometry(GENESIS_TERRAIN_SIZE, 20, GENESIS_TERRAIN_SIZE);
    return { heights, skirtGeo };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightsReady]);

  const TS = GENESIS_TERRAIN_SIZE;

  return (
    <>
      {/* Physics heightfield — deferred until heights are ready */}
      {heightsReady && (
        <RigidBody type="fixed" colliders={false} friction={0.88} restitution={0.05}>
          <HeightfieldCollider
            args={[
              GENESIS_TERRAIN_SEGS,
              GENESIS_TERRAIN_SEGS,
              Array.from(heights),
              { x: TS, y: 1, z: TS },
            ]}
            collisionGroups={CG_WORLD}
          />
        </RigidBody>
      )}

      {/* Earth skirt — hides gap between GLB terrain and the ocean */}
      <mesh geometry={skirtGeo} position={[0, -12, 0]}>
        <meshStandardMaterial color="#b8955a" roughness={1} metalness={0} />
      </mesh>

      {/* Safety net — catches anything that falls through */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1200, 0.5, 1200]} position={[0, -40, 0]} collisionGroups={CG_WORLD} />
      </RigidBody>

      {/* Invisible boundary walls at the ocean edge (2000 m footprint → ±1000 m) */}
      <RigidBody type="fixed" colliders={false} friction={0.05} restitution={0}>
        <CuboidCollider args={[1000, 14, 0.5]} position={[    0, 4, -1000]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[1000, 14, 0.5]} position={[    0, 4,  1000]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 14, 1000]} position={[-1000, 4,     0]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 14, 1000]} position={[ 1000, 4,     0]} collisionGroups={CG_WORLD} />
      </RigidBody>
    </>
  );
}

// ─── Animated ocean ────────────────────────────────────────────────────────────
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
      {/* Main ocean plane — large enough to fill the horizon beyond 2000 m island */}
      <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, OCEAN_Y, 0]} receiveShadow>
        <planeGeometry args={[60000, 60000, 1, 1]} />
        <meshStandardMaterial ref={matRef} color="#005f73" metalness={0.28} roughness={0.08} />
      </mesh>
      {/* Shoreline glow ring — centred at ~r=800 m (10× the original 80 m) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, OCEAN_Y + 0.01, 0]}>
        <ringGeometry args={[700, 900, 96]} />
        <meshStandardMaterial color="#0a8f9e" transparent opacity={0.45} metalness={0.1} roughness={0.15} />
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

      {/* GLB terrain visual — Genesis Island from converted FBX */}
      <Suspense fallback={null}>
        <TerrainModel />
      </Suspense>

      {/* Ocean */}
      <Ocean />

      {/* Palm trees around the island */}
      <Suspense fallback={null}>
        {PALM_PLACEMENTS.map((p, i) => (
          <PalmTree key={i} x={p.x} z={p.z} h={p.h} ry={p.ry} />
        ))}
      </Suspense>

      {/* Dock on the east shore */}
      <Suspense fallback={null}>
        <Dock />
      </Suspense>
    </group>
  );
}

useGLTF.preload("/models/genesis_island.glb");
