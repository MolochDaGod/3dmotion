import { useGameStore } from "./useGameStore";

// ─── CSS Crosshair ────────────────────────────────────────────────────────────
// Placed at exactly 50%/50% of the viewport — always matches screen center.
// The bullet raycaster also fires from screen center (camera.getWorldDirection),
// so what you see is what you hit. No 3D world-space math needed.

function Crosshair() {
  const GAP  = 7;  // px from center before tick starts
  const LEN  = 12; // px tick length
  const TICK = 2;  // px tick thickness

  const base: React.CSSProperties = {
    position: "absolute",
    background: "rgba(255,255,255,0.88)",
    borderRadius: 1,
  };

  return (
    <div style={{
      position: "absolute",
      left: "50%", top: "50%",
      transform: "translate(-50%, -50%)",
      width: 0, height: 0,
      pointerEvents: "none",
    }}>
      {/* Center dot */}
      <div style={{
        ...base,
        width: 4, height: 4,
        borderRadius: "50%",
        background: "rgba(255,60,60,0.95)",
        transform: "translate(-50%, -50%)",
        boxShadow: "0 0 4px rgba(255,80,80,0.7)",
      }} />

      {/* Top tick */}
      <div style={{ ...base, width: TICK, height: LEN,
        transform: `translate(-50%, calc(-100% - ${GAP}px))` }} />
      {/* Bottom tick */}
      <div style={{ ...base, width: TICK, height: LEN,
        transform: `translate(-50%, ${GAP}px)` }} />
      {/* Left tick */}
      <div style={{ ...base, width: LEN, height: TICK,
        transform: `translate(calc(-100% - ${GAP}px), -50%)` }} />
      {/* Right tick */}
      <div style={{ ...base, width: LEN, height: TICK,
        transform: `translate(${GAP}px, -50%)` }} />

      {/* Thin outer ring */}
      <div style={{
        position: "absolute",
        width: 44, height: 44,
        borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.18)",
        transform: "translate(-50%, -50%)",
      }} />
    </div>
  );
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

export function HUD() {
  const { health, maxHealth, ammo, maxAmmo, score, kills, isReloading, wave, isInvincible } =
    useGameStore();

  const healthPct   = (health / maxHealth) * 100;
  const healthColor = healthPct > 60 ? "#4caf50" : healthPct > 30 ? "#ff9800" : "#f44336";

  return (
    <div className="fixed inset-0 pointer-events-none select-none">

      {/* ── Crosshair (always at exact screen center) ── */}
      <Crosshair />

      {/* ── Health — bottom left ── */}
      <div className="absolute bottom-8 left-8 text-white">
        <div className="mb-1 text-xs text-gray-400 font-bold uppercase tracking-widest">
          Health {isInvincible && <span className="text-blue-400 ml-2 animate-pulse">ROLLING</span>}
        </div>
        <div className="w-48 h-3 bg-gray-800 rounded-full border border-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{ width: `${healthPct}%`, backgroundColor: healthColor }}
          />
        </div>
        <div className="text-xs mt-1" style={{ color: healthColor }}>
          {Math.ceil(health)} / {maxHealth}
        </div>
      </div>

      {/* ── Ammo — bottom right ── */}
      <div className="absolute bottom-8 right-8 text-white text-right">
        <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Ammo</div>
        <div className="text-3xl font-mono font-bold">
          {isReloading ? (
            <span className="text-yellow-400 animate-pulse text-lg">RELOADING...</span>
          ) : (
            <>
              <span className={ammo <= 3 ? "text-red-400" : "text-white"}>{ammo}</span>
              <span className="text-gray-500 text-lg"> / {maxAmmo}</span>
            </>
          )}
        </div>
        <div className="flex justify-end gap-1 mt-2">
          {Array.from({ length: maxAmmo }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-4 rounded-sm transition-colors duration-100"
              style={{ backgroundColor: i < ammo ? "#ffdd44" : "#333" }}
            />
          ))}
        </div>
      </div>

      {/* ── Score — top right ── */}
      <div className="absolute top-6 right-8 text-white text-right">
        <div className="text-xs text-gray-400 uppercase tracking-widest">Score</div>
        <div className="text-4xl font-bold font-mono text-yellow-400">{score.toLocaleString()}</div>
        <div className="text-xs text-gray-400 mt-1">
          Kills: <span className="text-red-400 font-bold">{kills}</span>
          &nbsp;·&nbsp;
          Wave: <span className="text-orange-400 font-bold">{wave}</span>
        </div>
      </div>

      {/* ── Controls — top center ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-white/25 text-xs text-center leading-5">
        WASD move &nbsp;·&nbsp; Shift sprint &nbsp;·&nbsp; Space jump
        &nbsp;·&nbsp; <span className="text-white/40">Alt</span> crouch
        &nbsp;·&nbsp; <span className="text-white/40">Ctrl</span> roll
        &nbsp;·&nbsp; <span className="text-white/40">RMB</span> melee
        &nbsp;·&nbsp; <span className="text-white/40">R</span> reload
      </div>

      {/* ── Warnings ── */}
      {ammo === 0 && !isReloading && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-red-400 font-bold text-base animate-bounce">
          EMPTY — R to reload
        </div>
      )}

      {healthPct < 25 && (
        <div
          className="absolute inset-0"
          style={{ boxShadow: "inset 0 0 90px rgba(255,0,0,0.28)" }}
        />
      )}
    </div>
  );
}
