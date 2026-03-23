import { useGameStore } from "./useGameStore";

export function HUD() {
  const { health, maxHealth, ammo, maxAmmo, score, kills, isReloading, wave } = useGameStore();

  const healthPct = (health / maxHealth) * 100;
  const healthColor =
    healthPct > 60 ? "#4caf50" : healthPct > 30 ? "#ff9800" : "#f44336";

  return (
    <div className="fixed inset-0 pointer-events-none select-none">
      {/* Health — bottom left */}
      <div className="absolute bottom-8 left-8 text-white">
        <div className="mb-2 text-xs text-gray-400 font-bold uppercase tracking-widest">Health</div>
        <div className="w-48 h-3 bg-gray-800 rounded-full border border-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${healthPct}%`, backgroundColor: healthColor }}
          />
        </div>
        <div className="text-xs mt-1" style={{ color: healthColor }}>
          {Math.ceil(health)} / {maxHealth}
        </div>
      </div>

      {/* Ammo — bottom right */}
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
              className="w-1.5 h-4 rounded-sm"
              style={{ backgroundColor: i < ammo ? "#ffdd44" : "#444" }}
            />
          ))}
        </div>
      </div>

      {/* Score — top right */}
      <div className="absolute top-6 right-8 text-white text-right">
        <div className="text-xs text-gray-400 uppercase tracking-widest">Score</div>
        <div className="text-4xl font-bold font-mono text-yellow-400">{score.toLocaleString()}</div>
        <div className="text-xs text-gray-400 mt-1">
          Kills: <span className="text-red-400 font-bold">{kills}</span>
          &nbsp;&nbsp;Wave: <span className="text-orange-400 font-bold">{wave}</span>
        </div>
      </div>

      {/* Controls hint — top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/30 text-xs text-center">
        Click to aim &nbsp;·&nbsp; WASD to move &nbsp;·&nbsp; Space to jump &nbsp;·&nbsp; R to reload &nbsp;·&nbsp; Shift to sprint
      </div>

      {/* Empty ammo warning */}
      {ammo === 0 && !isReloading && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-red-400 font-bold text-lg animate-bounce">
          EMPTY — Press R or Click to reload
        </div>
      )}

      {/* Low health warning */}
      {healthPct < 25 && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 80px rgba(255,0,0,0.25)" }} />
      )}
    </div>
  );
}
