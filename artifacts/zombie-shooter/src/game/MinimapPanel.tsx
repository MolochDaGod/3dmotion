import { useEffect, useRef, useState, useCallback } from "react";
import { useGameStore } from "./useGameStore";
import { getIslandHeight, isGenesisHeightsLoaded } from "./terrain";

// ── World bounds ──────────────────────────────────────────────────────────────
const WORLD_X_MIN = -2000;
const WORLD_X_MAX =  2500;
const WORLD_Z_MIN = -1500;
const WORLD_Z_MAX =  3200;
const WORLD_W     = WORLD_X_MAX - WORLD_X_MIN;  // 4500 m
const WORLD_D     = WORLD_Z_MAX - WORLD_Z_MIN;  // 4700 m

// ── Canvas resolution ─────────────────────────────────────────────────────────
// Rendered at 512 px wide — bilinear interp gives smooth satellite appearance.
const CANVAS_W = 512;
const CANVAS_H = Math.round(CANVAS_W * (WORLD_D / WORLD_W)); // 535

// ── Airship orbit (mirrors Airship.tsx constants) ─────────────────────────────
const ORBIT_X_RADIUS  = 1000;
const ORBIT_Z_RADIUS  = 1600;
const ORBIT_Z_CENTER  =  750;
const ORBIT_PERIOD_MS = 140_000; // ms per revolution

function getAirshipXZ(ms: number): [number, number] {
  const angle = ((ms / ORBIT_PERIOD_MS) % 1) * Math.PI * 2;
  return [
    ORBIT_X_RADIUS * Math.cos(angle),
    ORBIT_Z_CENTER + ORBIT_Z_RADIUS * Math.sin(angle),
  ];
}

// ── Underground tunnel pairs ──────────────────────────────────────────────────
// Each pair is [entrance A, entrance B] in world XZ
const TUNNELS: Array<{ label: string; ax: number; az: number; bx: number; bz: number }> = [
  { label: "Volcanic Cave",  ax:  180, az:  360, bx:  340, bz:  580 },
  { label: "Dock Passage",   ax:  870, az:  -40, bx:  730, bz:  190 },
  { label: "N. Catacombs",  ax:  -80, az: 1560, bx:  130, bz: 1800 },
  { label: "Island Cross",   ax:  200, az:  700, bx:  620, bz:  700 },
];

// ── Named map zones ───────────────────────────────────────────────────────────
const ZONES: Array<{ label: string; x: number; z: number; color: string; size: number }> = [
  { label: "TOWNSHIP",      x:  680, z:   60, color: "#FFD700", size: 9 },
  { label: "THE DOCK",      x:  990, z:  -30, color: "#44CCFF", size: 8 },
  { label: "N. BEACH",      x:   30, z: 2100, color: "#88EEFF", size: 8 },
  { label: "VOLCANIC PEAK", x:  110, z:  320, color: "#FF8844", size: 8 },
  { label: "S. SHORE",      x:  -50, z: -620, color: "#88EEFF", size: 8 },
  { label: "JUNGLE RIDGE",  x: -200, z:  700, color: "#44FF88", size: 8 },
  { label: "OCEAN",         x: -800, z:  500, color: "#2266AA", size: 10 },
];

// ── Quick-jump waypoints ──────────────────────────────────────────────────────
const WAYPOINTS = [
  { label: "Township",  x:  760, z:   80, color: "#FFD700" },
  { label: "Dock",      x: 1040, z:    0, color: "#44AAFF" },
  { label: "N.Beach",   x:    0, z: 2190, color: "#66EEFF" },
  { label: "Mountain",  x:  160, z:  400, color: "#FFBB44" },
  { label: "S.Shore",   x:    0, z: -700, color: "#66EEFF" },
] as const;

type Mode = "view" | "teleport" | "spawner";

// ── Coordinate converters ─────────────────────────────────────────────────────
function worldToCanvas(wx: number, wz: number): [number, number] {
  const px = ((wx - WORLD_X_MIN) / WORLD_W) * CANVAS_W;
  const py = ((WORLD_Z_MAX - wz) / WORLD_D) * CANVAS_H; // north = top
  return [px, py];
}
function canvasToWorld(px: number, py: number): [number, number] {
  const wx = (px / CANVAS_W) * WORLD_W + WORLD_X_MIN;
  const wz = WORLD_Z_MAX - (py / CANVAS_H) * WORLD_D;
  return [wx, wz];
}

// ── Satellite biome palette (tuned for GENESIS_HEIGHT_SCALE = 4×) ─────────────
// Raw heights 0–128 m × 4 = 0–513 m world.
function heightToRgb(h: number): [number, number, number] {
  if (h <= 0)    return [  0,  18,  52];  // abyssal ocean
  if (h <  2)    return [  8,  58, 118];  // shallow / near-shore
  if (h < 10)    return [198, 160,  82];  // sandy beach
  if (h < 40)    return [ 78, 172,  62];  // coastal grass
  if (h < 150)   return [ 32, 122,  36];  // dense jungle
  if (h < 300)   return [ 48, 100,  52];  // highland forest
  if (h < 440)   return [132, 116,  96];  // bare rock
  return                 [235, 228, 218];  // snow / ice cap
}

// ── Terrain bake with NW hillshading ─────────────────────────────────────────
// Samples 3 neighbours per pixel (north + west + center) to compute a
// Lambertian-style shading from a top-left sun. One-time CPU cost ≈ 300 ms.
function bakeTerrain(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // World step per 3 canvas pixels (used for slope estimation)
  const stepX = (WORLD_W / CANVAS_W) * 3;
  const stepZ = (WORLD_D / CANVAS_H) * 3;

  const img = ctx.createImageData(CANVAS_W, CANVAS_H);

  for (let py = 0; py < CANVAS_H; py++) {
    for (let px = 0; px < CANVAS_W; px++) {
      const [wx, wz] = canvasToWorld(px + 0.5, py + 0.5);
      const h  = getIslandHeight(wx, wz);
      // Neighbours: north (high world Z → smaller py) and west (low world X)
      const hN = getIslandHeight(wx,        wz + stepZ); // north
      const hW = getIslandHeight(wx - stepX, wz);         // west

      // Hillshade: NW sun lights north-facing + west-facing slopes
      // h > hN  → slope ascends northward → NW-lit
      // h > hW  → slope ascends westward  → NW-lit
      let shade = 0.78;
      if (h > 2) {
        shade = Math.max(0.22, Math.min(1.35,
          0.75 + (h - hN) * 0.018 + (h - hW) * 0.012
        ));
      }

      // Depth darkening for ocean (simulate water depth)
      let [r, g, b] = heightToRgb(h);
      if (h <= 2) {
        const depth = Math.max(0, Math.min(1, -h / 50 + 1));
        shade = 0.5 + depth * 0.5;
      }

      const i = (py * CANVAS_W + px) * 4;
      img.data[i]     = Math.min(255, Math.round(r * shade));
      img.data[i + 1] = Math.min(255, Math.round(g * shade));
      img.data[i + 2] = Math.min(255, Math.round(b * shade));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Shore glow — scan for land/water transitions and paint a bright coast line
  const shoreImg = ctx.createImageData(CANVAS_W, CANVAS_H);
  const srcData  = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
  for (let py = 1; py < CANVAS_H - 1; py++) {
    for (let px = 1; px < CANVAS_W - 1; px++) {
      const [wx, wz] = canvasToWorld(px + 0.5, py + 0.5);
      const h = getIslandHeight(wx, wz);
      if (h >= 2 && h < 12) {
        // Check if an adjacent pixel is ocean
        const [wxE, ] = canvasToWorld(px + 1 + 0.5, py + 0.5);
        const [wxW, ] = canvasToWorld(px - 1 + 0.5, py + 0.5);
        const [, wzN] = canvasToWorld(px + 0.5, py - 1 + 0.5);
        const [, wzS] = canvasToWorld(px + 0.5, py + 1 + 0.5);
        const nearOcean =
          getIslandHeight(wxE, wz) < 2 || getIslandHeight(wxW, wz) < 2 ||
          getIslandHeight(wx, wzN) < 2 || getIslandHeight(wx, wzS) < 2;
        if (nearOcean) {
          const i = (py * CANVAS_W + px) * 4;
          shoreImg.data[i]     = 255;
          shoreImg.data[i + 1] = 240;
          shoreImg.data[i + 2] = 180;
          shoreImg.data[i + 3] = 120; // semi-transparent glow
        }
      }
    }
  }
  // Composite shore over terrain
  const composite = ctx.createImageData(CANVAS_W, CANVAS_H);
  const baseData  = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
  for (let i = 0; i < CANVAS_W * CANVAS_H * 4; i += 4) {
    const a = shoreImg.data[i + 3] / 255;
    composite.data[i]     = Math.round(baseData[i]     * (1 - a) + shoreImg.data[i]     * a);
    composite.data[i + 1] = Math.round(baseData[i + 1] * (1 - a) + shoreImg.data[i + 1] * a);
    composite.data[i + 2] = Math.round(baseData[i + 2] * (1 - a) + shoreImg.data[i + 2] * a);
    composite.data[i + 3] = 255;
  }
  ctx.putImageData(composite, 0, 0);

  // Grid lines (very subtle, cartographic style)
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 0.5;
  for (let gx = -1500; gx <= 2500; gx += 500) {
    const [cpx] = worldToCanvas(gx, 0);
    ctx.beginPath(); ctx.moveTo(cpx, 0); ctx.lineTo(cpx, CANVAS_H); ctx.stroke();
  }
  for (let gz = -1000; gz <= 3000; gz += 500) {
    const [, cpy] = worldToCanvas(0, gz);
    ctx.beginPath(); ctx.moveTo(0, cpy); ctx.lineTo(CANVAS_W, cpy); ctx.stroke();
  }
  ctx.restore();
}

// ── Overlay draw (called every RAF frame) ─────────────────────────────────────
function drawOverlay(
  canvas: HTMLCanvasElement,
  gs: ReturnType<typeof useGameStore.getState>,
  now: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Airship orbit ellipse ─────────────────────────────────────────────────
  const [ocx, ocy] = worldToCanvas(0, ORBIT_Z_CENTER);
  const oRx = (ORBIT_X_RADIUS / WORLD_W) * CANVAS_W;
  const oRy = (ORBIT_Z_RADIUS / WORLD_D) * CANVAS_H;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "rgba(255, 200, 50, 0.35)";
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.ellipse(ocx, ocy, oRx, oRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Tunnel routes (dashed orange line + entrance icons) ───────────────────
  TUNNELS.forEach(t => {
    const [ax, ay] = worldToCanvas(t.ax, t.az);
    const [bx, by] = worldToCanvas(t.bx, t.bz);

    // Dashed tunnel line
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(200, 140, 50, 0.6)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Entrance markers (small brown squares)
    [[ax, ay], [bx, by]].forEach(([ex, ey]) => {
      ctx.fillStyle   = "#8B5E3C";
      ctx.strokeStyle = "#FFB060";
      ctx.lineWidth   = 1;
      ctx.fillRect(ex - 5, ey - 5, 10, 10);
      ctx.strokeRect(ex - 5, ey - 5, 10, 10);
      ctx.fillStyle = "#FFF";
      ctx.font      = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("T", ex, ey);
    });
  });

  // ── Zone labels ───────────────────────────────────────────────────────────
  ZONES.forEach(z => {
    const [zx, zy] = worldToCanvas(z.x, z.z);
    ctx.save();
    ctx.font         = `bold ${z.size}px monospace`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor  = "rgba(0,0,0,0.9)";
    ctx.shadowBlur   = 4;
    ctx.fillStyle    = z.color;
    ctx.globalAlpha  = 0.75;
    ctx.fillText(z.label, zx, zy);
    ctx.restore();
  });

  // ── Waypoint pins ─────────────────────────────────────────────────────────
  WAYPOINTS.forEach(wp => {
    const [px, py] = worldToCanvas(wp.x, wp.z);
    // Pin body
    ctx.fillStyle   = wp.color;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(px, py - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Pin needle
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 3, py - 5);
    ctx.lineTo(px + 3, py - 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Label
    ctx.fillStyle    = "#fff";
    ctx.font         = "bold 7px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor  = "#000";
    ctx.shadowBlur   = 3;
    ctx.fillText(wp.label, px, py + 3);
    ctx.shadowBlur   = 0;
  });

  // ── Custom spawners ───────────────────────────────────────────────────────
  gs.customSpawners.forEach(([sx, sz]) => {
    const [px, py] = worldToCanvas(sx, sz);
    ctx.strokeStyle = "rgba(255,40,40,0.9)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#bb0000";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle    = "#fff";
    ctx.font         = "9px sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("☠", px, py);
  });

  // ── Zombie dots ───────────────────────────────────────────────────────────
  gs.zombieWorldPositions.forEach(([zx, zz]) => {
    const [px, py] = worldToCanvas(zx, zz);
    ctx.fillStyle = "#FF3300";
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Airship live position ─────────────────────────────────────────────────
  const [ax, az_] = getAirshipXZ(now);
  const [apx, apy] = worldToCanvas(ax, az_);

  // Airship glow
  const grad = ctx.createRadialGradient(apx, apy, 0, apx, apy, 14);
  grad.addColorStop(0, "rgba(255,200,50,0.55)");
  grad.addColorStop(1, "rgba(255,200,50,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(apx, apy, 14, 0, Math.PI * 2);
  ctx.fill();

  // Airship body (small zeppelin shape)
  const airAngle = ((now / ORBIT_PERIOD_MS) % 1) * Math.PI * 2;
  const tangX    = -Math.sin(airAngle);
  const tangZ    =  Math.cos(airAngle);
  // Convert tangent direction to canvas angle (Z is flipped on canvas)
  const canvasAngle = Math.atan2(-tangZ, tangX);
  ctx.save();
  ctx.translate(apx, apy);
  ctx.rotate(canvasAngle);
  // Gas bag (ellipse)
  ctx.fillStyle   = "#FFD700";
  ctx.strokeStyle = "#A07000";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Gondola
  ctx.fillStyle = "#886600";
  ctx.fillRect(-4, 4, 8, 3);
  // Label
  ctx.fillStyle    = "#FFF";
  ctx.font         = "bold 7px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor  = "#000";
  ctx.shadowBlur   = 3;
  ctx.fillText("AIRSHIP", 0, -7);
  ctx.shadowBlur   = 0;
  ctx.restore();

  // ── Player dot (gold arrow pointing north) ────────────────────────────────
  const [ppx, ppy] = worldToCanvas(gs.playerWorldPos[0], gs.playerWorldPos[1]);
  // Outer ring (pulsing)
  const pulse = 0.6 + 0.4 * Math.sin(now * 0.004);
  ctx.strokeStyle = `rgba(255,255,255,${pulse * 0.9})`;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(ppx, ppy, 8, 0, Math.PI * 2);
  ctx.stroke();
  // Gold fill
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.arc(ppx, ppy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // "YOU" label
  ctx.fillStyle    = "#fff";
  ctx.font         = "bold 8px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor  = "#000";
  ctx.shadowBlur   = 4;
  ctx.fillText("YOU", ppx, ppy - 10);
  ctx.shadowBlur   = 0;

  // ── Compass rose (bottom-right) ───────────────────────────────────────────
  const cr = { x: CANVAS_W - 28, y: CANVAS_H - 28, r: 18 };
  ctx.save();
  ctx.globalAlpha = 0.85;
  // Circle
  ctx.strokeStyle = "rgba(255,215,0,0.5)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2);
  ctx.stroke();
  // N arrow (up = north on our map)
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.moveTo(cr.x,          cr.y - cr.r + 2);
  ctx.lineTo(cr.x - 5,      cr.y);
  ctx.lineTo(cr.x + 5,      cr.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.moveTo(cr.x,          cr.y + cr.r - 2);
  ctx.lineTo(cr.x - 5,      cr.y);
  ctx.lineTo(cr.x + 5,      cr.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle    = "#FFD700";
  ctx.font         = "bold 9px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cr.x, cr.y - cr.r - 7);
  ctx.restore();

  // ── Scale bar (bottom-left) ───────────────────────────────────────────────
  const scaleWorldM   = 500;  // 500 m
  const scaleCanvasPx = (scaleWorldM / WORLD_W) * CANVAS_W; // pixels for 500 m
  const sbX = 10, sbY = CANVAS_H - 12;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(sbX, sbY);
  ctx.lineTo(sbX + scaleCanvasPx, sbY);
  ctx.stroke();
  // Tick marks
  ctx.beginPath();
  ctx.moveTo(sbX, sbY - 3); ctx.lineTo(sbX, sbY + 3); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sbX + scaleCanvasPx, sbY - 3); ctx.lineTo(sbX + scaleCanvasPx, sbY + 3); ctx.stroke();
  ctx.fillStyle    = "rgba(255,255,255,0.8)";
  ctx.font         = "7px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("500 m", sbX + scaleCanvasPx / 2, sbY - 3);
  ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────
export function MinimapPanel() {
  const {
    showMinimap, setShowMinimap,
    customSpawners, addCustomSpawner, removeCustomSpawner,
    teleportTo,
  } = useGameStore();

  const terrainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rafId      = useRef(0);
  const [mode, setMode]         = useState<Mode>("teleport");
  const [bakedFlag, setBakedFlag] = useState(false);

  // ── Bake terrain once on open ─────────────────────────────────────────────
  const tryBake = useCallback(() => {
    const canvas = terrainRef.current;
    if (!canvas || !isGenesisHeightsLoaded()) return false;
    bakeTerrain(canvas);
    setBakedFlag(true);
    return true;
  }, []);

  useEffect(() => {
    if (!showMinimap) return;
    const attempt = (retries = 0) => {
      if (tryBake()) return;
      if (retries < 120) requestAnimationFrame(() => attempt(retries + 1));
    };
    requestAnimationFrame(() => attempt());
  }, [showMinimap, tryBake]);

  // ── Live overlay RAF loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showMinimap) { cancelAnimationFrame(rafId.current); return; }
    const loop = () => {
      const canvas = overlayRef.current;
      if (canvas) drawOverlay(canvas, useGameStore.getState(), performance.now());
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [showMinimap]);

  // ── Click / tap handler ───────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const rect  = e.currentTarget.getBoundingClientRect();
    const rawPx = (e.clientX - rect.left)  * (CANVAS_W / rect.width);
    const rawPy = (e.clientY - rect.top)   * (CANVAS_H / rect.height);
    const [wx, wz] = canvasToWorld(rawPx, rawPy);

    if (mode === "teleport") {
      const wy = getIslandHeight(wx, wz) + 22;
      teleportTo([wx, wy, wz]);
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

  // ── Styles ────────────────────────────────────────────────────────────────
  const isMobile = window.innerWidth < 600;

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position:    "fixed",
        inset:       0,
        zIndex:      400,
        background:  "rgba(2, 6, 14, 0.98)",
        display:     "flex",
        flexDirection: "column",
        overflow:    "hidden",
      }
    : {
        position:    "fixed",
        top:         "50%",
        left:        "50%",
        transform:   "translate(-50%, -50%)",
        zIndex:      400,
        background:  "rgba(2, 6, 14, 0.97)",
        border:      "1px solid rgba(255,215,0,0.3)",
        borderRadius: 10,
        boxShadow:   "0 0 80px rgba(0,0,0,0.95), 0 0 30px rgba(255,215,0,0.07) inset",
        display:     "flex",
        flexDirection: "column",
        maxHeight:   "95vh",
        overflow:    "hidden",
      };

  const mono: React.CSSProperties = { fontFamily: "monospace" };

  const btnBase: React.CSSProperties = {
    ...mono,
    padding:       "6px 0",
    fontSize:      10,
    fontWeight:    "bold",
    letterSpacing: 1,
    border:        "1px solid rgba(255,255,255,0.12)",
    color:         "#555",
    background:    "rgba(255,255,255,0.03)",
    borderRadius:  5,
    cursor:        "pointer",
    flex:          1,
    textTransform: "uppercase" as const,
  };
  const btnOn: React.CSSProperties = {
    ...btnBase,
    background: "rgba(255,215,0,0.14)",
    border:     "1px solid rgba(255,215,0,0.7)",
    color:      "#FFD700",
  };

  return (
    <div
      style={panelStyle}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        padding:       "10px 14px 8px",
        borderBottom:  "1px solid rgba(255,215,0,0.1)",
        flexShrink:    0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...mono, color: "#FFD700", fontSize: 13, fontWeight: "bold", letterSpacing: 3 }}>
            ⊞ GENESIS ISLAND
          </div>
          <div style={{ ...mono, color: "#555", fontSize: 8, letterSpacing: 2, marginTop: 1 }}>
            INTERACTIVE SATELLITE MAP  ·  {bakedFlag ? "RENDERED" : "RENDERING…"}
          </div>
        </div>
        <div style={{ ...mono, color: "#333", fontSize: 8, marginRight: 10 }}>[M] close</div>
        <button
          onClick={closeMap}
          style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, padding: 0 }}
        >✕</button>
      </div>

      {/* ── Map canvas ─────────────────────────────────────────────────────── */}
      <div style={{
        position:   "relative",
        flex:       isMobile ? "1" : "none",
        width:      isMobile ? "100%" : CANVAS_W,
        height:     isMobile ? undefined : CANVAS_H,
        aspectRatio: isMobile ? `${CANVAS_W} / ${CANVAS_H}` : undefined,
        cursor:     mode === "view" ? "default" : "crosshair",
        background: "#000918",
        overflow:   "hidden",
        borderBottom: "1px solid rgba(255,215,0,0.1)",
      }}>
        {/* Terrain bake layer */}
        <canvas
          ref={terrainRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            position:      "absolute",
            inset:         0,
            width:         "100%",
            height:        "100%",
            display:       "block",
            imageRendering: "auto",
          }}
        />
        {/* Live overlay layer — receives clicks */}
        <canvas
          ref={overlayRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            position: "absolute",
            inset:    0,
            width:    "100%",
            height:   "100%",
            display:  "block",
          }}
          onClick={handleClick}
        />
        {/* Mode hint */}
        {mode !== "view" && (
          <div style={{
            position:      "absolute",
            bottom:        32,
            left:          0,
            right:         0,
            textAlign:     "center",
            pointerEvents: "none",
            color:         mode === "teleport" ? "#FFD700" : "#FF7777",
            ...mono,
            fontSize:      10,
            fontWeight:    "bold",
            textShadow:    "0 0 10px #000, 0 0 5px #000",
            letterSpacing: 1,
          }}>
            {mode === "teleport" ? "⚡ CLICK TO TELEPORT" : "☠ CLICK TO PLACE SPAWNER"}
          </div>
        )}
      </div>

      {/* ── Controls strip ─────────────────────────────────────────────────── */}
      <div style={{ padding: "8px 14px", flexShrink: 0 }}>
        {/* Mode buttons */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["view", "teleport", "spawner"] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={mode === m ? btnOn : btnBase}>
              {m === "view" ? "👁 VIEW" : m === "teleport" ? "⚡ WARP" : "☠ SPAWNER"}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          display:    "flex",
          gap:        10,
          flexWrap:   "wrap",
          marginBottom: 8,
          ...mono,
          fontSize:   9,
          color:      "#444",
        }}>
          <span style={{ color: "#FFD700" }}>● YOU</span>
          <span style={{ color: "#FF3300" }}>● ZOMBIE</span>
          <span style={{ color: "#FF7777" }}>☠ SPAWNER</span>
          <span style={{ color: "#FFD700" }}>▲ POI</span>
          <span style={{ color: "#FFB060" }}>✈ AIRSHIP</span>
          <span style={{ color: "#FFB060" }}>T TUNNEL</span>
        </div>

        {/* Quick jump */}
        <div style={{ ...mono, fontSize: 8, letterSpacing: 1, color: "#333", marginBottom: 5 }}>QUICK JUMP</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {WAYPOINTS.map(wp => (
            <button
              key={wp.label}
              onClick={() => {
                const wy = getIslandHeight(wp.x, wp.z) + 22;
                teleportTo([wp.x, wy, wp.z]);
                closeMap();
              }}
              style={{
                ...mono,
                padding:      "4px 9px",
                fontSize:     9,
                background:   "rgba(255,255,255,0.04)",
                border:       `1px solid ${wp.color}44`,
                color:        wp.color,
                borderRadius: 5,
                cursor:       "pointer",
              }}
            >
              {wp.label}
            </button>
          ))}
        </div>

        {/* Tunnel key */}
        <div style={{ ...mono, fontSize: 8, letterSpacing: 1, color: "#333", marginTop: 8, marginBottom: 5 }}>
          UNDERGROUND TUNNELS
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {TUNNELS.map(t => (
            <span key={t.label} style={{
              ...mono,
              fontSize:     8,
              color:        "#FFB060",
              background:   "rgba(200,140,50,0.1)",
              border:       "1px solid rgba(200,140,50,0.25)",
              borderRadius: 4,
              padding:      "2px 6px",
            }}>
              T {t.label}
            </span>
          ))}
        </div>

        {/* Active spawners */}
        {customSpawners.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...mono, color: "#333", fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
              SPAWNERS ({customSpawners.length})
            </div>
            <div style={{ maxHeight: 60, overflowY: "auto" }}>
              {customSpawners.map(([sx, sz], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ ...mono, color: "#FF7777", fontSize: 9, flex: 1 }}>
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
      </div>
    </div>
  );
}
