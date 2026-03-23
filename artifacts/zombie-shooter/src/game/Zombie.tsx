import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface ZombieData {
  id: string;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  speed: number;
  isDead: boolean;
  attackCooldown: number;
}

interface ZombieProps {
  data: ZombieData;
  playerPosition: React.MutableRefObject<THREE.Vector3>;
  onDamagePlayer: (amount: number) => void;
  onDied: (id: string) => void;
}

const ATTACK_RANGE = 1.8;
const ATTACK_DAMAGE = 10;
const ATTACK_COOLDOWN = 1.5;

export function Zombie({ data, playerPosition, onDamagePlayer, onDied }: ZombieProps) {
  const meshRef = useRef<THREE.Group>(null!);
  const localCooldown = useRef(data.attackCooldown);
  const deadTimer = useRef(0);
  const dyingRef = useRef(false);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.copy(data.position);
    }
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (data.isDead) {
      if (!dyingRef.current) {
        dyingRef.current = true;
      }
      deadTimer.current += delta;
      meshRef.current.position.y = Math.max(-1.5, meshRef.current.position.y - delta * 2);
      meshRef.current.rotation.x = Math.min(Math.PI / 2, meshRef.current.rotation.x + delta * 3);
      if (deadTimer.current > 1.5) {
        onDied(data.id);
      }
      return;
    }

    const dir = new THREE.Vector3()
      .subVectors(playerPosition.current, meshRef.current.position);
    const dist = dir.length();

    if (dist < ATTACK_RANGE) {
      localCooldown.current -= delta;
      if (localCooldown.current <= 0) {
        onDamagePlayer(ATTACK_DAMAGE);
        localCooldown.current = ATTACK_COOLDOWN;
      }
    } else {
      dir.normalize();
      meshRef.current.position.addScaledVector(dir, data.speed * delta);
    }

    data.position.copy(meshRef.current.position);

    const angle = Math.atan2(
      playerPosition.current.x - meshRef.current.position.x,
      playerPosition.current.z - meshRef.current.position.z
    );
    meshRef.current.rotation.y = angle;
  });

  const healthPct = data.health / data.maxHealth;
  const bodyColor = data.isDead ? "#555" : "#6b7c4f";
  const headColor = data.isDead ? "#444" : "#8a7a5a";

  return (
    <group ref={meshRef} position={data.position.toArray()}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.9, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.26, 8, 8]} />
        <meshStandardMaterial color={headColor} roughness={0.9} />
      </mesh>
      <mesh position={[0.38, 1.2, 0]} rotation={[0, 0, -0.5]} castShadow>
        <boxGeometry args={[0.11, 0.52, 0.11]} />
        <meshStandardMaterial color={bodyColor} roughness={0.9} />
      </mesh>
      <mesh position={[-0.38, 1.2, 0]} rotation={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[0.11, 0.52, 0.11]} />
        <meshStandardMaterial color={bodyColor} roughness={0.9} />
      </mesh>
      <mesh position={[0.14, 0.2, 0]} castShadow>
        <boxGeometry args={[0.13, 0.45, 0.13]} />
        <meshStandardMaterial color="#3a3a2a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.14, 0.2, 0]} castShadow>
        <boxGeometry args={[0.13, 0.45, 0.13]} />
        <meshStandardMaterial color="#3a3a2a" roughness={0.9} />
      </mesh>
      {!data.isDead && (
        <group position={[0, 2.1, 0]}>
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[0.8, 0.08]} />
            <meshBasicMaterial color="#333" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(0.4 - healthPct * 0.4), 0, 0.01]}>
            <planeGeometry args={[0.8 * healthPct, 0.08]} />
            <meshBasicMaterial
              color={healthPct > 0.5 ? "#4caf50" : healthPct > 0.25 ? "#ff9800" : "#f44336"}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
