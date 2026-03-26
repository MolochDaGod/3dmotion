import { SCENES } from "../game/scene-configs";

interface PortalUIProps {
  currentSceneId: string;
  targetSceneId: string;
  onEnter: (sceneId: string) => void;
  onClose: () => void;
}

const SCENE_ICONS: Record<string, string> = {
  lost_portal: "🌀",
  combat_arena: "⚔️",
  dark_dungeon: "💀",
  open_world: "🌍",
};

export default function PortalUI({ currentSceneId, targetSceneId, onEnter, onClose }: PortalUIProps) {
  const current = SCENES[currentSceneId];
  const allScenes = Object.values(SCENES).filter(s => s.id !== currentSceneId);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-gray-950/95 border border-violet-500/30 rounded-2xl p-6 w-[480px] max-w-[90vw] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-violet-400 text-xs tracking-widest uppercase font-mono mb-1">Portal Gateway</p>
            <h2 className="text-white text-xl font-bold">Choose Your Destination</h2>
            <p className="text-white/40 text-xs mt-1">Currently: {current?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {allScenes.map(scene => (
            <button
              key={scene.id}
              onClick={() => onEnter(scene.id)}
              className="group flex items-center gap-4 bg-white/5 hover:bg-violet-500/15 border border-white/10 hover:border-violet-500/40 rounded-xl px-4 py-3 text-left transition-all duration-200"
            >
              <span className="text-3xl">{SCENE_ICONS[scene.id] ?? "🌐"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm group-hover:text-violet-200 transition-colors">{scene.name}</p>
                <p className="text-white/40 text-xs mt-0.5 line-clamp-1">{scene.description}</p>
              </div>
              <span className="text-violet-400/50 group-hover:text-violet-300 transition-colors text-sm">→</span>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
          <p className="text-white/20 text-[10px] font-mono">ESC / Click outside to close</p>
          <div className="flex gap-1">
            {Object.keys(SCENES).map(id => (
              <div
                key={id}
                className={`w-2 h-2 rounded-full ${id === currentSceneId ? "bg-violet-400" : "bg-white/10"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
