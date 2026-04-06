/**
 * GhostCharacter — renders a remote MMO player as their actual character mesh
 * with a 3-state animation set (idle / walk / run).
 *
 * For Mixamo-rigged characters (no embeddedAnims):
 *   Loads 3 pistol FBX clips — they're URL-cached by Three.js so no
 *   re-download happens if the local player already loaded them.
 *
 * For embedded-anim characters (e.g. Astronaut):
 *   Uses the GLB's own clips via the embeddedAnims mapping.
 *
 * Position / yaw lerp-smoothed at 60 fps regardless of 12 Hz snapshot rate.
 */
import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Text } from "@react-three/drei";
import { useCharacterStore } from "./useCharacterStore";
import type { RemotePlayer } from "./useMMOStore";

// ── Translucent ghost tint ─────────────────────────────────────────────────────
const GHOST_COLOR = "#39ff14";
const LERP_POS    = 0.18;
const LERP_YAW    = 0.22;

// Minimal FBX animation set reused across all Mixamo-rig ghost instances
const GHOST_FBX: Record<GhostState, string> = {
  idle: "/models/animations/pistol/pistol idle.fbx",
  walk: "/models/animations/pistol/pistol walk.fbx",
  run:  "/models/animations/pistol/pistol run.fbx",
};

type GhostState = "idle" | "walk" | "run";

/** Map any AnimKey string (any stance) → the 3 ghost states */
function toGhostState(anim: string): GhostState {
  const a = anim.toLowerCase();
  if (a.includes("run"))  return "run";
  if (a.includes("walk")) return "walk";
  return "idle";
}

/** Swap ghost material onto every mesh in a loaded group */
function applyGhostMaterial(group: THREE.Object3D) {
  group.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = new THREE.MeshStandardMaterial({
      color:            GHOST_COLOR,
      transparent:      true,
      opacity:          0.48,
      emissive:         GHOST_COLOR,
      emissiveIntensity: 0.28,
      roughness:        0.6,
      metalness:        0.1,
      depthWrite:       false,
    });
    mesh.castShadow    = false;
    mesh.receiveShadow = false;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { player: RemotePlayer }

export function GhostCharacter({ player }: Props) {
  const groupRef     = useRef<THREE.Group>(null!);
  const meshRootRef  = useRef<THREE.Group | null>(null);
  const targetPos    = useRef(new THREE.Vector3(player.x, player.y, player.z));
  const yawRef       = useRef(player.yaw);
  const mixerRef     = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef   = useRef<Partial<Record<GhostState, THREE.AnimationAction>>>({});
  const curStateRef  = useRef<GhostState>("idle");

  const charDef = useCharacterStore.getState().getAnyCharDef(player.characterId ?? "corsair-king");

  // ── Load mesh + animations ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fbxLoader  = new FBXLoader();
    const gltfLoader = new GLTFLoader();

    function applyMixer(root: THREE.Group) {
      if (cancelled) return;
      root.scale.setScalar(charDef.scale);
      applyGhostMaterial(root);
      groupRef.current?.add(root);
      meshRootRef.current = root;

      const mixer = new THREE.AnimationMixer(root);
      mixerRef.current = mixer;
      return mixer;
    }

    function loadMixamoAnims(mixer: THREE.AnimationMixer) {
      let loaded = 0;
      const states: GhostState[] = ["idle", "walk", "run"];
      for (const state of states) {
        fbxLoader.load(GHOST_FBX[state], (fbx) => {
          if (cancelled) return;
          const clip = fbx.animations[0];
          if (!clip) return;
          clip.name = state;
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          actionsRef.current[state] = action;
          loaded++;
          // Kick off idle as soon as it's available
          if (state === "idle") {
            action.play();
            curStateRef.current = "idle";
          }
        });
      }
    }

    function loadEmbeddedAnims(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
      if (!charDef.embeddedAnims) return;
      const clipByName = new Map(clips.map((c) => [c.name, c]));
      const mapping: Record<GhostState, string> = {
        idle: charDef.embeddedAnims["pistolIdle"]    ?? charDef.embeddedAnims["meleeIdle"]   ?? "",
        walk: charDef.embeddedAnims["pistolWalkFwd"] ?? charDef.embeddedAnims["meleeWalkFwd"] ?? "",
        run:  charDef.embeddedAnims["pistolRun"]     ?? charDef.embeddedAnims["meleeRunFwd"]  ?? "",
      };
      for (const [state, clipName] of Object.entries(mapping) as [GhostState, string][]) {
        const src = clipByName.get(clipName);
        if (!src) continue;
        const clip   = src.clone();
        clip.name    = state;
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        actionsRef.current[state] = action;
      }
      actionsRef.current["idle"]?.play();
      curStateRef.current = "idle";
    }

    const isGltf = charDef.format === "glb" || charDef.format === "gltf";

    if (isGltf) {
      gltfLoader.load(charDef.mesh, (gltf) => {
        const mixer = applyMixer(gltf.scene as THREE.Group);
        if (!mixer) return;
        if (charDef.embeddedAnims) {
          loadEmbeddedAnims(mixer, gltf.animations);
        } else {
          loadMixamoAnims(mixer);
        }
      });
    } else {
      fbxLoader.load(charDef.mesh, (fbx) => {
        const mixer = applyMixer(fbx);
        if (!mixer) return;
        loadMixamoAnims(mixer);
      });
    }

    return () => {
      cancelled = true;
      mixerRef.current?.stopAllAction();
      if (meshRootRef.current && groupRef.current) {
        groupRef.current.remove(meshRootRef.current);
        meshRootRef.current = null;
      }
      actionsRef.current = {};
      mixerRef.current   = null;
    };
  // charDef is stable per characterId; deliberately run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charDef.id]);

  // ── Animation state transitions (drive from incoming anim prop) ────────────
  const lastAnimRef = useRef("");
  useFrame((_, delta) => {
    // Position + yaw lerp
    targetPos.current.set(player.x, player.y, player.z);
    if (groupRef.current) {
      groupRef.current.position.lerp(targetPos.current, LERP_POS);
      yawRef.current = THREE.MathUtils.lerp(yawRef.current, player.yaw, LERP_YAW);
      groupRef.current.rotation.y = yawRef.current;
    }

    // Animation state switch
    if (player.anim !== lastAnimRef.current) {
      lastAnimRef.current = player.anim;
      const next = toGhostState(player.anim);
      if (next !== curStateRef.current) {
        const prev = actionsRef.current[curStateRef.current];
        const act  = actionsRef.current[next];
        if (act) {
          prev?.fadeOut(0.2);
          act.reset().fadeIn(0.2).play();
          curStateRef.current = next;
        }
      }
    }

    mixerRef.current?.update(delta);
  });

  const labelY = charDef.capsuleHH * 2 + charDef.capsuleR + 0.5;
  const barY   = labelY - 0.3;

  return (
    <group ref={groupRef} position={[player.x, player.y, player.z]}>
      {/* Username label */}
      <Text
        position={[0, labelY, 0]}
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

      {/* HP bar — background */}
      <mesh position={[0, barY, 0]}>
        <planeGeometry args={[0.7, 0.07]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      {/* HP bar — fill */}
      <mesh position={[-0.35 + (player.hp / 100) * 0.35, barY, 0.001]}>
        <planeGeometry args={[(player.hp / 100) * 0.7, 0.07]} />
        <meshBasicMaterial color={player.hp > 50 ? "#22c55e" : "#ef4444"} />
      </mesh>
    </group>
  );
}
