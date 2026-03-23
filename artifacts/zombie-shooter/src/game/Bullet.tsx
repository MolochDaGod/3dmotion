import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface BulletData {
  id: string;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  lifetime: number;
}

interface BulletProps {
  data: BulletData;
  onExpire: (id: string) => void;
}

export function Bullet({ data, onExpire }: BulletProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const age = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    age.current += delta;
    if (age.current >= data.lifetime) {
      onExpire(data.id);
      return;
    }
    meshRef.current.position.addScaledVector(data.direction, data.speed * delta);
    data.position.copy(meshRef.current.position);
  });

  return (
    <mesh ref={meshRef} position={data.position.toArray()}>
      <sphereGeometry args={[0.06, 4, 4]} />
      <meshStandardMaterial
        color="#ffdd44"
        emissive="#ffaa00"
        emissiveIntensity={2}
      />
    </mesh>
  );
}
