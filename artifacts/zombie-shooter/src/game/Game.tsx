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
// WebGPU renderer — imported from the three/src/* export path so Vite bundles
// only the renderer code without duplicating the full three/webgpu mega-bundle.
// WebGPURenderer auto-detects browser WebGPU support and falls back to WebGL 2
// if unavailable (Chrome 113+, Edge 113+, Safari 18+; Firefox uses WebGL 2).
import WebGPURenderer from "three/src/renderers/webgpu/WebGPURenderer.js";
import { getIslandHeight, getTerrainHeight, GENESIS_TERRAIN_SIZE } from "./terrain";
import { Player } from "./Player";
import { Zombie, ZombieData } from "./Zombie";
import { Bullet, BulletData } from "./Bullet";
import { PirateIsland, NAV_OBSTACLES as ISLAND_NAV_OBSTACLES } from "./PirateIsland";
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

// ── Runtime capability detection ──────────────────────────────────────────────
// navigator.gpu is the WebGPU entry point.  It exists in Chrome 113+, Edge 113+,
// and Safari 18+.  Firefox still uses WebGL 2 only.  We pick the renderer at
// startup so the Canvas and its children mount consistently.
const SUPPORTS_WEBGPU =
  typeof navigator !== "undefined" &&
  "gpu" in navigator &&
  navigator.gpu !== null;

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

// Genesis Island — spawn ring at ~70–80 m radius from centre
// (island is 200 m wide; shoreline sits at roughly r=80 m).
const ISLAND_SPAWN: [number, number, number][] = [
  [ 78, 0,   0], [-78, 0,   0], [  0, 0,  78], [  0, 0, -78],
  [ 55, 0,  55], [-55, 0,  55], [ 55, 0, -55], [-55, 0, -55],
  [ 70, 0,  36], [-70, 0,  36], [ 70, 0, -36], [-70, 0, -36],
  [ 36, 0,  70], [-36, 0,  70], [ 36, 0, -70], [-36, 0, -70],
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
  const pool = isIsland ? ISLAND_SPAWN : GRAVEYARD_SPAWN;
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

  const isGraveyard  = ed.activeScene === "graveyard";
  const navObstacles = isGraveyard ? GRAVEYARD_NAV_OBSTACLES : ISLAND_NAV_OBSTACLES;

  // ChromaticAberration expects a THREE.Vector2 — rebuild only when strength changes
  const caOffset = useMemo(
    () => new THREE.Vector2(ed.chromaticStrength, ed.chromaticStrength),
    [ed.chromaticStrength]
  );

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
          <Sky distance={4500} sunPosition={[0, -1, 0]} turbidity={18} rayleigh={0.1}
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
          <Sky distance={4500} sunPosition={[60, 18, -55]} inclination={0.56}
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
      <NavWorkerProvider key={ed.activeScene} obstacles={navObstacles} terrainSize={isGraveyard ? 120 : GENESIS_TERRAIN_SIZE}>
        <Physics gravity={[0, -22, 0]} timeStep="vary">
          {isGraveyard ? <Graveyard /> : <PirateIsland />}
          {/* key remounts when character OR scene changes — resets spawn pos */}
          <Player
            key={`${activeId}-${ed.activeScene}`}
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

      {/* Admin-spawned objects (FBX props placed via Admin Panel Build tool) */}
      <SpawnedObjects />

      {/* ── Post-processing pipeline ───────────────────────────────────────────
           WebGL 2 path: full @react-three/postprocessing stack.
           WebGPU path:  @react-three/postprocessing is skipped because it uses
           WebGL-specific APIs (getContext, capabilities, extensions) that do not
           exist on WebGPURenderer.  The renderer's built-in ACES tone mapping
           and emissive materials provide equivalent visual quality in that path.
           Bloom / Vignette / DOF / ChromaticAberration only on WebGL 2.        */}
      {!useWebGPU && (
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
      )}

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
        camera={{ fov: 70, near: 0.05, far: 500 }}
        gl={SUPPORTS_WEBGPU
          ? (canvas) => {
              // Create WebGPURenderer — same three.js singleton, WebGPU backend.
              // Cast is required because R3F types expect WebGLRenderer, but the
              // runtime interface (setSize, render, dispose, shadowMap, etc.) is
              // fully compatible with WebGPURenderer's Renderer base class.
              const renderer = new WebGPURenderer({
                canvas,
                antialias:       true,
                powerPreference: "high-performance",
              });
              return renderer as unknown as THREE_TYPES.WebGLRenderer;
            }
          : { antialias: true, powerPreference: "high-performance" }
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
      <AdminPanel />
    </div>
  );
}
