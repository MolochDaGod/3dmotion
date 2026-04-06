import { Suspense, useEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { useTexture, Text } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { useAdminStore, SPAWN_CATALOGUE } from "./useAdminStore";
import { useGameStore } from "./useGameStore";
import { GRAVEYARD, texPath } from "./assets/manifest";
import { getIslandHeight } from "./terrain";

// ─── Ruin mesh (always loads atlas texture) ──────────────────────────────────
function SpawnedRuinFBX({ meshPath, position, rotationY, scale }: {
  meshPath: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
}) {
  const fbx     = useLoader(FBXLoader, meshPath);
  const texture = useTexture(texPath(GRAVEYARD.texture));

  const obj = useMemo(() => {
    const clone = fbx.clone(true);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY      = false;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
        (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
          map: texture, roughness: 0.85, metalness: 0.05,
        });
      }
    });
    return clone;
  }, [fbx, texture]);

  return <primitive object={obj} position={position} rotation={[0, rotationY, 0]} scale={scale} />;
}

// ─── Generic FBX mesh (characters / weapons) ─────────────────────────────────
function SpawnedGenericFBX({ meshPath, position, rotationY, scale }: {
  meshPath: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
}) {
  const fbx = useLoader(FBXLoader, meshPath);

  const obj = useMemo(() => {
    const clone = fbx.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [fbx]);

  return <primitive object={obj} position={position} rotation={[0, rotationY, 0]} scale={scale} />;
}

// ─── Ghost preview shown in build-place mode ──────────────────────────────────
function GhostMesh() {
  const { ghostPosition, ghostVisible, buildTool, activeSpawnIdx } = useAdminStore();
  const { adminPanelOpen } = useGameStore();

  if (!adminPanelOpen || buildTool !== "place" || !ghostVisible) return null;

  const label = SPAWN_CATALOGUE[activeSpawnIdx]?.label ?? "—";
  const [gx, gy, gz] = ghostPosition;

  return (
    <group position={[gx, gy, gz]}>
      {/* Translucent placeholder cube */}
      <mesh>
        <boxGeometry args={[0.8, 1.6, 0.8]} />
        <meshStandardMaterial color="#11cc55" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Name label floating above */}
      <Text
        position={[0, 1.6, 0]}
        fontSize={0.28}
        color="#22ff88"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.015}
        outlineColor="#000000"
        billboard
      >
        {label}
      </Text>
      {/* Ground ring */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.55, 0.70, 32]} />
        <meshBasicMaterial color="#11cc55" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── Invisible placement plane + wheel cycling ────────────────────────────────
// Lives inside the R3F Canvas. Captures pointer events over the terrain
// so the user can aim at the ground to place props.
function BuildPlacer() {
  const {
    buildTool, activeSpawnIdx, adminPanelOpen,
    setActiveSpawn, setGhostPos, setGhostVis, spawnObject,
  } = useAdminStore();
  const { adminPanelOpen: open } = useGameStore();

  const active   = open && buildTool === "place";
  const planeRef = useRef<THREE.Mesh>(null!);

  // ── Scroll wheel → cycle prop ─────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    function onWheel(e: WheelEvent) {
      // Don't let the panel's scroll list capture this
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest("[data-admin-panel]")) return;
      e.preventDefault();
      const total = SPAWN_CATALOGUE.length;
      const dir   = e.deltaY > 0 ? 1 : -1;
      const next  = (useAdminStore.getState().activeSpawnIdx + dir + total) % total;
      setActiveSpawn(next);
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [active, setActiveSpawn]);

  // Hide ghost when not in place mode
  useEffect(() => {
    if (!active) setGhostVis(false);
  }, [active, setGhostVis]);

  if (!active) return null;

  function getTerrainY(x: number, z: number) {
    // Use island height; fall back to 0 (graveyard / flat ground)
    const h = getIslandHeight(x, z);
    return h ?? 0;
  }

  return (
    <mesh
      ref={planeRef}
      rotation-x={-Math.PI / 2}
      position={[0, -0.05, 0]}
      visible={false}
      onPointerMove={(e) => {
        e.stopPropagation();
        const x = e.point.x;
        const z = e.point.z;
        const y = getTerrainY(x, z);
        setGhostPos([x, y, z]);
        setGhostVis(true);
      }}
      onPointerLeave={() => setGhostVis(false)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const entry = SPAWN_CATALOGUE[activeSpawnIdx];
        if (!entry) return;
        const x = e.point.x;
        const z = e.point.z;
        const y = getTerrainY(x, z);
        spawnObject({
          label:     entry.label,
          meshPath:  entry.meshPath,
          category:  entry.category,
          position:  [x, y, z],
          rotationY: 0,
          scale:     entry.scale,
        });
      }}
    >
      <planeGeometry args={[8000, 8000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

// ─── Root: renders all placed objects ────────────────────────────────────────
export function SpawnedObjects() {
  const { objects, spawnObject } = useAdminStore();

  useEffect(() => {
    function onSpawn(e: Event) {
      const d = (e as CustomEvent).detail as {
        label: string; meshPath: string; category: string;
        scale: number; x?: number; y?: number; z?: number;
      };
      if (!d) return;
      spawnObject({
        label:     d.label,
        meshPath:  d.meshPath,
        category:  d.category as any,
        position:  [d.x ?? 0, d.y ?? 1, d.z ?? 0],
        rotationY: 0,
        scale:     d.scale,
      });
    }
    window.addEventListener("admin:spawn", onSpawn);
    return () => window.removeEventListener("admin:spawn", onSpawn);
  }, [spawnObject]);

  return (
    <>
      <BuildPlacer />
      <GhostMesh />
      {objects.map((obj) => (
        <Suspense key={obj.id} fallback={null}>
          {obj.category === "ruin" ? (
            <SpawnedRuinFBX
              meshPath={obj.meshPath}
              position={obj.position}
              rotationY={obj.rotationY}
              scale={obj.scale}
            />
          ) : (
            <SpawnedGenericFBX
              meshPath={obj.meshPath}
              position={obj.position}
              rotationY={obj.rotationY}
              scale={obj.scale}
            />
          )}
        </Suspense>
      ))}
    </>
  );
}
