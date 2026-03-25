import { useEffect } from "react";
import { useGameStore, SPELLS, CAMERA_CYCLE, type CameraViewMode } from "./useGameStore";
import { WEAPON_SKILLS } from "./SkillSystem";
import { CharacterPanel } from "./CharacterPanel";

// ─── CSS Crosshair ────────────────────────────────────────────────────────────

function Crosshair({ fps, staff, blocking }: { fps: boolean; staff: boolean; blocking: boolean }) {
  const GAP  = blocking ? 2 : fps ? 4  : 7;
  const LEN  = blocking ? 6 : fps ? 9  : 12;
  const TICK = fps ? 1.5 : 2;
  const DOT_COLOR = staff ? "rgba(180,120,255,0.95)" : "rgba(255,60,60,0.95)";
  const DOT_GLOW  = staff ? "rgba(160,80,255,0.7)"   : "rgba(255,80,80,0.7)";

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
        width: staff ? 6 : 4, height: staff ? 6 : 4,
        borderRadius: "50%",
        background: DOT_COLOR,
        transform: "translate(-50%, -50%)",
        boxShadow: `0 0 ${staff ? 8 : 4}px ${DOT_GLOW}`,
      }} />
      {!staff && <>
        <div style={{ ...base, width: TICK, height: LEN,
          transform: `translate(-50%, calc(-100% - ${GAP}px))` }} />
        <div style={{ ...base, width: TICK, height: LEN,
          transform: `translate(-50%, ${GAP}px)` }} />
        <div style={{ ...base, width: LEN, height: TICK,
          transform: `translate(calc(-100% - ${GAP}px), -50%)` }} />
        <div style={{ ...base, width: LEN, height: TICK,
          transform: `translate(${GAP}px, -50%)` }} />
      </>}
      {staff && <>
        {/* Magic reticle — diamond shape */}
        {[-45, 45, 135, 225].map((deg) => (
          <div key={deg} style={{
            ...base,
            width: 2, height: 14,
            background: "rgba(180,120,255,0.7)",
            transformOrigin: "center center",
            transform: `translate(-50%, calc(-50% - 12px)) rotate(${deg}deg) translateY(-6px)`,
          }} />
        ))}
        <div style={{
          position: "absolute",
          width: 32, height: 32, borderRadius: "50%",
          border: "1px solid rgba(180,120,255,0.3)",
          transform: "translate(-50%, -50%)",
        }} />
      </>}
      {!fps && !staff && (
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

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase",
            letterSpacing: 1, marginBottom: 8 }}>
            View Mode
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {CAMERA_CYCLE.map((m: CameraViewMode) => {
              const label = m === "tps" ? "Third Person" : m === "action" ? "Action Cam" : "First Person";
              return (
                <button
                  key={m}
                  onClick={() => setCameraMode(m)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 7,
                    border: camera.mode === m ? "1px solid #e53935" : "1px solid #333",
                    background: camera.mode === m ? "rgba(229,57,53,0.15)" : "rgba(255,255,255,0.04)",
                    color: camera.mode === m ? "#e53935" : "#666",
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: 1,
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "#444", marginTop: 6, textAlign: "center" }}>
            P cycles views in-game · F2 jumps TPS ↔ FPS
          </div>
        </div>

        <div style={{
          height: 1, background: "rgba(255,255,255,0.07)",
          margin: "16px 0",
        }} />

        <Slider
          label="Field of View"
          value={camera.fov}
          min={50} max={110} step={1}
          format={(v) => `${v}°`}
          onChange={setCameraFOV}
        />

        <Slider
          label="Mouse Sensitivity"
          value={camera.sensitivity}
          min={0.0005} max={0.006} step={0.0001}
          format={(v) => `${(v * 1000).toFixed(1)}`}
          onChange={setCameraSensitivity}
        />

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

// ─── Skill effect → emoji icon map ────────────────────────────────────────────
const SKILL_ICONS: Record<string, string> = {
  slash:    "⚔️",
  spin:     "🌀",
  thrust:   "🗡️",
  charge:   "💨",
  blast:    "💥",
  nova:     "✨",
  beam:     "🔦",
  bolt:     "⚡",
  arrow:    "🏹",
  hail:     "🌧️",
  storm:    "🌪️",
  bash:     "🛡️",
  buff:     "💚",
  fire:     "🔥",
  ice:      "❄️",
  earth:    "🪨",
  heal:     "💊",
  burst:    "🌟",
  wave:     "〰️",
  cleave:   "🪓",
};

// ─── HUD ──────────────────────────────────────────────────────────────────────

export function HUD() {
  const {
    health, maxHealth, mana, maxMana,
    ammo, maxAmmo, score, kills,
    isReloading, wave, isInvincible,
    camera, showCameraSettings, showCharacterPanel,
    weaponMode, selectedSpell, spellCooldown,
    skillCooldowns,
    isPaused,
    meleeBlocking,
  } = useGameStore();

  const selectedSpellDef = SPELLS.find((s) => s.id === selectedSpell);

  const WEAPONS = [
    { id: "pistol", label: "PISTOL",  color: "#80cfff", border: "rgba(100,180,255,0.9)", bg: "rgba(40,110,200,0.55)" },
    { id: "rifle",  label: "RIFLE",   color: "#aaffaa", border: "rgba(100,220,100,0.9)", bg: "rgba(20,130,20,0.55)"  },
    { id: "sword",  label: "SWORD",   color: "#ffaa55", border: "rgba(255,150,60,0.9)",  bg: "rgba(200,80,20,0.55)"  },
    { id: "axe",    label: "AXE",     color: "#ff7777", border: "rgba(255,80,80,0.9)",   bg: "rgba(180,20,20,0.55)"  },
    { id: "staff",  label: "STAFF",   color: "#cc88ff", border: "rgba(180,100,255,0.9)", bg: "rgba(100,20,200,0.55)" },
    { id: "bow",    label: "BOW",     color: "#aed67a", border: "rgba(140,210,80,0.9)",  bg: "rgba(60,130,20,0.55)"  },
    { id: "shield", label: "SHIELD",  color: "#c0c8d8", border: "rgba(180,200,230,0.9)", bg: "rgba(60,80,120,0.55)"  },
  ] as const;

  const isMeleeMode  = weaponMode === "sword" || weaponMode === "axe";
  const isRifleMode  = weaponMode === "rifle";
  const isStaffMode  = weaponMode === "staff";
  const isBowMode    = weaponMode === "bow";
  const isShieldMode = weaponMode === "shield";

  const healthPct   = (health / maxHealth) * 100;
  const healthColor = healthPct > 60 ? "#4caf50" : healthPct > 30 ? "#ff9800" : "#f44336";
  const manaPct     = (mana / maxMana) * 100;
  const isFPS       = camera.mode === "fps";

  return (
    <>
      {showCharacterPanel && <CharacterPanel />}
      {showCameraSettings && !showCharacterPanel && <CameraSettingsPanel />}

      {/* Pause / free-cursor overlay ─────────────────────────────────────── */}
      {isPaused && !showCharacterPanel && !showCameraSettings && (
        <div
          style={{
            position:        "fixed",
            inset:           0,
            display:         "flex",
            flexDirection:   "column",
            alignItems:      "center",
            justifyContent:  "center",
            background:      "rgba(0,0,0,0.55)",
            backdropFilter:  "blur(6px)",
            zIndex:          9999,
            userSelect:      "none",
          }}
          onClick={() => document.body.requestPointerLock()}
        >
          <div style={{
            fontFamily:    "monospace",
            fontSize:      38,
            fontWeight:    "bold",
            color:         "#ffffff",
            letterSpacing: 6,
            textTransform: "uppercase",
            textShadow:    "0 0 24px rgba(255,255,255,0.4)",
            marginBottom:  16,
          }}>
            PAUSED
          </div>
          <div style={{
            fontFamily:    "monospace",
            fontSize:      13,
            color:         "rgba(255,255,255,0.55)",
            letterSpacing: 2,
          }}>
            Click anywhere or press <strong style={{ color: "#fff" }}>P</strong> to resume
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none select-none">

        {/* Crosshair — hidden when paused */}
        {!isPaused && <Crosshair fps={isFPS} staff={isStaffMode} blocking={meleeBlocking} />}

        {/* Camera mode badge */}
        <div style={{
          position: "absolute", top: 50, left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.2)",
          textTransform: "uppercase",
          fontFamily: "monospace",
        }}>
          {camera.mode === "fps" ? "FPS" : camera.mode === "action" ? "ACTION CAM" : "TPS"} · P to cycle · F3 settings
        </div>

        {/* Health + Mana — bottom left */}
        <div className="absolute bottom-8 left-8 text-white">
          {/* Health */}
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
          <div className="text-xs mt-1 mb-3" style={{ color: healthColor }}>
            {Math.ceil(health)} / {maxHealth}
          </div>

          {/* Mana bar — always visible, pulses when staff is active */}
          <div className="mb-1 text-xs font-bold uppercase tracking-widest"
            style={{ color: isStaffMode ? "#cc88ff" : "rgba(170,100,255,0.45)" }}>
            Mana
          </div>
          <div className="w-48 h-2 rounded-full border overflow-hidden"
            style={{
              background: "rgba(60,20,100,0.55)",
              borderColor: isStaffMode ? "rgba(170,100,255,0.4)" : "rgba(100,50,150,0.25)",
            }}>
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${manaPct}%`,
                background: "linear-gradient(90deg, #7733cc, #aa77ff)",
                boxShadow: isStaffMode ? "0 0 6px rgba(160,100,255,0.7)" : "none",
                opacity: isStaffMode ? 1 : 0.55,
              }}
            />
          </div>
          <div className="text-xs mt-1" style={{ color: isStaffMode ? "#aa77ff" : "rgba(150,80,220,0.45)" }}>
            {Math.ceil(mana)} / {maxMana}
          </div>
        </div>

        {/* ── Skill Bar — bottom center ──────────────────────────────── */}
        {(() => {
          const skills = WEAPON_SKILLS[weaponMode] ?? [];
          if (skills.length === 0) return null;
          // Weapon accent colour (matches weapon cycle bar)
          const WEAPON_ACCENTS: Record<string, string> = {
            pistol: "#80cfff", rifle: "#aaffaa", sword: "#ffaa55",
            axe: "#ff7777", staff: "#cc88ff", bow: "#aed67a", shield: "#c0c8d8",
          };
          const accent = WEAPON_ACCENTS[weaponMode] ?? "#ffffff";
          return (
            <div style={{
              position: "absolute",
              bottom: 24, left: "50%",
              transform: "translateX(-50%)",
              display: "flex", gap: 8,
              alignItems: "flex-end",
            }}>
              {skills.map((sk, i) => {
                const cd     = skillCooldowns[sk.id] ?? 0;
                const maxCd  = sk.cooldown;
                const pct    = maxCd > 0 ? Math.min(1, cd / maxCd) : 0;
                const ready  = pct <= 0;
                return (
                  <div key={sk.id} style={{
                    position: "relative",
                    width: 58, height: 64,
                    borderRadius: 7,
                    border: `1.5px solid ${ready ? accent : "rgba(255,255,255,0.15)"}`,
                    background: ready
                      ? "rgba(0,0,0,0.55)"
                      : "rgba(0,0,0,0.75)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    boxShadow: ready ? `0 0 8px ${accent}55` : "none",
                    transition: "box-shadow 0.2s",
                  }}>
                    {/* Cooldown fill overlay (sweeps bottom-to-top) */}
                    {pct > 0 && (
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: `${Math.round(pct * 100)}%`,
                        background: "rgba(0,0,0,0.52)",
                        pointerEvents: "none",
                        transition: "height 0.1s linear",
                      }} />
                    )}

                    {/* Hotkey badge */}
                    <div style={{
                      position: "absolute", top: 3, right: 5,
                      fontSize: 9, fontFamily: "monospace",
                      color: ready ? accent : "rgba(255,255,255,0.25)",
                      fontWeight: "bold", letterSpacing: 1,
                    }}>{i + 1}</div>

                    {/* Skill icon — first word short */}
                    <div style={{
                      fontSize: 18, lineHeight: 1,
                      filter: ready ? "none" : "grayscale(0.7) opacity(0.5)",
                    }}>
                      {SKILL_ICONS[sk.effect] ?? "✦"}
                    </div>

                    {/* Skill name */}
                    <div style={{
                      fontSize: 7.5, textAlign: "center",
                      color: ready ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
                      fontFamily: "monospace", letterSpacing: 0.5,
                      marginTop: 3, padding: "0 2px",
                      maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", lineHeight: 1.2,
                    }}>
                      {sk.name.toUpperCase()}
                    </div>

                    {/* Cooldown seconds remaining */}
                    {pct > 0 && (
                      <div style={{
                        position: "absolute", bottom: 3,
                        fontSize: 9, fontFamily: "monospace",
                        color: "rgba(255,200,100,0.9)", fontWeight: "bold",
                      }}>
                        {cd.toFixed(1)}s
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Weapon mode + Ammo — bottom right */}
        <div className="absolute bottom-8 right-8 text-white text-right">

          {/* 5-weapon cycle bar */}
          <div className="flex justify-end gap-1 mb-3 items-center">
            <span style={{
              fontSize: 9, letterSpacing: 2, marginRight: 4,
              color: "rgba(255,255,255,0.3)", fontFamily: "monospace",
            }}>Q</span>
            {WEAPONS.map((w) => {
              const active = weaponMode === w.id;
              return (
                <div key={w.id} style={{
                  padding: "3px 9px", borderRadius: 4,
                  border: active ? `1px solid ${w.border}` : "1px solid rgba(255,255,255,0.12)",
                  background: active ? w.bg : "transparent",
                  color: active ? w.color : "rgba(255,255,255,0.2)",
                  fontSize: 10, letterSpacing: 1, fontFamily: "monospace",
                  transition: "all 0.2s",
                }}>
                  {w.label}
                </div>
              );
            })}
          </div>

          {/* Per-weapon info panel */}
          {isShieldMode ? (
            <>
              <div className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: "#c0c8d8" }}>
                Sword &amp; Shield
              </div>
              <div style={{ color: "#c0c8d8", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
                LMB Attack &nbsp;·&nbsp; RMB Block
              </div>
              <div style={{ color: "rgba(192,200,216,0.45)", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
                4-hit combo · Hold RMB to raise shield
              </div>
            </>
          ) : isBowMode ? (
            <>
              <div className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: "#aed67a" }}>
                Longbow
              </div>
              <div style={{ color: "#aed67a", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
                LMB Draw &amp; Fire &nbsp;·&nbsp; RMB Aim
              </div>
              <div style={{ color: "rgba(174,214,122,0.45)", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
                Hold RMB to aim · arrows stagger zombies
              </div>
            </>
          ) : isStaffMode ? (
            <>
              <div className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: "#cc88ff" }}>
                Magic Staff
              </div>
              <div style={{ color: "#cc88ff", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
                LMB Cast &nbsp;·&nbsp; RMB Area Blast
              </div>
              <div style={{ color: "rgba(200,160,255,0.45)", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
                {manaPct < 20
                  ? <span style={{ color: "#f44336" }}>LOW MANA — regen passively</span>
                  : `Mana: ${Math.ceil(mana)}/100 · Regen: 5/s`
                }
              </div>
            </>
          ) : isMeleeMode ? (
            <>
              <div className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: weaponMode === "axe" ? "#ff7777" : "#ffaa55" }}>
                {weaponMode === "axe" ? "Axe" : "Sword"}
              </div>
              <div style={{ color: "#ffcc88", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
                LMB Attack &nbsp;·&nbsp; RMB Block
              </div>
              <div style={{ color: "rgba(255,200,136,0.45)", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
                Rapid LMB = Combo
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: isRifleMode ? "#aaffaa" : "#80cfff" }}>
                {isRifleMode ? "Rifle / 2H Ranged" : "Pistol"}
              </div>
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
                    style={{ backgroundColor: i < ammo ? (isRifleMode ? "#aaffaa" : "#ffdd44") : "#333" }}
                  />
                ))}
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

        {/* Spell bar — bottom center */}
        {selectedSpellDef && (
          <div style={{
            position:       "absolute",
            bottom:         98,
            left:           "50%",
            transform:      "translateX(-50%)",
            display:        "flex",
            alignItems:     "center",
            gap:            8,
            background:     "rgba(8,4,20,0.75)",
            border:         `1px solid ${spellCooldown > 0 ? "rgba(255,255,255,0.1)" : selectedSpellDef.color + "66"}`,
            borderRadius:   8,
            padding:        "5px 12px",
            backdropFilter: "blur(8px)",
            boxShadow:      spellCooldown > 0 ? "none" : `0 0 12px ${selectedSpellDef.color}44`,
            transition:     "all 0.2s ease",
          }}>
            <span style={{ fontSize: 18 }}>{selectedSpellDef.icon}</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: "bold",
                color: spellCooldown > 0 ? "rgba(255,255,255,0.3)" : selectedSpellDef.color,
                letterSpacing: 1, textTransform: "uppercase",
              }}>
                {selectedSpellDef.name}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(140,200,255,0.7)" }}>
                {selectedSpellDef.manaCost}mp · dmg {selectedSpellDef.damage}
              </span>
            </div>
            {/* Cooldown overlay */}
            {spellCooldown > 0 ? (
              <div style={{
                fontFamily: "monospace", fontSize: 11, fontWeight: "bold",
                color: "#FF8888", minWidth: 32, textAlign: "right",
              }}>
                {spellCooldown.toFixed(1)}s
              </div>
            ) : (
              <div style={{
                fontFamily: "monospace", fontSize: 9,
                color: "rgba(255,255,255,0.35)",
              }}>
                F
              </div>
            )}
          </div>
        )}

        {/* Controls — top center */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-white/25 text-xs text-center leading-5">
          WASD move &nbsp;·&nbsp; Shift sprint &nbsp;·&nbsp; Space jump
          &nbsp;·&nbsp; <span className="text-white/40">Alt</span> crouch
          &nbsp;·&nbsp; <span className="text-white/40">Ctrl</span> roll
          &nbsp;·&nbsp; <span className="text-white/40">Q</span> cycle weapon
          &nbsp;·&nbsp; <span className="text-white/40">R</span> spell select
          &nbsp;·&nbsp; <span className="text-white/40">F</span> cast spell
          &nbsp;·&nbsp; <span className="text-white/40">C</span> character
          &nbsp;·&nbsp; <span className="text-white/40">P</span> pause
        </div>

        {/* Warnings */}
        {ammo === 0 && !isReloading && !isMeleeMode && !isStaffMode && !isBowMode && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-red-400 font-bold text-base animate-bounce">
            EMPTY — R to reload
          </div>
        )}

        {isStaffMode && mana < 20 && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 font-bold text-base animate-pulse"
            style={{ color: "#aa77ff" }}>
            LOW MANA
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
