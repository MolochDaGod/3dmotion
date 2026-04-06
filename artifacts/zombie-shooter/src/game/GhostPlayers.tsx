/**
 * GhostPlayers — renders animated character meshes for remote MMO players.
 * Only players on the same map as the local player are rendered.
 * Each ghost loads the remote player's actual character mesh + 3-state animation.
 */
import { useMMOStore } from "./useMMOStore";
import { GhostCharacter } from "./GhostCharacter";

interface Props { map: string }

export function GhostPlayers({ map }: Props) {
  const players = useMMOStore((s) => s.remotePlayers);

  return (
    <>
      {[...players.values()]
        .filter((p) => p.map === map)
        .map((p) => (
          <GhostCharacter key={p.id} player={p} />
        ))}
    </>
  );
}
