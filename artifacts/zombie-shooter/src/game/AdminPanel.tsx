import { useState } from "react";
import { useGameStore } from "./useGameStore";
import { useAdminStore, SPAWN_CATALOGUE, SpawnCategory } from "./useAdminStore";
import { useEditorStore } from "./useEditorStore";

type Tab = "player" | "spawn" | "build" | "world";

const CATEGORY_ICONS: Record<SpawnCategory | string, string> = {
  character: "◈",
  weapon:    "⚔",
  ruin:      "🏛",
  primitive: "■",
};

const mono = "'Courier New', monospace";
const red  = "#cc1111";
const green = "#11cc55";
const dim  = "#0a0f0a";

function AdminSlider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display?: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: "#4a6a4a", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "#88cc88" }}>{display ?? value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: green }} />
    </div>
  );
}

function AdminBtn({ label, color, onClick, small }: {
  label: string; color?: string; onClick: () => void; small?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const bg = color ?? green;
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: small ? "4px 10px" : "6px 14px",
        background: hov ? `${bg}33` : `${bg}18`,
        border: `1px solid ${hov ? bg : bg + "55"}`,
        borderRadius: 2, color: hov ? bg : bg + "bb",
        fontFamily: mono, fontSize: small ? 10 : 11, cursor: "pointer",
        letterSpacing: 1, whiteSpace: "nowrap",
      }}>{label}</button>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 12px", cursor: "pointer", width: "100%", textAlign: "left",
        background: value ? "rgba(17,204,85,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${value ? "#116633" : "#1a2a1a"}`,
        borderRadius: 2, fontFamily: mono, fontSize: 11,
        color: value ? "#22dd66" : "#3a5a3a", marginBottom: 4,
      }}>
      <span style={{ fontSize: 8, color: value ? green : "#2a3a2a" }}>{value ? "●" : "○"}</span>
      {label}
      <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.6 }}>{value ? "ON" : "OFF"}</span>
    </button>
  );
}

// ─── Player tab ───────────────────────────────────────────────────────────────
function PlayerTab() {
  const { health, maxHealth, mana, maxMana, godMode, isInvincible,
          setGodMode, setInvincible, heal } = useGameStore();

  const [teleX, setTeleX] = useState("0");
  const [teleY, setTeleY] = useState("2");
  const [teleZ, setTeleZ] = useState("0");

  return (
    <div>
      <SectionLabel>Status</SectionLabel>

      <Toggle label="God Mode (F8)" value={godMode} onChange={setGodMode} />
      <Toggle label="Invincible" value={isInvincible} onChange={setInvincible} />

      <div style={{ height: 8 }} />
      <AdminSlider label="Health" value={health} min={0} max={maxHealth} step={1}
        display={`${health}/${maxHealth}`}
        onChange={(v) => { if (v > health) heal(v - health); else useGameStore.setState({ health: v }); }} />
      <AdminSlider label="Mana" value={mana} min={0} max={maxMana} step={1}
        display={`${mana}/${maxMana}`}
        onChange={(v) => useGameStore.setState({ mana: v })} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <AdminBtn label="Full Heal" color={green} onClick={() => heal(maxHealth)} />
        <AdminBtn label="Full Mana" color={green} onClick={() => useGameStore.setState({ mana: maxMana })} />
        <AdminBtn label="Kill Self" color={red} onClick={() => useGameStore.setState({ health: 0 })} />
      </div>

      <SectionLabel>Teleport</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
        {[["X", teleX, setTeleX], ["Y", teleY, setTeleY], ["Z", teleZ, setTeleZ]].map(([axis, val, set]) => (
          <div key={axis as string}>
            <div style={{ fontFamily: mono, fontSize: 9, color: "#3a6a3a", marginBottom: 2 }}>{axis as string}</div>
            <input type="number" value={val as string} onChange={(e) => (set as any)(e.target.value)}
              style={{ width: "100%", background: "#050d06", border: "1px solid #1a2a1a",
                color: "#88cc88", fontFamily: mono, fontSize: 11, padding: "4px 6px", borderRadius: 2 }} />
          </div>
        ))}
      </div>
      <AdminBtn label="TELEPORT" onClick={() => {
        const x = parseFloat(teleX), y = parseFloat(teleY), z = parseFloat(teleZ);
        if (isNaN(x) || isNaN(y) || isNaN(z)) return;
        // We post a custom event that Player.tsx can listen to for external teleport
        window.dispatchEvent(new CustomEvent("admin:teleport", { detail: { x, y, z } }));
      }} />
    </div>
  );
}

// ─── Spawn tab ────────────────────────────────────────────────────────────────
function SpawnTab() {
  const { spawnObject, buildTool, activeSpawnIdx, setActiveSpawn } = useAdminStore();
  const { adminPanelOpen } = useGameStore();
  const [filter, setFilter] = useState<SpawnCategory | "all">("all");
  const [scale, setScale] = useState(1.0);
  const [lastMsg, setLastMsg] = useState("");

  const isPlaceMode = buildTool === "place";
  const filtered = SPAWN_CATALOGUE.filter((s) => filter === "all" || s.category === filter);

  // Find what index in the full catalogue the active item is
  const activeCatalogueEntry = SPAWN_CATALOGUE[activeSpawnIdx];

  function doItem(catalogueIdx: number) {
    const entry = SPAWN_CATALOGUE[catalogueIdx];
    if (!entry) return;
    if (isPlaceMode) {
      // In PLACE mode: arm this prop — it will be placed by clicking the terrain
      setActiveSpawn(catalogueIdx);
      setLastMsg(`Armed: ${entry.label}`);
    } else {
      // Not in place mode: drop at default position
      window.dispatchEvent(new CustomEvent("admin:spawn", {
        detail: { ...entry, scale: entry.scale * scale, x: 0, y: 1, z: 0 },
      }));
      setLastMsg(`Spawned: ${entry.label}`);
    }
    setTimeout(() => setLastMsg(""), 2000);
  }

  return (
    <div>
      <SectionLabel>Filter</SectionLabel>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(["all","character","weapon","ruin"] as const).map((cat) => (
          <button key={cat} onClick={() => setFilter(cat)}
            style={{
              padding: "3px 10px", fontFamily: mono, fontSize: 10, cursor: "pointer",
              background: filter === cat ? "rgba(17,204,85,0.12)" : "transparent",
              border: `1px solid ${filter === cat ? green : "#1a2a1a"}`,
              color: filter === cat ? green : "#3a5a3a", borderRadius: 2,
            }}>
            {cat === "all" ? "ALL" : `${CATEGORY_ICONS[cat]} ${cat.toUpperCase()}`}
          </button>
        ))}
      </div>

      <AdminSlider label="Scale multiplier" value={scale} min={0.1} max={5} step={0.1}
        display={`${scale.toFixed(1)}×`} onChange={setScale} />

      {/* Armed prop indicator */}
      {isPlaceMode && activeCatalogueEntry && (
        <div style={{
          marginBottom: 10, padding: "6px 10px", borderRadius: 3,
          background: "rgba(17,204,85,0.08)", border: "1px solid #1a4a1a",
          fontFamily: mono, fontSize: 10,
        }}>
          <span style={{ color: "#3a6a3a" }}>ARMED  </span>
          <span style={{ color: green }}>{CATEGORY_ICONS[activeCatalogueEntry.category]} {activeCatalogueEntry.label}</span>
          <span style={{ float: "right", color: "#2a4a2a" }}>scroll wheel to cycle</span>
        </div>
      )}

      {lastMsg && (
        <div style={{ fontFamily: mono, fontSize: 10, color: green, marginBottom: 8, letterSpacing: 1 }}>
          ✓ {lastMsg}
        </div>
      )}

      <div data-admin-panel style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #0d1a0d", borderRadius: 3 }}>
        {filtered.map((entry) => {
          // Find the index of this entry in the full catalogue
          const catIdx = SPAWN_CATALOGUE.indexOf(entry);
          const isArmed = isPlaceMode && catIdx === activeSpawnIdx;
          return (
            <button key={catIdx} onClick={() => doItem(catIdx)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "6px 12px", textAlign: "left", cursor: "pointer",
                background: isArmed ? "rgba(17,204,85,0.12)" : "transparent",
                border: "none", borderBottom: "1px solid #0a120a",
                fontFamily: mono, fontSize: 10,
                color: isArmed ? green : "#556655",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (!isArmed) e.currentTarget.style.background = "rgba(17,204,85,0.06)"; }}
              onMouseLeave={(e) => { if (!isArmed) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: isArmed ? green : "#2a5a2a", width: 12 }}>{CATEGORY_ICONS[entry.category]}</span>
              <span>{entry.label}</span>
              {isArmed && <span style={{ marginLeft: 6, fontSize: 8, color: green }}>◀ ARMED</span>}
              <span style={{ marginLeft: "auto", color: "#2a3a2a", fontSize: 9 }}>
                {entry.meshPath.split("/").pop()?.substring(0, 20)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Build tab ────────────────────────────────────────────────────────────────
function BuildTab() {
  const { objects, selectedId, buildTool, setTool, removeObject, clearAll, selectObject, rotateObject } = useAdminStore();
  const selectedObj = objects.find((o) => o.id === selectedId);

  return (
    <div>
      <SectionLabel>Tool</SectionLabel>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["place","select","delete"] as const).map((t) => (
          <button key={t} onClick={() => setTool(t)}
            style={{
              flex: 1, padding: "5px 4px", fontFamily: mono, fontSize: 10,
              cursor: "pointer", background: buildTool === t ? "rgba(17,204,85,0.12)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${buildTool === t ? green : "#1a2a1a"}`,
              color: buildTool === t ? green : "#3a5a3a", borderRadius: 2,
            }}>{t.toUpperCase()}</button>
        ))}
      </div>

      {selectedObj && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(17,204,85,0.04)", border: "1px solid #1a3a1a", borderRadius: 3 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: green, marginBottom: 6 }}>
            SELECTED: {selectedObj.label}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <AdminBtn small label="Rotate +45°" onClick={() => rotateObject(selectedObj.id, Math.PI / 4)} />
            <AdminBtn small label="Rotate -45°" onClick={() => rotateObject(selectedObj.id, -Math.PI / 4)} />
            <AdminBtn small color={red} label="Delete" onClick={() => removeObject(selectedObj.id)} />
          </div>
        </div>
      )}

      <SectionLabel>Placed Objects ({objects.length})</SectionLabel>
      <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
        {objects.length === 0 ? (
          <div style={{ fontFamily: mono, fontSize: 10, color: "#2a3a2a", padding: "8px 0" }}>
            No objects placed. Use PLACE tool + Spawn tab.
          </div>
        ) : objects.map((o) => (
          <div key={o.id} onClick={() => selectObject(o.id === selectedId ? null : o.id)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "4px 8px", cursor: "pointer", borderRadius: 2, marginBottom: 2,
              background: o.id === selectedId ? "rgba(17,204,85,0.08)" : "rgba(255,255,255,0.01)",
              border: `1px solid ${o.id === selectedId ? "#1a4a1a" : "transparent"}`,
            }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: o.id === selectedId ? green : "#3a5a3a" }}>
              {CATEGORY_ICONS[o.category]} {o.label}
            </span>
            <span style={{ fontFamily: mono, fontSize: 9, color: "#2a3a2a" }}>
              ({o.position.map((v) => v.toFixed(1)).join(", ")})
            </span>
          </div>
        ))}
      </div>

      <AdminBtn color={red} label="CLEAR ALL" onClick={() => { if (confirm("Clear all placed objects?")) clearAll(); }} />

      <div style={{ marginTop: 12, fontFamily: mono, fontSize: 9, color: "#2a3a2a", lineHeight: 2.0 }}>
        PLACE  — arm prop in SPAWN tab, then click terrain<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;scroll wheel cycles armed prop<br />
        SELECT — click objects to select / reposition<br />
        DELETE — click objects to remove<br />
        R key  — rotate selected 45°&nbsp;&nbsp;Del — remove selected
      </div>
    </div>
  );
}

// ─── World tab ────────────────────────────────────────────────────────────────
function WorldTab() {
  const { wave, nextWave } = useGameStore();
  const { patch, zombieSpeedMult, zombieDetectionRadius, zombieAttackDamage, maxZombies,
          fogNear, fogFar, ambientIntensity, sunIntensity } = useEditorStore();

  return (
    <div>
      <SectionLabel>Wave Control</SectionLabel>
      <div style={{ fontFamily: mono, fontSize: 12, color: green, marginBottom: 8 }}>
        Current Wave: <span style={{ color: "#ee4444" }}>{wave}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <AdminBtn label="NEXT WAVE" onClick={nextWave} />
        <AdminBtn color={red} label="RESET WAVE" onClick={() => useGameStore.setState({ wave: 1 })} />
      </div>

      <SectionLabel>Zombie Settings</SectionLabel>
      <AdminSlider label="Speed multiplier" value={zombieSpeedMult} min={0.1} max={5} step={0.1}
        display={`${zombieSpeedMult.toFixed(1)}×`} onChange={(v) => patch({ zombieSpeedMult: v })} />
      <AdminSlider label="Detection radius" value={zombieDetectionRadius} min={5} max={80} step={1}
        display={`${zombieDetectionRadius}m`} onChange={(v) => patch({ zombieDetectionRadius: v })} />
      <AdminSlider label="Damage/hit" value={zombieAttackDamage} min={0} max={100} step={1}
        display={`${zombieAttackDamage}`} onChange={(v) => patch({ zombieAttackDamage: v })} />
      <AdminSlider label="Max zombies" value={maxZombies} min={0} max={50} step={1}
        display={`${maxZombies}`} onChange={(v) => patch({ maxZombies: v })} />

      <SectionLabel>Environment</SectionLabel>
      <AdminSlider label="Fog near" value={fogNear} min={100} max={6000} step={50}
        display={`${fogNear}m`} onChange={(v) => patch({ fogNear: v })} />
      <AdminSlider label="Fog far" value={fogFar} min={500} max={12000} step={100}
        display={`${fogFar}m`} onChange={(v) => patch({ fogFar: v })} />
      <AdminSlider label="Ambient light" value={ambientIntensity} min={0} max={3} step={0.05}
        display={ambientIntensity.toFixed(2)} onChange={(v) => patch({ ambientIntensity: v })} />
      <AdminSlider label="Sun intensity" value={sunIntensity} min={0} max={8} step={0.1}
        display={sunIntensity.toFixed(1)} onChange={(v) => patch({ sunIntensity: v })} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <AdminBtn label="Night" onClick={() => patch({ ambientIntensity: 0.05, sunIntensity: 0.1, fogNear: 200, fogFar: 1200 })} />
        <AdminBtn label="Dusk" onClick={() => patch({ ambientIntensity: 0.3, sunIntensity: 0.8, fogNear: 800, fogFar: 3500 })} />
        <AdminBtn label="Day" onClick={() => patch({ ambientIntensity: 0.55, sunIntensity: 2.8, fogNear: 2700, fogFar: 8000 })} />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 3, color: "#2a5a2a",
      textTransform: "uppercase", marginBottom: 8, paddingBottom: 4,
      borderBottom: "1px solid #0d1a0d" }}>
      // {children}
    </div>
  );
}

// ─── Root AdminPanel ──────────────────────────────────────────────────────────
export function AdminPanel() {
  const { adminPanelOpen, toggleAdminPanel, godMode } = useGameStore();
  const [tab, setTab] = useState<Tab>("player");

  if (!adminPanelOpen) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "player", label: "PLAYER" },
    { id: "spawn",  label: "SPAWN"  },
    { id: "build",  label: "BUILD"  },
    { id: "world",  label: "WORLD"  },
  ];

  return (
    <div data-admin-panel style={{
      position: "fixed", top: 60, left: 16, width: 340, zIndex: 9000,
      background: "rgba(4,10,5,0.97)", border: "1px solid #1a3a1a",
      borderRadius: 4, overflow: "hidden", userSelect: "none",
      boxShadow: "0 4px 32px #000a, 0 0 0 1px #0d2a0d",
      fontFamily: mono,
    }}>
      {/* Header */}
      <div style={{ background: "#060e07", borderBottom: "1px solid #1a3a1a",
        display: "flex", alignItems: "center", padding: "10px 14px", gap: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: 3, color: green, fontWeight: 700 }}>ADMIN PANEL</span>
        {godMode && (
          <span style={{ fontSize: 9, padding: "1px 6px", background: "rgba(200,30,30,0.15)",
            border: "1px solid #882222", color: "#cc3333", borderRadius: 2, letterSpacing: 2 }}>
            GOD
          </span>
        )}
        <button onClick={toggleAdminPanel} style={{ marginLeft: "auto", background: "none",
          border: "none", color: "#2a5a2a", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #0d1a0d" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "7px 0", fontFamily: mono, fontSize: 9, letterSpacing: 1.5,
              cursor: "pointer", border: "none", borderBottom: `2px solid ${tab === t.id ? green : "transparent"}`,
              background: tab === t.id ? "rgba(17,204,85,0.06)" : "transparent",
              color: tab === t.id ? green : "#2a5a2a",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        {tab === "player" && <PlayerTab />}
        {tab === "spawn"  && <SpawnTab />}
        {tab === "build"  && <BuildTab />}
        {tab === "world"  && <WorldTab />}
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 14px", borderTop: "1px solid #0d1a0d",
        fontFamily: mono, fontSize: 9, color: "#1a3a1a", display: "flex", justifyContent: "space-between" }}>
        <span>F1 — Controls &nbsp;·&nbsp; F8 — God Mode &nbsp;·&nbsp; F9 — Panel</span>
        <span style={{ color: godMode ? "#cc3333" : "#2a4a2a" }}>
          {godMode ? "⚡ NOCLIP" : "● NORMAL"}
        </span>
      </div>
    </div>
  );
}
