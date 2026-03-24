import { Suspense, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { GRAVEYARD, COLLIDE_TERRAIN } from "./assets/manifest";

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
// A solid 120×120 ground plane with a thick cuboid collider so nothing falls
// through, plus boundary walls to keep players inside.
function Ground() {
  return (
    <>
      {/* ── Main ground body ── */}
      <RigidBody type="fixed" colliders={false} friction={0.9} restitution={0}>
        {/* Thick slab: half-extents 60 × 0.5 × 60, top surface at y=0 */}
        <CuboidCollider
          args={[60, 0.5, 60]}
          position={[0, -0.5, 0]}
          collisionGroups={COLLIDE_TERRAIN}
        />

        {/* Visible ground mesh */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[120, 120, 40, 40]} />
          <meshStandardMaterial
            color="#1a1e12"
            roughness={1.0}
            metalness={0.0}
          />
        </mesh>

        {/* Subtle terrain variation — slightly raised patches */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial
            color="#161a10"
            roughness={1.0}
            transparent
            opacity={0.6}
          />
        </mesh>
      </RigidBody>

      {/* ── Boundary walls (invisible colliders) ── */}
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        <CuboidCollider args={[60, 8, 0.5]} position={[  0, 8, -60]} collisionGroups={COLLIDE_TERRAIN} />
        <CuboidCollider args={[60, 8, 0.5]} position={[  0, 8,  60]} collisionGroups={COLLIDE_TERRAIN} />
        <CuboidCollider args={[0.5, 8, 60]} position={[-60, 8,   0]} collisionGroups={COLLIDE_TERRAIN} />
        <CuboidCollider args={[0.5, 8, 60]} position={[ 60, 8,   0]} collisionGroups={COLLIDE_TERRAIN} />
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
        <group key={i} position={[x, 0, z]}>
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
        <group key={i} position={[x, 0, z]}>
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

      {DEAD_TREES.map(([x, y, z, ry], i) => (
        <DeadTree key={i} position={[x, y, z]} rotY={ry} />
      ))}

      {/* ── FBX ruin props (each wrapped in Suspense) ── */}
      {RUIN_PLACEMENTS.map(([modelNum, x, z, rotY, scale], i) => (
        <Suspense key={i} fallback={null}>
          <RuinProp
            modelNum={modelNum}
            position={[x, 0, z]}
            rotY={rotY}
            scale={scale}
          />
        </Suspense>
      ))}
    </group>
  );
}
