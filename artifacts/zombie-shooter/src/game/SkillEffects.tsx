import { useRef, forwardRef, useImperativeHandle } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Shared geometries (created once) ────────────────────────────────────────
const RING_GEO  = new THREE.TorusGeometry(1, 0.045, 8, 48);
const DISC_GEO  = new THREE.CircleGeometry(1, 36);
const SPARK_GEO = new THREE.SphereGeometry(0.04, 4, 4);

interface EffectEntry {
  mesh:   THREE.Mesh | THREE.Group;
  t:      number;   // 0 → 1
  dur:    number;   // seconds
  maxR:   number;
  type:   "ring" | "burst" | "spark_ring";
}

export interface SkillEffectsHandle {
  spawnRing (pos: THREE.Vector3, color: string, maxR: number, dur?: number): void;
  spawnBurst(pos: THREE.Vector3, color: string, maxR: number, dur?: number): void;
  spawnSpark(pos: THREE.Vector3, color: string, maxR: number, count?: number): void;
}

// ─── SkillEffects — imperative 3-D vfx manager ────────────────────────────────
// Mount once inside the scene. Call via ref to spawn effects.
export const SkillEffects = forwardRef<SkillEffectsHandle>(
  function SkillEffects(_, ref) {
    const groupRef = useRef<THREE.Group>(null!);
    const pool     = useRef<EffectEntry[]>([]);

    useImperativeHandle(ref, () => ({
      spawnRing(pos, color, maxR, dur = 0.55) {
        if (!groupRef.current) return;
        const mat  = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(RING_GEO, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(pos).setY(pos.y + 0.08);
        mesh.scale.setScalar(0.01);
        groupRef.current.add(mesh);
        pool.current.push({ mesh, t: 0, dur, maxR, type: "ring" });
      },

      spawnBurst(pos, color, maxR, dur = 0.45) {
        if (!groupRef.current) return;
        // Outer ring
        const rMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(RING_GEO, rMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(pos).setY(pos.y + 0.06);
        ring.scale.setScalar(0.01);

        // Ground disc
        const dMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const disc = new THREE.Mesh(DISC_GEO, dMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(pos).setY(pos.y + 0.05);
        disc.scale.setScalar(0.01);

        groupRef.current.add(ring, disc);

        const g = new THREE.Group();
        g.add(ring, disc);
        pool.current.push({ mesh: g, t: 0, dur, maxR, type: "burst" });
      },

      spawnSpark(pos, color, maxR, count = 8) {
        if (!groupRef.current) return;
        const g = new THREE.Group();
        for (let i = 0; i < count; i++) {
          const angle  = (i / count) * Math.PI * 2;
          const mat    = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
          const spark  = new THREE.Mesh(SPARK_GEO, mat);
          // Store initial angle in userData for animation
          spark.userData.angle  = angle;
          spark.userData.height = 0.5 + Math.random() * 0.6;
          spark.position.set(Math.cos(angle) * 0.05, 0.1, Math.sin(angle) * 0.05);
          g.add(spark);
        }
        g.position.copy(pos);
        groupRef.current.add(g);
        pool.current.push({ mesh: g, t: 0, dur: 0.4, maxR, type: "spark_ring" });
      },
    }));

    useFrame((_, delta) => {
      const alive: EffectEntry[] = [];

      for (const e of pool.current) {
        e.t = Math.min(1, e.t + delta / e.dur);
        const p = e.t;  // progress 0→1

        if (e.type === "ring") {
          const mesh = e.mesh as THREE.Mesh;
          mesh.scale.setScalar(p * e.maxR);
          (mesh.material as THREE.MeshBasicMaterial).opacity =
            p < 0.55 ? 0.85 : 0.85 * (1 - (p - 0.55) / 0.45);

        } else if (e.type === "burst") {
          const g    = e.mesh as THREE.Group;
          const ring = g.children[0] as THREE.Mesh;
          const disc = g.children[1] as THREE.Mesh;
          ring.scale.setScalar(p * e.maxR);
          disc.scale.setScalar(p * e.maxR * 0.92);
          (ring.material as THREE.MeshBasicMaterial).opacity =
            p < 0.5 ? 0.7 : 0.7 * (1 - (p - 0.5) / 0.5);
          (disc.material as THREE.MeshBasicMaterial).opacity =
            p < 0.4 ? 0.25 : 0.25 * (1 - (p - 0.4) / 0.6);

        } else if (e.type === "spark_ring") {
          const g = e.mesh as THREE.Group;
          for (const spark of g.children) {
            const s = spark as THREE.Mesh;
            const a = s.userData.angle as number;
            const h = s.userData.height as number;
            const r = p * e.maxR;
            s.position.set(Math.cos(a) * r, h * p * (1 - p) * 4, Math.sin(a) * r);
            const fade = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
            (s.material as THREE.MeshBasicMaterial).opacity = fade;
            (s.material as THREE.MeshBasicMaterial).transparent = true;
          }
        }

        if (e.t >= 1) {
          // Dispose materials and remove from scene
          if (e.type === "ring") {
            (e.mesh as THREE.Mesh).material.dispose();
            groupRef.current?.remove(e.mesh);
          } else if (e.type === "burst") {
            const g = e.mesh as THREE.Group;
            for (const c of g.children) (c as THREE.Mesh).material.dispose();
            groupRef.current?.remove(g);
          } else if (e.type === "spark_ring") {
            const g = e.mesh as THREE.Group;
            for (const c of g.children) (c as THREE.Mesh).material.dispose();
            groupRef.current?.remove(g);
          }
        } else {
          alive.push(e);
        }
      }

      pool.current = alive;
    });

    return <group ref={groupRef} />;
  }
);
