import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Sky, Stars } from "@react-three/drei";
import * as THREE_TYPES from "three";
import * as THREE from "three";
import { Player } from "./Player";
import { Zombie, ZombieData } from "./Zombie";
import { Bullet, BulletData } from "./Bullet";
import { Map } from "./Map";
import { HUD } from "./HUD";
import { useGameStore } from "./useGameStore";

interface GameProps {
  onGameOver: (score: number) => void;
}

let bulletIdCounter = 0;
let zombieIdCounter = 0;

const MAX_ZOMBIES = 18;
const BULLET_HIT_RADIUS = 1.0;

const SPAWN_POSITIONS: [number, number, number][] = [
  [45, 0, 0], [-45, 0, 0], [0, 0, 45], [0, 0, -45],
  [45, 0, 45], [-45, 0, 45], [45, 0, -45], [-45, 0, -45],
  [30, 0, 45], [-30, 0, 45], [30, 0, -45], [-30, 0, -45],
];

function spawnZombie(wave: number): ZombieData {
  const pos = SPAWN_POSITIONS[Math.floor(Math.random() * SPAWN_POSITIONS.length)];
  const jitter = () => (Math.random() - 0.5) * 6;
  return {
    id: `zombie-${++zombieIdCounter}`,
    position: new THREE.Vector3(pos[0] + jitter(), 0, pos[2] + jitter()),
    health: 50 + wave * 10,
    maxHealth: 50 + wave * 10,
    speed: 1.5 + wave * 0.3,
    isDead: false,
    attackCooldown: 0,
  };
}

function SceneContent({
  zombies,
  bullets,
  playerPosRef,
  onShoot,
  onBulletExpire,
  onZombieDied,
  onDamagePlayer,
  onPlayerDead,
}: {
  zombies: ZombieData[];
  bullets: BulletData[];
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  onShoot: (pos: THREE.Vector3, dir: THREE.Vector3) => void;
  onBulletExpire: (id: string) => void;
  onZombieDied: (id: string) => void;
  onDamagePlayer: (amount: number) => void;
  onPlayerDead: () => void;
}) {
  return (
    <>
      <Sky sunPosition={[100, 20, 100]} turbidity={10} rayleigh={1} />
      <Stars radius={200} depth={50} count={500} factor={3} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[30, 50, 20]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={150}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <pointLight position={[0, 8, 0]} intensity={0.3} color="#ffaa44" />

      <Map />

      <Player
        onShoot={onShoot}
        onDead={onPlayerDead}
        playerPosRef={playerPosRef}
      />

      {bullets.map((b) => (
        <Bullet key={b.id} data={b} onExpire={onBulletExpire} />
      ))}

      {zombies.map((z) => (
        <Zombie
          key={z.id}
          data={z}
          playerPosition={playerPosRef}
          onDamagePlayer={onDamagePlayer}
          onDied={onZombieDied}
        />
      ))}
    </>
  );
}

export default function Game({ onGameOver }: GameProps) {
  const [zombies, setZombies] = useState<ZombieData[]>(() => [
    spawnZombie(1), spawnZombie(1), spawnZombie(1),
  ]);
  const [bullets, setBullets] = useState<BulletData[]>([]);
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const { takeDamage, addScore, addKill, score, wave, nextWave, kills } = useGameStore();
  const killCountRef = useRef(kills);
  const waveRef = useRef(wave);

  useEffect(() => { killCountRef.current = kills; }, [kills]);
  useEffect(() => { waveRef.current = wave; }, [wave]);

  const handleShoot = useCallback((position: THREE.Vector3, direction: THREE.Vector3) => {
    const newBullet: BulletData = {
      id: `bullet-${++bulletIdCounter}`,
      position: position.clone(),
      direction: direction.clone().normalize(),
      speed: 35,
      lifetime: 2.5,
    };

    setBullets((prev) => [...prev, newBullet]);

    // Collect kills BEFORE calling setState so we don't mutate store inside updater
    let killsScored = 0;
    let scoreGained = 0;

    setZombies((prev) => {
      return prev.map((z) => {
        if (z.isDead) return z;
        const dist = z.position.distanceTo(position);
        if (dist > 40) return z;
        const toZombie = new THREE.Vector3().subVectors(
          z.position.clone().add(new THREE.Vector3(0, 1, 0)),
          position
        );
        const cross = new THREE.Vector3().crossVectors(direction, toZombie);
        const perp = cross.length() / direction.length();
        if (perp < BULLET_HIT_RADIUS && toZombie.dot(direction) > 0) {
          const dmg = 30 + Math.random() * 20;
          const newHealth = z.health - dmg;
          if (newHealth <= 0) {
            killsScored += 1;
            scoreGained += 100 + waveRef.current * 50;
            return { ...z, health: 0, isDead: true };
          }
          return { ...z, health: newHealth };
        }
        return z;
      });
    });

    // Apply store updates after state update is committed
    if (killsScored > 0) {
      setTimeout(() => {
        for (let i = 0; i < killsScored; i++) addKill();
        addScore(scoreGained);
      }, 0);
    }
  }, [addKill, addScore]);

  const handleBulletExpire = useCallback((id: string) => {
    setBullets((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const handleZombieDied = useCallback((id: string) => {
    setZombies((prev) => prev.filter((z) => z.id !== id));
  }, []);

  const handleDamagePlayer = useCallback((amount: number) => {
    takeDamage(amount);
  }, [takeDamage]);

  const handlePlayerDead = useCallback(() => {
    onGameOver(score);
  }, [onGameOver, score]);

  useEffect(() => {
    const interval = setInterval(() => {
      setZombies((prev) => {
        if (prev.length >= MAX_ZOMBIES) return prev;
        const currentWave = waveRef.current;
        const count = Math.min(2, MAX_ZOMBIES - prev.length);
        return [...prev, ...Array.from({ length: count }, () => spawnZombie(currentWave))];
      });
      if (killCountRef.current >= waveRef.current * 10) {
        nextWave();
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [nextWave]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  return (
    <div className="fixed inset-0 bg-black cursor-none">
      <Canvas
        shadows={{ type: THREE_TYPES.PCFShadowMap }}
        camera={{ fov: 70, near: 0.05, far: 500 }}
        gl={{ antialias: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <SceneContent
          zombies={zombies}
          bullets={bullets}
          playerPosRef={playerPosRef}
          onShoot={handleShoot}
          onBulletExpire={handleBulletExpire}
          onZombieDied={handleZombieDied}
          onDamagePlayer={handleDamagePlayer}
          onPlayerDead={handlePlayerDead}
        />
      </Canvas>
      <HUD />
    </div>
  );
}
