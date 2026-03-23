import { useGameStore } from "./useGameStore";

export function HUD() {
  const { health, maxHealth, ammo, maxAmmo, score, kills, isReloading, wave } = useGameStore();

  const healthPct = (health / maxHealth) * 100;
  const healthColor =
    healthPct > 60 ? "#4caf50" : healthPct > 30 ? "#ff9800" : "#f44336";

  return (
    <div className="fixed inset-0 pointer-events-none select-none">
      <div className="absolute bottom-8 left-8 text-white">
        <div className="mb-2 text-sm text-gray-300 font-bold uppercase tracking-widest">Health</div>
        <div className="w-48 h-4 bg-gray-800 rounded-full border border-gray-600 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${healthPct}%`, backgroundColor: healthColor }}
          />
        </div>
        <div className="text-sm mt-1" style={{ color: healthColor }}>
          {Math.ceil(health)} / {maxHealth}
        </div>
      </div>

      <div className="absolute bottom-8 right-8 text-white text-right">
        <div className="text-sm text-gray-300 font-bold uppercase tracking-widest mb-1">Ammo</div>
        <div className="text-3xl font-mono font-bold">
          {isReloading ? (
            <span className="text-yellow-400 animate-pulse text-xl">RELOADING...</span>
          ) : (
            <>
              <span className={ammo <= 3 ? "text-red-400" : "text-white"}>{ammo}</span>
              <span className="text-gray-500 text-xl"> / {maxAmmo}</span>
            </>
          )}
        </div>
        <div className="flex justify-end gap-1 mt-2">
          {Array.from({ length: maxAmmo }).map((_, i) => (
            <div
              key={i}
              className="w-2 h-5 rounded-sm"
              style={{ backgroundColor: i < ammo ? "#ffdd44" : "#444" }}
            />
          ))}
        </div>
      </div>

      <div className="absolute top-6 right-8 text-white text-right">
        <div className="text-sm text-gray-400 uppercase tracking-widest">Score</div>
        <div className="text-4xl font-bold font-mono text-yellow-400">{score.toLocaleString()}</div>
        <div className="text-sm text-gray-400 mt-1">Kills: <span className="text-red-400 font-bold">{kills}</span></div>
        <div className="text-sm text-gray-400">Wave: <span className="text-orange-400 font-bold">{wave}</span></div>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-6 h-6">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white opacity-80" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white opacity-80" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-400" />
        </div>
      </div>

      <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/40 text-xs">
        Click to aim • WASD to move • Space to jump • R to reload
      </div>

      {ammo === 0 && !isReloading && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-red-400 font-bold text-xl animate-bounce">
          EMPTY — Click or press R to reload
        </div>
      )}
    </div>
  );
}
