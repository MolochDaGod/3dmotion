import { useEffect } from "react";
import { useGameStore } from "./useGameStore";

const WEAPON_INFO: Record<string, {
  icon: string; name: string; color: string;
  lmbLabel: string; rmbLabel: string; lmbDesc: string; rmbDesc: string;
}> = {
  pistol: {
    icon: "🔫", name: "Pistol", color: "#80cfff",
    lmbLabel: "LMB — Fire",        lmbDesc: "Single precise shot",
    rmbLabel: "RMB — Melee",       rmbDesc: "Close-range strike",
  },
  rifle: {
    icon: "🎯", name: "Assault Rifle", color: "#aaffaa",
    lmbLabel: "LMB — Fire",        lmbDesc: "Rapid sustained fire",
    rmbLabel: "RMB — Melee",       rmbDesc: "Rifle butt strike",
  },
  sword: {
    icon: "⚔️", name: "Sword", color: "#ffaa55",
    lmbLabel: "LMB — Slash",       lmbDesc: "3-hit combo chain",
    rmbLabel: "RMB — Block",       rmbDesc: "Parry incoming attacks",
  },
  axe: {
    icon: "🪓", name: "Battle Axe", color: "#ff7777",
    lmbLabel: "LMB — Cleave",      lmbDesc: "Heavy overhead strike",
    rmbLabel: "RMB — Block",       rmbDesc: "Shield counter stance",
  },
  staff: {
    icon: "🔮", name: "Magic Staff", color: "#cc88ff",
    lmbLabel: "LMB — Cast Bolt",   lmbDesc: "Single magic projectile (20 MP)",
    rmbLabel: "RMB — Area Blast",  rmbDesc: "AoE arcane burst (40 MP)",
  },
  bow: {
    icon: "🏹", name: "Longbow", color: "#aed67a",
    lmbLabel: "LMB — Draw & Fire", lmbDesc: "Nock and loose an arrow (~900ms cycle)",
    rmbLabel: "RMB — Aim",        rmbDesc: "Hold to enter aim-walk stance",
  },
};

export function CharacterPanel() {
  const {
    health, maxHealth,
    mana, maxMana,
    score, kills, wave,
    weaponMode,
    setShowCharacterPanel,
  } = useGameStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyC" || e.code === "Escape") {
        e.preventDefault();
        setShowCharacterPanel(false);
        document.body.requestPointerLock();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setShowCharacterPanel]);

  const hp    = (health / maxHealth) * 100;
  const mp    = (mana / maxMana) * 100;
  const hpCol = hp > 60 ? "#4caf50" : hp > 30 ? "#ff9800" : "#f44336";
  const info  = WEAPON_INFO[weaponMode] ?? WEAPON_INFO.pistol;

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.72)",
        zIndex: 200,
        pointerEvents: "auto",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setShowCharacterPanel(false);
          document.body.requestPointerLock();
        }
      }}
    >
      <div
        style={{
          background: "linear-gradient(160deg, rgba(14,10,28,0.98) 0%, rgba(20,12,40,0.98) 100%)",
          border: "1px solid rgba(180,120,255,0.22)",
          borderRadius: 16,
          padding: "28px 32px",
          width: 480,
          color: "#fff",
          pointerEvents: "auto",
          boxShadow: "0 0 60px rgba(120,60,220,0.35), 0 24px 80px rgba(0,0,0,0.9)",
          fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{
              fontSize: 13, letterSpacing: 3, textTransform: "uppercase",
              color: "rgba(180,120,255,0.7)", marginBottom: 4,
            }}>
              Character
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#e8d8ff" }}>
              Corsair King
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2, letterSpacing: 1 }}>
              C or ESC to close
            </div>
          </div>

          {/* Wave / score badge */}
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 11, letterSpacing: 2, color: "rgba(255,200,80,0.6)",
              textTransform: "uppercase",
            }}>
              Wave
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#ffd740", lineHeight: 1, fontFamily: "monospace" }}>
              {wave}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(180,120,255,0.15)", marginBottom: 22 }} />

        {/* Stat bars */}
        <div style={{ marginBottom: 20 }}>

          {/* Health */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa" }}>Health</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: hpCol }}>
                {Math.ceil(health)} / {maxHealth}
              </span>
            </div>
            <div style={{
              height: 10, borderRadius: 6,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${hp}%`,
                background: `linear-gradient(90deg, ${hpCol}cc, ${hpCol})`,
                borderRadius: 6,
                transition: "width 0.3s ease",
                boxShadow: `0 0 8px ${hpCol}88`,
              }} />
            </div>
          </div>

          {/* Mana */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa" }}>Mana</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#aa77ff" }}>
                {Math.ceil(mana)} / {maxMana}
              </span>
            </div>
            <div style={{
              height: 10, borderRadius: 6,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${mp}%`,
                background: "linear-gradient(90deg, #7733cccc, #aa77ff)",
                borderRadius: 6,
                transition: "width 0.3s ease",
                boxShadow: "0 0 10px rgba(160,100,255,0.6)",
              }} />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(180,120,255,0.15)", marginBottom: 20 }} />

        {/* Combat stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 22 }}>
          {[
            { label: "Score", value: score.toLocaleString(), color: "#ffd740" },
            { label: "Kills", value: kills.toString(),       color: "#ff5555" },
            { label: "Wave",  value: wave.toString(),        color: "#ff9800" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "12px 14px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(180,120,255,0.15)", marginBottom: 20 }} />

        {/* Equipped weapon */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>
            Equipped Weapon
          </div>

          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${info.color}33`,
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                fontSize: 28, width: 48, height: 48,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${info.color}18`, borderRadius: 10,
                border: `1px solid ${info.color}44`,
              }}>
                {info.icon}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: info.color, letterSpacing: 0.5 }}>
                  {info.name}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginTop: 2 }}>
                  Q to cycle weapon
                </div>
              </div>
            </div>

            {/* LMB / RMB attack info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: info.lmbLabel, desc: info.lmbDesc },
                { label: info.rmbLabel, desc: info.rmbDesc },
              ].map(({ label, desc }) => (
                <div key={label} style={{
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: 8, padding: "10px 12px",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: info.color, marginBottom: 4, letterSpacing: 0.5 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div style={{
          marginTop: 20,
          fontSize: 10, color: "rgba(255,255,255,0.18)",
          textAlign: "center", letterSpacing: 1,
        }}>
          WASD move · Shift sprint · Space jump · Alt crouch · Ctrl roll
        </div>
      </div>
    </div>
  );
}
