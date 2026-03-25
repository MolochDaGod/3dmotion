import { Suspense, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { RigidBody, CuboidCollider, HeightfieldCollider } from "@react-three/rapier";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { GRAVEYARD } from "./assets/manifest";
import {
  getTerrainHeight, buildTerrainHeightArray,
  TERRAIN_SIZE, TERRAIN_SEGS,
} from "./terrain";
import { CG_WORLD } from "./CollisionLayers";
import type { NavObstacle } from "./NavGrid";

// ─── Ruin layout ───────────────────────────────────────────────────────────────
type RuinEntry = [number, number, number, number, number];

const RUIN_PLACEMENTS: RuinEntry[] = [
  [1,   -9,  -14, 0.00, 1.0],
  [2,   10,  -11, 0.70, 1.0],
  [3,  -15,    6, 2.10, 1.1],
  [4,   15,    8, 1.50, 0.9],
  [5,    1,  -21, 0.30, 1.1],
  [6,  -22,  -18, 1.00, 1.0],
  [7,   23,  -17, 3.00, 1.0],
  [8,  -25,   13, 0.50, 1.1],
  [9,   24,   11, 2.50, 1.2],
  [10,   0,   23, 1.80, 0.9],
  [11, -13,   21, 0.00, 1.0],
  [12,  13,   19, 2.00, 1.0],
  [13, -36,  -21, 0.80, 1.1],
  [14,  36,  -22, 2.30, 1.0],
  [15, -38,   18, 1.50, 1.2],
  [16,  38,   16, 0.20, 0.9],
  [17,  -5,  -36, 1.10, 1.0],
  [18,   6,  -38, 3.50, 1.1],
  [19, -39,   -5, 0.90, 1.0],
  [20,  39,    3, 2.80, 1.0],
  [21,  -3,   36, 1.40, 1.1],
];

// ─── Single ruin prop ─────────────────────────────────────────────────────────
function RuinProp({ modelNum, position, rotY, scale }: {
  modelNum: number;
  position: [number, number, number];
  rotY:     number;
  scale:    number;
}) {
  const url     = GRAVEYARD.ruinFbx(modelNum);
  const fbx     = useLoader(FBXLoader, url);
  const texture = useTexture(GRAVEYARD.texture);

  const obj = useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY      = false;
    fbx.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        const mat = new THREE.MeshStandardMaterial({
          map:       texture,
          roughness: 0.85,
          metalness: 0.05,
          // Slightly lighter tint so stone reads under daylight
          color:     new THREE.Color(0xd8ccc0),
        });
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(() => mat.clone())
          : mat;
      }
    });
    return fbx;
  }, [fbx, texture]);

  return (
    <RigidBody type="fixed" colliders="trimesh" position={position} rotation={[0, rotY, 0]} collisionGroups={CG_WORLD}>
      <primitive object={obj} scale={scale} />
    </RigidBody>
  );
}

// ─── Terrain ground + boundary walls ─────────────────────────────────────────
function Ground() {
  const { heights, terrainGeo, skirtGeo } = useMemo(() => {
    const heights    = buildTerrainHeightArray();
    const verts      = (TERRAIN_SEGS + 1) * (TERRAIN_SEGS + 1);
    const positions  = new Float32Array(verts * 3);
    const half       = TERRAIN_SIZE / 2;
    const step       = TERRAIN_SIZE / TERRAIN_SEGS;

    for (let row = 0; row <= TERRAIN_SEGS; row++) {
      for (let col = 0; col <= TERRAIN_SEGS; col++) {
        const i = row * (TERRAIN_SEGS + 1) + col;
        positions[i * 3]     = -half + col * step;
        positions[i * 3 + 1] = heights[i];
        positions[i * 3 + 2] = -half + row * step;
      }
    }

    const indices: number[] = [];
    for (let row = 0; row < TERRAIN_SEGS; row++) {
      for (let col = 0; col < TERRAIN_SEGS; col++) {
        const tl = row * (TERRAIN_SEGS + 1) + col;
        const tr = tl + 1;
        const bl = tl + (TERRAIN_SEGS + 1);
        const br = bl + 1;
        indices.push(tl, bl, tr, tr, bl, br);
      }
    }

    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    terrainGeo.setIndex(indices);
    terrainGeo.computeVertexNormals();

    // Skirt — thick slab below the terrain
    const skirtGeo = new THREE.BoxGeometry(TERRAIN_SIZE, 12, TERRAIN_SIZE);

    return { heights, terrainGeo, skirtGeo };
  }, []);

  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={0.8} restitution={0.1}>
        {/*
          HeightfieldCollider args:
          - nrows / ncols = quad count (TERRAIN_SEGS = 63)
          - heights: flat array of (nrows+1)*(ncols+1) = 64*64 heights
          - scale: world size {x, y, z}
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

        {/* Lush green grass surface */}
        <mesh geometry={terrainGeo} receiveShadow castShadow={false}>
          <meshStandardMaterial
            color="#4a8a22"
            roughness={0.95}
            metalness={0.0}
          />
        </mesh>

        {/* Skirt — earth below the surface */}
        <mesh geometry={skirtGeo} position={[0, -7, 0]} castShadow={false}>
          <meshStandardMaterial
            color="#3a6018"
            roughness={1.0}
            metalness={0.0}
          />
        </mesh>
      </RigidBody>

      {/* Safety-net floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[80, 0.5, 80]} position={[0, -25, 0]} collisionGroups={CG_WORLD} />
      </RigidBody>

      {/* Boundary walls (invisible) */}
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        <CuboidCollider args={[62, 12, 0.5]} position={[  0, 4, -62]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[62, 12, 0.5]} position={[  0, 4,  62]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 12, 62]} position={[-62, 4,   0]} collisionGroups={CG_WORLD} />
        <CuboidCollider args={[0.5, 12, 62]} position={[ 62, 4,   0]} collisionGroups={CG_WORLD} />
      </RigidBody>
    </>
  );
}

// ─── Autumn trees ─────────────────────────────────────────────────────────────
// Canopy colors cycle through autumn palette
const AUTUMN_COLORS = ["#cc5500", "#dd8800", "#bb3300", "#e8a020", "#993300", "#ffaa00"];

const TREE_PLACEMENTS: [number, number, number, number, number, number][] = [
  // x, z, rotY, trunkH, canopyR, colorIdx
  [-10, 10,  0.0, 4.5, 2.2, 0],
  [ 10, 12,  0.5, 5.0, 2.5, 1],
  [-12, -8,  1.0, 4.0, 2.0, 2],
  [ 12, -8,  0.7, 5.5, 2.8, 3],
  [-30,-26,  0.0, 6.0, 3.0, 4],
  [ 30,-26,  1.3, 5.5, 2.6, 0],
  [-42, 20,  0.0, 5.0, 2.3, 1],
  [ 42,-30,  0.9, 4.5, 2.1, 2],
  [ -5, 18,  0.0, 4.2, 2.0, 3],
  [  5, 20,  1.2, 4.8, 2.4, 4],
  [-48, -5,  0.4, 5.2, 2.6, 5],
  [ 48,  8,  1.8, 4.8, 2.3, 0],
  [-20, 40,  0.6, 5.5, 2.7, 1],
  [ 18,-44,  2.1, 5.0, 2.5, 2],
  [-44, 38,  0.3, 4.5, 2.2, 3],
  [ 44, 36,  1.5, 5.8, 3.0, 4],
  [  0,-48,  0.8, 4.2, 2.1, 5],
  [-55, 10,  0.1, 6.2, 3.1, 0],
  [ 55,-15,  0.9, 5.5, 2.8, 1],
  [ -8,-45,  1.6, 4.8, 2.3, 2],
];

function AutumnTree({ x, z, rotY, trunkH, canopyR, colorIdx }: {
  x: number; z: number; rotY: number;
  trunkH: number; canopyR: number; colorIdx: number;
}) {
  const y = getTerrainHeight(x, z);
  const color = AUTUMN_COLORS[colorIdx % AUTUMN_COLORS.length];
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {/* Trunk */}
      <mesh position={[0, trunkH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.32, trunkH, 7]} />
        <meshStandardMaterial color="#5a3a1a" roughness={1} />
      </mesh>
      {/* Main canopy */}
      <mesh position={[0, trunkH + canopyR * 0.55, 0]} castShadow receiveShadow>
        <sphereGeometry args={[canopyR, 8, 7]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {/* Secondary canopy cluster (offset, slightly smaller) */}
      <mesh position={[canopyR * 0.45, trunkH + canopyR * 0.3, canopyR * 0.2]} castShadow>
        <sphereGeometry args={[canopyR * 0.7, 7, 6]} />
        <meshStandardMaterial color={AUTUMN_COLORS[(colorIdx + 2) % AUTUMN_COLORS.length]} roughness={0.9} />
      </mesh>
      <mesh position={[-canopyR * 0.4, trunkH + canopyR * 0.25, -canopyR * 0.25]} castShadow>
        <sphereGeometry args={[canopyR * 0.65, 7, 6]} />
        <meshStandardMaterial color={AUTUMN_COLORS[(colorIdx + 4) % AUTUMN_COLORS.length]} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ─── Large boulders ───────────────────────────────────────────────────────────
// [x, z, rotY, sx, sy, sz] — each entry is one rock cluster anchor
const BOULDER_PLACEMENTS: [number, number, number, number, number, number][] = [
  // Inner field boulders
  [ 18,  -5, 0.4, 2.4, 1.6, 2.0],
  [-16,   3, 1.1, 2.0, 1.4, 1.8],
  [  7, -18, 0.7, 1.8, 1.2, 1.6],
  [-20,  16, 2.0, 2.2, 1.5, 2.0],
  // Mid-ring
  [ 32,  10, 0.3, 3.0, 2.0, 2.6],
  [-31,  -8, 1.7, 2.8, 1.8, 2.4],
  [  4,  32, 0.9, 2.4, 1.6, 2.2],
  [-30, -30, 0.5, 3.2, 2.1, 2.8],
  [ 35,  28, 1.4, 2.6, 1.7, 2.3],
  // Outer ring backdrop — bigger rocks forming distant ridge feel
  [-50,  -2, 0.2, 4.0, 3.0, 3.5],
  [ 50,  -8, 0.8, 4.5, 3.2, 4.0],
  [-45,  35, 1.3, 3.8, 2.8, 3.2],
  [ 40, -42, 0.6, 4.2, 3.0, 3.8],
  [  0, -55, 0.1, 5.0, 3.5, 4.5],
  [-55, -40, 1.8, 4.8, 3.4, 4.2],
];

function BoulderCluster({ x, z, rotY, sx, sy, sz }: {
  x: number; z: number; rotY: number;
  sx: number; sy: number; sz: number;
}) {
  const y = getTerrainHeight(x, z);
  return (
    <RigidBody type="fixed" colliders="trimesh" position={[x, y, z]} rotation={[0, rotY, 0]} collisionGroups={CG_WORLD}>
      {/* Main boulder */}
      <mesh castShadow receiveShadow
        position={[0, sy * 0.42, 0]}
        scale={[sx, sy, sz]}
        rotation={[0.1, 0, 0.08]}
      >
        <sphereGeometry args={[1, 7, 6]} />
        <meshStandardMaterial color="#8a8070" roughness={1} metalness={0} />
      </mesh>
      {/* Companion rock */}
      <mesh castShadow receiveShadow
        position={[sx * 0.55, sy * 0.22, sz * 0.3]}
        scale={[sx * 0.65, sy * 0.6, sz * 0.65]}
        rotation={[0.2, 0.5, 0.1]}
      >
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#787060" roughness={1} metalness={0} />
      </mesh>
      {/* Small pebble */}
      <mesh castShadow receiveShadow
        position={[-sx * 0.55, sy * 0.1, -sz * 0.35]}
        scale={[sx * 0.35, sy * 0.3, sz * 0.35]}
      >
        <sphereGeometry args={[1, 5, 4]} />
        <meshStandardMaterial color="#6a6058" roughness={1} metalness={0} />
      </mesh>
    </RigidBody>
  );
}

// ─── NavGrid obstacle data (exported for NavGrid.initNavGrid) ─────────────────
// Provides {x, z, radius} for every solid obstacle so A* can avoid them.
export const NAV_OBSTACLES: NavObstacle[] = [
  // Boulders — radius ≈ max horizontal scale
  ...BOULDER_PLACEMENTS.map(([x, z, , sx, , sz]) => ({
    x, z, radius: Math.max(sx, sz) * 1.1,
  })),
  // Ruins — fixed 3 m footprint
  ...RUIN_PLACEMENTS.map(([, x, z]) => ({ x, z, radius: 3.0 })),
];

// ─── Outdoor Scene (public export) ───────────────────────────────────────────
export function Graveyard() {
  return (
    <group>
      {/* ── Ground + boundary walls ── */}
      <Ground />

      {/* ── Autumn trees ── */}
      {TREE_PLACEMENTS.map(([x, z, rotY, trunkH, canopyR, colorIdx], i) => (
        <AutumnTree key={i} x={x} z={z} rotY={rotY} trunkH={trunkH} canopyR={canopyR} colorIdx={colorIdx} />
      ))}

      {/* ── Boulder clusters (with physics colliders) ── */}
      {BOULDER_PLACEMENTS.map(([x, z, rotY, sx, sy, sz], i) => (
        <BoulderCluster key={i} x={x} z={z} rotY={rotY} sx={sx} sy={sy} sz={sz} />
      ))}

      {/* ── Ancient ruin props (FBX — each in Suspense) ── */}
      {RUIN_PLACEMENTS.map(([modelNum, x, z, rotY, scale], i) => (
        <Suspense key={i} fallback={null}>
          <RuinProp
            modelNum={modelNum}
            position={[x, getTerrainHeight(x, z) - 1.0, z]}
            rotY={rotY}
            scale={scale}
          />
        </Suspense>
      ))}
    </group>
  );
}
