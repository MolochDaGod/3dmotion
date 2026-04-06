/**
 * GhostPlayers — renders translucent capsule meshes for remote MMO players.
 * Shown on the same map as the local player only.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useMMOStore, RemotePlayer } from "./useMMOStore";

const GHOST_COLOR   = "#39ff14";   // neon green ghost tint
const LERP_FACTOR   = 0.18;        // smooth remote position lerp

function GhostMesh({ player, map }: { player: RemotePlayer; map: string }) {
  const groupRef = useRef<THREE.Group>(null!);
  const target   = useRef(new THREE.Vector3(player.x, player.y, player.z));
  const yawRef   = useRef(player.yaw);

  useFrame(() => {
    target.current.set(player.x, player.y, player.z);
    if (groupRef.current) {
      groupRef.current.position.lerp(target.current, LERP_FACTOR);
      yawRef.current = THREE.MathUtils.lerp(yawRef.current, player.yaw, LERP_FACTOR);
      groupRef.current.rotation.y = yawRef.current;
    }
  });

  if (player.map !== map) return null;

  return (
    <group ref={groupRef} position={[player.x, player.y, player.z]}>
      {/* Capsule body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.35, 1.0, 6, 8]} />
        <meshStandardMaterial
          color={GHOST_COLOR}
          transparent
          opacity={0.38}
          emissive={GHOST_COLOR}
          emissiveIntensity={0.35}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>

      {/* Username label */}
      <Text
        position={[0, 1.8, 0]}
        fontSize={0.28}
        color={GHOST_COLOR}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
        renderOrder={999}
        depthTest={false}
      >
        {player.username}
      </Text>

      {/* HP bar */}
      <mesh position={[0, 1.55, 0]}>
        <planeGeometry args={[0.6, 0.06]} />
        <meshBasicMaterial color="#222" />
      </mesh>
      <mesh position={[-0.3 + (player.hp / 100) * 0.3, 1.55, 0.001]}>
        <planeGeometry args={[(player.hp / 100) * 0.6, 0.06]} />
        <meshBasicMaterial color={player.hp > 50 ? "#22c55e" : "#ef4444"} />
      </mesh>
    </group>
  );
}

interface Props { map: string }

export function GhostPlayers({ map }: Props) {
  const players = useMMOStore((s) => s.remotePlayers);

  return (
    <>
      {[...players.values()].map((p) => (
        <GhostMesh key={p.id} player={p} map={map} />
      ))}
    </>
  );
}
