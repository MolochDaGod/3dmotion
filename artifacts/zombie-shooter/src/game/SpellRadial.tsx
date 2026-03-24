import { useEffect, useRef, useState } from "react";
import { SPELLS, SpellType, useGameStore } from "./useGameStore";

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number, gap = 4): string {
  const s = (startDeg + gap / 2) * (Math.PI / 180);
  const e = (endDeg   - gap / 2) * (Math.PI / 180);
  const ri = r * 0.42;
  const ro = r;

  const x1 = cx + ro * Math.cos(s);
  const y1 = cy + ro * Math.sin(s);
  const x2 = cx + ro * Math.cos(e);
  const y2 = cy + ro * Math.sin(e);
  const x3 = cx + ri * Math.cos(e);
  const y3 = cy + ri * Math.sin(e);
  const x4 = cx + ri * Math.cos(s);
  const y4 = cy + ri * Math.sin(s);

  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${ro} ${ro} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${ri} ${ri} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function labelPos(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const mid  = ((startDeg + endDeg) / 2) * (Math.PI / 180);
  const dist = r * 0.72;
  return { x: cx + dist * Math.cos(mid), y: cy + dist * Math.sin(mid) };
}

// ─── SpellRadial component ────────────────────────────────────────────────────

export function SpellRadial() {
  const show            = useGameStore((s) => s.showSpellRadial);
  const selectedSpell   = useGameStore((s) => s.selectedSpell);
  const spellCooldown   = useGameStore((s) => s.spellCooldown);
  const setSelectedSpell   = useGameStore((s) => s.setSelectedSpell);
  const setShowSpellRadial = useGameStore((s) => s.setShowSpellRadial);

  const [hovered, setHovered] = useState<SpellType | null>(null);
  const svgRef  = useRef<SVGSVGElement>(null);

  const SIZE     = 320;
  const CX       = SIZE / 2;
  const CY       = SIZE / 2;
  const R        = SIZE / 2 - 8;
  const N        = SPELLS.length;
  const SLICE    = 360 / N;

  // Close on Escape; confirm on R release
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") setShowSpellRadial(false);
      if (e.code === "KeyR" && e.type === "keyup") {
        if (hovered) setSelectedSpell(hovered);
        setShowSpellRadial(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup",   onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup",   onKey);
    };
  }, [show, hovered, setSelectedSpell, setShowSpellRadial]);

  // Detect hovered segment from mouse position
  useEffect(() => {
    if (!show) return;
    const onMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx   = e.clientX - rect.left - CX;
      const my   = e.clientY - rect.top  - CY;
      const dist = Math.sqrt(mx * mx + my * my);
      const ri   = R * 0.42;
      if (dist < ri || dist > R + 8) { setHovered(null); return; }
      let angle  = Math.atan2(my, mx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const idx  = Math.floor(angle / SLICE);
      setHovered(SPELLS[idx % N]?.id ?? null);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [show, CX, CY, R, SLICE, N]);

  if (!show) return null;

  const active = hovered ?? selectedSpell;
  const activeDef = SPELLS.find((s) => s.id === active);
  const mana   = useGameStore.getState().mana;

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      zIndex:         900,
      background:     "rgba(0,0,0,0.45)",
      backdropFilter: "blur(2px)",
    }}>
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          style={{ filter: "drop-shadow(0 0 20px rgba(120,80,255,0.5))" }}
        >
          {SPELLS.map((spell, i) => {
            const startDeg = i * SLICE - 90;
            const endDeg   = startDeg + SLICE;
            const isActive = hovered ? hovered === spell.id : selectedSpell === spell.id;
            const lp = labelPos(CX, CY, R, startDeg, endDeg);
            const arcPath = describeArc(CX, CY, R, startDeg, endDeg);
            const canCast  = mana >= spell.manaCost;

            return (
              <g
                key={spell.id}
                onClick={() => {
                  setSelectedSpell(spell.id);
                  setShowSpellRadial(false);
                }}
                style={{ cursor: "pointer" }}
              >
                {/* Segment background */}
                <path
                  d={arcPath}
                  fill={isActive ? `${spell.color}33` : "rgba(10,6,30,0.85)"}
                  stroke={isActive ? spell.color : "rgba(255,255,255,0.12)"}
                  strokeWidth={isActive ? 2.5 : 1}
                  style={{ transition: "all 0.12s ease" }}
                />

                {/* Icon */}
                <text
                  x={lp.x}
                  y={lp.y - 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isActive ? 28 : 22}
                  style={{ transition: "font-size 0.1s ease", userSelect: "none" }}
                >
                  {spell.icon}
                </text>

                {/* Name */}
                <text
                  x={lp.x}
                  y={lp.y + 16}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill={isActive ? spell.color : "rgba(255,255,255,0.7)"}
                  fontFamily="monospace"
                  fontWeight={isActive ? "bold" : "normal"}
                  style={{ userSelect: "none" }}
                >
                  {spell.name.toUpperCase()}
                </text>

                {/* Mana cost */}
                <text
                  x={lp.x}
                  y={lp.y + 27}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill={canCast ? "rgba(140,200,255,0.9)" : "rgba(255,80,80,0.9)"}
                  fontFamily="monospace"
                  style={{ userSelect: "none" }}
                >
                  {spell.manaCost}mp
                </text>

                {/* Selected indicator dot */}
                {selectedSpell === spell.id && (
                  <circle
                    cx={lp.x}
                    cy={lp.y + 38}
                    r={3}
                    fill={spell.color}
                  />
                )}
              </g>
            );
          })}

          {/* Center circle */}
          <circle cx={CX} cy={CY} r={R * 0.38} fill="rgba(8,4,20,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />

          {/* Center: active spell info */}
          <text x={CX} y={CY - 20} textAnchor="middle" fontSize={26} style={{ userSelect: "none" }}>
            {activeDef?.icon ?? "✨"}
          </text>
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={10} fill={activeDef?.color ?? "white"} fontFamily="monospace" fontWeight="bold" style={{ userSelect: "none" }}>
            {activeDef?.name.toUpperCase() ?? ""}
          </text>
          <text x={CX} y={CY + 18} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.55)" fontFamily="monospace" style={{ userSelect: "none" }}>
            {activeDef?.description ?? ""}
          </text>
          <text x={CX} y={CY + 32} textAnchor="middle" fontSize={8} fill="rgba(140,200,255,0.8)" fontFamily="monospace" style={{ userSelect: "none" }}>
            {activeDef ? `DMG ${activeDef.damage}  •  ${activeDef.manaCost}mp` : ""}
          </text>
        </svg>

        {/* Cooldown indicator */}
        {spellCooldown > 0 && (
          <div style={{
            position:   "absolute",
            bottom:     -32,
            left:       "50%",
            transform:  "translateX(-50%)",
            color:      "#FF8888",
            fontFamily: "monospace",
            fontSize:   12,
          }}>
            COOLDOWN {spellCooldown.toFixed(1)}s
          </div>
        )}

        {/* Hint */}
        <div style={{
          position:   "absolute",
          bottom:     -52,
          left:       "50%",
          transform:  "translateX(-50%)",
          color:      "rgba(255,255,255,0.45)",
          fontFamily: "monospace",
          fontSize:   11,
          whiteSpace: "nowrap",
        }}>
          HOVER + CLICK  •  RELEASE R TO SELECT  •  ESC CANCEL
        </div>
      </div>
    </div>
  );
}
