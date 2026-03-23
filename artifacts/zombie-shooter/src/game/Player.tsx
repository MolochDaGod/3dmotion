import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "./useGameStore";

interface PlayerProps {
  onShoot: (position: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead: () => void;
}

const MOVE_SPEED = 5;
const SPRINT_SPEED = 9;
const JUMP_FORCE = 8;
const GRAVITY = -20;
const MOUSE_SENSITIVITY = 0.002;

export function Player({ onShoot, onDead }: PlayerProps) {
  const playerRef = useRef<THREE.Group>(null!);
  const velocityY = useRef(0);
  const isOnGround = useRef(true);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const isPointerLocked = useRef(false);
  const deadFired = useRef(false);
  const shootCooldown = useRef(0);

  const { camera } = useThree();
  const { health, shoot, reload, ammo, isReloading } = useGameStore();

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPointerLocked.current) return;
    yaw.current -= e.movementX * MOUSE_SENSITIVITY;
    pitch.current -= e.movementY * MOUSE_SENSITIVITY;
    pitch.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, pitch.current));
  }, []);

  const handleClick = useCallback(() => {
    if (!isPointerLocked.current) {
      document.body.requestPointerLock();
      return;
    }
    if (shootCooldown.current > 0 || isReloading) return;
    const fired = shoot();
    if (fired) {
      shootCooldown.current = 0.15;
      const dir = new THREE.Vector3(0, 0, -1)
        .applyEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
      const pos = playerRef.current.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      onShoot(pos, dir);
    } else if (ammo <= 0) {
      reload();
    }
  }, [shoot, reload, ammo, isReloading, onShoot]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = true;
    if (e.code === "KeyR") reload();
  }, [reload]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = false;
  }, []);

  const handlePointerLockChange = useCallback(() => {
    isPointerLocked.current = document.pointerLockElement === document.body;
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
    };
  }, [handleMouseMove, handleClick, handleKeyDown, handleKeyUp, handlePointerLockChange]);

  useFrame((_, delta) => {
    if (!playerRef.current) return;

    if (health <= 0 && !deadFired.current) {
      deadFired.current = true;
      onDead();
      return;
    }

    if (shootCooldown.current > 0) shootCooldown.current -= delta;

    const sprint = keys.current["ShiftLeft"] || keys.current["ShiftRight"];
    const speed = sprint ? SPRINT_SPEED : MOVE_SPEED;

    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const move = new THREE.Vector3();
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) move.add(forward);
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) move.sub(forward);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) move.sub(right);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) move.add(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * delta);

    playerRef.current.position.add(move);

    if (keys.current["Space"] && isOnGround.current) {
      velocityY.current = JUMP_FORCE;
      isOnGround.current = false;
    }

    velocityY.current += GRAVITY * delta;
    playerRef.current.position.y += velocityY.current * delta;

    if (playerRef.current.position.y <= 0) {
      playerRef.current.position.y = 0;
      velocityY.current = 0;
      isOnGround.current = true;
    }

    const mapHalf = 49;
    playerRef.current.position.x = Math.max(-mapHalf, Math.min(mapHalf, playerRef.current.position.x));
    playerRef.current.position.z = Math.max(-mapHalf, Math.min(mapHalf, playerRef.current.position.z));

    const cameraOffset = new THREE.Vector3(0, 2.5, 5)
      .applyEuler(new THREE.Euler(pitch.current * 0.5, yaw.current, 0, "YXZ"));
    const targetPos = playerRef.current.position.clone().add(cameraOffset).add(new THREE.Vector3(0, 1, 0));
    camera.position.lerp(targetPos, 0.15);

    const lookAt = playerRef.current.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    camera.lookAt(lookAt);

    playerRef.current.rotation.y = yaw.current;
  });

  return (
    <group ref={playerRef} position={[0, 0, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 1.0, 4, 8]} />
        <meshStandardMaterial color="#4a90d9" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshStandardMaterial color="#f4c896" roughness={0.8} />
      </mesh>
      <mesh position={[0.4, 1.3, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.12, 0.55, 0.12]} />
        <meshStandardMaterial color="#4a90d9" roughness={0.7} />
      </mesh>
      <mesh position={[0.55, 1.05, -0.2]} rotation={[0.5, 0, 0.1]} castShadow>
        <boxGeometry args={[0.08, 0.35, 0.15]} />
        <meshStandardMaterial color="#333" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[-0.4, 1.3, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.12, 0.55, 0.12]} />
        <meshStandardMaterial color="#4a90d9" roughness={0.7} />
      </mesh>
      <mesh position={[0.15, 0.22, 0]} castShadow>
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.15, 0.22, 0]} castShadow>
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.9} />
      </mesh>
    </group>
  );
}
