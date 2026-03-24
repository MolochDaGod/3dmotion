import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MagicProjectileState, SpellType, useGameStore } from "./useGameStore";

// ─── Trail particle pool ───────────────────────────────────────────────────────

const TRAIL_COUNT = 32;

function OrbTrail({ color, coreColor }: { color: string; coreColor: string }) {
  const meshRef   = useRef<THREE.InstancedMesh>(null!);
  const dataRef   = useRef<{ pos: THREE.Vector3; age: number; life: number }[]>([]);
  const dummy     = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < dataRef.current.length; i++) {
      const p = dataRef.current[i];
      dummy.position.copy(p.pos);
      const t = 1 - p.age / p.life;
      dummy.scale.setScalar(t * 0.18);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TRAIL_COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} />
    </instancedMesh>
  );
}

// ─── Orb projectile ───────────────────────────────────────────────────────────

function OrbProjectile({ color, coreColor }: { color: string; coreColor: string }) {
  const outerRef = useRef<THREE.Mesh>(null!);
  const innerRef = useRef<THREE.Mesh>(null!);
  const haloRef  = useRef<THREE.Mesh>(null!);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    if (outerRef.current) outerRef.current.rotation.y = t.current * 2.1;
    if (innerRef.current) innerRef.current.rotation.z = t.current * 3.3;
    if (haloRef.current) {
      const pulse = 1 + Math.sin(t.current * 8) * 0.12;
      haloRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group>
      {/* Outer energy shell */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2.5}
          transparent
          opacity={0.35}
          wireframe
        />
      </mesh>
      {/* Inner dense core */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={6}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Soft glow halo */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.42, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} />
      </mesh>
      {/* Point light */}
      <pointLight color={color} intensity={3} distance={5} />
    </group>
  );
}

// ─── Javelin (elongated bolt) ──────────────────────────────────────────────────

function JavelinProjectile({ color, coreColor }: { color: string; coreColor: string }) {
  const glowRef  = useRef<THREE.Mesh>(null!);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    if (glowRef.current) glowRef.current.rotation.z = t.current * 18;
  });

  return (
    <group>
      {/* Main bolt body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.01, 1.2, 8]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={8}
        />
      </mesh>
      {/* Energy glow around bolt */}
      <mesh ref={glowRef} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.02, 1.0, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      {/* Tip flare */}
      <mesh position={[0, 0, -0.6]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={10}
        />
      </mesh>
      <pointLight color={color} intensity={2.5} distance={4} />
    </group>
  );
}

// ─── Wave (expanding ring) ─────────────────────────────────────────────────────

function WaveProjectile({ color, coreColor, age }: { color: string; coreColor: string; age: number }) {
  const ringRef  = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);
  const t = useRef(0);

  useFrame((_, dt) => { t.current += dt; });

  // Wave grows as it moves — scales with age
  const r = 0.3 + age * 1.5;

  return (
    <group>
      {/* Leading ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r, 0.06, 8, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={4}
          transparent
          opacity={Math.max(0, 0.85 - age * 0.4)}
        />
      </mesh>
      {/* Inner secondary ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 0.7, 0.03, 6, 24]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={6}
          transparent
          opacity={Math.max(0, 0.6 - age * 0.3)}
        />
      </mesh>
      <pointLight color={color} intensity={3} distance={6} />
    </group>
  );
}

// ─── Nova (area burst — stationary) ───────────────────────────────────────────

function NovaProjectile({ color, coreColor, age }: { color: string; coreColor: string; age: number }) {
  const t   = useRef(0);
  const r   = age * 5;        // expands quickly
  const op  = Math.max(0, 0.9 - age * 1.2);

  useFrame((_, dt) => { t.current += dt; });

  return (
    <group>
      {/* Expanding fireball shell */}
      <mesh>
        <sphereGeometry args={[Math.max(0.05, r), 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={3}
          transparent
          opacity={op * 0.6}
        />
      </mesh>
      {/* Inner bright core */}
      <mesh>
        <sphereGeometry args={[Math.max(0.05, r * 0.5), 12, 12]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={8}
          transparent
          opacity={op}
        />
      </mesh>
      {/* Shockwave ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[Math.max(0.1, r * 1.2), 0.1, 8, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={5}
          transparent
          opacity={op * 0.8}
        />
      </mesh>
      <pointLight color={color} intensity={8 * op} distance={r * 3 + 2} />
    </group>
  );
}

// ─── Single projectile instance ────────────────────────────────────────────────

interface ProjectileProps {
  data: MagicProjectileState;
  onHit: (id: string, pos: THREE.Vector3, spell: MagicProjectileState["spell"]) => void;
}

export function MagicProjectileInstance({ data, onHit }: ProjectileProps) {
  const groupRef  = useRef<THREE.Group>(null!);
  const pos       = useRef(new THREE.Vector3(...data.position));
  const dir       = useRef(new THREE.Vector3(...data.direction).normalize());
  const age       = useRef(0);
  const hitFired  = useRef(false);

  const removeMagicProjectile = useGameStore((s) => s.removeMagicProjectile);
  const { spell } = data;

  useFrame((_, dt) => {
    age.current += dt;

    // Despawn after max life
    if (age.current > data.maxLife) {
      removeMagicProjectile(data.id);
      return;
    }

    // Move projectile (nova is stationary)
    if (spell.speed > 0) {
      pos.current.addScaledVector(dir.current, spell.speed * dt);
    }

    if (groupRef.current) {
      groupRef.current.position.copy(pos.current);
    }

    // Orient javelin along travel direction
    if (spell.id === "javelin" && groupRef.current) {
      groupRef.current.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        dir.current,
      );
    }
  });

  const a = age.current;

  const visuals: Record<SpellType, React.ReactNode> = {
    orb:     <OrbProjectile     color={spell.color} coreColor={spell.coreColor} />,
    javelin: <JavelinProjectile color={spell.color} coreColor={spell.coreColor} />,
    wave:    <WaveProjectile    color={spell.color} coreColor={spell.coreColor} age={a} />,
    nova:    <NovaProjectile    color={spell.color} coreColor={spell.coreColor} age={a} />,
  };

  return (
    <group ref={groupRef} position={pos.current.toArray()}>
      {visuals[spell.id]}
    </group>
  );
}

// ─── Manager: renders all active projectiles ──────────────────────────────────

interface MagicSystemProps {
  onProjectileHit: (id: string, pos: THREE.Vector3, spell: MagicProjectileState["spell"]) => void;
}

export function MagicSystem({ onProjectileHit }: MagicSystemProps) {
  const projectiles = useGameStore((s) => s.magicProjectiles);
  return (
    <>
      {projectiles.map((p) => (
        <MagicProjectileInstance key={p.id} data={p} onHit={onProjectileHit} />
      ))}
    </>
  );
}
