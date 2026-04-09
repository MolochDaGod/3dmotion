import { useEffect, useRef, useState, useCallback } from "react";
import { useGameStore } from "./useGameStore";
import { getIslandHeight, isGenesisHeightsLoaded } from "./terrain";

// ── World bounds shown on the minimap ────────────────────────────────────────
// Full terrain is -6000→+6000 in X/Z. Land mass: x -800→1240, z -860→2580.
// We show the land mass + a comfortable ocean margin so the shape is legible.
const WORLD_X_MIN = -2000;
const WORLD_X_MAX = 2500;
const WORLD_Z_MIN = -1500;
const WORLD_Z_MAX = 3200;
const WORLD_W = WORLD_X_MAX - WORLD_X_MIN;   // 4500 m
const WORLD_D = WORLD_Z_MAX - WORLD_Z_MIN;   // 4700 m

// Canvas pixel dims — keep roughly the world aspect ratio
const CANVAS_W = 180;
const CANVAS_H = Math.round(CANVAS_W * (WORLD_D / WORLD_W)); // ~188

// ── Coordinate helpers ────────────────────────────────────────────────────────
function worldToCanvas(x: number, z: number): [number, number] {
  const px = ((x - WORLD_X_MIN) / WORLD_W) * CANVAS_W;
  // north (high Z) = top of minimap → flip Z axis
  const py = ((WORLD_Z_MAX - z) / WORLD_D) * CANVAS_H;
  return [px, py];
}

function canvasToWorld(px: number, py: number): [number, number] {
  const x = (px / CANVAS_W) * WORLD_W + WORLD_X_MIN;
  const z = WORLD_Z_MAX - (py / CANVAS_H) * WORLD_D;
  return [x, z];
}

// ── Biome coloring from raw height ───────────────────────────────────────────
function heightToRgb(h: number): [number, number, number] {
  if (h <= 1)    return [0,   42,  80];   // deep ocean
  if (h < 8)     return [10,  80, 130];   // shallow water
  if (h < 40)    return [195, 148, 52];   // beach / sand
  if (h < 200)   return [55,  165, 38];   // lowland grass
  if (h < 800)   return [28,  118, 22];   // jungle canopy
  if (h < 1400)  return [58,  105, 62];   // forest
  if (h < 2000)  return [118, 108, 95];   // bare rock
  return                 [212, 203, 188]; // snow peak
}

// ── Named teleport waypoints ──────────────────────────────────────────────────
const WAYPOINTS = [
  { label: "Township",  x:  760, z:   80, color: "#FFD700" },
  { label: "Dock",      x: 1040, z:    0, color: "#44AAFF" },
  { label: "N.Beach",   x:    0, z: 2190, color: "#66EEFF" },
  { label: "Mountain",  x:  160, z:  400, color: "#FFBB44" },
  { label: "S.Shore",   x:    0, z: -700, color: "#66EEFF" },
] as const;

type Mode = "view" | "teleport" | "spawner";

// ── Component ─────────────────────────────────────────────────────────────────
export function MinimapPanel() {
  const {
    showMinimap, setShowMinimap,
    customSpawners, addCustomSpawner, removeCustomSpawner,
    teleportTo,
  } = useGameStore();

  const terrainRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const rafId        = useRef(0);
  const [mode, setMode] = useState<Mode>("teleport");

  // ── Bake terrain into terrainRef canvas ──────────────────────────────────
  // Must run AFTER the canvas element mounts (hence inside useEffect + rAF).
  const bakeTerrain = useCallback(() => {
    const canvas = terrainRef.current;
    if (!canvas) return false;
    if (!isGenesisHeightsLoaded()) return false;

    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const img = ctx.createImageData(CANVAS_W, CANVAS_H);
    for (let py = 0; py < CANVAS_H; py++) {
      for (let px = 0; px < CANVAS_W; px++) {
        const [wx, wz] = canvasToWorld(px + 0.5, py + 0.5);
        const h = getIslandHeight(wx, wz);
        const [r, g, b] = heightToRgb(h);
        const shade = h > 2 ? 0.88 + 0.12 * Math.min(1, h / 400) : 1;
        const i = (py * CANVAS_W + px) * 4;
        img.data[i]     = Math.round(r * shade);
        img.data[i + 1] = Math.round(g * shade);
        img.data[i + 2] = Math.round(b * shade);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  }, []);

  // ── Trigger baking once canvas is mounted ────────────────────────────────
  useEffect(() => {
    if (!showMinimap) return;

    // Defer one frame so React has mounted the canvas DOM element
    const attempt = (retries = 0) => {
      if (bakeTerrain()) return;
      if (retries < 60) requestAnimationFrame(() => attempt(retries + 1));
    };
    requestAnimationFrame(() => attempt());
  }, [showMinimap, bakeTerrain]);

  // ── Live overlay: player, zombies, waypoints, spawners ───────────────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const gs = useGameStore.getState();

    // Waypoint triangles + labels
    WAYPOINTS.forEach(wp => {
      const [px, py] = worldToCanvas(wp.x, wp.z);
      ctx.fillStyle   = wp.color;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(px, py - 6);
      ctx.lineTo(px + 5, py + 3);
      ctx.lineTo(px - 5, py + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle   = "#fff";
      ctx.font        = "bold 7px monospace";
      ctx.textAlign   = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur  = 3;
      ctx.fillText(wp.label, px, py + 13);
      ctx.shadowBlur  = 0;
    });

    // Custom spawner skulls
    gs.customSpawners.forEach(([sx, sz]) => {
      const [px, py] = worldToCanvas(sx, sz);
      ctx.strokeStyle = "rgba(255,40,40,0.7)";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#bb0000";
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle  = "#fff";
      ctx.font       = "8px sans-serif";
      ctx.textAlign  = "center";
      ctx.fillText("☠", px, py + 3);
    });

    // Zombie dots
    gs.zombieWorldPositions.forEach(([zx, zz]) => {
      const [px, py] = worldToCanvas(zx, zz);
      ctx.fillStyle = "#ff4400";
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Player dot (gold with white ring)
    const [ppx, ppy] = worldToCanvas(gs.playerWorldPos[0], gs.playerWorldPos[1]);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(ppx, ppy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(ppx, ppy, 4, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // ── RAF loop for live overlay ─────────────────────────────────────────────
  useEffect(() => {
    if (!showMinimap) { cancelAnimationFrame(rafId.current); return; }
    const loop = () => { drawOverlay(); rafId.current = requestAnimationFrame(loop); };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [showMinimap, drawOverlay]);

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const rect  = e.currentTarget.getBoundingClientRect();
    const rawPx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const rawPy = (e.clientY - rect.top)  * (CANVAS_H / rect.height);
    const [wx, wz] = canvasToWorld(rawPx, rawPy);

    if (mode === "teleport") {
      const wy = getIslandHeight(wx, wz) + 22;
      teleportTo([wx, wy, wz]);
      // Close the map and re-lock the pointer so play resumes
      setShowMinimap(false);
      setTimeout(() => document.body.requestPointerLock(), 50);
    } else if (mode === "spawner") {
      addCustomSpawner([wx, wz]);
    }
  }, [mode, teleportTo, addCustomSpawner, setShowMinimap]);

  const closeMap = useCallback(() => {
    setShowMinimap(false);
    setTimeout(() => document.body.requestPointerLock(), 50);
  }, [setShowMinimap]);

  if (!showMinimap) return null;

  const panelW = CANVAS_W + 20;

  const btnBase: React.CSSProperties = {
    padding: "4px 0",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "bold",
    letterSpacing: 1,
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#666",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 4,
    cursor: "pointer",
    flex: 1,
    textTransform: "uppercase",
  };
  const btnOn: React.CSSProperties = {
    ...btnBase,
    background: "rgba(255,215,0,0.15)",
    border: "1px solid rgba(255,215,0,0.8)",
    color: "#FFD700",
  };

  return (
    <div
      style={{
        position:     "fixed",
        top:          20,
        right:        20,
        zIndex:       300,
        background:   "rgba(5, 10, 18, 0.95)",
        border:       "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding:      "10px",
        userSelect:   "none",
        boxShadow:    "0 8px 40px rgba(0,0,0,0.9)",
        width:        panelW,
      }}
      // Swallow pointer events so the underlying game doesn't steal them
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span style={{ color: "#FFD700", fontFamily: "monospace", fontSize: 11, fontWeight: "bold", letterSpacing: 2, flex: 1 }}>
          ⊞ MINIMAP
        </span>
        <span style={{ color: "#333", fontFamily: "monospace", fontSize: 8 }}>[M] close</span>
        <button onClick={closeMap} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
      </div>

      {/* Canvas stack — terrain bake + live overlay */}
      <div style={{
        position: "relative",
        width:    CANVAS_W,
        height:   CANVAS_H,
        cursor:   mode === "view" ? "default" : "crosshair",
        borderRadius: 2,
        overflow: "hidden",
        border:   "1px solid rgba(255,200,0,0.2)",
      }}>
        {/* Static terrain layer */}
        <canvas
          ref={terrainRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", inset: 0, display: "block", imageRendering: "pixelated" }}
        />
        {/* Live overlay — receives clicks */}
        <canvas
          ref={overlayRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", inset: 0, display: "block" }}
          onClick={handleClick}
        />
        {/* Mode hint inside the map */}
        {mode !== "view" && (
          <div style={{
            position:      "absolute",
            bottom:        4,
            left:          0,
            right:         0,
            textAlign:     "center",
            pointerEvents: "none",
            color:         mode === "teleport" ? "#FFD700" : "#FF7777",
            fontFamily:    "monospace",
            fontSize:      8,
            fontWeight:    "bold",
            textShadow:    "0 0 8px #000, 0 0 4px #000",
            letterSpacing: 1,
          }}>
            {mode === "teleport" ? "⚡ CLICK TO TELEPORT" : "☠ CLICK TO PLACE SPAWNER"}
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
        {(["view", "teleport", "spawner"] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={mode === m ? btnOn : btnBase}>
            {m === "view" ? "👁 View" : m === "teleport" ? "⚡ Warp" : "☠ Spawner"}
          </button>
        ))}
      </div>

      {/* Quick-jump buttons */}
      <div style={{ marginTop: 8 }}>
        <div style={{ color: "#2a2a2a", fontFamily: "monospace", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>QUICK JUMP</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {WAYPOINTS.map(wp => (
            <button
              key={wp.label}
              onClick={() => {
                const wy = getIslandHeight(wp.x, wp.z) + 22;
                teleportTo([wp.x, wy, wp.z]);
                closeMap();
              }}
              style={{
                padding:    "3px 7px",
                fontSize:   9,
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.04)",
                border:     `1px solid ${wp.color}44`,
                color:      wp.color,
                borderRadius: 4,
                cursor:     "pointer",
              }}
            >
              {wp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active spawners */}
      {customSpawners.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: "#2a2a2a", fontFamily: "monospace", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
            SPAWNERS ({customSpawners.length})
          </div>
          <div style={{ maxHeight: 72, overflowY: "auto" }}>
            {customSpawners.map(([sx, sz], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ color: "#FF7777", fontFamily: "monospace", fontSize: 9, flex: 1 }}>
                  ☠ {Math.round(sx)}, {Math.round(sz)}
                </span>
                <button
                  onClick={() => removeCustomSpawner(i)}
                  style={{ background: "none", border: "none", color: "#FF4444", cursor: "pointer", fontSize: 12, padding: 0 }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 9, fontFamily: "monospace", flexWrap: "wrap" }}>
        <span style={{ color: "#FFD700" }}>● You</span>
        <span style={{ color: "#ff4400" }}>● Zombies</span>
        <span style={{ color: "#FF7777" }}>☠ Spawners</span>
        <span style={{ color: "#aaa" }}>▲ Locations</span>
      </div>
    </div>
  );
}
