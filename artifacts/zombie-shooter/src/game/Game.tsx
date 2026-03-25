import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import {
  EffectComposer, Bloom, Vignette, DepthOfField, ChromaticAberration,
} from "@react-three/postprocessing";
import { Sky } from "@react-three/drei";
import { Perf } from "r3f-perf";
import * as THREE_TYPES from "three";
import * as THREE from "three";
import { getTerrainHeight } from "./terrain";
import { Player } from "./Player";
import { Zombie, ZombieData } from "./Zombie";
import { Bullet, BulletData } from "./Bullet";
import { Graveyard, NAV_OBSTACLES } from "./Graveyard";
import { NavWorkerProvider } from "./NavWorkerContext";
import { useCharacterStore } from "./useCharacterStore";
import { HUD } from "./HUD";
import { MagicSystem } from "./MagicProjectile";
import { SpellRadial } from "./SpellRadial";
import { useGameStore, MagicProjectileState } from "./useGameStore";
import { ProgressBridge, LoadingScreen } from "./LoadingScreen";
import { useEditorStore } from "./useEditorStore";

// ─── Skill hit payload ────────────────────────────────────────────────────────
// Player resolves who got hit (via Rapier shape cast or geometry) then calls
// onSkillHit with either a list of zombie IDs (shape-based) or a ray origin+dir
// (for ranged skills). Game.tsx applies damage in both cases.
export interface SkillHitPayload {
  zombieIds?: string[];                     // shape-cast result
  origin?:    THREE.Vector3;                // ray-based: start point
  dir?:       THREE.Vector3;                // ray-based: direction
  damage:     number;
  range:      number;
  arcDeg:     number;
}

interface GameProps {
  onGameOver: (score: number) => void;
}

let bulletIdCounter = 0;
let zombieIdCounter = 0;

const MAX_ZOMBIES       = 18;
const BULLET_HIT_RADIUS = 1.0;
const MELEE_RANGE       = 2.6;
const MELEE_DAMAGE      = 80;
const MELEE_ARC_DOT     = 0.35;

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
    position: new THREE.Vector3(pos[0] + jitter(), getTerrainHeight(pos[0], pos[2]), pos[2] + jitter()),
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
  onMelee,
  onSkillHit,
  onBulletExpire,
  onZombieDied,
  onDamagePlayer,
  onPlayerDead,
  onMagicHit,
  onLoadProgress,
  onLoaded,
}: {
  zombies: ZombieData[];
  bullets: BulletData[];
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  onShoot:      (pos: THREE.Vector3, dir: THREE.Vector3) => void;
  onMelee:      (pos: THREE.Vector3, dir: THREE.Vector3) => void;
  onSkillHit:   (payload: SkillHitPayload) => void;
  onBulletExpire: (id: string) => void;
  onZombieDied:   (id: string) => void;
  onDamagePlayer: (amount: number) => void;
  onPlayerDead:   () => void;
  onMagicHit: (id: string, pos: THREE.Vector3, spell: MagicProjectileState["spell"]) => void;
  onLoadProgress: (p: number) => void;
  onLoaded:       () => void;
}) {
  const ed = useEditorStore();
  const { activeId } = useCharacterStore();

  // ChromaticAberration expects a THREE.Vector2 — rebuild only when strength changes
  const caOffset = useMemo(
    () => new THREE.Vector2(ed.chromaticStrength, ed.chromaticStrength),
    [ed.chromaticStrength]
  );

  return (
    <>
      {/* ── Performance overlay (F2 or toggle from editor panel) ── */}
      {ed.showPerf && <Perf position="top-left" />}

      {/* ── Daytime atmosphere ── */}
      <fog attach="fog" args={["#c9dff0", ed.fogNear, ed.fogFar]} />
      <color attach="background" args={["#87ceeb"]} />

      {/* Procedural sky — sun high in south-east */}
      <Sky
        distance={4500}
        sunPosition={[100, 35, -80]}
        inclination={0.52}
        azimuth={0.18}
        turbidity={7}
        rayleigh={1.2}
        mieCoefficient={0.004}
        mieDirectionalG={0.82}
      />

      {/* ── Sunlight — intensities driven by editor store ── */}
      <ambientLight intensity={ed.ambientIntensity} color="#ffe8d0" />
      <directionalLight
        position={[60, 90, -50]}
        intensity={ed.sunIntensity}
        color="#fff5e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={220}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
      />
      {/* Cool sky-blue fill from the opposite (north) side */}
      <directionalLight position={[-40, 30, 50]} intensity={0.35} color="#c0d8f5" />

      {/* ── All physics bodies — player, graveyard, AND zombie sensors ── */}
      {/* NavWorkerProvider creates ONE shared A* Web Worker for all zombies. */}
      <NavWorkerProvider obstacles={NAV_OBSTACLES}>
        <Physics gravity={[0, -22, 0]} timeStep="vary">
          <Graveyard />
          {/* key={activeId} forces a clean remount when the character changes. */}
          <Player
            key={activeId}
            onShoot={onShoot}
            onMelee={onMelee}
            onSkillHit={onSkillHit}
            onDead={onPlayerDead}
            playerPosRef={playerPosRef}
          />

          {/* Zombies inside Physics so their Rapier sensor bodies are registered */}
          {zombies.map((z) => (
            <Zombie
              key={z.id}
              data={z}
              playerPosition={playerPosRef}
              onDamagePlayer={onDamagePlayer}
              onDied={onZombieDied}
            />
          ))}
        </Physics>
      </NavWorkerProvider>

      {bullets.map((b) => (
        <Bullet key={b.id} data={b} onExpire={onBulletExpire} />
      ))}

      {/* Magic projectile VFX — lives outside Physics since projectiles fly freely */}
      <MagicSystem onProjectileHit={onMagicHit} />

      {/* ── Post-processing pipeline ───────────────────────────────────────────
           Bloom         — spell glow, torches, emissive surfaces
           DepthOfField  — subtle cinematic background blur (editor-tunable)
           Vignette      — edge darkening for immersive framing
           Chromatic     — barrel/lens aberration (0 by default, editor can crank up)   */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={ed.bloomThreshold}
          luminanceSmoothing={ed.bloomSmoothing}
          intensity={ed.bloomIntensity}
          mipmapBlur
        />
        <DepthOfField
          focusDistance={ed.dofFocusDistance}
          focalLength={ed.dofFocalLength}
          bokehScale={ed.dofBokehScale}
        />
        <Vignette
          eskil={false}
          offset={ed.vignetteOffset}
          darkness={ed.vignetteDarkness}
        />
        <ChromaticAberration offset={caOffset} />
      </EffectComposer>

      {/* ── Asset load progress bridge (must be inside Canvas) ── */}
      <ProgressBridge onProgress={onLoadProgress} onLoaded={onLoaded} />
    </>
  );
}

export default function Game({ onGameOver }: GameProps) {
  const [zombies, setZombies] = useState<ZombieData[]>(() => [
    spawnZombie(1), spawnZombie(1), spawnZombie(1),
  ]);
  const [bullets, setBullets] = useState<BulletData[]>([]);
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 0));

  // ── Asset loading state ───────────────────────────────────────────────────
  const [loadProgress,  setLoadProgress]  = useState(0);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [showOverlay,   setShowOverlay]   = useState(true);

  const handleLoadProgress = useCallback((p: number) => setLoadProgress(p), []);
  const handleLoaded       = useCallback(() => setIsLoaded(true), []);

  // Remove overlay from DOM after fade-out finishes (600 ms transition)
  useEffect(() => {
    if (!isLoaded) return;
    const t = setTimeout(() => setShowOverlay(false), 650);
    return () => clearTimeout(t);
  }, [isLoaded]);

  const {
    takeDamage, addScore, addKill, score, wave, nextWave, kills,
    removeMagicProjectile,
  } = useGameStore();

  const { cycleNext: cycleCharacter } = useCharacterStore();

  // ── 'N' key — cycle through character skins ───────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyN") cycleCharacter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleCharacter]);

  const killCountRef = useRef(kills);
  const waveRef      = useRef(wave);

  useEffect(() => { killCountRef.current = kills; }, [kills]);
  useEffect(() => { waveRef.current = wave; }, [wave]);

  // A* grid is now initialised inside navWorker.ts (Web Worker thread).
  // No sync initNavGrid call needed on the main thread.

  // ── Bullet shoot ────────────────────────────────────────────────────────────
  const handleShoot = useCallback((position: THREE.Vector3, direction: THREE.Vector3) => {
    const newBullet: BulletData = {
      id: `bullet-${++bulletIdCounter}`,
      position: position.clone(),
      direction: direction.clone().normalize(),
      speed: 35,
      lifetime: 2.5,
    };
    setBullets((prev) => [...prev, newBullet]);

    let killsScored = 0;
    let scoreGained = 0;
    setZombies((prev) => prev.map((z) => {
      if (z.isDead) return z;
      const dist = z.position.distanceTo(position);
      if (dist > 40) return z;
      const toZombie = new THREE.Vector3().subVectors(
        z.position.clone().add(new THREE.Vector3(0, 1, 0)), position);
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
    }));
    if (killsScored > 0) {
      setTimeout(() => { for (let i = 0; i < killsScored; i++) addKill(); addScore(scoreGained); }, 0);
    }
  }, [addKill, addScore]);

  // ── Melee hit ───────────────────────────────────────────────────────────────
  const handleMelee = useCallback((origin: THREE.Vector3, direction: THREE.Vector3) => {
    let killsScored = 0;
    let scoreGained = 0;
    setZombies((prev) => prev.map((z) => {
      if (z.isDead) return z;
      const toZ = z.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
      const dist = toZ.length();
      if (dist > MELEE_RANGE) return z;
      const dot = direction.clone().normalize().dot(toZ.clone().normalize());
      if (dot < MELEE_ARC_DOT) return z;
      const newHealth = z.health - MELEE_DAMAGE;
      if (newHealth <= 0) {
        killsScored += 1;
        scoreGained += 50 + waveRef.current * 25;
        return { ...z, health: 0, isDead: true };
      }
      return { ...z, health: newHealth };
    }));
    if (killsScored > 0) {
      setTimeout(() => { for (let i = 0; i < killsScored; i++) addKill(); addScore(scoreGained); }, 0);
    }
  }, [addKill, addScore]);

  // ── Magic projectile hit ─────────────────────────────────────────────────────
  // Called by MagicSystem when a projectile needs to be checked for zombie hits.
  // The projectile checks its own position each frame; this handles AoE and
  // proximity checks against the live zombie list.
  const handleMagicHit = useCallback((
    id: string,
    pos: THREE.Vector3,
    spell: MagicProjectileState["spell"],
  ) => {
    removeMagicProjectile(id);

    let killsScored = 0;
    let scoreGained = 0;

    setZombies((prev) => prev.map((z) => {
      if (z.isDead) return z;
      const zPos = z.position.clone().add(new THREE.Vector3(0, 1, 0));
      const dist = zPos.distanceTo(pos);
      if (dist > spell.radius + 1.2) return z;
      const newHealth = z.health - spell.damage;
      if (newHealth <= 0) {
        killsScored += 1;
        scoreGained += 120 + waveRef.current * 60;
        return { ...z, health: 0, isDead: true };
      }
      return { ...z, health: newHealth };
    }));

    if (killsScored > 0) {
      setTimeout(() => { for (let i = 0; i < killsScored; i++) addKill(); addScore(scoreGained); }, 0);
    }
  }, [addKill, addScore, removeMagicProjectile]);

  // ── Skill hit — called by Player after Rapier shape cast or ray check ─────────
  const handleSkillHit = useCallback((payload: SkillHitPayload) => {
    const { damage, range, arcDeg } = payload;
    const halfArcRad = (arcDeg / 2) * (Math.PI / 180);

    let killsScored = 0;
    let scoreGained = 0;

    setZombies((prev) => prev.map((z) => {
      if (z.isDead) return z;

      let hit = false;

      if (payload.zombieIds) {
        // Shape-cast path: Player already resolved IDs via Rapier
        hit = payload.zombieIds.includes(z.id);
      } else if (payload.origin && payload.dir) {
        // Ray path: re-run geometry check (ranged skills, multi-ray)
        const zCenter = z.position.clone().add(new THREE.Vector3(0, 1, 0));
        const toZ     = zCenter.sub(payload.origin);
        const dist    = toZ.length();
        if (dist <= range) {
          const dot = payload.dir.clone().normalize().dot(toZ.clone().normalize());
          hit = dot >= Math.cos(halfArcRad);
        }
      }

      if (!hit) return z;

      const newHealth = z.health - damage;
      if (newHealth <= 0) {
        killsScored += 1;
        scoreGained += 80 + waveRef.current * 40;
        return { ...z, health: 0, isDead: true };
      }
      return { ...z, health: newHealth };
    }));

    if (killsScored > 0) {
      setTimeout(() => {
        for (let i = 0; i < killsScored; i++) addKill();
        addScore(scoreGained);
      }, 0);
    }
  }, [addKill, addScore]);

  const handleBulletExpire  = useCallback((id: string) => setBullets((p) => p.filter((b) => b.id !== id)), []);
  const handleZombieDied    = useCallback((id: string) => setZombies((p) => p.filter((z) => z.id !== id)), []);
  const handleDamagePlayer  = useCallback((amount: number) => takeDamage(amount), [takeDamage]);
  const handlePlayerDead    = useCallback(() => onGameOver(score), [onGameOver, score]);

  // ── Wave spawner ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const cap = useEditorStore.getState().maxZombies;
      setZombies((prev) => {
        if (prev.length >= cap) return prev;
        const currentWave = waveRef.current;
        const count = Math.min(2, cap - prev.length);
        return [...prev, ...Array.from({ length: count }, () => spawnZombie(currentWave))];
      });
      if (killCountRef.current >= waveRef.current * 10) nextWave();
    }, 3500);
    return () => clearInterval(interval);
  }, [nextWave]);

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
          onMelee={handleMelee}
          onSkillHit={handleSkillHit}
          onBulletExpire={handleBulletExpire}
          onZombieDied={handleZombieDied}
          onDamagePlayer={handleDamagePlayer}
          onPlayerDead={handlePlayerDead}
          onMagicHit={handleMagicHit}
          onLoadProgress={handleLoadProgress}
          onLoaded={handleLoaded}
        />
      </Canvas>

      {/* ── Loading screen (fades out when assets ready, unmounts after transition) ── */}
      {showOverlay && (
        <div
          style={{
            position:      "absolute",
            inset:         0,
            transition:    "opacity 0.6s ease-out",
            opacity:       isLoaded ? 0 : 1,
            pointerEvents: isLoaded ? "none" : "auto",
          }}
        >
          <LoadingScreen progress={loadProgress} />
        </div>
      )}

      <HUD />
      <SpellRadial />
    </div>
  );
}
