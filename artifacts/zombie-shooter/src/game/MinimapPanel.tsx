import { useEffect, useRef, useState, useCallback } from "react";
import { useGameStore } from "./useGameStore";
import { getIslandHeight, isGenesisHeightsLoaded } from "./terrain";

// ── Island land-mass bounds (trimmed — no wasted ocean) ──────────────────────
const WORLD_X_MIN = -900;
const WORLD_X_MAX = 1300;
const WORLD_Z_MIN = -950;
const WORLD_Z_MAX = 2650;
const WORLD_W     = WORLD_X_MAX - WORLD_X_MIN;  // 2200
const WORLD_D     = WORLD_Z_MAX - WORLD_Z_MIN;  // 3600

// Canvas pixel dims — aspect ratio matches the world bounds
const CANVAS_W = 198;
const CANVAS_H = 324;

// ── Coordinate helpers ────────────────────────────────────────────────────────
function worldToCanvas(x: number, z: number): [number, number] {
  const px = ((x - WORLD_X_MIN) / WORLD_W) * CANVAS_W;
  // north (high Z) = top of map → flip Z
  const py = ((WORLD_Z_MAX - z) / WORLD_D) * CANVAS_H;
  return [px, py];
}

function canvasToWorld(px: number, py: number): [number, number] {
  const x = (px / CANVAS_W) * WORLD_W + WORLD_X_MIN;
  const z = WORLD_Z_MAX - (py / CANVAS_H) * WORLD_D;
  return [x, z];
}

// ── Biome coloring from height ────────────────────────────────────────────────
function heightToRgb(h: number): [number, number, number] {
  if (h <= 0)    return [0,   48,  90];   // ocean deep
  if (h < 6)     return [10,  80, 130];   // ocean shallow
  if (h < 40)    return [200, 153, 58];   // beach / sand
  if (h < 200)   return [58,  170, 40];   // lowland grass
  if (h < 800)   return [29,  120, 24];   // jungle canopy
  if (h < 1400)  return [61,  107, 64];   // forest
  if (h < 2000)  return [122, 110, 98];   // bare rock
  return                 [216, 207, 192]; // snow peak
}

// ── Named teleport waypoints ──────────────────────────────────────────────────
const WAYPOINTS = [
  { label: "Township",  x: 760,  z:  80,   color: "#FFD700" },
  { label: "Dock",      x: 1040, z:   0,   color: "#4AF" },
  { label: "N.Beach",   x:   0,  z: 2190,  color: "#6EF" },
  { label: "Mountain",  x: 160,  z: 400,   color: "#FC8" },
  { label: "S.Shore",   x:   0,  z: -700,  color: "#6EF" },
] as const;

type Mode = "view" | "teleport" | "spawner";

// ── Component ─────────────────────────────────────────────────────────────────
export function MinimapPanel() {
  const {
    showMinimap, setShowMinimap,
    customSpawners, addCustomSpawner, removeCustomSpawner,
    teleportTo,
  } = useGameStore();

  const terrainRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const terrainBaked = useRef(false);
  const rafId        = useRef(0);
  const [mode, setMode] = useState<Mode>("teleport");

  // ── M key toggle ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        useGameStore.getState().setShowMinimap(
          !useGameStore.getState().showMinimap
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Bake terrain ImageData once (after heights are loaded) ───────────────
  const bakeTerrain = useCallback(() => {
    const canvas = terrainRef.current;
    if (!canvas || terrainBaked.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(CANVAS_W, CANVAS_H);
    for (let py = 0; py < CANVAS_H; py++) {
      for (let px = 0; px < CANVAS_W; px++) {
        const [wx, wz] = canvasToWorld(px + 0.5, py + 0.5);
        const h        = getIslandHeight(wx, wz);
        const [r, g, b] = heightToRgb(h);
        // slight darkening at lower elevations for depth
        const shade = 0.85 + 0.15 * Math.min(1, h / 200);
        const i = (py * CANVAS_W + px) * 4;
        img.data[i]     = Math.round(r * shade);
        img.data[i + 1] = Math.round(g * shade);
        img.data[i + 2] = Math.round(b * shade);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    terrainBaked.current = true;
  }, []);

  useEffect(() => {
    if (!showMinimap) return;
    if (isGenesisHeightsLoaded()) {
      bakeTerrain();
    } else {
      const id = setInterval(() => {
        if (isGenesisHeightsLoaded()) { bakeTerrain(); clearInterval(id); }
      }, 250);
      return () => clearInterval(id);
    }
  }, [showMinimap, bakeTerrain]);

  // ── Live overlay: player dot + zombie dots + waypoints + spawners ─────────
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const gs = useGameStore.getState();

    // Waypoint triangles
    WAYPOINTS.forEach(wp => {
      const [px, py] = worldToCanvas(wp.x, wp.z);
      ctx.fillStyle   = wp.color;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py - 7);
      ctx.lineTo(px + 5, py + 3);
      ctx.lineTo(px - 5, py + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle  = "#fff";
      ctx.font       = "bold 7px monospace";
      ctx.textAlign  = "center";
      ctx.shadowColor   = "#000";
      ctx.shadowBlur    = 3;
      ctx.fillText(wp.label, px, py + 14);
      ctx.shadowBlur = 0;
    });

    // Custom spawner icons
    gs.customSpawners.forEach(([sx, sz]) => {
      const [px, py] = worldToCanvas(sx, sz);
      // Pulsing outer ring
      ctx.strokeStyle = "rgba(255,40,40,0.6)";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      // Fill
      ctx.fillStyle = "#cc0000";
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      // Skull glyph
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

    // Player dot (yellow, white ring)
    const [ppx, ppy] = worldToCanvas(gs.playerWorldPos[0], gs.playerWorldPos[1]);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(ppx, ppy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(ppx, ppy, 4, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // RAF loop for live overlay
  useEffect(() => {
    if (!showMinimap) { cancelAnimationFrame(rafId.current); return; }
    const loop = () => { drawOverlay(); rafId.current = requestAnimationFrame(loop); };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [showMinimap, drawOverlay]);

  // ── Click handler (teleport or place spawner) ─────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const rawPx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const rawPy = (e.clientY - rect.top)  * (CANVAS_H / rect.height);
    const [wx, wz] = canvasToWorld(rawPx, rawPy);

    if (mode === "teleport") {
      const wy = getIslandHeight(wx, wz) + 22;
      teleportTo([wx, wy, wz]);
    } else if (mode === "spawner") {
      addCustomSpawner([wx, wz]);
    }
  }, [mode, teleportTo, addCustomSpawner]);

  if (!showMinimap) return null;

  const btnBase: React.CSSProperties = {
    padding: "4px 0",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "bold",
    letterSpacing: 1,
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#888",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    cursor: "pointer",
    flex: 1,
    textTransform: "uppercase",
  };
  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "rgba(255,215,0,0.18)",
    border: "1px solid #FFD700",
    color: "#FFD700",
  };

  return (
    <div style={{
      position:   "fixed",
      top:        20,
      right:      20,
      zIndex:     200,
      background: "rgba(6, 12, 20, 0.94)",
      border:     "1px solid rgba(255,255,255,0.12)",
      borderRadius: 8,
      padding:    "10px",
      userSelect: "none",
      boxShadow:  "0 6px 32px rgba(0,0,0,0.8)",
      width:      CANVAS_W + 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ color: "#FFD700", fontFamily: "monospace", fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
          ⊞ MINIMAP
        </span>
        <span style={{ color: "#444", fontFamily: "monospace", fontSize: 9 }}>[M] to close</span>
        <button
          onClick={() => setShowMinimap(false)}
          style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
        >✕</button>
      </div>

      {/* Canvas stack: terrain + live overlay */}
      <div style={{
        position: "relative",
        width: CANVAS_W,
        height: CANVAS_H,
        cursor: mode === "view" ? "default" : "crosshair",
        borderRadius: 3,
        overflow: "hidden",
      }}>
        {/* Terrain layer (static bake) */}
        <canvas
          ref={terrainRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", inset: 0, imageRendering: "pixelated" }}
        />
        {/* Overlay layer (live dots) */}
        <canvas
          ref={overlayRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: "absolute", inset: 0 }}
          onClick={handleClick}
        />
        {/* Border overlay */}
        <div style={{
          position: "absolute", inset: 0,
          border: "1px solid rgba(255,200,0,0.25)",
          borderRadius: 3,
          pointerEvents: "none",
        }} />
        {/* Mode label inside map */}
        {mode !== "view" && (
          <div style={{
            position: "absolute", bottom: 4, left: 0, right: 0,
            textAlign: "center", pointerEvents: "none",
            color: mode === "teleport" ? "#FFD700" : "#FF6666",
            fontFamily: "monospace", fontSize: 8, fontWeight: "bold",
            textShadow: "0 0 6px rgba(0,0,0,1)",
            letterSpacing: 1,
          }}>
            {mode === "teleport" ? "⚡ CLICK TO TELEPORT" : "☠ CLICK TO PLACE SPAWNER"}
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
        {(["view", "teleport", "spawner"] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={mode === m ? btnActive : btnBase}
          >
            {m === "view" ? "👁 View" : m === "teleport" ? "⚡ Teleport" : "☠ Spawner"}
          </button>
        ))}
      </div>

      {/* Quick-jump waypoints */}
      <div style={{ marginTop: 8 }}>
        <div style={{ color: "#3a3a3a", fontFamily: "monospace", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
          QUICK JUMP
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {WAYPOINTS.map(wp => (
            <button
              key={wp.label}
              onClick={() => {
                const wy = getIslandHeight(wp.x, wp.z) + 22;
                teleportTo([wp.x, wy, wp.z]);
              }}
              style={{
                padding: "3px 7px",
                fontSize: 9,
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${wp.color}55`,
                color: wp.color,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {wp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom spawners list */}
      {customSpawners.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: "#3a3a3a", fontFamily: "monospace", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
            ACTIVE SPAWNERS ({customSpawners.length})
          </div>
          <div style={{ maxHeight: 80, overflowY: "auto" }}>
            {customSpawners.map(([sx, sz], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ color: "#FF7777", fontFamily: "monospace", fontSize: 9, flex: 1 }}>
                  ☠ {Math.round(sx)}, {Math.round(sz)}
                </span>
                <button
                  onClick={() => removeCustomSpawner(i)}
                  style={{ background: "none", border: "none", color: "#FF4444", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 9, fontFamily: "monospace" }}>
        <span style={{ color: "#FFD700" }}>● You</span>
        <span style={{ color: "#ff4400" }}>● Zombies</span>
        <span style={{ color: "#FF6666" }}>☠ Spawners</span>
        <span style={{ color: "#FFD700" }}>▲ Locations</span>
      </div>
    </div>
  );
}
