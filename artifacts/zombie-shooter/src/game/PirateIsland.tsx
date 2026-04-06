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
const GLB_RAW_SCALE  = 2.5e-4;
const GLB_SCALE_XZ   = GLB_RAW_SCALE * 60;
const GLB_SCALE_Y    = GLB_RAW_SCALE * GENESIS_HEIGHT_SCALE;
const GLB_RAW_OFFSET_Y = 72.105;
const GLB_OFFSET_Y   = GLB_RAW_OFFSET_Y * GENESIS_HEIGHT_SCALE;
const GLB_OFFSET_X   = -25.000 * 60;
const GLB_OFFSET_Z   =  25.000 * 60;

// Biome height thresholds (world metres, after GENESIS_HEIGHT_SCALE applied)
const H_BEACH   =   40;
const H_GRASS   =  200;
const H_JUNGLE  =  800;
const H_FOREST  = 1400;
const H_ROCK    = 2000;

// ── Township location (east lowland, south of dock, grass biome) ──────────────
export const TOWN_CX       = 480;
export const TOWN_CZ       = 280;
const        TOWN_FENCE_W  = 150;   // palisade east-west span
const        TOWN_FENCE_D  = 130;   // palisade north-south span

// ── Colour palette ─────────────────────────────────────────────────────────────
const WOOD_DARK   = "#6B4226";
const WOOD_MID    = "#8B5E3C";
const WOOD_LIGHT  = "#9E7A52";
const STONE_GREY  = "#8A7A68";
const STONE_DARK  = "#6E6055";
const THATCH      = "#A88C40";
const THATCH_DARK = "#7A6228";
const CANVAS_RED  = "#B03828";
const CANVAS_BLUE = "#3060A0";
const TORCH_ORG   = "#FF8000";

// ── Start fetching the height binary as soon as this module loads ─────────────
preloadGenesisHeights();

// ─── Nav obstacles (A* avoidance) ─────────────────────────────────────────────
interface PalmConfig { x: number; z: number; h: number; ry: number }

const PALM_PLACEMENTS: PalmConfig[] = [
  { x:  120, z: 2400, h: 12.0, ry:  0.30 },
  { x: -360, z: 2320, h: 10.5, ry:  1.10 },
  { x:  520, z: 2240, h: 11.5, ry: -0.50 },
  { x: -600, z: 2160, h: 12.5, ry:  0.80 },
  { x:  720, z: 2040, h:  9.5, ry: -1.20 },
  { x: -200, z: 1980, h: 11.0, ry:  2.10 },
  { x:  840, z: 1920, h: 10.0, ry:  0.90 },
  { x: -680, z: 1880, h: 12.0, ry: -0.80 },
  { x:  180, z: 1840, h: 10.5, ry:  1.50 },
  { x:  900, z: 1560, h: 11.5, ry: -0.20 },
  { x:  960, z: 1200, h: 10.0, ry:  1.80 },
  { x:  920, z:  840, h: 11.0, ry: -0.40 },
  { x:  860, z:  440, h: 12.0, ry:  2.20 },
  { x: -720, z: 1400, h:  9.5, ry: -1.00 },
  { x: -740, z:  960, h: 11.0, ry:  1.30 },
  { x: -680, z:  520, h: 10.5, ry:  0.40 },
  { x:  280, z: -280, h: 10.5, ry:  0.70 },
  { x: -240, z: -400, h:  9.5, ry: -0.90 },
  { x:  420, z: -560, h: 11.0, ry:  1.60 },
  { x:  220, z: 1700, h: 15.0, ry:  0.55 },
  { x: -300, z: 1560, h: 16.0, ry: -0.75 },
  { x:  420, z: 1440, h: 14.5, ry:  1.20 },
  { x: -420, z: 1320, h: 15.5, ry:  2.80 },
  { x:  140, z: 1160, h: 17.0, ry: -1.40 },
  { x: -220, z: 1000, h: 14.0, ry:  0.35 },
  { x:  560, z:  860, h: 15.0, ry: -0.60 },
  { x: -540, z:  740, h: 16.5, ry:  1.85 },
  { x:  320, z:  640, h: 15.5, ry:  0.90 },
  { x: -160, z:  580, h: 14.5, ry: -1.10 },
];

export const NAV_OBSTACLES: NavObstacle[] = [
  ...PALM_PLACEMENTS.map((p) => ({ x: p.x, z: p.z, radius: 24.0 })),
  { x:  160, z:  400, radius: 560.0 },
  { x: 1160, z:    0, radius: 120.0 },
  { x: TOWN_CX, z: TOWN_CZ, radius: 110.0 },   // township — no zombie spawns inside
];

// ─── Biome material factory (richer, more natural palette) ────────────────────
function biomeMaterial(worldY: number, idx: number): THREE.MeshStandardMaterial {
  const polyFactor = 1 + (idx % 8);

  // Subtle hue jitter — every 3 meshes at same biome gets a slightly different tone
  const hueShift = (idx % 3) * 0.018;

  function tinted(hex: string, shift: number): THREE.Color {
    const c = new THREE.Color(hex);
    c.r = Math.min(1, c.r + shift);
    c.g = Math.min(1, c.g + shift * 0.5);
    return c;
  }

  if (worldY < H_BEACH) {
    return new THREE.MeshStandardMaterial({
      color: tinted("#C8993A", hueShift * 0.8),
      roughness: 0.90, metalness: 0.01,
      polygonOffset: true, polygonOffsetFactor: polyFactor, polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_GRASS) {
    return new THREE.MeshStandardMaterial({
      color: tinted("#3AAA28", -hueShift * 0.3),
      roughness: 0.82, metalness: 0.01,
      polygonOffset: true, polygonOffsetFactor: polyFactor, polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_JUNGLE) {
    return new THREE.MeshStandardMaterial({
      color: tinted("#1D7818", hueShift * 0.2),
      roughness: 0.88, metalness: 0.01,
      polygonOffset: true, polygonOffsetFactor: polyFactor, polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_FOREST) {
    return new THREE.MeshStandardMaterial({
      color: tinted("#3D6B40", -hueShift * 0.2),
      roughness: 0.93, metalness: 0.01,
      polygonOffset: true, polygonOffsetFactor: polyFactor, polygonOffsetUnits: polyFactor,
    });
  }
  if (worldY < H_ROCK) {
    return new THREE.MeshStandardMaterial({
      color: tinted("#7A6E62", hueShift),
      roughness: 0.97, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: polyFactor, polygonOffsetUnits: polyFactor,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: tinted("#D8CFC0", hueShift * 0.3),   // snow/ice peak
    roughness: 0.80, metalness: 0.04,
    polygonOffset: true, polygonOffsetFactor: polyFactor, polygonOffsetUnits: polyFactor,
  });
}

// ─── Palm tree ─────────────────────────────────────────────────────────────────
const LEAF_ANGLES = [0, 51, 103, 154, 205, 257, 308];

function PalmTree({ x, z, h = 10.0, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY  = getIslandHeight(x, z);
  const trunkH   = h * 0.78;
  const leafSize = h * 0.24;
  const crownR   = h * 0.06;

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[crownR, crownR * 2, trunkH, 8]} />
          <meshStandardMaterial color="#7a5523" roughness={0.96} metalness={0} />
        </mesh>
      </RigidBody>
      {LEAF_ANGLES.map((deg, i) => (
        <mesh key={i} position={[0, trunkH + 0.05, 0]}
          rotation={[0.55, (deg * Math.PI) / 180, 0]} castShadow>
          <planeGeometry args={[leafSize * 0.4, leafSize * 3.5]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#2d8a32" : "#3dad40"}
            side={THREE.DoubleSide} roughness={0.72} metalness={0} />
        </mesh>
      ))}
      {h > 11 && [0, 1.8, 3.6].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.4, trunkH - 0.4, Math.sin(a) * 0.4]} castShadow>
          <sphereGeometry args={[0.22, 6, 5]} />
          <meshStandardMaterial color="#5c3a14" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Jungle tree ───────────────────────────────────────────────────────────────
function JungleTree({ x, z, h = 13.0, ry = 0 }: { x: number; z: number; h?: number; ry?: number }) {
  const groundY = getIslandHeight(x, z);
  const trunkH  = h * 0.65;
  const crownY  = trunkH + h * 0.18;

  return (
    <group position={[x, groundY, z]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
        {[0, 1.26, 2.51, 3.77].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45]}
            rotation-y={a} castShadow>
            <boxGeometry args={[0.22, 1.2, 0.55]} />
            <meshStandardMaterial color="#5a3e20" roughness={1} />
          </mesh>
        ))}
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.22, 0.38, trunkH, 7]} />
          <meshStandardMaterial color="#4a3318" roughness={0.98} metalness={0} />
        </mesh>
      </RigidBody>
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

// ─── Rock clusters ─────────────────────────────────────────────────────────────
interface RockConfig { x: number; z: number; s: number; ry: number }
const ROCK_PLACEMENTS: RockConfig[] = [
  { x:  440, z: 1600, s: 3.2, ry: 0.4 }, { x: -360, z: 1500, s: 2.5, ry: 1.2 },
  { x:  700, z: 1240, s: 4.0, ry: 2.1 }, { x: -580, z: 1160, s: 3.0, ry: 0.8 },
  { x:  260, z:  840, s: 5.5, ry: 1.7 }, { x: -440, z:  740, s: 4.8, ry: 0.3 },
  { x:  760, z:  560, s: 3.6, ry: 2.8 }, { x: -120, z:  300, s: 2.8, ry: 1.5 },
  { x:  340, z: -160, s: 6.0, ry: 0.6 }, { x: -300, z: -240, s: 5.2, ry: 2.2 },
  { x:   80, z: -500, s: 4.4, ry: 1.0 }, { x:  500, z: -700, s: 3.8, ry: 0.2 },
  { x: -440, z: 2100, s: 2.0, ry: 0.9 }, { x:  620, z: 1960, s: 1.8, ry: 1.6 },
];
function RockCluster({ x, z, s, ry }: RockConfig) {
  const groundY = getIslandHeight(x, z);
  return (
    <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
      <group position={[x, groundY, z]} rotation-y={ry}>
        <mesh castShadow receiveShadow position={[0, s * 0.38, 0]}>
          <dodecahedronGeometry args={[s * 0.52, 0]} />
          <meshStandardMaterial color="#7a7060" roughness={0.97} metalness={0.04} />
        </mesh>
        <mesh castShadow receiveShadow position={[s * 0.58, s * 0.22, s * 0.28]}>
          <dodecahedronGeometry args={[s * 0.35, 0]} />
          <meshStandardMaterial color="#6e6555" roughness={0.98} metalness={0.03} />
        </mesh>
        <mesh castShadow receiveShadow position={[-s * 0.42, s * 0.18, -s * 0.22]}>
          <dodecahedronGeometry args={[s * 0.30, 0]} />
          <meshStandardMaterial color="#807268" roughness={0.96} metalness={0.05} />
        </mesh>
      </group>
    </RigidBody>
  );
}

// ─── Ore veins ─────────────────────────────────────────────────────────────────
interface OreConfig { x: number; z: number; s: number; ry: number; kind: "iron" | "gold" | "coal" }
const ORE_PLACEMENTS: OreConfig[] = [
  { x:  360, z: 1360, s: 2.2, ry: 0.5, kind: "iron" },
  { x: -320, z: 1180, s: 1.8, ry: 1.8, kind: "iron" },
  { x:  600, z:  700, s: 2.5, ry: 0.9, kind: "iron" },
  { x: -480, z:  400, s: 2.0, ry: 2.3, kind: "iron" },
  { x:  200, z: -120, s: 1.9, ry: 0.7, kind: "iron" },
  { x:  240, z:  640, s: 1.6, ry: 1.3, kind: "gold" },
  { x: -200, z:  200, s: 1.4, ry: 2.7, kind: "gold" },
  { x:  760, z: 1720, s: 1.5, ry: 0.2, kind: "coal" },
  { x: -640, z: 1640, s: 1.7, ry: 1.1, kind: "coal" },
  { x:  820, z:  320, s: 1.4, ry: 2.0, kind: "coal" },
];
const ORE_COLORS: Record<string, string> = {
  iron: "#9a5a3a", gold: "#d4a820", coal: "#2a2620",
};
function OreVein({ x, z, s, ry, kind }: OreConfig) {
  const groundY = getIslandHeight(x, z);
  const color   = ORE_COLORS[kind];
  return (
    <RigidBody type="fixed" colliders="hull" collisionGroups={CG_WORLD}>
      <group position={[x, groundY, z]} rotation-y={ry}>
        <mesh castShadow receiveShadow position={[0, s * 0.28, 0]}>
          <dodecahedronGeometry args={[s * 0.55, 0]} />
          <meshStandardMaterial color="#6a6050" roughness={0.99} metalness={0.02} />
        </mesh>
        <mesh castShadow position={[s * 0.12, s * 0.55, s * 0.08]}>
          <octahedronGeometry args={[s * 0.28, 0]} />
          <meshStandardMaterial color={color} roughness={0.70}
            metalness={kind === "gold" ? 0.6 : 0.1} />
        </mesh>
      </group>
    </RigidBody>
  );
}

// ─── Hemp plants ───────────────────────────────────────────────────────────────
const HEMP_POSITIONS: Array<[number, number]> = [
  [  60, 2320], [-280, 2220], [ 380, 2140], [-520, 2080], [ 660, 2000],
  [ 880, 1760], [-660, 1720], [ 160, 1680], [ 820, 1400], [-760, 1280],
  [ 920, 1000], [-700,  840], [ 860,  600], [-620,  480], [ 400,  280],
  [-340,  200], [ 120, -160], [-160, -360], [ 400, -520],
];
function HempPlant({ x, z }: { x: number; z: number }) {
  const groundY = getIslandHeight(x, z);
  const angles  = [0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4];
  return (
    <group position={[x, groundY, z]}>
      {angles.map((a, i) => {
        const lean = (i % 3 - 1) * 0.18;
        return (
          <group key={i} rotation-y={a}>
            <mesh castShadow position={[lean * 0.8, 0.55, 0]}>
              <cylinderGeometry args={[0.03, 0.04, 1.1, 4]} />
              <meshStandardMaterial color="#5a7a2a" roughness={0.85} />
            </mesh>
            {[-0.3, 0, 0.3].map((rot, j) => (
              <mesh key={j} position={[lean, 1.0, 0]}
                rotation={[0.35 + Math.abs(lean), 0, rot]}>
                <planeGeometry args={[0.15, 0.65]} />
                <meshStandardMaterial color="#4a8a1e"
                  side={THREE.DoubleSide} roughness={0.78} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// ─── Wild flowers (improved — fuller petals + stem leaves) ────────────────────
const FLOWER_DATA: Array<[number, number, string]> = [
  [  40, 2360, "#e84cc0"], [-320, 2280, "#f2c12e"], [ 460, 2180, "#e84cc0"],
  [-560, 2120, "#f2c12e"], [ 620, 2020, "#ff5e78"], [-180, 1960, "#f2c12e"],
  [ 800, 1900, "#e84cc0"], [-660, 1840, "#ff5e78"], [ 220, 1800, "#f2c12e"],
  [ 920, 1520, "#e84cc0"], [-720, 1380, "#f2c12e"], [ 880,  920, "#ff5e78"],
  [-700,  600, "#e84cc0"], [ 320,  300, "#f2c12e"], [-260, -300, "#ff5e78"],
  [ 440, -600, "#e84cc0"],
  // Extra flowers near township for colour
  [ 440,  380, "#ffdd00"], [ 360,  220, "#ff7b39"], [ 520,  160, "#e84cc0"],
  [ 410,  480, "#ffffff"], [ 350,  330, "#ffdd00"],
];
function WildFlower({ x, z, color }: { x: number; z: number; color: string }) {
  const groundY = getIslandHeight(x, z);
  const petalAngles = [0, 60, 120, 180, 240, 300];
  return (
    <group position={[x, groundY, z]}>
      {[0, 1.2, 2.4].map((a, i) => (
        <group key={i} rotation-y={a + i * 0.4}>
          {/* Stem */}
          <mesh position={[0.12, 0.30, 0]}>
            <cylinderGeometry args={[0.016, 0.022, 0.60, 4]} />
            <meshStandardMaterial color="#4a7a1a" roughness={0.88} />
          </mesh>
          {/* Stem leaf */}
          <mesh position={[0.12, 0.22, 0]} rotation={[0.5, a, 0.4]}>
            <planeGeometry args={[0.08, 0.22]} />
            <meshStandardMaterial color="#3a6a10" side={THREE.DoubleSide} roughness={0.80} />
          </mesh>
          {/* Petal ring */}
          {petalAngles.map((deg, pi) => (
            <mesh key={pi}
              position={[
                0.12 + Math.cos((deg * Math.PI) / 180) * 0.055,
                0.62,
                Math.sin((deg * Math.PI) / 180) * 0.055,
              ]}
            >
              <sphereGeometry args={[0.048, 5, 4]} />
              <meshStandardMaterial color={color} roughness={0.60} />
            </mesh>
          ))}
          {/* Centre stamen */}
          <mesh position={[0.12, 0.62, 0]}>
            <sphereGeometry args={[0.038, 5, 4]} />
            <meshStandardMaterial color="#f8e020" roughness={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Chicken (wildlife) ────────────────────────────────────────────────────────
function Chicken({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  const groundY   = getIslandHeight(x, z);
  const bobRef    = useRef(0);
  const groupRef  = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + x * 0.3;
    if (groupRef.current) {
      // Gentle idle bob
      groupRef.current.position.y = groundY + Math.sin(t * 2.2) * 0.04;
      groupRef.current.rotation.y = ry + Math.sin(t * 0.8) * 0.18;
    }
    bobRef.current = t;
  });

  return (
    <group ref={groupRef} position={[x, groundY, z]}>
      {/* Body */}
      <mesh castShadow position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.28, 8, 6]} />
        <meshStandardMaterial color="#E8D8B0" roughness={0.78} metalness={0} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0.24, 0.72, 0]}>
        <sphereGeometry args={[0.15, 7, 5]} />
        <meshStandardMaterial color="#E8D8B0" roughness={0.76} metalness={0} />
      </mesh>
      {/* Comb (red) */}
      <mesh castShadow position={[0.24, 0.88, 0]}>
        <boxGeometry args={[0.06, 0.10, 0.12]} />
        <meshStandardMaterial color="#CC2020" roughness={0.7} metalness={0} />
      </mesh>
      {/* Beak */}
      <mesh castShadow position={[0.39, 0.71, 0]} rotation-z={-0.3}>
        <coneGeometry args={[0.04, 0.12, 5]} />
        <meshStandardMaterial color="#D4A020" roughness={0.72} metalness={0} />
      </mesh>
      {/* Eye */}
      <mesh position={[0.30, 0.75, 0.06]}>
        <sphereGeometry args={[0.028, 5, 4]} />
        <meshStandardMaterial color="#111111" roughness={0.3} metalness={0} />
      </mesh>
      {/* Wing (left) */}
      <mesh castShadow position={[-0.08, 0.48, 0.20]} rotation={[0.2, 0, 0.3]}>
        <boxGeometry args={[0.22, 0.12, 0.32]} />
        <meshStandardMaterial color="#D0C098" roughness={0.80} metalness={0} />
      </mesh>
      {/* Wing (right) */}
      <mesh castShadow position={[-0.08, 0.48, -0.20]} rotation={[0.2, 0, -0.3]}>
        <boxGeometry args={[0.22, 0.12, 0.32]} />
        <meshStandardMaterial color="#D0C098" roughness={0.80} metalness={0} />
      </mesh>
      {/* Legs */}
      <mesh castShadow position={[ 0.05, 0.18, 0.10]}>
        <cylinderGeometry args={[0.025, 0.028, 0.36, 4]} />
        <meshStandardMaterial color="#D4A020" roughness={0.75} />
      </mesh>
      <mesh castShadow position={[ 0.05, 0.18, -0.10]}>
        <cylinderGeometry args={[0.025, 0.028, 0.36, 4]} />
        <meshStandardMaterial color="#D4A020" roughness={0.75} />
      </mesh>
      {/* Tail feathers */}
      <mesh castShadow position={[-0.26, 0.52, 0]} rotation-z={0.5}>
        <boxGeometry args={[0.06, 0.22, 0.18]} />
        <meshStandardMaterial color="#C8A868" roughness={0.78} />
      </mesh>
    </group>
  );
}

// ─── Township buildings ────────────────────────────────────────────────────────
// Each building is placed relative to the world and reads groundY from heights.

function TavernBuilding({ cx, cz }: { cx: number; cz: number }) {
  const gY  = getIslandHeight(cx, cz);
  const W   = 22, D = 14, wallH = 7, foundD = 2;
  const rA  = 0.52;   // roof slope angle (~30°)

  return (
    <group position={[cx, gY - foundD, cz]}>
      {/* Stone foundation */}
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        <mesh castShadow receiveShadow position={[0, foundD * 0.5, 0]}>
          <boxGeometry args={[W + 2, foundD, D + 2]} />
          <meshStandardMaterial color={STONE_GREY} roughness={0.95} metalness={0.02} />
        </mesh>

        {/* Main walls */}
        <mesh castShadow receiveShadow position={[0, foundD + wallH / 2, 0]}>
          <boxGeometry args={[W, wallH, D]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.92} metalness={0} />
        </mesh>

        {/* Front porch floor */}
        <mesh castShadow receiveShadow position={[0, foundD + 0.3, D / 2 + 2.5]}>
          <boxGeometry args={[W, 0.6, 5]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.94} metalness={0} />
        </mesh>

        {/* Porch posts */}
        {[-8, -3, 3, 8].map((ox, i) => (
          <mesh key={i} castShadow position={[ox, foundD + 2.5, D / 2 + 4.5]}>
            <cylinderGeometry args={[0.25, 0.30, 5, 6]} />
            <meshStandardMaterial color={WOOD_LIGHT} roughness={0.90} metalness={0} />
          </mesh>
        ))}
        {/* Porch railing */}
        <mesh castShadow position={[0, foundD + 1.2, D / 2 + 4.8]}>
          <boxGeometry args={[W, 0.4, 0.3]} />
          <meshStandardMaterial color={WOOD_LIGHT} roughness={0.90} />
        </mesh>
      </RigidBody>

      {/* Roof — front slope */}
      <mesh castShadow position={[0, foundD + wallH + 0.8, D / 4 + 0.5]}
        rotation-x={-rA}>
        <boxGeometry args={[W + 2, 0.55, D / 2 + 2]} />
        <meshStandardMaterial color={THATCH} roughness={0.93} metalness={0} />
      </mesh>
      {/* Roof — back slope */}
      <mesh castShadow position={[0, foundD + wallH + 0.8, -D / 4 - 0.5]}
        rotation-x={rA}>
        <boxGeometry args={[W + 2, 0.55, D / 2 + 2]} />
        <meshStandardMaterial color={THATCH} roughness={0.93} metalness={0} />
      </mesh>
      {/* Ridge pole */}
      <mesh castShadow position={[0, foundD + wallH + 3.0, 0]}>
        <boxGeometry args={[W + 3, 0.8, 0.9]} />
        <meshStandardMaterial color={THATCH_DARK} roughness={0.96} metalness={0} />
      </mesh>

      {/* Chimney */}
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        <mesh castShadow position={[6, foundD + wallH + 5, -3]}>
          <boxGeometry args={[2.5, 10, 2.5]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.97} metalness={0.01} />
        </mesh>
      </RigidBody>

      {/* Windows (decorative boxes inset into walls) */}
      {[-7, 7].map((ox, i) => (
        <group key={i}>
          <mesh position={[ox, foundD + wallH * 0.55, D / 2 + 0.01]}>
            <boxGeometry args={[2.8, 2.2, 0.3]} />
            <meshStandardMaterial color="#4a3010" roughness={0.5} metalness={0} />
          </mesh>
          {/* Cross bar */}
          <mesh position={[ox, foundD + wallH * 0.55, D / 2 + 0.2]}>
            <boxGeometry args={[0.15, 2.2, 0.3]} />
            <meshStandardMaterial color={WOOD_LIGHT} roughness={0.88} />
          </mesh>
          <mesh position={[ox, foundD + wallH * 0.55, D / 2 + 0.2]}>
            <boxGeometry args={[2.8, 0.15, 0.3]} />
            <meshStandardMaterial color={WOOD_LIGHT} roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* Door frame */}
      <mesh position={[0, foundD + 2.6, D / 2 + 0.02]}>
        <boxGeometry args={[3.6, 5.2, 0.4]} />
        <meshStandardMaterial color={WOOD_LIGHT} roughness={0.90} />
      </mesh>
      {/* Door fill (dark inside) */}
      <mesh position={[0, foundD + 2.4, D / 2 + 0.05]}>
        <boxGeometry args={[3.0, 4.8, 0.1]} />
        <meshStandardMaterial color="#1a1008" roughness={0.99} />
      </mesh>

      {/* Hanging sign */}
      <mesh castShadow position={[0, foundD + wallH - 0.5, D / 2 + 5.0]}>
        <boxGeometry args={[5.5, 1.4, 0.22]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.95} />
      </mesh>
      {/* Sign chain */}
      <mesh position={[-2.4, foundD + wallH + 0.1, D / 2 + 5.0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 4]} />
        <meshStandardMaterial color="#888870" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[ 2.4, foundD + wallH + 0.1, D / 2 + 5.0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 4]} />
        <meshStandardMaterial color="#888870" roughness={0.7} metalness={0.4} />
      </mesh>

      {/* Barrels by the entrance */}
      {[[-4.0, 0.8], [5.5, 1.4]].map(([ox, ry], i) => (
        <mesh key={i} castShadow
          position={[ox, foundD + 0.55, D / 2 + 3.5]}
          rotation-y={ry}>
          <cylinderGeometry args={[0.45, 0.50, 1.1, 10]} />
          <meshStandardMaterial color="#6B4226" roughness={0.96} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

function PirateHut({ cx, cz, ry = 0 }: { cx: number; cz: number; ry?: number }) {
  const gY    = getIslandHeight(cx, cz);
  const W     = 9, D = 7, wallH = 5, foundD = 1.5;
  const rA    = 0.55;

  return (
    <group position={[cx, gY - foundD, cz]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        {/* Foundation */}
        <mesh castShadow receiveShadow position={[0, foundD * 0.5, 0]}>
          <boxGeometry args={[W + 1, foundD, D + 1]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.97} metalness={0.01} />
        </mesh>
        {/* Walls */}
        <mesh castShadow receiveShadow position={[0, foundD + wallH / 2, 0]}>
          <boxGeometry args={[W, wallH, D]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.93} metalness={0} />
        </mesh>
      </RigidBody>
      {/* Roof slopes */}
      <mesh castShadow position={[0, foundD + wallH + 0.5,  D / 4]} rotation-x={-rA}>
        <boxGeometry args={[W + 1.5, 0.5, D / 2 + 1.5]} />
        <meshStandardMaterial color={THATCH} roughness={0.94} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, foundD + wallH + 0.5, -D / 4]} rotation-x={rA}>
        <boxGeometry args={[W + 1.5, 0.5, D / 2 + 1.5]} />
        <meshStandardMaterial color={THATCH} roughness={0.94} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, foundD + wallH + 2.2, 0]}>
        <boxGeometry args={[W + 2, 0.7, 0.8]} />
        <meshStandardMaterial color={THATCH_DARK} roughness={0.96} metalness={0} />
      </mesh>
      {/* Door */}
      <mesh position={[0, foundD + 2.2, D / 2 + 0.05]}>
        <boxGeometry args={[2.0, 3.8, 0.35]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.90} />
      </mesh>
      <mesh position={[0, foundD + 2.0, D / 2 + 0.22]}>
        <boxGeometry args={[1.5, 3.4, 0.1]} />
        <meshStandardMaterial color="#1a1008" roughness={0.99} />
      </mesh>
    </group>
  );
}

function Watchtower({ cx, cz }: { cx: number; cz: number }) {
  const gY    = getIslandHeight(cx, cz);
  const towerH = 20, baseW = 5, platW = 9, foundD = 2;

  return (
    <group position={[cx, gY - foundD, cz]}>
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        {/* Stone base */}
        <mesh castShadow receiveShadow position={[0, foundD * 0.5, 0]}>
          <boxGeometry args={[baseW + 3, foundD, baseW + 3]} />
          <meshStandardMaterial color={STONE_GREY} roughness={0.96} metalness={0.02} />
        </mesh>
        {/* Tower shaft */}
        <mesh castShadow receiveShadow position={[0, foundD + towerH / 2, 0]}>
          <boxGeometry args={[baseW, towerH, baseW]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.92} metalness={0} />
        </mesh>
        {/* Platform */}
        <mesh castShadow receiveShadow position={[0, foundD + towerH + 0.6, 0]}>
          <boxGeometry args={[platW, 1.2, platW]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.94} metalness={0} />
        </mesh>
      </RigidBody>
      {/* Platform railing */}
      {[[-platW/2, 0], [platW/2, 0], [0, -platW/2], [0, platW/2]].map(([ox, oz], i) => (
        <mesh key={i} castShadow
          position={[ox, foundD + towerH + 1.8, oz]}
          rotation-y={i < 2 ? 0 : Math.PI/2}>
          <boxGeometry args={[platW, 0.9, 0.3]} />
          <meshStandardMaterial color={WOOD_LIGHT} roughness={0.90} />
        </mesh>
      ))}
      {/* Roof cap */}
      <mesh castShadow position={[0, foundD + towerH + 4.2, 0]}>
        <coneGeometry args={[platW * 0.7, 5, 4]} />
        <meshStandardMaterial color={THATCH_DARK} roughness={0.95} />
      </mesh>
      {/* Torch beacon */}
      <mesh castShadow position={[0, foundD + towerH + 7.0, 0]}>
        <sphereGeometry args={[0.55, 7, 5]} />
        <meshStandardMaterial color={TORCH_ORG} roughness={0.30} metalness={0}
          emissive={new THREE.Color(TORCH_ORG)} emissiveIntensity={2.5} />
      </mesh>
      {/* Ladder (visual rungs) */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-baseW / 2 - 0.3, foundD + 1.5 + i * 2.2, 0]}
          rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.07, 0.07, baseW + 0.8, 4]} />
          <meshStandardMaterial color={WOOD_LIGHT} roughness={0.90} />
        </mesh>
      ))}
    </group>
  );
}

function WellStructure({ cx, cz }: { cx: number; cz: number }) {
  const gY = getIslandHeight(cx, cz);
  return (
    <group position={[cx, gY, cz]}>
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        {/* Stone basin */}
        <mesh castShadow receiveShadow position={[0, 0.7, 0]}>
          <cylinderGeometry args={[1.5, 1.7, 1.4, 12]} />
          <meshStandardMaterial color={STONE_GREY} roughness={0.96} metalness={0.02} />
        </mesh>
        {/* Rim */}
        <mesh castShadow receiveShadow position={[0, 1.45, 0]}>
          <torusGeometry args={[1.5, 0.18, 6, 14]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.97} metalness={0.02} />
        </mesh>
        {/* Support posts */}
        <mesh castShadow position={[-1.3, 2.4, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 3.0, 6]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.92} />
        </mesh>
        <mesh castShadow position={[ 1.3, 2.4, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 3.0, 6]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.92} />
        </mesh>
        {/* Cross beam */}
        <mesh castShadow position={[0, 3.8, 0]}>
          <boxGeometry args={[3.2, 0.35, 0.35]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.93} />
        </mesh>
      </RigidBody>
      {/* Bucket rope */}
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.6, 4]} />
        <meshStandardMaterial color="#C4A060" roughness={0.88} />
      </mesh>
      {/* Bucket */}
      <mesh castShadow position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.48, 7]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.95} />
      </mesh>
    </group>
  );
}

function MarketStall({
  cx, cz, ry = 0, awningColor = CANVAS_RED,
}: {
  cx: number; cz: number; ry?: number; awningColor?: string;
}) {
  const gY = getIslandHeight(cx, cz);
  const W = 8, D = 5, countH = 3.5;

  return (
    <group position={[cx, gY, cz]} rotation-y={ry}>
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        {/* Counter */}
        <mesh castShadow receiveShadow position={[0, countH / 2, 0]}>
          <boxGeometry args={[W, countH, D]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.92} metalness={0} />
        </mesh>
        {/* Top surface */}
        <mesh castShadow receiveShadow position={[0, countH + 0.15, 0]}>
          <boxGeometry args={[W, 0.3, D]} />
          <meshStandardMaterial color={WOOD_LIGHT} roughness={0.88} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Corner posts */}
      {[[-W/2+0.3, D/2-0.3], [W/2-0.3, D/2-0.3], [-W/2+0.3, -D/2+0.3], [W/2-0.3, -D/2+0.3]].map(
        ([ox, oz], i) => (
          <mesh key={i} castShadow position={[ox, countH + 2.5, oz]}>
            <cylinderGeometry args={[0.18, 0.22, 5, 5]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.92} />
          </mesh>
        )
      )}

      {/* Awning (tilted forward) */}
      <mesh castShadow position={[0, countH + 4.5, D / 2 + 0.8]} rotation-x={-0.35}>
        <boxGeometry args={[W + 1.5, 0.14, D + 2]} />
        <meshStandardMaterial color={awningColor} roughness={0.80} metalness={0}
          side={THREE.DoubleSide} />
      </mesh>
      {/* Awning stripes (lighter overlay) */}
      {[-2.5, 0, 2.5].map((ox, i) => (
        <mesh key={i} position={[ox, countH + 4.55, D / 2 + 0.8]}
          rotation-x={-0.35}>
          <boxGeometry args={[1.0, 0.16, D + 2]} />
          <meshStandardMaterial color="#f0e8d8" roughness={0.82} metalness={0}
            transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Goods on counter: pots/barrels */}
      {[-2, 1.2].map((ox, i) => (
        <mesh key={i} castShadow position={[ox, countH + 0.55, 0]}>
          <cylinderGeometry args={[0.30, 0.36, 0.80, 8]} />
          <meshStandardMaterial color={i === 0 ? "#8B4A14" : "#6B7040"} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Village palisade fence ─────────────────────────────────────────────────────
function VillagePalisade({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  const POST_SPACING = 4.0;
  const POST_H       = 6.0;
  const POST_R       = 0.28;
  const RAIL_H_LOW   = 1.8;
  const RAIL_H_HIGH  = 4.2;

  const hw = w / 2, hd = d / 2;

  // Compute ground height per post (sampled at the post position)
  function posts(axis: "x" | "z", fixed: number, from: number, to: number) {
    const count = Math.ceil((to - from) / POST_SPACING);
    return Array.from({ length: count + 1 }, (_, i) => {
      const t  = i / count;
      const at = from + t * (to - from);
      const px = axis === "x" ? at : fixed;
      const pz = axis === "z" ? at : fixed;
      const py = getIslandHeight(px, pz);
      return { px, py, pz };
    });
  }

  const northPosts = posts("x", cz + hd,  cx - hw, cx + hw);
  const southPosts = posts("x", cz - hd,  cx - hw, cx + hw);
  const eastPosts  = posts("z", cx + hw,  cz - hd, cz + hd);
  const westPosts  = posts("z", cx - hw,  cz - hd, cz + hd);

  // Leave a 6m gate gap in the north fence (entrance)
  const gateLo = cx - 4, gateHi = cx + 4;

  function renderSide(
    arr: { px: number; py: number; pz: number }[],
    side: "N" | "S" | "E" | "W",
  ) {
    return arr.map(({ px, py, pz }, i) => {
      // Skip gate posts
      if (side === "N" && px > gateLo && px < gateHi) return null;
      const isSharpened = true;
      return (
        <group key={i}>
          {/* Post shaft */}
          <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
            <mesh castShadow receiveShadow position={[px, py + POST_H / 2, pz]}>
              <cylinderGeometry args={[POST_R, POST_R * 1.2, POST_H, 6]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.96} metalness={0} />
            </mesh>
          </RigidBody>
          {/* Sharpened tip */}
          {isSharpened && (
            <mesh castShadow position={[px, py + POST_H + 0.5, pz]}>
              <coneGeometry args={[POST_R, 1.0, 6]} />
              <meshStandardMaterial color={WOOD_MID} roughness={0.95} metalness={0} />
            </mesh>
          )}
        </group>
      );
    });
  }

  // Horizontal rails between posts for a given side
  function renderRails(
    arr: { px: number; py: number; pz: number }[],
    side: "N" | "S" | "E" | "W",
  ) {
    return arr.slice(0, -1).map(({ px, py, pz }, i) => {
      const next = arr[i + 1];
      if (side === "N" && (px > gateLo || next.px > gateLo) && (px < gateHi || next.px < gateHi)) return null;
      const mx = (px + next.px) / 2;
      const my = (py + next.py) / 2;
      const mz = (pz + next.pz) / 2;
      const len = Math.sqrt((next.px - px) ** 2 + (next.pz - pz) ** 2);
      const ry  = side === "N" || side === "S" ? 0 : Math.PI / 2;
      return (
        <group key={i}>
          {[RAIL_H_LOW, RAIL_H_HIGH].map((rh, ri) => (
            <mesh key={ri} castShadow
              position={[mx, my + rh, mz]}
              rotation-y={ry}>
              <boxGeometry args={[len, 0.25, 0.25]} />
              <meshStandardMaterial color={WOOD_MID} roughness={0.94} metalness={0} />
            </mesh>
          ))}
        </group>
      );
    });
  }

  return (
    <>
      {renderSide(northPosts, "N")}
      {renderSide(southPosts, "S")}
      {renderSide(eastPosts,  "E")}
      {renderSide(westPosts,  "W")}
      {renderRails(northPosts, "N")}
      {renderRails(southPosts, "S")}
      {renderRails(eastPosts,  "E")}
      {renderRails(westPosts,  "W")}
    </>
  );
}

// ─── Gate arch (north entrance) ────────────────────────────────────────────────
function GateArch({ cx, cz }: { cx: number; cz: number }) {
  const hd  = TOWN_FENCE_D / 2;
  const gY  = getIslandHeight(cx, cz + hd);
  const archH = 8.0, archW = 10, postR = 0.4;

  return (
    <group position={[cx, gY, cz + hd]}>
      <RigidBody type="fixed" colliders="cuboid" collisionGroups={CG_WORLD}>
        {/* Left gate post */}
        <mesh castShadow receiveShadow position={[-archW / 2, archH / 2, 0]}>
          <cylinderGeometry args={[postR * 1.5, postR * 1.8, archH, 6]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.93} metalness={0} />
        </mesh>
        {/* Right gate post */}
        <mesh castShadow receiveShadow position={[ archW / 2, archH / 2, 0]}>
          <cylinderGeometry args={[postR * 1.5, postR * 1.8, archH, 6]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.93} metalness={0} />
        </mesh>
        {/* Arch lintel */}
        <mesh castShadow receiveShadow position={[0, archH + 0.6, 0]}>
          <boxGeometry args={[archW + 2.5, 1.2, 1.4]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.92} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Skull decoration on lintel */}
      <mesh castShadow position={[0, archH + 1.8, 0]}>
        <sphereGeometry args={[0.75, 8, 6]} />
        <meshStandardMaterial color="#f0ead8" roughness={0.65} metalness={0.05} />
      </mesh>
      {/* Eye sockets */}
      <mesh position={[-0.25, archH + 1.88, 0.65]}>
        <sphereGeometry args={[0.18, 5, 4]} />
        <meshStandardMaterial color="#111" roughness={0.3} />
      </mesh>
      <mesh position={[ 0.25, archH + 1.88, 0.65]}>
        <sphereGeometry args={[0.18, 5, 4]} />
        <meshStandardMaterial color="#111" roughness={0.3} />
      </mesh>

      {/* Torches on gate posts */}
      {[-archW / 2, archW / 2].map((ox, i) => (
        <mesh key={i} castShadow position={[ox, archH - 1, 0.6]}>
          <sphereGeometry args={[0.30, 6, 5]} />
          <meshStandardMaterial color={TORCH_ORG} roughness={0.3} metalness={0}
            emissive={new THREE.Color(TORCH_ORG)} emissiveIntensity={2.0} />
        </mesh>
      ))}

      {/* Pirate flag on top of lintel */}
      <mesh position={[0, archH + 4.5, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 6, 5]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.90} />
      </mesh>
      <mesh position={[1.5, archH + 7.2, 0]} rotation-y={0.15}>
        <planeGeometry args={[3.2, 2.0]} />
        <meshStandardMaterial color="#111111" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Village fire pit ──────────────────────────────────────────────────────────
function FirePit({ cx, cz }: { cx: number; cz: number }) {
  const gY    = getIslandHeight(cx, cz);
  const flameRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (flameRef.current) {
      flameRef.current.scale.y = 1 + Math.sin(t * 6.5) * 0.25;
      flameRef.current.scale.x = 1 + Math.sin(t * 5.2 + 0.7) * 0.15;
    }
  });

  return (
    <group position={[cx, gY, cz]}>
      {/* Stone ring */}
      <mesh receiveShadow position={[0, 0.18, 0]}>
        <torusGeometry args={[1.2, 0.28, 6, 16]} />
        <meshStandardMaterial color={STONE_GREY} roughness={0.97} metalness={0.02} />
      </mesh>
      {/* Log stack */}
      {[0, 1.05, 2.09].map((a, i) => (
        <mesh key={i} castShadow
          position={[Math.cos(a) * 0.5, 0.18, Math.sin(a) * 0.5]}
          rotation-y={a}>
          <cylinderGeometry args={[0.12, 0.16, 2.4, 5]} />
          <meshStandardMaterial color="#4a2e0e" roughness={0.98} />
        </mesh>
      ))}
      {/* Embers */}
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.55, 7, 4]} />
        <meshStandardMaterial color="#e05000" roughness={0.4} metalness={0}
          emissive={new THREE.Color("#e05000")} emissiveIntensity={1.2} />
      </mesh>
      {/* Animated flame */}
      <mesh ref={flameRef} castShadow position={[0, 0.85, 0]}>
        <coneGeometry args={[0.45, 1.8, 6]} />
        <meshStandardMaterial color={TORCH_ORG} roughness={0.35} metalness={0}
          emissive={new THREE.Color(TORCH_ORG)} emissiveIntensity={2.8}
          transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Pirate Village (assembly) ─────────────────────────────────────────────────
// Layout centred on (TOWN_CX, TOWN_CZ).
// North fence wall has the gate entrance.
const CHICKEN_POSITIONS: Array<[number, number, number]> = [
  [TOWN_CX - 30, TOWN_CZ + 20, 0.8],
  [TOWN_CX + 15, TOWN_CZ - 10, 2.1],
  [TOWN_CX - 20, TOWN_CZ - 30, 1.3],
  [TOWN_CX + 35, TOWN_CZ + 15, 0.4],
  [TOWN_CX - 10, TOWN_CZ + 40, 1.9],
];

function PirateVillage() {
  return (
    <>
      {/* ── Palisade fence + gate ─── */}
      <VillagePalisade cx={TOWN_CX} cz={TOWN_CZ} w={TOWN_FENCE_W} d={TOWN_FENCE_D} />
      <GateArch cx={TOWN_CX} cz={TOWN_CZ} />

      {/* ── Main tavern (centre of village) ─── */}
      <TavernBuilding cx={TOWN_CX} cz={TOWN_CZ} />

      {/* ── Huts around the tavern ─── */}
      <PirateHut cx={TOWN_CX - 50} cz={TOWN_CZ + 25}  ry={0.4} />
      <PirateHut cx={TOWN_CX + 48} cz={TOWN_CZ + 20}  ry={-0.3} />
      <PirateHut cx={TOWN_CX - 45} cz={TOWN_CZ - 28}  ry={1.2} />
      <PirateHut cx={TOWN_CX + 42} cz={TOWN_CZ - 30}  ry={-1.0} />

      {/* ── Watchtower ─── */}
      <Watchtower cx={TOWN_CX - 62} cz={TOWN_CZ} />

      {/* ── Market stalls ─── */}
      <MarketStall cx={TOWN_CX - 18} cz={TOWN_CZ - 48} ry={0}
        awningColor={CANVAS_RED} />
      <MarketStall cx={TOWN_CX + 18} cz={TOWN_CZ - 46} ry={0.15}
        awningColor={CANVAS_BLUE} />

      {/* ── Central well ─── */}
      <WellStructure cx={TOWN_CX + 10} cz={TOWN_CZ + 20} />

      {/* ── Fire pit in the square ─── */}
      <FirePit cx={TOWN_CX - 12} cz={TOWN_CZ + 15} />

      {/* ── Loose barrels + crates outside tavern ─── */}
      {[[TOWN_CX + 14, TOWN_CZ + 32], [TOWN_CX - 6, TOWN_CZ + 35]].map(
        ([bx, bz], i) => {
          const by = getIslandHeight(bx, bz);
          return (
            <mesh key={i} castShadow position={[bx, by + 0.55, bz]}>
              <cylinderGeometry args={[0.45, 0.52, 1.1, 10]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.96} />
            </mesh>
          );
        }
      )}

      {/* ── Chickens inside the fence ─── */}
      {CHICKEN_POSITIONS.map(([x, z, ry], i) => (
        <Chicken key={i} x={x} z={z} ry={ry} />
      ))}
    </>
  );
}

// ─── Wooden dock ───────────────────────────────────────────────────────────────
const PLANK_COUNT   = 18;
const DOCK_START_X  = 1040;
const DOCK_Z        =    0;
const PLANK_SPACING = 22.0;
const OCEAN_Y       = -0.40;

function Dock() {
  const planks = useMemo(() => {
    return Array.from({ length: PLANK_COUNT }, (_, i) => {
      const px       = DOCK_START_X + i * PLANK_SPACING;
      const terrainY = Math.max(OCEAN_Y + 0.10, getIslandHeight(px, DOCK_Z));
      const t  = i / (PLANK_COUNT - 1);
      const py = terrainY * (1 - t) + (OCEAN_Y + 0.10) * t;
      return { px, py };
    });
  }, []);

  const posts = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({ px: DOCK_START_X + i * 4.4 }));
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
          const terrainY = Math.max(OCEAN_Y + 0.10, getIslandHeight(px, DOCK_Z));
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
          <mesh key={i}
            position={[DOCK_START_X + (PLANK_COUNT / 2) * PLANK_SPACING, 6.5 + OCEAN_Y, side]}>
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
      mesh.geometry.computeBoundingBox();
      const bbox    = mesh.geometry.boundingBox ?? new THREE.Box3();
      const localCY = (bbox.min.y + bbox.max.y) * 0.5 + mesh.position.y;
      const worldY  = localCY * GLB_SCALE_Y + GLB_OFFSET_Y;
      const idx = meshIdx++;
      mesh.material = biomeMaterial(worldY, idx);
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
    const skirtH   = 30 * GENESIS_HEIGHT_SCALE;
    const skirtGeo = new THREE.BoxGeometry(GENESIS_TERRAIN_SIZE, skirtH, GENESIS_TERRAIN_SIZE);
    return { heights, skirtGeo };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightsReady]);

  const TS = GENESIS_TERRAIN_SIZE;

  return (
    <>
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

      <mesh geometry={skirtGeo} position={[0, -15 * GENESIS_HEIGHT_SCALE, 0]}>
        <meshStandardMaterial color="#b8955a" roughness={1} metalness={0} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1200, 0.5, 1200]} position={[0, -40, 0]} collisionGroups={CG_WORLD} />
      </RigidBody>

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
      <mesh rotation-x={-Math.PI / 2} position={[0, OCEAN_Y + 0.01, 0]}>
        <ringGeometry args={[700, 920, 96]} />
        <meshStandardMaterial color="#0a8f9e" transparent opacity={0.45}
          metalness={0.1} roughness={0.15} />
      </mesh>
    </>
  );
}

// ─── Pirate Island — main export ───────────────────────────────────────────────
export function PirateIsland() {
  const [heightsReady, setHeightsReady] = useState(isGenesisHeightsLoaded);
  useEffect(() => {
    if (heightsReady) return;
    const id = setInterval(() => {
      if (isGenesisHeightsLoaded()) { setHeightsReady(true); clearInterval(id); }
    }, 80);
    return () => clearInterval(id);
  }, [heightsReady]);

  return (
    <group>
      <IslandGround />

      <Suspense fallback={null}>
        <TerrainModel />
      </Suspense>

      <Ocean />

      {heightsReady && (
        <>
          {/* Trees */}
          <Suspense fallback={null}>
            {PALM_PLACEMENTS.map((p, i) =>
              p.h >= 13 ? (
                <JungleTree key={i} x={p.x} z={p.z} h={p.h} ry={p.ry} />
              ) : (
                <PalmTree key={i} x={p.x} z={p.z} h={p.h} ry={p.ry} />
              )
            )}
          </Suspense>

          {/* Rocks */}
          {ROCK_PLACEMENTS.map((r, i) => <RockCluster key={i} {...r} />)}

          {/* Ores */}
          {ORE_PLACEMENTS.map((o, i) => <OreVein key={i} {...o} />)}

          {/* Hemp */}
          {HEMP_POSITIONS.map(([x, z], i) => <HempPlant key={i} x={x} z={z} />)}

          {/* Wild flowers */}
          {FLOWER_DATA.map(([x, z, color], i) => (
            <WildFlower key={i} x={x} z={z} color={color} />
          ))}

          {/* Dock */}
          <Suspense fallback={null}>
            <Dock />
          </Suspense>

          {/* ── Pirate township + wildlife ──────────────────────────────── */}
          <Suspense fallback={null}>
            <PirateVillage />
          </Suspense>
        </>
      )}
    </group>
  );
}

useGLTF.preload("/models/genesis_island.glb");
