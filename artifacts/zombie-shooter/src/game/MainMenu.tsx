import { useState, useRef, useEffect } from "react";
import { useCharacterStore } from "./useCharacterStore";
import { useSettingsStore, QUALITY_PRESETS, QualityPreset } from "./useSettingsStore";
import { ModelViewer } from "./ModelViewer";

type Screen = "home" | "characters" | "viewer" | "settings" | "playback";

const NAV_ITEMS: { screen: Screen; label: string; icon: string; desc: string }[] = [
  { screen: "characters", label: "CHARACTERS",   icon: "◈", desc: "Browse & select your operative" },
  { screen: "viewer",     label: "MODEL VIEWER",  icon: "◉", desc: "Validate meshes, animations, textures" },
  { screen: "settings",   label: "SETTINGS",      icon: "◎", desc: "Render quality, camera, controls" },
  { screen: "playback",   label: "PLAYBACK",       icon: "▷", desc: "Review recorded sessions" },
];

// ─── Shared style primitives ──────────────────────────────────────────────────
const mono = "'Courier New', monospace";
const red  = "#cc1111";
const dim  = "#2a1a1a";

function Divider() {
  return <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, transparent, #3a1a1a, transparent)", margin: "20px 0" }} />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 4, color: "#4a2a2a", textTransform: "uppercase", marginBottom: 20 }}>
      // {children}
    </div>
  );
}

// ─── HOME screen ─────────────────────────────────────────────────────────────
function HomeScreen({
  onStart,
  onNav,
  gameOver,
  score,
}: {
  onStart: () => void;
  onNav: (s: Screen) => void;
  gameOver: boolean;
  score: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = 0.2;
    v.play().catch(() => {});
  }, []);

  const { def } = useCharacterStore();

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* bg video */}
      <video
        ref={videoRef}
        src="/hero-scroll.mp4"
        autoPlay loop muted playsInline
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }}
      />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(to bottom, rgba(2,5,2,0.6) 0%, rgba(5,10,6,0.85) 55%, rgba(4,8,5,0.98) 100%)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, height: "100%", display: "flex", fontFamily: mono, color: "#e8ddd0", userSelect: "none" }}>
        {/* ── Left panel: title + start ──────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
          <div style={{ opacity: 0.18, fontSize: 12, letterSpacing: 10, marginBottom: 24, color: "#8a4a2a" }}>
            ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦
          </div>
          <h1 style={{ fontSize: "clamp(2.2rem,6vw,4.5rem)", fontWeight: 900, color: red, margin: 0, letterSpacing: 6, textShadow: `0 0 40px ${red}80, 0 0 80px ${red}30, 0 2px 0 #000`, lineHeight: 1 }}>
            MOTION TRAINING
          </h1>
          <div style={{ width: 300, height: 1, background: `linear-gradient(90deg,transparent,#8a3a2a,transparent)`, margin: "18px 0" }} />

          {gameOver ? (
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <p style={{ fontSize: "1.4rem", color: "#FFD700", margin: "0 0 6px", letterSpacing: 4 }}>GAME OVER</p>
              <p style={{ fontSize: "1rem", margin: 0 }}>Final Score: <span style={{ color: "#ee4444", fontWeight: "bold" }}>{score}</span></p>
            </div>
          ) : (
            <p style={{ color: "#6a5a4a", letterSpacing: 4, fontSize: 12, margin: "0 0 24px", textTransform: "uppercase" }}>
              Third Person Survival · Wave {" "}
              <span style={{ color: def.color }}>{def.name}</span>
            </p>
          )}

          {/* Start */}
          <StartButton label={gameOver ? "PLAY AGAIN" : "START GAME"} onClick={onStart} />

          {/* Feature badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", margin: "28px 0 0" }}>
            {[
              { icon: "⚔", label: "7 Weapons" },
              { icon: "✦", label: "8 Magic Spells" },
              { icon: "◈", label: "Characters" },
              { icon: "⚡", label: "God Mode" },
              { icon: "🏛", label: "21 Ruin Props" },
              { icon: "◎", label: "Wave Survival" },
            ].map((f) => (
              <div key={f.label} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                background: "rgba(255,255,255,0.02)", border: "1px solid #2a1a1a",
                borderRadius: 2, fontFamily: mono, fontSize: 9, letterSpacing: 1, color: "#5a3a2a",
              }}>
                <span style={{ fontSize: 10 }}>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Quick controls ref */}
          <div style={{ marginTop: 24, color: "#2a1a0a", fontSize: 10, textAlign: "center", lineHeight: 2.2, letterSpacing: 0.8 }}>
            <p style={{ margin: 0 }}>WASD — Move &nbsp;·&nbsp; Shift — Sprint &nbsp;·&nbsp; Space — Jump &nbsp;·&nbsp; Alt — Crouch</p>
            <p style={{ margin: 0 }}>LMB — Shoot &nbsp;·&nbsp; Q — Cycle Weapon &nbsp;·&nbsp; R — Spell &nbsp;·&nbsp; F — Cast &nbsp;·&nbsp; 1/2/3/4 — Skills</p>
            <p style={{ margin: 0 }}>C — Character &nbsp;·&nbsp; P — Camera &nbsp;·&nbsp; Ctrl — Roll &nbsp;·&nbsp; F2 — Perf</p>
            <p style={{ margin: "2px 0 0", color: "#3a2a0a", fontWeight: 700 }}>
              <span style={{ color: "#664444" }}>F1</span> — God Mode &nbsp;·&nbsp;
              <span style={{ color: "#664444" }}>F9</span> — Admin Panel &nbsp;·&nbsp;
              <span style={{ color: "#443333" }}>` — Dev Editor</span>
            </p>
          </div>
        </div>

        {/* ── Right panel: nav cards ─────────────────────────────────────── */}
        <div style={{ width: 340, borderLeft: "1px solid #1a0d0d", background: "rgba(4,6,4,0.75)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 24px", gap: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "#3a1a1a", marginBottom: 4 }}>SYSTEM MENU</div>

          {NAV_ITEMS.map((item) => (
            <NavCard key={item.screen} item={item} onClick={() => onNav(item.screen)} />
          ))}

          <Divider />

          {/* Pipeline link */}
          <NavCard
            item={{ screen: "home", label: "GRUDGE PIPELINE", icon: "◬", desc: "AI 3D character generation studio" }}
            onClick={() => window.open("/grudge-pipeline/", "_blank")}
            accent="#1a3a2a"
            textColor="#5aaa5a"
          />

          <div style={{ marginTop: 12, fontSize: 9, color: "#1a0a0a", letterSpacing: 2, textAlign: "center" }}>
            MOTION TRAINING v0.9.0
          </div>
        </div>
      </div>
    </div>
  );
}

function StartButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "linear-gradient(180deg,#cc1111,#991111)" : "linear-gradient(180deg,#aa1111,#771111)",
        border: "2px solid #ee3333",
        color: "#fff",
        fontFamily: mono,
        fontWeight: 900,
        fontSize: 17,
        letterSpacing: 4,
        padding: "13px 48px",
        borderRadius: 3,
        cursor: "pointer",
        textTransform: "uppercase",
        boxShadow: hovered ? "0 0 36px #cc1111aa,0 2px 0 #000" : "0 0 24px #cc111155,0 2px 0 #000",
        transition: "all 0.12s ease",
      }}
    >
      {label}
    </button>
  );
}

function NavCard({
  item,
  onClick,
  accent = "#1a0d0d",
  textColor = "#cc4444",
}: {
  item: { label: string; icon: string; desc: string };
  onClick: () => void;
  accent?: string;
  textColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: hovered ? `${accent}cc` : `${accent}44`,
        border: `1px solid ${hovered ? textColor + "55" : "#1a0a0a"}`,
        borderRadius: 3,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.12s ease",
        width: "100%",
      }}
    >
      <span style={{ fontSize: 20, color: textColor, opacity: hovered ? 1 : 0.6 }}>{item.icon}</span>
      <div>
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: 3, color: hovered ? textColor : "#8a4a4a", textTransform: "uppercase" }}>
          {item.label}
        </div>
        <div style={{ fontFamily: mono, fontSize: 9, color: "#3a2a2a", letterSpacing: 1, marginTop: 2 }}>
          {item.desc}
        </div>
      </div>
      {hovered && <span style={{ marginLeft: "auto", color: textColor, fontSize: 14 }}>→</span>}
    </button>
  );
}

// ─── CHARACTER SELECT screen ──────────────────────────────────────────────────
function CharacterScreen({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const { activeId, setActive, def: activeDef, allChars } = useCharacterStore();

  const aiCount = allChars.filter((c) => c.source === "meshy").length;

  return (
    <MenuShell title="CHARACTER SELECT" onBack={onBack}>
      <SectionTitle>
        Registered Operatives — {allChars.length} available{aiCount > 0 ? ` (${aiCount} AI)` : ""}
      </SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, maxWidth: 860 }}>
        {allChars.map((c) => {
          const active = c.id === activeId;
          const isAi = c.source === "meshy";
          const meshLabel = isAi
            ? (c.mesh.split("/").pop()?.split("?")[0] ?? "remote")
            : (c.mesh.split("/").pop() ?? c.mesh);
          return (
            <div
              key={c.id}
              onClick={() => setActive(c.id)}
              style={{
                padding: "18px 20px",
                background: active ? `${c.color}11` : "rgba(255,255,255,0.02)",
                border: `2px solid ${active ? c.color + "88" : isAi ? "#1a3a1a" : "#1a1a1a"}`,
                borderRadius: 4,
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: mono,
                position: "relative",
              }}
            >
              {isAi && (
                <div style={{
                  position: "absolute", top: 8, right: 10,
                  fontSize: 8, letterSpacing: 2, fontWeight: 700,
                  color: "#39ff14", background: "rgba(57,255,20,0.1)",
                  border: "1px solid rgba(57,255,20,0.3)",
                  borderRadius: 2, padding: "1px 5px",
                }}>
                  AI
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, boxShadow: active ? `0 0 10px ${c.color}` : "none" }} />
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: active ? c.color : "#8a7a6a", textTransform: "uppercase" }}>
                  {c.name}
                </span>
                {active && <span style={{ marginLeft: "auto", fontSize: 9, letterSpacing: 2, color: c.color }}>ACTIVE</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  ["Scale",    `${c.scale}×`],
                  ["Height",   `${(c.capsuleHH * 2 + c.capsuleR * 2).toFixed(2)} m`],
                  ["Capsule R", `${c.capsuleR} m`],
                  ["Mesh",     meshLabel],
                ].map(([k, v]) => (
                  <div key={k} style={{ fontSize: 9, color: "#3a3a3a" }}>
                    <span style={{ color: "#2a4a2a" }}>{k}:</span> <span style={{ color: "#5a5a5a" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Divider />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <StartButton label="DEPLOY NOW" onClick={onStart} />
        <span style={{ fontFamily: mono, fontSize: 11, color: "#3a2a2a" }}>
          Active: <span style={{ color: activeDef.color }}>{activeDef.name}</span>
        </span>
      </div>

      {allChars.length === 1 && (
        <div style={{ marginTop: 24, fontFamily: mono, fontSize: 11, color: "#3a2a1a", lineHeight: 1.8 }}>
          <span style={{ color: "#885533" }}>// ADD MORE CHARACTERS</span><br />
          Use <span style={{ color: "#4a8a4a" }}>Grudge Pipeline</span> to generate and send AI characters, or<br />
          export any rigged FBX from Meshy → drop in <code style={{ color: "#cc8844" }}>public/models/character/</code><br />
          and add an entry to <code style={{ color: "#cc8844" }}>CharacterRegistry.ts</code>
        </div>
      )}
    </MenuShell>
  );
}

// ─── SETTINGS screen ──────────────────────────────────────────────────────────
function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { quality, fov, sensitivity, setQuality, setFov, setSensitivity } = useSettingsStore();
  const cfg = QUALITY_PRESETS[quality];

  const PRESETS: QualityPreset[] = ["low", "medium", "high", "ultra"];

  return (
    <MenuShell title="SETTINGS" onBack={onBack}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, maxWidth: 720 }}>
        {/* Render quality */}
        <div>
          <SectionTitle>Render Quality</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PRESETS.map((p) => {
              const isActive = p === quality;
              const pcfg = QUALITY_PRESETS[p];
              return (
                <button
                  key={p}
                  onClick={() => setQuality(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: isActive ? "rgba(180,30,30,0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isActive ? "#882222" : "#1a1a1a"}`,
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: mono,
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: isActive ? "#ee4444" : "#6a4a4a", textTransform: "uppercase" }}>
                      {p}
                    </div>
                    <div style={{ fontSize: 9, color: "#3a2a2a", marginTop: 3, letterSpacing: 1 }}>
                      {pcfg.pixelRatio.toFixed(2)}× · {pcfg.shadowsEnabled ? `${pcfg.shadowMapSize}px shadows` : "no shadows"} · bloom {pcfg.bloomIntensity > 0 ? pcfg.bloomIntensity.toFixed(1) : "off"}
                    </div>
                  </div>
                  {isActive && <span style={{ color: "#cc3333", fontSize: 12 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Camera & controls */}
        <div>
          <SectionTitle>Camera &amp; Controls</SectionTitle>
          <SettingsSlider
            label="Field of View"
            value={fov}
            min={40} max={110} step={1}
            display={`${fov}°`}
            onChange={setFov}
          />
          <SettingsSlider
            label="Mouse Sensitivity"
            value={sensitivity}
            min={0.1} max={3.0} step={0.05}
            display={sensitivity.toFixed(2) + "×"}
            onChange={setSensitivity}
          />

          <Divider />
          <SectionTitle>Active Config</SectionTitle>
          {[
            ["Pixel Ratio",    `${cfg.pixelRatio.toFixed(2)}×`],
            ["Shadow Map",     cfg.shadowsEnabled ? `${cfg.shadowMapSize}px` : "disabled"],
            ["Antialias",      cfg.antialias ? "on" : "off"],
            ["Bloom",          cfg.bloomIntensity > 0 ? `intensity ${cfg.bloomIntensity}` : "off"],
            ["Depth of Field", cfg.dofEnabled ? "on" : "off"],
            ["Field of View",  `${fov}°`],
            ["Sensitivity",    `${sensitivity.toFixed(2)}×`],
          ].map(([k, v]) => (
            <div key={k as string} style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 11, color: "#3a2a2a", marginBottom: 6 }}>
              <span>{k}</span>
              <span style={{ color: "#8a6a6a" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, fontFamily: mono, fontSize: 10, color: "#2a1a1a", letterSpacing: 1 }}>
        // Changes take effect on next game start · Use ` to open the Dev Editor for real-time scene tuning
      </div>
    </MenuShell>
  );
}

function SettingsSlider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: "#4a3a3a", letterSpacing: 1, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: "#8a5a5a" }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: red, cursor: "pointer" }}
      />
    </div>
  );
}

// ─── PLAYBACK screen ──────────────────────────────────────────────────────────
function PlaybackScreen({ onBack }: { onBack: () => void }) {
  return (
    <MenuShell title="SESSION PLAYBACK" onBack={onBack}>
      <SectionTitle>Recorded Sessions</SectionTitle>
      <div style={{ fontFamily: mono, color: "#3a2a2a", fontSize: 12, lineHeight: 2 }}>
        <span style={{ color: "#885533" }}>// PLAYBACK SYSTEM — COMING NEXT BUILD</span><br />
        Session recording will capture:<br />
        <span style={{ color: "#5a4a3a" }}>
          &nbsp;&nbsp;· Player position + rotation keyframes (60fps)<br />
          &nbsp;&nbsp;· Weapon state, spells cast, damage dealt<br />
          &nbsp;&nbsp;· Zombie positions + kill events<br />
          &nbsp;&nbsp;· Wave progression timestamps<br />
        </span>
        <br />
        Playback will render in free-cam observer mode with scrubbing.
      </div>
    </MenuShell>
  );
}

// ─── Shared shell for secondary screens ──────────────────────────────────────
function MenuShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = 0.15;
    v.play().catch(() => {});
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: mono }}>
      <video
        ref={videoRef}
        src="/hero-scroll.mp4"
        autoPlay loop muted playsInline
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0, opacity: 0.12 }}
      />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "rgba(3,5,4,0.94)" }} />

      <div style={{ position: "relative", zIndex: 2, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ height: 52, background: "rgba(4,8,5,0.98)", borderBottom: "1px solid #0d1a0d", display: "flex", alignItems: "center", padding: "0 28px", gap: 20, flexShrink: 0 }}>
          <button
            onClick={onBack}
            style={{ background: "none", border: "1px solid #1a2a1a", color: "#6a8a6a", fontFamily: mono, fontSize: 11, padding: "5px 14px", cursor: "pointer", borderRadius: 2, letterSpacing: 2 }}
          >
            ← MENU
          </button>
          <div style={{ width: 1, height: 24, background: "#1a2a1a" }} />
          <span style={{ fontSize: 13, letterSpacing: 5, color: red, fontWeight: 700 }}>MOTION TRAINING</span>
          <span style={{ fontSize: 11, letterSpacing: 3, color: "#2a4a2a" }}>/ {title}</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "36px 40px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Root MainMenu ────────────────────────────────────────────────────────────
export function MainMenu({
  onStart,
  gameOver,
  score,
}: {
  onStart: () => void;
  gameOver: boolean;
  score: number;
}) {
  const [screen, setScreen] = useState<Screen>("home");

  // Always release pointer lock when the menu is visible so the cursor is free.
  useEffect(() => {
    document.exitPointerLock();
  }, []);

  if (screen === "viewer") return <ModelViewer onBack={() => setScreen("home")} />;

  if (screen === "characters") return <CharacterScreen onBack={() => setScreen("home")} onStart={onStart} />;

  if (screen === "settings") return <SettingsScreen onBack={() => setScreen("home")} />;

  if (screen === "playback") return <PlaybackScreen onBack={() => setScreen("home")} />;

  return <HomeScreen onStart={onStart} onNav={setScreen} gameOver={gameOver} score={score} />;
}
