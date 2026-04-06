/**
 * PirateIsland — Genesis Island map for Racalvin the Pirate King.
 *
 * Visual terrain: genesis_island.glb (converted from Terrain_1774999201051.fbx)
 * Physics:        Rapier HeightfieldCollider built from baked mesh heights
 * Pathfinding:    NavGrid 100×100 cells @ 2 m/cell over 200 m footprint
 *
 * Coordinate system: 1 Three.js unit = 1 metre.
 * Island footprint: 6000 m × 6000 m (centred on origin).
 * Height range: 0 m (shoreline / ocean level) → ~1280 m (peak, after 10× scale).
 *
 * Conversion constants (FBX cm → game metres):
 *   GLB_SCALE_Y  = 2.5e-3  (Y only, 10× the raw 2.5e-4 to give volcano peaks)
 *   GLB_SCALE_XZ = 7.5e-3  (X/Z, 30× for 6000 m footprint)
 *   GLB_OFFSET_Y = 721.05  (aligns visual mesh min with physics ground = 0)
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
  GENESIS_HEIGHT_SCALE,
} from "./terrain";
import { CG_WORLD } from "./CollisionLayers";
import type { NavObstacle } from "./NavGrid";

// ── GLB alignment constants ────────────────────────────────────────────────────
// X/Z: 30× the raw FBX scale to reach 6000 m footprint.
// Y:   raw scale × GENESIS_HEIGHT_SCALE so the mountain visual matches physics.
// GLB_OFFSET_Y: the raw offset (72.105) also scales with GENESIS_HEIGHT_SCALE.
const GLB_RAW_SCALE  = 2.5e-4;
const GLB_SCALE_XZ   = GLB_RAW_SCALE * 30;                      // 7.5e-3
const GLB_SCALE_Y    = GLB_RAW_SCALE * GENESIS_HEIGHT_SCALE;    // 2.5e-3
const GLB_RAW_OFFSET_Y = 72.105;
const GLB_OFFSET_Y   = GLB_RAW_OFFSET_Y * GENESIS_HEIGHT_SCALE; // 721.05
const GLB_OFFSET_X   = -25.000 * 30;                            // −750 m
const GLB_OFFSET_Z   =  25.000 * 30;                            //  750 m

// Biome height thresholds (world metres, after GENESIS_HEIGHT_SCALE applied)
// Raw binary peaks at ~128 m → scaled peak ~1280 m.
const H_BEACH   =   20;   //   0–20 m  → sand / shoreline
const H_GRASS   =  100;   //  20–100 m → tropical grass / lowland
const H_JUNGLE  =  400;   // 100–400 m → dense jungle canopy
const H_FOREST  =  700;   // 400–700 m → highland misty forest
const H_ROCK    = 1000;   // 700–1000 m→ bare rock / cliff

// ── Start fetching the height binary as soon as this module loads ─────────────
preloadGenesisHeights();

// ─── Nav obstacles (A* avoidance) ─────────────────────────────────────────────
interface PalmConfig { x: number; z: number; h: number; ry: number }

// Palms scattered over the 6000 m island (all positions ×3 from original 2000 m layout).
const PALM_PLACEMENTS: PalmConfig[] = [
  { x:  1800, z:   450, h: 12.0, ry:  0.30 },
  { x: -1650, z:   750, h: 10.5, ry:  1.10 },
  { x:   450, z:  1950, h: 14.0, ry: -0.50 },
  { x: -1200, z: -1740, h: 11.0, ry:  2.10 },
  { x:  2100, z:  -900, h:  9.5, ry: -1.20 },
  { x: -1950, z:  1140, h: 13.0, ry:  0.80 },
  { x:   840, z: -2100, h: 11.0, ry:  3.00 },
  { x: -2160, z:  -660, h: 10.5, ry:  1.50 },
  { x:  1350, z:  1740, h: 12.5, ry: -0.20 },
  { x:  -960, z:  1860, h:  9.0, ry:  2.50 },
  { x:  2250, z:   300, h: 13.5, ry:  0.90 },
  { x:  -540, z: -2040, h: 10.0, ry: -0.80 },
  { x:  1440, z: -1800, h: 11.5, ry:  0.60 },
  { x: -1500, z: -1650, h: 10.5, ry: -0.40 },
  { x:   600, z:  2250, h: 12.0, ry:  1.80 },
  { x:  -750, z:  2160, h:  9.5, ry: -1.00 },
  { x:  2460, z:   600, h: 12.0, ry:  2.20 },
  { x: -2400, z:   450, h: 10.5, ry:  0.40 },
  { x:  1140, z:  2400, h: 11.5, ry: -0.90 },
  { x: -1260, z:  2340, h:  9.0, ry:  1.30 },
  // Tall jungle canopy trees (×3 positions)
  { x:   360, z:   900, h: 15.0, ry:  0.55 },
  { x:  -600, z:  1050, h: 16.0, ry: -0.75 },
  { x:   990, z:  -750, h: 14.5, ry:  1.20 },
  { x: -1140, z:   540, h: 15.5, ry:  2.80 },
  { x:   750, z:  1260, h: 17.0, ry: -1.40 },
  { x:  -480, z:  -960, h: 14.0, ry:  0.35 },
  { x:  1230, z:  1050, h: 15.0, ry: -0.60 },
  { x: -1320, z:  1260, h: 16.5, ry:  1.85 },
];

export const NAV_OBSTACLES: NavObstacle[] = [
  ...PALM_PLACEMENTS.map((p) => ({ x: p.x, z: p.z, radius: 60.0 })),
  { x:     0, z:     0, radius: 1260.0 },
  { x:   450, z:  -150, radius:  240.0 },
  { x:  -450, z:  -150, radius:  240.0 },
  { x:  2400, z:     0, radius:  240.0 },
  { x:     0, z:  2400, radius:  180.0 },
];

// ─── Biome material factory ────────────────────────────────────────────────────
function biomeMaterial(worldY: number, idx: number): THREE.MeshStandardMaterial {
  // Stagger polygon offset per mesh index to prevent inter-mesh z-fighting
  const polyFactor = 1 + (idx % 8);

  if (worldY < H_BEACH) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#e8c97a"),
      roughness: 0.88,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: polyFactor,
      polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_GRASS) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#4eaa3a"),
      roughness: 0.84,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: polyFactor,
      polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_JUNGLE) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#2d7e22"),
      roughness: 0.88,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: polyFactor,
      polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_FOREST) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#4a6e35"),
      roughness: 0.92,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: polyFactor,
      polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_ROCK) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#8b7050"),
      roughness: 0.97,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: polyFactor,
      polygonOffsetUnits: polyFactor,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#5c4840"),
    roughness: 1.0,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: polyFactor,
    polygonOffsetUnits: polyFactor,
  });
}

// ─── Palm tree ─────────────────────────────────────────────────────────────────
const LEAF_ANGLES = [0, 51, 103, 154, 205, 257, 308];

function PalmTree({ x, z, h = 10.0, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY  = getIslandHeight(x, z);
  const trunkH   = h * 0.78;
  const leafSize = h * 0.24;     // crown scales with tree height
  const crownR   = h * 0.06;     // trunk radius at top

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[crownR, crownR * 2, trunkH, 8]} />
          <meshStandardMaterial color="#7a5523" roughness={0.96} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Crown fronds */}
      {LEAF_ANGLES.map((deg, i) => (
        <mesh
          key={i}
          position={[0, trunkH + 0.05, 0]}
          rotation={[0.55, (deg * Math.PI) / 180, 0]}
          castShadow
        >
          <planeGeometry args={[leafSize * 0.4, leafSize * 3.5]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#2d8a32" : "#3dad40"}
            side={THREE.DoubleSide}
            roughness={0.72}
            metalness={0}
          />
        </mesh>
      ))}

      {/* Coconuts */}
      {h > 11 && [0, 1.8, 3.6].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.4, trunkH - 0.4, Math.sin(a) * 0.4]} castShadow>
          <sphereGeometry args={[0.22, 6, 5]} />
          <meshStandardMaterial color="#5c3a14" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Jungle tree (broad canopy, 40ft class) ────────────────────────────────────
function JungleTree({ x, z, h = 13.0, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY = getIslandHeight(x, z);
  const trunkH  = h * 0.65;
  const crownY  = trunkH + h * 0.18;

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        {/* Buttress roots */}
        {[0, 1.26, 2.51, 3.77].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45]} rotation-y={a} castShadow>
            <boxGeometry args={[0.22, 1.2, 0.55]} />
            <meshStandardMaterial color="#5a3e20" roughness={1} />
          </mesh>
        ))}
        {/* Main trunk */}
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.22, 0.38, trunkH, 7]} />
          <meshStandardMaterial color="#4a3318" roughness={0.98} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Layered canopy spheres */}
      <mesh castShadow position={[0, crownY, 0]}>
        <sphereGeometry args={[h * 0.22, 7, 5]} />
        <meshStandardMaterial color="#1e6e18" roughness={0.80} metalness={0} />
      </mesh>
      <mesh castShadow position={[h * 0.14, crownY - h * 0.06, h * 0.08]}>
        <sphereGeometry args={[h * 0.16, 6, 4]} />
        <meshStandardMaterial color="#257a1f" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[-h * 0.12, crownY - h * 0.04, -h * 0.10]}>
        <sphereGeometry args={[h * 0.15, 6, 4]} />
        <meshStandardMaterial color="#1c6015" roughness={0.85} metalness={0} />
      </mesh>
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
    let meshIdx = 0;
    c.traverse((obj: THREE.Object3D) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow    = true;
      mesh.receiveShadow = true;

      // Compute height of this mesh section in world metres.
      // mesh.position is in the GLB's local space (FBX centimetre scale).
      // Applying the same formula as the group transform:
      //   worldY = localY * GLB_SCALE_Y + GLB_OFFSET_Y
      // We use the mesh's own position.y as the representative height;
      // for very wide meshes we clamp to H_BEACH minimum so flat shoreline
      // sections always get beach colour.
      mesh.geometry.computeBoundingBox();
      const bbox     = mesh.geometry.boundingBox ?? new THREE.Box3();
      const localCY  = (bbox.min.y + bbox.max.y) * 0.5 + mesh.position.y;
      const worldY   = localCY * GLB_SCALE_Y + GLB_OFFSET_Y;

      const idx = meshIdx++;
      const mat = biomeMaterial(worldY, idx);
      mesh.material = mat;
    });
    return c;
  }, [scene]);

  return (
    <group
      position={[GLB_OFFSET_X, GLB_OFFSET_Y, GLB_OFFSET_Z]}
      scale={[GLB_SCALE_XZ, GLB_SCALE_Y, GLB_SCALE_XZ]}
    >
      <primitive object={clone} />
    </group>
  );
}

// ─── Island terrain + physics ─────────────────────────────────────────────────
function IslandGround() {
  const [heightsReady, setHeightsReady] = useState(isGenesisHeightsLoaded);

  useEffect(() => {
    if (heightsReady) return;
    const id = setInterval(() => {
      if (isGenesisHeightsLoaded()) { setHeightsReady(true); clearInterval(id); }
    }, 80);
    return () => clearInterval(id);
  }, [heightsReady]);

  const { heights, skirtGeo } = useMemo(() => {
    const heights  = buildIslandHeightArray();
    // Skirt height must cover the full peak so no gaps are visible
    const skirtH   = 30 * GENESIS_HEIGHT_SCALE;
    const skirtGeo = new THREE.BoxGeometry(GENESIS_TERRAIN_SIZE, skirtH, GENESIS_TERRAIN_SIZE);
    return { heights, skirtGeo };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightsReady]);

  const TS = GENESIS_TERRAIN_SIZE;

  return (
    <>
      {/* Physics heightfield — heights already include GENESIS_HEIGHT_SCALE */}
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

      {/* Earth skirt — hides gap between GLB terrain edge and ocean */}
      <mesh geometry={skirtGeo} position={[0, -15 * GENESIS_HEIGHT_SCALE, 0]}>
        <meshStandardMaterial color="#b8955a" roughness={1} metalness={0} />
      </mesh>

      {/* Safety net */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1200, 0.5, 1200]} position={[0, -40, 0]} collisionGroups={CG_WORLD} />
      </RigidBody>

      {/* Boundary walls */}
      <RigidBody type="fixed" colliders={false} friction={0.05} restitution={0}>
        <CuboidCollider args={[1000, 20, 0.5]} position={[    0, 8, -1000]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[1000, 20, 0.5]} position={[    0, 8,  1000]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 20, 1000]} position={[-1000, 8,     0]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 20, 1000]} position={[ 1000, 8,     0]} collisionGroups={CG_WORLD} />
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
      <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, OCEAN_Y, 0]} receiveShadow>
        <planeGeometry args={[60000, 60000, 1, 1]} />
        <meshStandardMaterial ref={matRef} color="#005f73" metalness={0.28} roughness={0.08} />
      </mesh>
      {/* Shoreline foam ring */}
      <mesh rotation-x={-Math.PI / 2} position={[0, OCEAN_Y + 0.01, 0]}>
        <ringGeometry args={[700, 920, 96]} />
        <meshStandardMaterial color="#0a8f9e" transparent opacity={0.45} metalness={0.1} roughness={0.15} />
      </mesh>
    </>
  );
}

// ─── Pirate Island — main export ───────────────────────────────────────────────
export function PirateIsland() {
  return (
    <group>
      <IslandGround />

      <Suspense fallback={null}>
        <TerrainModel />
      </Suspense>

      <Ocean />

      <Suspense fallback={null}>
        {PALM_PLACEMENTS.map((p, i) =>
          p.h >= 13 ? (
            <JungleTree key={i} x={p.x} z={p.z} h={p.h} ry={p.ry} />
          ) : (
            <PalmTree key={i} x={p.x} z={p.z} h={p.h} ry={p.ry} />
          )
        )}
      </Suspense>

      <Suspense fallback={null}>
        <Dock />
      </Suspense>
    </group>
  );
}

useGLTF.preload("/models/genesis_island.glb");
