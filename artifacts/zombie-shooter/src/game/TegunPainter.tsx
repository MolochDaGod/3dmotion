/**
 * TegunPainter — scene-side R3F component + HTML HUD for the TEGUN weapon.
 *
 * When the player has TEGUN equipped:
 *  • An invisible 8000×8000 m pointer-capture plane sits just below the terrain.
 *  • Moving the cursor shows a coloured brush ring snapped to terrain height.
 *  • Scroll wheel cycles through the 7 paint modes.
 *  • LMB (via "tegun:fire" event from Player.tsx) stamps a paint disc or spawner.
 *
 * All paint strokes persist in useTegunStore and are re-rendered as flat discs.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useTegunStore, TEGUN_MODES, type TegunModeConfig } from "./useTegunStore";
import { useGameStore } from "./useGameStore";
import { useAdminStore } from "./useAdminStore";
import { getIslandHeight } from "./terrain";

// ─── Terrain height helper ────────────────────────────────────────────────────
function terrainY(x: number, z: number): number {
  return getIslandHeight(x, z) ?? 0;
}

// ─── Brush ring cursor ────────────────────────────────────────────────────────
function BrushCursor() {
  const { ghostVis, ghostPos, activeModeIdx, brushRadius } = useTegunStore();
  if (!ghostVis) return null;

  const cfg: TegunModeConfig = TEGUN_MODES[activeModeIdx];
  const [gx, gy, gz] = ghostPos;

  return (
    <group position={[gx, gy, gz]}>
      {/* Outer solid ring */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.18}>
        <ringGeometry args={[brushRadius - 0.4, brushRadius, 56]} />
        <meshBasicMaterial color={cfg.color} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner tinted fill */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.12}>
        <circleGeometry args={[brushRadius, 56]} />
        <meshBasicMaterial color={cfg.color} transparent opacity={0.10} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Mode label floating above */}
      <Text
        position={[0, 2.0, 0]}
        fontSize={0.30}
        color={cfg.color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.018}
        outlineColor="#000000"
        billboard
      >
        {cfg.icon} {cfg.label}
      </Text>
    </group>
  );
}

// ─── Paint strokes renderer ───────────────────────────────────────────────────
function PaintStrokes() {
  const { strokes } = useTegunStore();
  return (
    <>
      {strokes.map((s) => (
        <mesh
          key={s.id}
          rotation-x={-Math.PI / 2}
          position={[s.position[0], s.position[1] + 0.20, s.position[2]]}
        >
          <circleGeometry args={[s.radius, 36]} />
          <meshBasicMaterial
            color={s.color}
            transparent
            opacity={0.40}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

// ─── Spawner markers renderer ─────────────────────────────────────────────────
function SpawnerMarkers() {
  const { spawners } = useTegunStore();
  const spawnerCfg = TEGUN_MODES.find((m) => m.id === "spawner")!;
  return (
    <>
      {spawners.map((sp) => (
        <group key={sp.id} position={[sp.position[0], sp.position[1], sp.position[2]]}>
          {/* Base disc */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.15}>
            <circleGeometry args={[2.0, 24]} />
            <meshBasicMaterial color={spawnerCfg.color} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* Vertical post */}
          <mesh position-y={1.0}>
            <cylinderGeometry args={[0.12, 0.12, 2.0, 8]} />
            <meshStandardMaterial color={spawnerCfg.color} emissive={spawnerCfg.color} emissiveIntensity={0.5} />
          </mesh>
          {/* Top orb */}
          <mesh position-y={2.2}>
            <sphereGeometry args={[0.35, 12, 12]} />
            <meshStandardMaterial color={spawnerCfg.color} emissive={spawnerCfg.color} emissiveIntensity={0.8} />
          </mesh>
          {/* Label */}
          <Text
            position={[0, 3.0, 0]}
            fontSize={0.28}
            color={spawnerCfg.color}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.015}
            outlineColor="#000000"
            billboard
          >
            ☠ SPAWNER
          </Text>
          {/* Outer ring */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.22}>
            <ringGeometry args={[2.1, 2.5, 24]} />
            <meshBasicMaterial color={spawnerCfg.color} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ─── Main R3F scene component ─────────────────────────────────────────────────
export function TegunPainter() {
  const { weaponMode }    = useGameStore();
  const adminPanelOpen    = useGameStore((s) => s.adminPanelOpen);
  const { buildTool }     = useAdminStore();
  const {
    activeModeIdx, brushRadius,
    setModeIdx, setGhostPos, setGhostVis, addStroke, addSpawner,
  } = useTegunStore();

  // Active = TEGUN is equipped AND admin build-place isn't stealing pointer events
  const active = weaponMode === "tegun" && !(adminPanelOpen && buildTool === "place");

  // ── Scroll wheel → cycle TEGUN mode ────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    function onWheel(e: WheelEvent) {
      const target = e.target as HTMLElement;
      if (target?.closest?.("[data-admin-panel]")) return;
      e.preventDefault();
      const { activeModeIdx: cur } = useTegunStore.getState();
      const total = TEGUN_MODES.length;
      setModeIdx((cur + (e.deltaY > 0 ? 1 : -1) + total) % total);
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [active, setModeIdx]);

  // Hide ghost when TEGUN is put away
  useEffect(() => {
    if (!active) setGhostVis(false);
  }, [active, setGhostVis]);

  // ── tegun:fire event from Player.tsx ───────────────────────────────────────
  useEffect(() => {
    function onFire() {
      const { ghostVis, ghostPos, activeModeIdx: mi, brushRadius: br } = useTegunStore.getState();
      if (!ghostVis) return;
      const cfg = TEGUN_MODES[mi];
      if (cfg.id === "spawner") {
        addSpawner({ position: ghostPos });
      } else {
        addStroke({ mode: cfg.id, position: ghostPos, radius: br, color: cfg.color });
      }
    }
    window.addEventListener("tegun:fire", onFire);
    return () => window.removeEventListener("tegun:fire", onFire);
  }, [addStroke, addSpawner]);

  return (
    <>
      {/* Always render strokes/spawners even when TEGUN is away */}
      <PaintStrokes />
      <SpawnerMarkers />

      {active && (
        <>
          {/* Invisible pointer-capture plane covering the whole map */}
          <mesh
            rotation-x={-Math.PI / 2}
            position-y={-0.05}
            visible={false}
            onPointerMove={(e) => {
              e.stopPropagation();
              const x = e.point.x, z = e.point.z;
              setGhostPos([x, terrainY(x, z), z]);
              setGhostVis(true);
            }}
            onPointerLeave={() => setGhostVis(false)}
          >
            <planeGeometry args={[8000, 8000]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          <BrushCursor />
        </>
      )}
    </>
  );
}

// ─── HTML HUD overlay ─────────────────────────────────────────────────────────
const mono = "'Courier New', monospace";

export function TegunHUD() {
  const { weaponMode }   = useGameStore();
  const { activeModeIdx, brushRadius, setBrushRadius } = useTegunStore();

  if (weaponMode !== "tegun") return null;

  const cfg = TEGUN_MODES[activeModeIdx];

  return (
    <>
      {/* Bottom-centre mode bar */}
      <div style={{
        position: "fixed", bottom: 110, left: "50%", transform: "translateX(-50%)",
        zIndex: 8500, pointerEvents: "none",
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {TEGUN_MODES.map((m, i) => (
          <div key={m.id} style={{
            padding: "3px 8px",
            borderRadius: 3,
            fontFamily: mono, fontSize: 9, letterSpacing: 1.5,
            border: `1px solid ${i === activeModeIdx ? m.color : "rgba(255,255,255,0.12)"}`,
            background: i === activeModeIdx ? `${m.color}22` : "rgba(0,0,0,0.55)",
            color: i === activeModeIdx ? m.color : "rgba(255,255,255,0.3)",
            whiteSpace: "nowrap",
            boxShadow: i === activeModeIdx ? `0 0 6px ${m.color}66` : "none",
          }}>
            {m.icon} {m.label}
          </div>
        ))}
      </div>

      {/* Active mode callout */}
      <div style={{
        position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
        zIndex: 8500, pointerEvents: "none",
        background: "rgba(0,0,0,0.80)", border: `1px solid ${cfg.color}`,
        borderRadius: 4, padding: "5px 18px",
        fontFamily: mono, fontSize: 11, letterSpacing: 2,
        color: cfg.color, whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: `0 0 12px ${cfg.color}44`,
      }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>TEGUN</span>
        <span>{cfg.icon} {cfg.label}</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
          scroll cycle · LMB paint · [ ] brush size
        </span>
        <span style={{ fontSize: 9, color: cfg.color, opacity: 0.7 }}>r={brushRadius}m</span>
      </div>
    </>
  );
}
