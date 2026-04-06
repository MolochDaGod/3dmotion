/**
 * MMOSync — mounts inside the R3F Canvas.
 * Sends the local player's position/state to the WebSocket server every 50 ms
 * and syncs the current wave number when it changes.
 */
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { connectMMO, disconnectMMO, sendSnapshot, sendWaveSync, getMMOId } from "./MMOClient";
import { useMMOStore } from "./useMMOStore";
import { useGameStore } from "./useGameStore";

const SNAP_INTERVAL_MS = 80; // ~12 Hz

interface Props {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerYawRef: React.MutableRefObject<number>;
  currentAnim: string;
  map: string;
}

export function MMOSync({ playerPosRef, playerYawRef, currentAnim, map }: Props) {
  const username   = useMMOStore((s) => s.username);
  const wave       = useGameStore((s) => s.wave);
  const health     = useGameStore((s) => s.health);
  const character  = useGameStore((s) => (s as any).selectedCharacter as string | undefined);

  const lastSnapRef  = useRef(0);
  const lastWaveRef  = useRef(0);

  // Connect / reconnect when username or map changes
  useEffect(() => {
    if (!username) return;
    connectMMO(username, map, character);
    return () => disconnectMMO();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, map]);

  // Every frame: throttled position broadcast
  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    if (now - lastSnapRef.current < SNAP_INTERVAL_MS) return;
    lastSnapRef.current = now;

    const id = getMMOId();
    if (!id || !username) return;

    const pos = playerPosRef.current;
    sendSnapshot({
      id,
      username,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      yaw: playerYawRef.current,
      map,
      anim: currentAnim,
      hp: health,
      characterId: character,
    });

    // Sync wave to server (server keeps highest authoritative wave per map)
    if (wave !== lastWaveRef.current) {
      lastWaveRef.current = wave;
      sendWaveSync(wave, map);
    }
  });

  return null;
}
