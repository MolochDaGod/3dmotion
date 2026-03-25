import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, useTexture } from "@react-three/drei";
import { getTerrainHeight } from "./terrain";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { RigidBody, BallCollider } from "@react-three/rapier";
import * as THREE from "three";
import { getPath, isNavReady } from "./NavGrid";

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

type ZState = "loading" | "idle" | "run" | "attack" | "hit" | "dead";

const ATTACK_RANGE    = 1.9;
const ATTACK_DAMAGE   = 10;
const ATTACK_COOLDOWN = 4.0;
const DETECTOR_RADIUS = 22;
const DEAD_LINGER     = 3.5;

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

  const stateRef        = useRef<ZState>("loading");
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const attackCdRef     = useRef(0);
  const deadTimerRef    = useRef(0);
  const prevHealthRef   = useRef(data.health);
  const tmpDir          = useRef(new THREE.Vector3());

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

  function fadeToAction(name: string, fadeIn = 0.18) {
    const action = actions[name];
    if (!action) return;
    const prev = activeActionRef.current;
    if (prev && prev !== action) prev.fadeOut(fadeIn);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeIn).play();
    activeActionRef.current = action;
  }

  function transitionTo(next: ZState) {
    if (stateRef.current === "dead" && next !== "dead") return;
    stateRef.current = next;
    switch (next) {
      case "idle":   fadeToAction("idle"); break;
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

    tmpDir.current.set(pp.x - pos.x, 0, pp.z - pos.z);
    const dist = tmpDir.current.length();

    if (dist > DETECTOR_RADIUS) {
      if (st !== "idle") transitionTo("idle");
      // Still sync sensor to current position
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
          setTimeout(() => onDamagePlayer(ATTACK_DAMAGE), 700);
        } else if (st !== "idle") {
          transitionTo("idle");
        }
      }
    } else {
      if (st !== "run" && st !== "attack" && st !== "hit") {
        transitionTo("run");
      }
      if (st === "run") {
        // ── A* path following ──────────────────────────────────────────────
        pathTimerRef.current -= delta;

        // Request a fresh path every 1.5 s (or immediately if path is empty)
        if (pathTimerRef.current <= 0 || waypointsRef.current.length === 0) {
          pathTimerRef.current = 1.5;
          if (isNavReady()) {
            const fresh = getPath(pos.x, pos.z, pp.x, pp.z);
            if (fresh.length > 0) {
              // Skip the first waypoint (it's the zombie's own cell)
              waypointsRef.current = fresh.slice(1);
            }
          }
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
        pos.x += (steerX / len) * data.speed * delta;
        pos.z += (steerZ / len) * data.speed * delta;
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
