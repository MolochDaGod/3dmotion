/**
 * Airship — procedural pirate airship orbiting Genesis Island.
 *
 * Orbit:  elliptical path directly over the island land mass.
 *   X semi-axis 1000 m, Z semi-axis 1600 m, Z centre 750 m.
 *   This sweeps from east coast (x ≈ 1000) to west coast (x ≈ -1000)
 *   and from south beach (z ≈ -850) to north bay (z ≈ 2350).
 * Altitude: 1800 m + ±20 m gentle bob.
 * Period:   140 s.
 *
 * Exported:
 *   AIRSHIP_SPAWN_POS  — world position on top of the gondola at t=0
 *                         (used by Game.tsx as the battle-royale drop origin)
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Orbit constants ────────────────────────────────────────────────────────────
const ORBIT_X_RADIUS  = 1000;   // east-west semi-axis (island is ~2040 m wide)
const ORBIT_Z_RADIUS  = 1600;   // north-south semi-axis (island is ~3440 m deep)
const ORBIT_Z_CENTER  = 750;    // northward shift so orbit is centered over land
const ORBIT_ALTITUDE  = 1800;   // metres MSL — tall enough for a 20 s freefall
const ORBIT_PERIOD    = 140;    // seconds per revolution
const BOB_AMP         = 20;     // ± altitude bob
const BOB_FREQ        = 0.18;
const ROLL_AMP        = 0.07;
const PROP_RPM        = 80;

// ── Gondola is ~35 m below the envelope centre; spawn on top of envelope ──────
export const AIRSHIP_SPAWN_POS: [number, number, number] = [
  ORBIT_X_RADIUS,           // x at angle = 0  (east coast, near the dock)
  ORBIT_ALTITUDE + 30,      // y: top of gas envelope
  ORBIT_Z_CENTER,           // z at angle = 0
];

// ── Colours ────────────────────────────────────────────────────────────────────
const C_ENVELOPE  = new THREE.Color("#3a2a1a");
const C_ENVELOPE2 = new THREE.Color("#5a3a22");
const C_GONDOLA   = new THREE.Color("#2e1f10");
const C_TRIM      = new THREE.Color("#c8920a");
const C_ROPE      = new THREE.Color("#8a7040");
const C_FIN       = new THREE.Color("#4a2a14");
const C_PROP      = new THREE.Color("#6a4820");

// ── Rope helper ────────────────────────────────────────────────────────────────
function Rope({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const geo = useMemo(() => {
    const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
    return new THREE.CylinderGeometry(0.25, 0.25, dir.length(), 4);
  }, [from, to]);

  const midPos: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  const dir  = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.normalize()
  );

  return (
    <mesh geometry={geo} position={midPos} quaternion={quat}>
      <meshStandardMaterial color={C_ROPE} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// ── Flag helper ────────────────────────────────────────────────────────────────
function SkullFlag({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 16, 6]} />
        <meshStandardMaterial color="#5a3a10" roughness={0.9} />
      </mesh>
      <mesh position={[4, 14, 0]}>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#111" side={THREE.DoubleSide} roughness={1} />
      </mesh>
      <mesh position={[4, 14.5, 0.1]}>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color="#eee" side={THREE.DoubleSide} roughness={1} />
      </mesh>
    </group>
  );
}

// ── Propeller ─────────────────────────────────────────────────────────────────
function Propeller({ x, propRef }: { x: number; propRef: React.RefObject<THREE.Group> }) {
  return (
    <group ref={propRef} position={[x, -5, 8]}>
      <mesh>
        <sphereGeometry args={[1.5, 8, 8]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.4} metalness={0.6} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
        <mesh key={i} position={[Math.cos(angle) * 7, Math.sin(angle) * 7, 0]} rotation={[0, 0, angle]}>
          <boxGeometry args={[3.5, 9, 0.6]} />
          <meshStandardMaterial color={C_PROP} roughness={0.85} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Airship() {
  const groupRef = useRef<THREE.Group>(null!);
  const propLRef = useRef<THREE.Group>(null!);
  const propRRef = useRef<THREE.Group>(null!);
  const timeRef  = useRef(0);

  const propSpeed = (PROP_RPM * 2 * Math.PI) / 60;

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t     = timeRef.current;
    const angle = (t / ORBIT_PERIOD) * Math.PI * 2;

    // Elliptical orbit centred at (0, ORBIT_Z_CENTER) in XZ
    const wx = ORBIT_X_RADIUS * Math.cos(angle);
    const wy = ORBIT_ALTITUDE + Math.sin(t * BOB_FREQ) * BOB_AMP;
    const wz = ORBIT_Z_CENTER + ORBIT_Z_RADIUS * Math.sin(angle);

    groupRef.current.position.set(wx, wy, wz);

    // Heading — tangent to ellipse (approximate: dx/dt, dz/dt normalised)
    const dx = -ORBIT_X_RADIUS * Math.sin(angle);
    const dz =  ORBIT_Z_RADIUS * Math.cos(angle);
    groupRef.current.rotation.y = -Math.atan2(dx, dz);
    groupRef.current.rotation.z = Math.sin(t * BOB_FREQ * 0.5) * ROLL_AMP;

    if (propLRef.current) propLRef.current.rotation.z += propSpeed * delta;
    if (propRRef.current) propRRef.current.rotation.z -= propSpeed * delta;
  });

  const rigPts: Array<[[number,number,number],[number,number,number]]> = [
    [[ 40, -8,  10], [ 20, -16,  8]],
    [[ 40, -8, -10], [ 20, -16, -8]],
    [[-40, -8,  10], [-20, -16,  8]],
    [[-40, -8, -10], [-20, -16, -8]],
    [[  0, -14,  10], [  0, -16,  8]],
    [[  0, -14, -10], [  0, -16, -8]],
  ];

  return (
    <group ref={groupRef}>
      {/* ── Gas envelope ── */}
      <mesh scale={[140, 22, 22]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={C_ENVELOPE} roughness={0.88} metalness={0.05} />
      </mesh>
      <mesh scale={[138, 20, 20]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={C_ENVELOPE2} roughness={0.95} metalness={0} transparent opacity={0.35} />
      </mesh>

      {/* ── Gondola hull ── */}
      <mesh position={[0, -20, 0]} castShadow>
        <boxGeometry args={[55, 10, 14]} />
        <meshStandardMaterial color={C_GONDOLA} roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[0, -25, 0]}>
        <boxGeometry args={[50, 2, 8]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, -18, 7.1]}>
        <boxGeometry args={[40, 3, 0.4]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.3} metalness={0.7} emissive={C_TRIM} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, -18, -7.1]}>
        <boxGeometry args={[40, 3, 0.4]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.3} metalness={0.7} emissive={C_TRIM} emissiveIntensity={0.4} />
      </mesh>

      {/* ── Rear stabiliser fins ── */}
      <mesh position={[-62, 8,  0]} rotation={[0, 0,  0.18]}><boxGeometry args={[22, 18, 1.5]} /><meshStandardMaterial color={C_FIN} roughness={0.92} /></mesh>
      <mesh position={[-62,-6,  0]} rotation={[0, 0, -0.18]}><boxGeometry args={[22, 14, 1.5]} /><meshStandardMaterial color={C_FIN} roughness={0.92} /></mesh>
      <mesh position={[-62, 0,  10]} rotation={[ 0.18, 0, 0]}><boxGeometry args={[22, 1.5, 14]} /><meshStandardMaterial color={C_FIN} roughness={0.92} /></mesh>
      <mesh position={[-62, 0, -10]} rotation={[-0.18, 0, 0]}><boxGeometry args={[22, 1.5, 14]} /><meshStandardMaterial color={C_FIN} roughness={0.92} /></mesh>

      {/* ── Rigging ── */}
      {rigPts.map(([f, t], i) => <Rope key={i} from={f} to={t} />)}

      {/* ── Propellers ── */}
      <Propeller x={20}  propRef={propLRef} />
      <Propeller x={-20} propRef={propRRef} />

      {/* ── Mast + flag ── */}
      <SkullFlag y={22} />

      {/* ── Lanterns ── */}
      <mesh position={[72, -18, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color="#ffcc44" emissive="#ffaa00" emissiveIntensity={2.0} />
      </mesh>
      <pointLight position={[72, -18, 0]} color="#ffaa44" intensity={80} distance={120} />
      <mesh position={[-72, -18, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color="#ffcc44" emissive="#ffaa00" emissiveIntensity={2.0} />
      </mesh>
      <pointLight position={[-72, -18, 0]} color="#ffaa44" intensity={80} distance={120} />
    </group>
  );
}
