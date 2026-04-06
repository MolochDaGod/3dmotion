import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { logger } from "../lib/logger";

// ── MMO message types ──────────────────────────────────────────────────────────
export interface PlayerSnapshot {
  id: string;
  username: string;
  x: number; y: number; z: number;
  yaw: number;
  map: string;
  anim: string;
  hp: number;
  characterId?: string;
}

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  ts: number;
}

interface WaveState {
  wave: number;
  map: string;
  playerCount: number;
}

type InMsg =
  | { type: "join";      id: string; username: string; map: string; characterId?: string }
  | { type: "snapshot";  data: PlayerSnapshot }
  | { type: "chat";      id: string; username: string; text: string }
  | { type: "wave_sync"; wave: number; map: string }
  | { type: "ping" };

type OutMsg =
  | { type: "welcome";      yourId: string; players: PlayerSnapshot[]; wave: WaveState; history: ChatMessage[] }
  | { type: "snapshot";     data: PlayerSnapshot }
  | { type: "player_left";  id: string }
  | { type: "chat";         msg: ChatMessage }
  | { type: "wave_update";  wave: WaveState }
  | { type: "pong" };

// ── Server state ───────────────────────────────────────────────────────────────
const clients = new Map<string, WebSocket>();
const snapshots = new Map<string, PlayerSnapshot>();
const chatHistory: ChatMessage[] = [];
const MAX_CHAT_HISTORY = 50;

// Per-map wave tracking (latest authoritative wave)
const waveByMap = new Map<string, number>();

function broadcast(msg: OutMsg, excludeId?: string) {
  const payload = JSON.stringify(msg);
  for (const [id, ws] of clients) {
    if (id === excludeId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function send(ws: WebSocket, msg: OutMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ── Attach to HTTP server (WebSocket upgrade) ──────────────────────────────────
export function attachMMOServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/mmo" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let myId = "";

    ws.on("message", (raw) => {
      let msg: InMsg;
      try { msg = JSON.parse(raw.toString()); }
      catch { return; }

      switch (msg.type) {
        case "join": {
          myId = msg.id;
          clients.set(myId, ws);
          // Seed snapshot
          const snap: PlayerSnapshot = {
            id: myId,
            username: msg.username,
            x: 0, y: 0, z: 0,
            yaw: 0,
            map: msg.map,
            anim: "idle",
            hp: 100,
            characterId: msg.characterId,
          };
          snapshots.set(myId, snap);

          const currentWave = waveByMap.get(msg.map) ?? 1;
          const wave: WaveState = {
            wave: currentWave,
            map: msg.map,
            playerCount: clients.size,
          };

          send(ws, {
            type: "welcome",
            yourId: myId,
            players: [...snapshots.values()].filter(s => s.id !== myId),
            wave,
            history: chatHistory.slice(-20),
          });

          broadcast({ type: "snapshot", data: snap }, myId);
          logger.info({ id: myId, username: msg.username }, "MMO player joined");
          break;
        }

        case "snapshot": {
          if (!myId) return;
          const updated = { ...msg.data, id: myId };
          snapshots.set(myId, updated);
          broadcast({ type: "snapshot", data: updated }, myId);
          break;
        }

        case "chat": {
          if (!myId) return;
          const chatMsg: ChatMessage = {
            id: myId,
            username: msg.username,
            text: msg.text.slice(0, 256),
            ts: Date.now(),
          };
          chatHistory.push(chatMsg);
          if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
          broadcast({ type: "chat", msg: chatMsg });
          break;
        }

        case "wave_sync": {
          if (!myId) return;
          const current = waveByMap.get(msg.map) ?? 1;
          if (msg.wave > current) {
            waveByMap.set(msg.map, msg.wave);
            const waveState: WaveState = {
              wave: msg.wave,
              map: msg.map,
              playerCount: clients.size,
            };
            broadcast({ type: "wave_update", wave: waveState });
          }
          break;
        }

        case "ping":
          send(ws, { type: "pong" });
          break;
      }
    });

    ws.on("close", () => {
      if (!myId) return;
      clients.delete(myId);
      snapshots.delete(myId);
      broadcast({ type: "player_left", id: myId });
      logger.info({ id: myId }, "MMO player disconnected");
    });

    ws.on("error", (err) => logger.error({ err }, "MMO WebSocket error"));
  });

  logger.info("MMO WebSocket server attached at /ws/mmo");
}
