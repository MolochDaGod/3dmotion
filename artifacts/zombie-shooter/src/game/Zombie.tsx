import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, useTexture } from "@react-three/drei";
import { getTerrainHeight } from "./terrain";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { RigidBody, BallCollider } from "@react-three/rapier";
import * as THREE from "three";
import { useNavWorker } from "./NavWorkerContext";
import { useEditorStore } from "./useEditorStore";

useGLTF.preload("/models/mutant.gltf");

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

type ZState = "loading" | "idle" | "wander" | "run" | "attack" | "hit" | "dead";

const ATTACK_RANGE    = 1.9;
const ATTACK_DAMAGE   = 10;
const ATTACK_COOLDOWN = 4.0;
const DEAD_LINGER     = 3.5;
const WANDER_SPEED    = 0.30;  // fraction of data.speed used while wandering
const WANDER_BOUNDS   = 80;    // world-unit boundary — zombies bounce back inside

const ONCE_ANIMS = new Set([
  "punch", "punchStart", "punchEnd", "fist",
  "jumpAttack", "jumpAttackStart", "jumpAttackEnd",
  "dash", "hit", "knockDown",
]);

export function Zombie({ data, playerPosition, onDamagePlayer, onDied }: ZombieProps) {
  const groupRef = useRef<THREE.Group>(null!);
  // Rapier kinematic sensor body — used for weapon shape-cast hit detection
  const rbRef    = useRef<any>(null);

  const { scene, animations } = useGLTF("/models/mutant.gltf");
  const texture = useTexture("/models/mutant.jpg");

  const clone = useMemo(() => {
    const c = skeletonClone(scene) as THREE.Group;
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    c.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.85,
          metalness: 0.0,
          skinning: true,
        } as any);
      }
    });
    return c;
  }, [scene, texture]);

  const { actions, mixer } = useAnimations(animations, groupRef);

  const { asyncGetPath, ready: navReady } = useNavWorker();

  const stateRef        = useRef<ZState>("loading");
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const attackCdRef     = useRef(0);
  const deadTimerRef    = useRef(0);
  const prevHealthRef   = useRef(data.health);
  const tmpDir          = useRef(new THREE.Vector3());
  // Prevents flooding the worker — only one path request in-flight at a time.
  const pathPendingRef  = useRef(false);

  // ── Wander ─────────────────────────────────────────────────────────────────
  // Each zombie starts with a random direction and a staggered timer so they
  // don't all pivot at the same moment.
  const wanderDirRef   = useRef(new THREE.Vector3(
    Math.random() - 0.5, 0, Math.random() - 0.5
  ).normalize());
  const wanderTimerRef = useRef(Math.random() * 4);  // 0–4 s initial offset

  // ── A* navigation ──────────────────────────────────────────────────────────
  // waypointsRef: current A* path as [x,z] pairs, consumed front-to-back
  const waypointsRef = useRef<[number, number][]>([]);
  // pathTimerRef: time until next path request (seconds)
  const pathTimerRef = useRef<number>(0);

  // ── Sync Rapier sensor userData after mount ──────────────────────────────
  useEffect(() => {
    if (rbRef.current) {
      rbRef.current.userData = { zombieId: data.id };
    }
  }, [data.id]);

  function fadeToAction(name: string, fadeIn = 0.18, timeScale = 1.0) {
    const action = actions[name];
    if (!action) return;
    const prev = activeActionRef.current;
    if (prev && prev !== action) prev.fadeOut(fadeIn);
    action.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fadeIn).play();
    activeActionRef.current = action;
  }

  function transitionTo(next: ZState) {
    if (stateRef.current === "dead" && next !== "dead") return;
    stateRef.current = next;
    switch (next) {
      case "idle":   fadeToAction("idle"); break;
      // Wander: reuse the run cycle at ~35% speed — gives a creepy slow lurch
      case "wander": fadeToAction("running", 0.4, 0.35); break;
      case "run":    fadeToAction("running"); break;
      case "attack":
        fadeToAction("punchStart", 0.1);
        setTimeout(() => {
          if (stateRef.current === "attack") fadeToAction("punch", 0.15);
        }, 400);
        break;
      case "hit":  fadeToAction("hit", 0.08);  break;
      case "dead": fadeToAction("knockDown", 0.15); break;
    }
  }

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.copy(data.position);

    Object.entries(actions).forEach(([name, action]) => {
      if (!action) return;
      if (ONCE_ANIMS.has(name)) {
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
      }
    });

    const onFinished = () => {
      const st = stateRef.current;
      if (st === "attack" || st === "hit") transitionTo("idle");
    };
    mixer.addEventListener("finished", onFinished);
    transitionTo("idle");

    return () => {
      mixer.removeEventListener("finished", onFinished);
      mixer.stopAllAction();
    };
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const st  = stateRef.current;
    const pos = groupRef.current.position;
    const pp  = playerPosition.current;

    if (st === "loading") return;

    if (data.isDead && st !== "dead") {
      transitionTo("dead");
    }

    if (st === "dead") {
      deadTimerRef.current += delta;
      if (deadTimerRef.current > DEAD_LINGER) onDied(data.id);
      return;
    }

    if (data.health < prevHealthRef.current) {
      prevHealthRef.current = data.health;
      if (!data.isDead) transitionTo("hit");
    }

    // Read editor settings each frame (getState avoids React re-render overhead)
    const ed = useEditorStore.getState();
    const detectionRadius = ed.zombieDetectionRadius;
    const speedMult       = ed.zombieSpeedMult;

    tmpDir.current.set(pp.x - pos.x, 0, pp.z - pos.z);
    const dist = tmpDir.current.length();

    if (dist > detectionRadius) {
      // ── Wander: zombie slowly patrol when player is far away ──────────────
      if (st !== "wander") transitionTo("wander");

      wanderTimerRef.current -= delta;
      if (wanderTimerRef.current <= 0) {
        // Pick a new random wander direction every 2–5 seconds
        wanderTimerRef.current = 2 + Math.random() * 3;
        const angle = Math.random() * Math.PI * 2;
        wanderDirRef.current.set(Math.sin(angle), 0, Math.cos(angle));
      }

      const ws = data.speed * WANDER_SPEED * speedMult;
      const nx = pos.x + wanderDirRef.current.x * ws * delta;
      const nz = pos.z + wanderDirRef.current.z * ws * delta;

      if (Math.abs(nx) < WANDER_BOUNDS && Math.abs(nz) < WANDER_BOUNDS) {
        pos.x = nx;
        pos.z = nz;
      } else {
        wanderDirRef.current.negate();
      }

      groupRef.current.rotation.y = Math.atan2(wanderDirRef.current.x, wanderDirRef.current.z);
      data.position.copy(pos);
      pos.y = getTerrainHeight(pos.x, pos.z);
      data.position.y = pos.y;
      rbRef.current?.setNextKinematicTranslation({ x: pos.x, y: pos.y + 1.0, z: pos.z });
      return;
    }

    groupRef.current.rotation.y = Math.atan2(pp.x - pos.x, pp.z - pos.z);
    attackCdRef.current -= delta;

    if (dist < ATTACK_RANGE) {
      if (st !== "attack" && st !== "hit") {
        if (attackCdRef.current <= 0) {
          attackCdRef.current = ATTACK_COOLDOWN;
          transitionTo("attack");
          setTimeout(() => onDamagePlayer(ed.zombieAttackDamage), 700);
        } else if (st !== "idle") {
          transitionTo("idle");
        }
      }
    } else {
      if (st !== "run" && st !== "attack" && st !== "hit") {
        transitionTo("run");
      }
      if (st === "run") {
        // ── A* path following (Web Worker — non-blocking) ─────────────────
        pathTimerRef.current -= delta;

        // Request a fresh path every 1.5 s (or when path exhausted).
        // pathPendingRef guards against flooding the worker.
        if (
          (pathTimerRef.current <= 0 || waypointsRef.current.length === 0) &&
          navReady.current &&
          !pathPendingRef.current
        ) {
          pathTimerRef.current = 1.5;
          pathPendingRef.current = true;
          const fx = pos.x, fz = pos.z, tx = pp.x, tz = pp.z;
          asyncGetPath(fx, fz, tx, tz).then((fresh) => {
            pathPendingRef.current = false;
            if (fresh.length > 0) {
              waypointsRef.current = fresh.slice(1);
            }
          });
        }

        // Pop waypoints the zombie has already reached (within 2 m)
        while (waypointsRef.current.length > 0) {
          const [wx, wz] = waypointsRef.current[0];
          const dx = wx - pos.x, dz = wz - pos.z;
          if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
            waypointsRef.current.shift();
          } else {
            break;
          }
        }

        // Steer toward the next waypoint, or fall back to straight-line
        let steerX: number, steerZ: number;
        if (waypointsRef.current.length > 0) {
          const [wx, wz] = waypointsRef.current[0];
          steerX = wx - pos.x;
          steerZ = wz - pos.z;
        } else {
          // Fallback: direct line to player
          steerX = tmpDir.current.x;
          steerZ = tmpDir.current.z;
        }

        const len = Math.sqrt(steerX * steerX + steerZ * steerZ) || 1;
        pos.x += (steerX / len) * data.speed * speedMult * delta;
        pos.z += (steerZ / len) * data.speed * speedMult * delta;
        data.position.copy(pos);
      }
    }

    // ── Pin zombie feet to terrain surface ────────────────────────────────
    // Zombies don't use the Rapier character controller, so we manually
    // lock their Y to the heightfield at every frame to prevent floating / sinking.
    pos.y = getTerrainHeight(pos.x, pos.z);
    data.position.y = pos.y;

    // ── Sync Rapier kinematic sensor to zombie world position ──────────────
    // The sensor sits at chest height (y+1) so weapon sweeps at that level hit it.
    rbRef.current?.setNextKinematicTranslation({ x: pos.x, y: pos.y + 1.0, z: pos.z });
  });

  const healthPct = Math.max(0, data.health / data.maxHealth);

  return (
    <>
      {/* ── Rapier kinematic sensor — used only for skill hit detection ── */}
      {!data.isDead && (
        <RigidBody
          ref={rbRef}
          type="kinematicPosition"
          colliders={false}
          position={[data.position.x, data.position.y + 1.0, data.position.z]}
          userData={{ zombieId: data.id }}
        >
          <BallCollider args={[1.2]} sensor />
        </RigidBody>
      )}

      {/* ── Animated zombie mesh ─────────────────────────────────────────── */}
      <group ref={groupRef}>
        <primitive object={clone} />

        {!data.isDead && (
          <group position={[0, 2.6, 0]}>
            <mesh>
              <planeGeometry args={[0.9, 0.08]} />
              <meshBasicMaterial color="#222" side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            <mesh position={[-(0.45 - healthPct * 0.45), 0, 0.01]}>
              <planeGeometry args={[0.9 * healthPct, 0.08]} />
              <meshBasicMaterial
                color={healthPct > 0.5 ? "#4caf50" : healthPct > 0.25 ? "#ff9800" : "#f44336"}
                side={THREE.DoubleSide}
                depthTest={false}
              />
            </mesh>
          </group>
        )}
      </group>
    </>
  );
}
