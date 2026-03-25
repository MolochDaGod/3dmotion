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

// ─── Ruin layout ───────────────────────────────────────────────────────────────
// [modelNum(1-21), x, z, rotY, scale]
// Scale = 1.0 lets FBXLoader's unit conversion (cm→m) give real-world sizing.
// Increase if ruins appear too small after first load.
type RuinEntry = [number, number, number, number, number];

const RUIN_PLACEMENTS: RuinEntry[] = [
  // ── Inner graveyard cluster ─────────────────────────────────────────────────
  [1,   -9,  -14, 0.00, 1.0],
  [2,   10,  -11, 0.70, 1.0],
  [3,  -15,    6, 2.10, 1.1],
  [4,   15,    8, 1.50, 0.9],
  [5,    1,  -21, 0.30, 1.1],
  // ── Mid ring ────────────────────────────────────────────────────────────────
  [6,  -22,  -18, 1.00, 1.0],
  [7,   23,  -17, 3.00, 1.0],
  [8,  -25,   13, 0.50, 1.1],
  [9,   24,   11, 2.50, 1.2],
  [10,   0,   23, 1.80, 0.9],
  [11, -13,   21, 0.00, 1.0],
  [12,  13,   19, 2.00, 1.0],
  // ── Outer ring ──────────────────────────────────────────────────────────────
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
// Loaded with FBXLoader, shared graveyard texture applied to every sub-mesh.
// Wrapped in a fixed Rapier body with convex-hull collider.
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
    // Mutate in-place (each FBX url is cached once, loaded once per component).
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY      = false;
    fbx.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        const mat = new THREE.MeshStandardMaterial({
          map:       texture,
          roughness: 0.90,
          metalness: 0.05,
          color:     new THREE.Color(0xccbbaa),
        });
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(() => mat.clone())
          : mat;
      }
    });
    return fbx;
  }, [fbx, texture]);

  return (
    <RigidBody
      type="fixed"
      colliders="hull"
      friction={0.5}
      restitution={0}
      position={position}
      rotation={[0, rotY, 0]}
    >
      <primitive object={obj} scale={scale} />
    </RigidBody>
  );
}

// ─── Graveyard ground ─────────────────────────────────────────────────────────
// Uses a Rapier HeightfieldCollider so the physics surface exactly matches
// the visual mesh. Nothing can fall through — a safety-net floor at y=-25
// catches any edge case. Boundary walls keep everything inside the arena.
function Ground() {
  // Build height data once — same function drives both physics and visuals.
  const heights = useMemo(() => buildTerrainHeightArray(), []);

  // Visual terrain: PlaneGeometry vertices displaced to match the heightfield.
  const terrainGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS,
    );
    geo.rotateX(-Math.PI / 2); // lie flat in XZ plane
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Thick skirt geometry — a box that hangs below the lowest possible terrain
  // point so you never see "the edge of the world" even at oblique angles.
  const skirtGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(TERRAIN_SIZE + 4, 10, TERRAIN_SIZE + 4);
    return geo;
  }, []);

  return (
    <>
      {/* ── Heightfield physics body ── */}
      <RigidBody type="fixed" colliders={false} friction={0.9} restitution={0}>
        {/*
          Rapier HeightfieldCollider args: [nrows, ncols, heights, scale]
          - nrows / ncols = number of QUAD rows/cols (so TERRAIN_SEGS = 63)
          - heights: Float32Array length (nrows+1)*(ncols+1) = 64*64
          - scale: world size of the heightfield {x, y, z}
        */}
        <HeightfieldCollider
          args={[
            TERRAIN_SEGS,
            TERRAIN_SEGS,
            Array.from(heights),
            { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE },
          ]}
        />

        {/* Visual surface — vertices exactly match the collision shape */}
        <mesh geometry={terrainGeo} receiveShadow castShadow={false}>
          <meshStandardMaterial
            color="#141810"
            roughness={1.0}
            metalness={0.0}
          />
        </mesh>

        {/* Skirt — solid earth below the terrain so the world looks thick */}
        <mesh geometry={skirtGeo} position={[0, -7, 0]} castShadow={false}>
          <meshStandardMaterial
            color="#191d11"
            roughness={1.0}
            metalness={0.0}
          />
        </mesh>
      </RigidBody>

      {/* ── Safety-net floor — catches anything that somehow gets past the heightfield ── */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[80, 0.5, 80]} position={[0, -25, 0]} />
      </RigidBody>

      {/* ── Boundary walls (invisible colliders) ── */}
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        <CuboidCollider args={[62, 12, 0.5]} position={[  0, 4, -62]} />
        <CuboidCollider args={[62, 12, 0.5]} position={[  0, 4,  62]} />
        <CuboidCollider args={[0.5, 12, 62]} position={[-62, 4,   0]} />
        <CuboidCollider args={[0.5, 12, 62]} position={[ 62, 4,   0]} />
      </RigidBody>
    </>
  );
}

// ─── Graveyard dirt mounds (purely visual) ────────────────────────────────────
// Roughly hemispherical dark-earth bumps to suggest buried graves.
const GRAVE_MOUNDS: [number, number, number][] = [
  [-6, 0, -8], [6, 0, -8], [-4, 0, -16], [4, 0, -16],
  [-18, 0, -10], [18, 0, -10], [-16, 0, 4], [16, 0, 4],
  [0, 0, -6], [-10, 0, 2], [10, 0, 2], [-2, 0, -24],
];

function GraveMounds() {
  return (
    <>
      {GRAVE_MOUNDS.map(([x, , z], i) => (
        <group key={i} position={[x, getTerrainHeight(x, z), z]}>
          <mesh rotation={[-Math.PI / 2, 0, i * 0.6]} receiveShadow>
            <cylinderGeometry args={[0.55, 0.8, 0.22, 8]} />
            <meshStandardMaterial color="#14180e" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ─── Dead trees ───────────────────────────────────────────────────────────────
const DEAD_TREES: [number, number, number, number][] = [
  [-10, 0, 10, 0],  [10, 0, 12, 0.5],
  [-12, 0, -8, 1],  [12, 0, -8, 0.7],
  [-30, 0, -26, 0], [30, 0, -26, 1.3],
  [-42, 0, 20, 0],  [42, 0, -30, 0.9],
  [-7, 0, -5, 0],   [7, 0, -5, 0.4],
  [-5, 0, 18, 0],   [5, 0, 20, 1.2],
];

function DeadTree({ position, rotY }: { position: [number,number,number]; rotY: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* Trunk */}
      <mesh position={[0, 2.2, 0]} rotation={[0.05, 0, 0.04]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.28, 4.4, 6]} />
        <meshStandardMaterial color="#1c1610" roughness={1} />
      </mesh>
      {/* Branch 1 */}
      <mesh position={[0.6, 3.8, 0]} rotation={[0, 0, 0.7]} castShadow>
        <cylinderGeometry args={[0.05, 0.10, 1.4, 5]} />
        <meshStandardMaterial color="#181410" roughness={1} />
      </mesh>
      {/* Branch 2 */}
      <mesh position={[-0.5, 3.4, 0.2]} rotation={[0.1, 0.3, -0.5]} castShadow>
        <cylinderGeometry args={[0.04, 0.09, 1.2, 5]} />
        <meshStandardMaterial color="#161210" roughness={1} />
      </mesh>
    </group>
  );
}

// ─── Torch flames (visual point-light warmth) ─────────────────────────────────
const TORCH_POSITIONS: [number, number, number][] = [
  [-8, 0, -8], [8, 0, -8], [-8, 0, 8], [8, 0, 8],
];

function Torches() {
  return (
    <>
      {TORCH_POSITIONS.map(([x, , z], i) => (
        <group key={i} position={[x, getTerrainHeight(x, z), z]}>
          {/* Pole */}
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 1.8, 5]} />
            <meshStandardMaterial color="#2a1a0a" roughness={1} />
          </mesh>
          {/* Flame light */}
          <pointLight
            position={[0, 2.0, 0]}
            intensity={18}
            distance={12}
            color="#ff6622"
            castShadow={false}
          />
          {/* Flame mesh */}
          <mesh position={[0, 1.98, 0]}>
            <sphereGeometry args={[0.14, 6, 6]} />
            <meshStandardMaterial
              color="#ffaa33"
              emissive="#ff7700"
              emissiveIntensity={4}
              transparent
              opacity={0.85}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ─── Graveyard (public export) ────────────────────────────────────────────────
export function Graveyard() {
  return (
    <group>
      {/* ── Ground + boundary walls ── */}
      <Ground />

      {/* ── Terrain decoration ── */}
      <GraveMounds />
      <Torches />

      {DEAD_TREES.map(([x, , z, ry], i) => (
        <DeadTree key={i} position={[x, getTerrainHeight(x, z), z]} rotY={ry} />
      ))}

      {/* ── FBX ruin props (each wrapped in Suspense) ── */}
      {/* Base embedded 1 m into the terrain surface at each prop's (x,z) */}
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
