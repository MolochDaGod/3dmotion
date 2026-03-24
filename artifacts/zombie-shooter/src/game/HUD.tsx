import { useEffect } from "react";
import { useGameStore } from "./useGameStore";

// ─── CSS Crosshair ────────────────────────────────────────────────────────────

function Crosshair({ fps }: { fps: boolean }) {
  const GAP  = fps ? 4  : 7;
  const LEN  = fps ? 9  : 12;
  const TICK = fps ? 1.5 : 2;

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
      <div style={{
        ...base,
        width: 4, height: 4, borderRadius: "50%",
        background: "rgba(255,60,60,0.95)",
        transform: "translate(-50%, -50%)",
        boxShadow: "0 0 4px rgba(255,80,80,0.7)",
      }} />
      <div style={{ ...base, width: TICK, height: LEN,
        transform: `translate(-50%, calc(-100% - ${GAP}px))` }} />
      <div style={{ ...base, width: TICK, height: LEN,
        transform: `translate(-50%, ${GAP}px)` }} />
      <div style={{ ...base, width: LEN, height: TICK,
        transform: `translate(calc(-100% - ${GAP}px), -50%)` }} />
      <div style={{ ...base, width: LEN, height: TICK,
        transform: `translate(${GAP}px, -50%)` }} />
      {!fps && (
        <div style={{
          position: "absolute",
          width: 44, height: 44, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.18)",
          transform: "translate(-50%, -50%)",
        }} />
      )}
    </div>
  );
}

// ─── Camera Settings Panel ───────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 11, color: "#aaa", marginBottom: 5,
        fontFamily: "monospace", letterSpacing: 1,
      }}>
        <span style={{ textTransform: "uppercase" }}>{label}</span>
        <span style={{ color: "#fff" }}>{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: "#e53935",
          cursor: "pointer",
          height: 4,
        }}
      />
    </div>
  );
}

function CameraSettingsPanel() {
  const {
    camera,
    setCameraMode,
    setCameraFOV,
    setCameraSensitivity,
    setCameraShoulderX,
    setCameraShoulderY,
    setCameraShoulderZ,
    setShowCameraSettings,
  } = useGameStore();

  // ESC closes the panel and re-acquires pointer lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "F3") {
        e.preventDefault();
        setShowCameraSettings(false);
        document.body.requestPointerLock();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setShowCameraSettings]);

  const isTPS = camera.mode === "tps";

  return (
    // Outer backdrop — click outside to close
    <div
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        zIndex: 100,
        pointerEvents: "auto",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setShowCameraSettings(false);
          document.body.requestPointerLock();
        }
      }}
    >
      <div
        style={{
          background: "rgba(12,12,14,0.96)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: "24px 28px",
          width: 340,
          color: "#fff",
          pointerEvents: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 22,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2,
              color: "#e53935", textTransform: "uppercase" }}>
              Camera Settings
            </div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 2, letterSpacing: 1 }}>
              F3 or ESC to close
            </div>
          </div>
          <button
            onClick={() => {
              setShowCameraSettings(false);
              document.body.requestPointerLock();
            }}
            style={{
              background: "none", border: "1px solid #333",
              color: "#888", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer", fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase",
            letterSpacing: 1, marginBottom: 8 }}>
            View Mode
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["tps", "fps"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setCameraMode(m)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 7,
                  border: camera.mode === m
                    ? "1px solid #e53935"
                    : "1px solid #333",
                  background: camera.mode === m
                    ? "rgba(229,57,53,0.15)"
                    : "rgba(255,255,255,0.04)",
                  color: camera.mode === m ? "#e53935" : "#666",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 1,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {m === "tps" ? "Third Person" : "First Person"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#444", marginTop: 6, textAlign: "center" }}>
            F2 also toggles view mode in-game
          </div>
        </div>

        <div style={{
          height: 1, background: "rgba(255,255,255,0.07)",
          margin: "16px 0",
        }} />

        {/* FOV */}
        <Slider
          label="Field of View"
          value={camera.fov}
          min={50} max={110} step={1}
          format={(v) => `${v}°`}
          onChange={setCameraFOV}
        />

        {/* Sensitivity */}
        <Slider
          label="Mouse Sensitivity"
          value={camera.sensitivity}
          min={0.0005} max={0.006} step={0.0001}
          format={(v) => `${(v * 1000).toFixed(1)}`}
          onChange={setCameraSensitivity}
        />

        {/* TPS-only shoulder offset */}
        {isTPS && (
          <>
            <div style={{
              height: 1, background: "rgba(255,255,255,0.07)",
              margin: "16px 0 12px",
            }} />
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1,
              textTransform: "uppercase", marginBottom: 12 }}>
              Shoulder Offset (Third Person)
            </div>
            <Slider
              label="Right offset"
              value={camera.shoulderX}
              min={-1.5} max={1.5} step={0.05}
              onChange={setCameraShoulderX}
            />
            <Slider
              label="Height"
              value={camera.shoulderY}
              min={0.5} max={3.0} step={0.05}
              onChange={setCameraShoulderY}
            />
            <Slider
              label="Distance"
              value={camera.shoulderZ}
              min={1.0} max={6.0} step={0.1}
              onChange={setCameraShoulderZ}
            />
          </>
        )}

        {/* Reset */}
        <div style={{
          height: 1, background: "rgba(255,255,255,0.07)",
          margin: "16px 0 14px",
        }} />
        <button
          onClick={() => {
            setCameraFOV(70);
            setCameraSensitivity(0.002);
            setCameraShoulderX(0.55);
            setCameraShoulderY(1.55);
            setCameraShoulderZ(2.8);
          }}
          style={{
            width: "100%", padding: "8px 0",
            borderRadius: 7, border: "1px solid #333",
            background: "rgba(255,255,255,0.04)",
            color: "#555", fontSize: 12, cursor: "pointer",
            letterSpacing: 1, textTransform: "uppercase",
          }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

export function HUD() {
  const {
    health, maxHealth, ammo, maxAmmo, score, kills,
    isReloading, wave, isInvincible,
    camera, showCameraSettings, weaponMode,
  } = useGameStore();

  const healthPct   = (health / maxHealth) * 100;
  const healthColor = healthPct > 60 ? "#4caf50" : healthPct > 30 ? "#ff9800" : "#f44336";
  const isFPS       = camera.mode === "fps";

  return (
    <>
      {/* ── Settings panel (outside pointer-events:none wrapper) ── */}
      {showCameraSettings && <CameraSettingsPanel />}

      {/* ── All other HUD elements — pointer-events: none ── */}
      <div className="fixed inset-0 pointer-events-none select-none">

        {/* Crosshair */}
        <Crosshair fps={isFPS} />

        {/* Camera mode badge */}
        <div style={{
          position: "absolute", top: 50, left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.2)",
          textTransform: "uppercase",
          fontFamily: "monospace",
        }}>
          {isFPS ? "FPS" : "TPS"} · F2 to switch · F3 settings
        </div>

        {/* Health — bottom left */}
        <div className="absolute bottom-8 left-8 text-white">
          <div className="mb-1 text-xs text-gray-400 font-bold uppercase tracking-widest">
            Health {isInvincible && (
              <span className="text-blue-400 ml-2 animate-pulse">ROLLING</span>
            )}
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

        {/* Weapon mode + Ammo — bottom right */}
        <div className="absolute bottom-8 right-8 text-white text-right">

          {/* Weapon mode toggle badge */}
          <div className="flex justify-end gap-2 mb-3 items-center">
            <span style={{
              fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.35)",
              fontFamily: "monospace", textTransform: "uppercase",
            }}>Q</span>
            {/* Ranged pill */}
            <div style={{
              padding: "3px 10px", borderRadius: 4,
              border: weaponMode === "ranged"
                ? "1px solid rgba(100,180,255,0.9)"
                : "1px solid rgba(255,255,255,0.15)",
              background: weaponMode === "ranged" ? "rgba(40,110,200,0.55)" : "transparent",
              color: weaponMode === "ranged" ? "#80cfff" : "rgba(255,255,255,0.25)",
              fontSize: 11, letterSpacing: 1, fontFamily: "monospace",
              transition: "all 0.25s",
            }}>
              RANGED
            </div>
            {/* Melee pill */}
            <div style={{
              padding: "3px 10px", borderRadius: 4,
              border: weaponMode === "melee"
                ? "1px solid rgba(255,150,60,0.9)"
                : "1px solid rgba(255,255,255,0.15)",
              background: weaponMode === "melee" ? "rgba(200,80,20,0.55)" : "transparent",
              color: weaponMode === "melee" ? "#ffaa55" : "rgba(255,255,255,0.25)",
              fontSize: 11, letterSpacing: 1, fontFamily: "monospace",
              transition: "all 0.25s",
            }}>
              MELEE
            </div>
          </div>

          {/* Ammo — hidden in melee, replaced by attack hint */}
          {weaponMode === "ranged" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Sword</div>
              <div style={{ color: "#ffaa55", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
                LMB Attack &nbsp;·&nbsp; RMB Block
              </div>
              <div style={{ color: "rgba(255,170,85,0.5)", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
                Rapid LMB = Combo
              </div>
            </>
          )}
        </div>

        {/* Score — top right */}
        <div className="absolute top-6 right-8 text-white text-right">
          <div className="text-xs text-gray-400 uppercase tracking-widest">Score</div>
          <div className="text-4xl font-bold font-mono text-yellow-400">{score.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">
            Kills: <span className="text-red-400 font-bold">{kills}</span>
            &nbsp;·&nbsp;
            Wave: <span className="text-orange-400 font-bold">{wave}</span>
          </div>
        </div>

        {/* Controls — top center */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-white/25 text-xs text-center leading-5">
          WASD move &nbsp;·&nbsp; Shift sprint &nbsp;·&nbsp; Space jump
          &nbsp;·&nbsp; <span className="text-white/40">Alt</span> crouch
          &nbsp;·&nbsp; <span className="text-white/40">Ctrl</span> roll
          &nbsp;·&nbsp; <span className="text-white/40">Q</span> ranged↔melee
          &nbsp;·&nbsp; <span className="text-white/40">R</span> reload
        </div>

        {/* Warnings */}
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
    </>
  );
}
