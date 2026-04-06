/**
 * Airship — procedural pirate airship orbiting the island.
 *
 * Orbit:  3 400 m from origin, 520 m altitude, 240-second revolution.
 * Ship always faces tangent to the orbit circle (heading = direction of travel).
 * Gentle altitude bob ±18 m and roll ±4° add atmospheric life.
 *
 * Geometry (all procedural, no external model needed):
 *   Envelope  — stretched sphere ~140 m long, dark brown canvas
 *   Gondola   — box hull with windows, lantern-yellow trim
 *   Fin × 4   — rear stabiliser fins
 *   Rigging   — 6 thin ropes from envelope to gondola
 *   Props × 2 — side paddle-wheel propellers that spin
 *   Mast      — central mast with skull-and-crossbones flag mesh
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Orbit constants ────────────────────────────────────────────────────────────
const ORBIT_RADIUS    = 7200;   // 2× — orbits beyond the expanded 12 000 m island
const ORBIT_ALTITUDE  = 2000;   // raised well above reachable terrain (~2× 520 m + headroom)
const ORBIT_PERIOD    = 280;    // slightly slower revolution to match larger orbit
const BOB_AMP         = 36;     // 2× bob amplitude to stay visually proportional
const BOB_FREQ        = 0.18;   // altitude bob frequency (rad/s)
const ROLL_AMP        = 0.07;   // banking roll amplitude (radians ≈ 4°)
const PROP_RPM        = 80;     // propeller rotation speed (RPM)

// ── Colours ────────────────────────────────────────────────────────────────────
const C_ENVELOPE  = new THREE.Color("#3a2a1a"); // dark oiled canvas
const C_ENVELOPE2 = new THREE.Color("#5a3a22"); // panel seam highlight
const C_GONDOLA   = new THREE.Color("#2e1f10"); // dark mahogany hull
const C_TRIM      = new THREE.Color("#c8920a"); // brass / lantern yellow
const C_ROPE      = new THREE.Color("#8a7040"); // hemp rope
const C_FIN       = new THREE.Color("#4a2a14"); // dark leather fin
const C_PROP      = new THREE.Color("#6a4820"); // wood prop blade

// ── Rope helper ────────────────────────────────────────────────────────────────
function Rope({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const geo = useMemo(() => {
    const dir   = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
    const len   = dir.length();
    const g     = new THREE.CylinderGeometry(0.25, 0.25, len, 4);
    return g;
  }, [from, to]);

  const midPos: [number,number,number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];

  const dir   = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const up    = new THREE.Vector3(0, 1, 0);
  const quat  = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());

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
      {/* Pole */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 16, 6]} />
        <meshStandardMaterial color="#5a3a10" roughness={0.9} />
      </mesh>
      {/* Flag cloth */}
      <mesh position={[4, 14, 0]}>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#111" side={THREE.DoubleSide} roughness={1} />
      </mesh>
      {/* Skull outline (white cross as stand-in) */}
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
      {/* Hub */}
      <mesh>
        <sphereGeometry args={[1.5, 8, 8]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* 4 blades */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * 7, Math.sin(angle) * 7, 0]}
          rotation={[0, 0, angle]}
        >
          <boxGeometry args={[3.5, 9, 0.6]} />
          <meshStandardMaterial color={C_PROP} roughness={0.85} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Airship() {
  const groupRef   = useRef<THREE.Group>(null!);
  const propLRef   = useRef<THREE.Group>(null!);
  const propRRef   = useRef<THREE.Group>(null!);
  const timeRef    = useRef(0);

  const propSpeed = (PROP_RPM * 2 * Math.PI) / 60; // rad/s

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;

    // Orbit angle
    const angle = (t / ORBIT_PERIOD) * Math.PI * 2;

    // World position — bob adds natural breathing
    const wx = Math.cos(angle) * ORBIT_RADIUS;
    const wy = ORBIT_ALTITUDE + Math.sin(t * BOB_FREQ) * BOB_AMP;
    const wz = Math.sin(angle) * ORBIT_RADIUS;

    groupRef.current.position.set(wx, wy, wz);

    // Heading — ship faces direction of travel (tangent to circle)
    // tangent = (-sin, 0, cos), so rotation Y = angle + π/2
    groupRef.current.rotation.y = -(angle + Math.PI / 2);

    // Gentle banking roll
    groupRef.current.rotation.z = Math.sin(t * BOB_FREQ * 0.5) * ROLL_AMP;

    // Spin propellers
    if (propLRef.current) propLRef.current.rotation.z += propSpeed * delta;
    if (propRRef.current) propRRef.current.rotation.z -= propSpeed * delta;
  });

  // Rigging attachment points: 4 corners of envelope underside → gondola corners
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

      {/* ── Envelope (gas bag) ── */}
      <mesh scale={[140, 22, 22]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={C_ENVELOPE} roughness={0.88} metalness={0.05} />
      </mesh>

      {/* Envelope panel seams (slightly smaller overlay, different colour) */}
      <mesh scale={[138, 20, 20]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={C_ENVELOPE2} roughness={0.95} metalness={0}
          wireframe={false} transparent opacity={0.35} />
      </mesh>

      {/* ── Gondola hull ── */}
      <mesh position={[0, -20, 0]} castShadow>
        <boxGeometry args={[55, 10, 14]} />
        <meshStandardMaterial color={C_GONDOLA} roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Gondola keel (bottom ridge) */}
      <mesh position={[0, -25, 0]}>
        <boxGeometry args={[50, 2, 8]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Gondola window strip */}
      <mesh position={[0, -18, 7.1]}>
        <boxGeometry args={[40, 3, 0.4]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.3} metalness={0.7} emissive={C_TRIM} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, -18, -7.1]}>
        <boxGeometry args={[40, 3, 0.4]} />
        <meshStandardMaterial color={C_TRIM} roughness={0.3} metalness={0.7} emissive={C_TRIM} emissiveIntensity={0.4} />
      </mesh>

      {/* ── Rear stabiliser fins (4× cross shape) ── */}
      {/* Top fin */}
      <mesh position={[-62, 8, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[22, 18, 1.5]} />
        <meshStandardMaterial color={C_FIN} roughness={0.92} />
      </mesh>
      {/* Bottom fin */}
      <mesh position={[-62, -6, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[22, 14, 1.5]} />
        <meshStandardMaterial color={C_FIN} roughness={0.92} />
      </mesh>
      {/* Port fin */}
      <mesh position={[-62, 0, 10]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[22, 1.5, 14]} />
        <meshStandardMaterial color={C_FIN} roughness={0.92} />
      </mesh>
      {/* Starboard fin */}
      <mesh position={[-62, 0, -10]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[22, 1.5, 14]} />
        <meshStandardMaterial color={C_FIN} roughness={0.92} />
      </mesh>

      {/* ── Rigging ropes ── */}
      {rigPts.map(([f, t], i) => (
        <Rope key={i} from={f} to={t} />
      ))}

      {/* ── Propellers (port & starboard) ── */}
      <Propeller x={20}  propRef={propLRef} />
      <Propeller x={-20} propRef={propRRef} />

      {/* ── Mast + flag ── */}
      <SkullFlag y={22} />

      {/* ── Bow lantern (emissive warm light) ── */}
      <mesh position={[72, -18, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color="#ffcc44" emissive="#ffaa00" emissiveIntensity={2.0} />
      </mesh>
      <pointLight position={[72, -18, 0]} color="#ffaa44" intensity={80} distance={120} />

      {/* ── Stern lantern ── */}
      <mesh position={[-72, -18, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color="#ffcc44" emissive="#ffaa00" emissiveIntensity={2.0} />
      </mesh>
      <pointLight position={[-72, -18, 0]} color="#ffaa44" intensity={80} distance={120} />

    </group>
  );
}
