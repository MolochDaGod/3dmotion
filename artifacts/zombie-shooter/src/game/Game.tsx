import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import {
  EffectComposer, Bloom, Vignette, SMAA,
} from "@react-three/postprocessing";
import { Sky } from "@react-three/drei";
import { Perf } from "r3f-perf";
import * as THREE_TYPES from "three";
import * as THREE from "three";
// WebGPURenderer is lazy-loaded at runtime so Vite never eagerly traverses the
// Three.js node-graph during the dev-server scan phase.  The dynamic import()
// below runs only in browsers that actually have navigator.gpu.
import { getIslandHeight, getTerrainHeight, GENESIS_TERRAIN_SIZE, isGenesisHeightsLoaded } from "./terrain";
import { Player } from "./Player";
import { Zombie, ZombieData } from "./Zombie";
import { Bullet, BulletData } from "./Bullet";
import { PirateIsland, NAV_OBSTACLES as ISLAND_NAV_OBSTACLES } from "./PirateIsland";
import { Airship, AIRSHIP_SPAWN_POS, AIRSHIP_GONDOLA_DECK_Y } from "./Airship";
import { Graveyard,   NAV_OBSTACLES as GRAVEYARD_NAV_OBSTACLES } from "./Graveyard";
import { NavWorkerProvider } from "./NavWorkerContext";
import { useCharacterStore } from "./useCharacterStore";
import { HUD } from "./HUD";
import { MagicSystem } from "./MagicProjectile";
import { SpellRadial } from "./SpellRadial";
import { useGameStore, MagicProjectileState } from "./useGameStore";
import { ProgressBridge, LoadingScreen } from "./LoadingScreen";
import { useEditorStore } from "./useEditorStore";
import { AdminPanel } from "./AdminPanel";
import { SpawnedObjects } from "./SpawnedObjects";
import { useAdminStore, SPAWN_CATALOGUE } from "./useAdminStore";
import { TegunPainter, TegunHUD } from "./TegunPainter";
import { MMOSync } from "./MMOSync";
import { GhostPlayers } from "./GhostPlayers";
import { ChatOverlay } from "./ChatOverlay";
import { UsernameModal } from "./UsernameModal";
import { MMOWaveBanner } from "./MMOWaveBanner";

// ── Runtime capability detection ──────────────────────────────────────────────
// WebGPU is disabled — navigator.gpu exists in modern browsers but the canvas
// getContext("webgpu") call fails inside the Replit iframe proxy.  WebGL 2 is
// fully supported everywhere and is the correct renderer for this environment.
const SUPPORTS_WEBGPU = false;

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

// Genesis Island (12000 m footprint — 2× scale) — player spawns at north beach (0, _, 2190).
// Island land mass (2× binary map): x ≈ -800→+1240, z ≈ -860→+2580.
// Zombies emerge from the sea just outside the coastline on all four sides and wade ashore.
const ISLAND_SPAWN: [number, number, number][] = [
  // North coast — just beyond the beach
  [    0, 0,  3200], [ 1000, 0,  3100], [-1000, 0,  3100],
  // NE / NW coast flanks
  [ 1800, 0,  2400], [-1800, 0,  2400],
  // East coast — wade in from the east
  [ 1900, 0,  1200], [ 1800, 0,   200], [ 1700, 0,  -400],
  // West coast — mirror flanks
  [-1900, 0,  1200], [-1800, 0,   200], [-1700, 0,  -400],
  // South — through the jungle from below
  [    0, 0, -1400], [  900, 0, -1300], [ -900, 0, -1300],
  // Far south pressure
  [  400, 0, -1800], [ -400, 0, -1800],
];
// Graveyard: flat centre, spawns ring at ~20–28 m radius
const GRAVEYARD_SPAWN: [number, number, number][] = [
  [ 26, 0,  0], [-26, 0,  0], [ 0, 0,  26], [  0, 0, -26],
  [ 20, 0, 20], [-20, 0, 20], [20, 0, -20], [-20, 0, -20],
  [ 24, 0, 12], [-24, 0, 12], [24, 0, -12], [-24, 0, -12],
];

function spawnZombie(wave: number): ZombieData {
  const { activeScene } = useEditorStore.getState();
  const isIsland = activeScene !== "graveyard";
  // Merge in any custom spawner positions placed via the minimap
  const customPool = isIsland
    ? useGameStore.getState().customSpawners.map(([sx, sz]) => [sx, 0, sz] as [number, number, number])
    : [];
  const pool = isIsland ? [...ISLAND_SPAWN, ...customPool] : GRAVEYARD_SPAWN;
  const getH = isIsland ? getIslandHeight : getTerrainHeight;
  const pos = pool[Math.floor(Math.random() * pool.length)];
  const jitter = () => (Math.random() - 0.5) * 4;
  const spawnX = pos[0] + jitter();
  const spawnZ = pos[2] + jitter();
  return {
    id: `zombie-${++zombieIdCounter}`,
    position: new THREE.Vector3(spawnX, getH(spawnX, spawnZ) + 0.1, spawnZ),
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
  playerYawRef,
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
  useWebGPU,
}: {
  zombies: ZombieData[];
  bullets: BulletData[];
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerYawRef: React.MutableRefObject<number>;
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
  // true when a WebGPURenderer is in use — @react-three/postprocessing uses
  // WebGL-specific APIs (getContext, capabilities, extensions) that don't exist
  // on WebGPURenderer, so we skip the EffectComposer in that path and let the
  // renderer's built-in ACES tone mapping + emissive bloom carry visual quality.
  useWebGPU: boolean;
}) {
  const ed = useEditorStore();
  const { activeId } = useCharacterStore();

  // Shared ref: Player writes the current AnimKey every transition; MMOSync reads it at 12 Hz.
  const currentAnimRef = useRef<string>("pistolIdle");

  const isGraveyard  = ed.activeScene === "graveyard";

  // ── Wait for island height binary before spawning the player.
  // The HeightfieldCollider is only registered in Rapier after this loads,
  // so mounting Player before it's ready causes the player to fall through. ──
  const [islandReady, setIslandReady] = useState(() => isGenesisHeightsLoaded());
  useEffect(() => {
    if (islandReady || isGraveyard) return;
    const id = setInterval(() => {
      if (isGenesisHeightsLoaded()) { setIslandReady(true); clearInterval(id); }
    }, 80);
    return () => clearInterval(id);
  }, [islandReady, isGraveyard]);

  const canSpawn = isGraveyard || islandReady;

  // ── Pre-drop: ride airship for 3 s, then auto-drop (Space drops early) ──────
  useEffect(() => {
    if (!canSpawn || isGraveyard) return;
    const gs = useGameStore.getState();
    gs.setOnShipPhase(true);
    gs.setPlayerAltitude(AIRSHIP_GONDOLA_DECK_Y);

    let dropped = false;
    const doDrop = () => {
      if (dropped) return;
      dropped = true;
      useGameStore.getState().setOnShipPhase(false);
      useGameStore.getState().setDropPhase(true);
    };

    // Auto-drop after 3 seconds
    const autoTimer = setTimeout(doDrop, 3000);

    // Space key triggers early drop
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") doDrop(); };
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(autoTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [canSpawn, isGraveyard]);

  const navObstacles = isGraveyard ? GRAVEYARD_NAV_OBSTACLES : ISLAND_NAV_OBSTACLES;
  const activeMap    = isGraveyard ? "graveyard" : "island";

  return (
    <>
      {/* ── Performance overlay (F2 or toggle from editor panel) ── */}
      {ed.showPerf && <Perf position="top-left" />}

      {/* ── Scene atmosphere — switches with activeScene ── */}
      {isGraveyard ? (
        <>
          <fog attach="fog" args={["#1a1c22", ed.fogNear * 0.55, ed.fogFar * 0.55]} />
          <color attach="background" args={["#0d0e12"]} />
          {/* Overcast midnight — pale moonlight */}
          <Sky distance={20000} sunPosition={[0, -1, 0]} turbidity={18} rayleigh={0.1}
               mieCoefficient={0.001} mieDirectionalG={0.9} />
          <ambientLight intensity={ed.ambientIntensity * 0.35} color="#b0c8e0" />
          <directionalLight position={[-20, 60, 30]} intensity={ed.sunIntensity * 0.4}
            color="#c8d8f0" castShadow shadow-mapSize={[4096, 4096]}
            shadow-camera-far={220} shadow-camera-left={-60} shadow-camera-right={60}
            shadow-camera-top={60} shadow-camera-bottom={-60} />
          {/* Eerie green ground-fill */}
          <directionalLight position={[0, -5, 0]} intensity={0.12} color="#40602a" />
        </>
      ) : (
        <>
          <fog attach="fog" args={["#b8dde8", ed.fogNear, ed.fogFar]} />
          <color attach="background" args={["#6db3cc"]} />
          {/* Procedural sky — sun low in the east-southeast (morning over the sea) */}
          <Sky distance={20000} sunPosition={[60, 18, -55]} inclination={0.56}
               azimuth={0.14} turbidity={9} rayleigh={1.9}
               mieCoefficient={0.006} mieDirectionalG={0.88} />
          {/* Warm golden morning angle */}
          <ambientLight intensity={ed.ambientIntensity} color="#ffd8a0" />
          <directionalLight position={[50, 65, -80]} intensity={ed.sunIntensity}
            color="#ffe8c0" castShadow shadow-mapSize={[4096, 4096]}
            shadow-camera-far={220} shadow-camera-left={-60} shadow-camera-right={60}
            shadow-camera-top={60} shadow-camera-bottom={-60} />
          {/* Ocean-bounce fill — cool blue from the water below */}
          <directionalLight position={[-30, 15, 50]} intensity={0.28} color="#90c8e0" />
        </>
      )}

      {/* ── All physics bodies — terrain, player, AND zombie sensors ── */}
      {/* key forces full remount of nav worker + physics when scene changes */}
      <NavWorkerProvider
        key={ed.activeScene}
        obstacles={navObstacles}
        terrainSize={isGraveyard ? 120 : GENESIS_TERRAIN_SIZE}
        cellSize={isGraveyard ? 2 : 10}
      >
        <Physics gravity={[0, -22, 0]} timeStep="vary">
          {isGraveyard ? <Graveyard /> : <PirateIsland />}
          {/* Only mount Player after island height binary is confirmed loaded —
              HeightfieldCollider is not in Rapier until then, so spawning early
              causes the player to fall straight through the terrain. */}
          {canSpawn && (
            <Player
              key={`${activeId}-${ed.activeScene}`}
              onShoot={onShoot}
              onMelee={onMelee}
              onSkillHit={onSkillHit}
              onDead={onPlayerDead}
              playerPosRef={playerPosRef}
              currentAnimRef={currentAnimRef}
              waterY={isGraveyard ? undefined : 0}
              spawnPos={isGraveyard
                ? [0, getTerrainHeight(0, 0) + 5, 0]
                : AIRSHIP_SPAWN_POS}
            />
          )}

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

      {/* Admin-spawned objects (FBX props placed via Admin Panel Build tool) */}
      <SpawnedObjects />

      {/* TEGUN terrain-editor weapon — paint strokes + pointer plane */}
      <TegunPainter />

      {/* Airship — orbits the island, not Graveyard */}
      {!isGraveyard && <Airship />}

      {/* ── MMO: ghost players + position sync ─────────────────────────────── */}
      <GhostPlayers map={activeMap} />
      <MMOSync
        playerPosRef={playerPosRef}
        playerYawRef={playerYawRef}
        currentAnimRef={currentAnimRef}
        characterId={activeId}
        map={activeMap}
      />

      {/* ── Post-processing pipeline ───────────────────────────────────────────
           WebGL 2 path: SMAA (replaces canvas MSAA) + Bloom + Vignette.
           Canvas is created with antialias:false; SMAA in the EffectComposer
           with multisampling:0 provides sharper, cost-equivalent anti-aliasing.
           WebGPU path: postprocessing skipped (WebGL-specific APIs missing);
           the renderer's built-in ACES tone mapping carries visual quality.   */}
      {!useWebGPU && (
        <EffectComposer multisampling={0}>
          <SMAA />
          <Bloom
            luminanceThreshold={ed.bloomThreshold}
            luminanceSmoothing={ed.bloomSmoothing}
            intensity={ed.bloomIntensity}
            mipmapBlur
          />
          <Vignette
            eskil={false}
            offset={ed.vignetteOffset}
            darkness={ed.vignetteDarkness}
          />
        </EffectComposer>
      )}

      {/* ── Asset load progress bridge (must be inside Canvas) ── */}
      <ProgressBridge onProgress={onLoadProgress} onLoaded={onLoaded} />
    </>
  );
}

// ─── Build-mode HUD badge ─────────────────────────────────────────────────────
function BuildHUD() {
  const { buildTool, activeSpawnIdx } = useAdminStore();
  const { adminPanelOpen } = useGameStore();
  if (!adminPanelOpen || buildTool !== "place") return null;
  const entry = SPAWN_CATALOGUE[activeSpawnIdx];
  if (!entry) return null;
  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      zIndex: 8500, pointerEvents: "none",
      background: "rgba(4,10,5,0.85)", border: "1px solid #1a5a1a",
      borderRadius: 4, padding: "5px 18px",
      fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 2,
      color: "#11cc55", whiteSpace: "nowrap",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ color: "#2a5a2a", fontSize: 9 }}>BUILD PLACE</span>
      <span style={{ color: "#11cc55" }}>⬛ {entry.label}</span>
      <span style={{ color: "#2a4a2a", fontSize: 9 }}>scroll to cycle · LMB to place</span>
    </div>
  );
}

export default function Game({ onGameOver }: GameProps) {
  const [zombies, setZombies] = useState<ZombieData[]>(() => [
    spawnZombie(1), spawnZombie(1), spawnZombie(1),
  ]);
  const [bullets, setBullets] = useState<BulletData[]>([]);
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const playerYawRef = useRef(0);

  // ── Minimap: sync live zombie positions to store ──────────────────────────
  useEffect(() => {
    useGameStore.getState().setZombieWorldPositions(
      zombies.filter(z => !z.isDead).map(z => [z.position.x, z.position.z] as [number, number])
    );
  }, [zombies]);

  // ── Asset loading state ───────────────────────────────────────────────────
  const [loadProgress,  setLoadProgress]  = useState(0);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [showOverlay,   setShowOverlay]   = useState(true);

  const handleLoadProgress = useCallback((p: number) => setLoadProgress(p), []);
  const handleLoaded       = useCallback(() => setIsLoaded(true), []);

  // Hard timeout — if useProgress never completes (asset error / context issues),
  // force the overlay away after 18 s so the player can still play.
  useEffect(() => {
    const t = setTimeout(() => setIsLoaded(true), 18_000);
    return () => clearTimeout(t);
  }, []);

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
      {/*
        ── Renderer selection ────────────────────────────────────────────────────
        WebGPU (SUPPORTS_WEBGPU = true):
          • gl factory returns a WebGPURenderer.  Three.js auto-detects if the
            browser truly supports WebGPU and falls back to its own WebGL 2 backend
            if not — so this is always safe.
          • @react-three/postprocessing is disabled (see SceneContent below) because
            the postprocessing library accesses WebGLRenderer-specific APIs.
          • ACESFilmicToneMapping + toneMappingExposure are set on the renderer to
            compensate visually: emissive surfaces look bright/glowy, sky is correct.
          • shadows use PCFSoftShadowMap for smoother contact shadows in WebGPU mode.

        WebGL 2 (SUPPORTS_WEBGPU = false):
          • Standard R3F Canvas with WebGL 2 renderer + full postprocessing stack.
        ───────────────────────────────────────────────────────────────────────── */}
      <Canvas
        shadows={{ type: SUPPORTS_WEBGPU ? THREE_TYPES.PCFSoftShadowMap : THREE_TYPES.PCFShadowMap }}
        camera={{ fov: 70, near: 0.1, far: 12000 }}
        gl={SUPPORTS_WEBGPU
          ? async (canvas) => {
              // Dynamic import keeps WebGPU out of Vite's static scan graph.
              const { default: WebGPURenderer } = await import(
                /* webpackIgnore: true */
                "three/src/renderers/webgpu/WebGPURenderer.js"
              );
              // Cast: R3F expects WebGLRenderer; WebGPURenderer is API-compatible.
              const renderer = new (WebGPURenderer as any)({
                canvas,
                antialias:       true,
                powerPreference: "high-performance",
              });
              // WebGPURenderer requires async backend initialization before the
              // first .render() call.  R3F's Canvas calls render() synchronously
              // on the first frame, so we MUST await init() here in the gl factory
              // before returning — otherwise every frame fires the
              // "called before backend is initialized" error that corrupts the
              // WebGPU command queue and kills the render loop.
              await renderer.init();
              return renderer as unknown as THREE_TYPES.WebGLRenderer;
            }
          : { antialias: false, powerPreference: "high-performance" }
        }
        dpr={[1, 2]}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ gl }) => {
          // ACES Filmic tone mapping gives emissive surfaces a natural bloom-like
          // glow and keeps the sky and skin tones perceptually correct.
          // Applied to both WebGPU and WebGL 2 paths for consistent look.
          gl.toneMapping        = THREE_TYPES.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;

          if (SUPPORTS_WEBGPU) {
            console.info("[Renderer] WebGPU backend — hardware-accelerated rendering active");
          } else {
            // WebGL 2 path — verify we got a proper GL2 context
            const glAny = gl as unknown as { capabilities?: { isWebGL2?: boolean } };
            if (glAny.capabilities && !glAny.capabilities.isWebGL2) {
              console.warn("[Renderer] WebGL2 not available — running on WebGL1 fallback");
            } else {
              console.info("[Renderer] WebGL 2 renderer active");
            }
          }
        }}
      >
        <SceneContent
          zombies={zombies}
          bullets={bullets}
          playerPosRef={playerPosRef}
          playerYawRef={playerYawRef}
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
          useWebGPU={SUPPORTS_WEBGPU}
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
      <BuildHUD />
      <TegunHUD />
      <AdminPanel />

      {/* ── MMO HTML overlays ─────────────────────────────────────────── */}
      <UsernameModal />
      <ChatOverlay />
      <MMOWaveBanner />
    </div>
  );
}
