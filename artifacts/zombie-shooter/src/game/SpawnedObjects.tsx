import { Suspense, useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { useAdminStore } from "./useAdminStore";
import { useGameStore } from "./useGameStore";
import { GRAVEYARD, texPath } from "./assets/manifest";

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

// ─── Ghost preview box shown in build-place mode ──────────────────────────────
function GhostMesh() {
  const { ghostPosition, ghostVisible, buildTool } = useAdminStore();
  const { adminPanelOpen } = useGameStore();

  if (!adminPanelOpen || buildTool !== "place" || !ghostVisible) return null;

  return (
    <mesh position={ghostPosition}>
      <boxGeometry args={[0.8, 1.6, 0.8]} />
      <meshStandardMaterial color="#11cc55" transparent opacity={0.35} />
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
