import { useEffect, useState } from "react";
import type { WeaponId, SkillDef } from "../game/types";
import { WEAPONS, WEAPON_ORDER, SKILLS, SCENES } from "../game/scene-configs";

interface HUDProps {
  currentWeapon: WeaponId;
  cooldowns: Record<number, number>;
  sceneId: string;
  nearPortal: boolean;
  onPortalOpen: () => void;
  health: number;
  mana: number;
  renderBackend: string;
}

export default function GameHUD({
  currentWeapon, cooldowns, sceneId, nearPortal, onPortalOpen, health, mana, renderBackend
}: HUDProps) {
  const skills: SkillDef[] = SKILLS[currentWeapon];
  const weapon = WEAPONS[currentWeapon];
  const scene = SCENES[sceneId];

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Top-left: backend + scene */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-violet-200 text-[10px] font-mono tracking-widest uppercase">{renderBackend}</span>
        </div>
        <div className="bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
          <p className="text-white/70 text-[11px] font-semibold tracking-wider">{scene?.name}</p>
        </div>
      </div>

      {/* Top-right: Health + Mana */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 w-44">
        <div className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-red-400 text-[10px] font-bold tracking-wider">HP</span>
            <span className="text-red-300 text-[10px] font-mono">{health}/100</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-red-700 to-red-400 rounded-full transition-all" style={{ width: `${health}%` }} />
          </div>
        </div>
        <div className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-blue-400 text-[10px] font-bold tracking-wider">MP</span>
            <span className="text-blue-300 text-[10px] font-mono">{mana}/100</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-700 to-blue-400 rounded-full transition-all" style={{ width: `${mana}%` }} />
          </div>
        </div>
      </div>

      {/* Bottom center: Skill bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        {/* Weapon slots */}
        <div className="flex gap-1.5">
          {WEAPON_ORDER.map((wid, i) => (
            <div
              key={wid}
              className={`w-8 h-8 rounded border flex items-center justify-center cursor-default transition-all ${
                wid === currentWeapon
                  ? "border-white/60 bg-white/15 scale-110"
                  : "border-white/10 bg-black/40"
              }`}
            >
              <span className="text-[8px] text-white/60 font-mono">{wid.slice(0,3).toUpperCase()}</span>
            </div>
          ))}
        </div>

        {/* Skill slots */}
        <div className="flex gap-2">
          {skills.map((skill, idx) => {
            const key = (idx + 1) as 1|2|3|4;
            const endTime = cooldowns[key] ?? 0;
            const remaining = Math.max(0, (endTime - now) / 1000);
            const pct = remaining > 0 ? (remaining / skill.cooldown) * 100 : 0;
            const ready = remaining === 0;
            return (
              <div key={idx} className="relative flex flex-col items-center gap-0.5">
                <div
                  className={`w-14 h-14 rounded-lg border flex flex-col items-center justify-center relative overflow-hidden transition-all ${
                    ready
                      ? "border-white/30 bg-black/60"
                      : "border-white/10 bg-black/70"
                  }`}
                >
                  {/* Cooldown overlay */}
                  {!ready && (
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-black/60 transition-all"
                      style={{ height: `${pct}%` }}
                    />
                  )}
                  <span className="text-2xl z-10">{skill.icon}</span>
                  {!ready && (
                    <span className="text-[10px] font-mono font-bold z-10" style={{ color: skill.color }}>
                      {remaining.toFixed(1)}s
                    </span>
                  )}
                </div>
                <div className="flex gap-1 items-center">
                  <span className="text-white/30 text-[9px] font-mono">[{key}]</span>
                  <span className="text-white/50 text-[9px] truncate max-w-[56px]">{skill.name}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Weapon name */}
        <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-full px-4 py-1 backdrop-blur-sm">
          <span className="text-white/40 text-[9px] tracking-widest uppercase font-mono">Q Switch</span>
          <span className="text-white/20 text-[9px]">·</span>
          <span className="text-white text-[11px] font-semibold tracking-wide">{weapon.name}</span>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-5 right-4 z-10 flex flex-col gap-0.5 text-right">
        <span className="text-white/20 text-[9px] font-mono">WASD — Move</span>
        <span className="text-white/20 text-[9px] font-mono">Mouse — Look</span>
        <span className="text-white/20 text-[9px] font-mono">Click — Lock Cursor</span>
        <span className="text-white/20 text-[9px] font-mono">Q — Switch Weapon</span>
        <span className="text-white/20 text-[9px] font-mono">1–4 — Skills</span>
        <span className="text-white/20 text-[9px] font-mono">LMB — Attack</span>
      </div>

      {/* Portal prompt */}
      {nearPortal && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div
            className="bg-black/70 border border-violet-500/50 rounded-xl px-6 py-3 backdrop-blur-md text-center animate-pulse cursor-pointer pointer-events-auto"
            onClick={onPortalOpen}
          >
            <p className="text-violet-300 text-sm font-semibold tracking-wide">Portal Nearby</p>
            <p className="text-white/40 text-xs mt-0.5">Click to Enter</p>
          </div>
        </div>
      )}
    </>
  );
}
