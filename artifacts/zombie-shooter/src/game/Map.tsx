import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";

// Static fixed rigid body — wraps each environmental mesh so the
// Rapier character controller can resolve collisions against them.

function Building({ position, size, color }: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" friction={0.4}>
      <mesh position={[position[0], position[1] + size[1] / 2, position[2]]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}

function Tree({ position }: { position: [number, number, number] }) {
  // Trees are purely visual — no collider (thin trunks add clutter to the nav)
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 3, 6]} />
        <meshStandardMaterial color="#5c3a1e" roughness={1} />
      </mesh>
      <mesh position={[0, 4, 0]} castShadow>
        <coneGeometry args={[1.5, 3, 7]} />
        <meshStandardMaterial color="#2d5a27" roughness={1} />
      </mesh>
      <mesh position={[0, 5.5, 0]} castShadow>
        <coneGeometry args={[1.0, 2.5, 7]} />
        <meshStandardMaterial color="#3a6e33" roughness={1} />
      </mesh>
    </group>
  );
}

function Barrel({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="hull" friction={0.5}>
      <group position={[position[0], 0, position[2]]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.9, 8]} />
          <meshStandardMaterial color="#8b4513" roughness={0.8} metalness={0.2} />
        </mesh>
      </group>
    </RigidBody>
  );
}

// ─── Boundary wall helper (invisible collider + visible mesh) ─────────────────
function BoundaryWall({ position, size }: {
  position: [number, number, number];
  size: [number, number, number];
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" friction={0.2}>
      <mesh position={position} receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#4a4a4a" roughness={1} />
      </mesh>
    </RigidBody>
  );
}

export function Map() {
  const buildings = useMemo(() => [
    { pos: [-20, 0, -15] as [number,number,number], size: [6, 8, 6]   as [number,number,number], color: "#666" },
    { pos: [20,  0, -15] as [number,number,number], size: [8, 10, 6]  as [number,number,number], color: "#777" },
    { pos: [-25, 0,  15] as [number,number,number], size: [5, 6, 7]   as [number,number,number], color: "#5a5a5a" },
    { pos: [25,  0,  15] as [number,number,number], size: [7, 9, 5]   as [number,number,number], color: "#6a6a6a" },
    { pos: [0,   0, -30] as [number,number,number], size: [10, 12, 6] as [number,number,number], color: "#707070" },
    { pos: [-35, 0,  -5] as [number,number,number], size: [5, 7, 8]   as [number,number,number], color: "#606060" },
    { pos: [35,  0,  -5] as [number,number,number], size: [5, 7, 8]   as [number,number,number], color: "#686868" },
    { pos: [0,   0,  35] as [number,number,number], size: [8, 5, 5]   as [number,number,number], color: "#5c5c5c" },
    { pos: [-15, 0,  30] as [number,number,number], size: [6, 6, 6]   as [number,number,number], color: "#6f6f6f" },
    { pos: [15,  0,  30] as [number,number,number], size: [5, 8, 5]   as [number,number,number], color: "#686868" },
  ], []);

  const trees = useMemo(() => [
    [-10, 0, 10], [10, 0, 10], [-10, 0, -10], [10, 0, -10],
    [-8, 0, 25], [8, 0, 25], [-30, 0, -25], [30, 0, -25],
    [-40, 0, 20], [40, 0, -30], [-40, 0, -40], [40, 0, 40],
    [-5, 0, -5], [5, 0, 5], [-5, 0, 5], [5, 0, -5],
  ] as [number,number,number][], []);

  const barrels = useMemo(() => [
    [-12, 0, 0], [12, 0, 0], [-3, 0, -8], [3, 0, -8],
    [-15, 0, -12], [15, 0, -12], [0, 0, 12],
  ] as [number,number,number][], []);

  return (
    <group>
      {/* ── Ground plane (static rapier collider) ── */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.8} restitution={0}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[100, 100, 1, 1]} />
          <meshStandardMaterial color="#3a4a2a" roughness={1} />
        </mesh>
      </RigidBody>

      {/* Road markings (purely visual) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[8, 100]} />
        <meshStandardMaterial color="#2a3520" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[100, 8]} />
        <meshStandardMaterial color="#2a3520" roughness={1} />
      </mesh>

      {buildings.map((b, i) => (
        <Building key={i} position={b.pos} size={b.size} color={b.color} />
      ))}

      {trees.map((t, i) => (
        <Tree key={i} position={t} />
      ))}

      {barrels.map((b, i) => (
        <Barrel key={i} position={b} />
      ))}

      {/* ── Boundary walls ── */}
      <BoundaryWall position={[-50, 5, 0]}   size={[1, 10, 100]} />
      <BoundaryWall position={[ 50, 5, 0]}   size={[1, 10, 100]} />
      <BoundaryWall position={[0,  5, -50]}  size={[100, 10, 1]} />
      <BoundaryWall position={[0,  5,  50]}  size={[100, 10, 1]} />

      {/* Courtyard platform */}
      <mesh position={[0, 0.05, -20]} receiveShadow>
        <boxGeometry args={[15, 0.1, 15]} />
        <meshStandardMaterial color="#555" roughness={0.9} />
      </mesh>
    </group>
  );
}
