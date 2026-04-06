import { useMMOStore } from "./useMMOStore";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface PlayerSnapshotPayload {
  id: string;
  username: string;
  x: number; y: number; z: number;
  yaw: number;
  map: string;
  anim: string;
  hp: number;
  characterId?: string;
}

// ── WebSocket URL resolution ───────────────────────────────────────────────────
// The Replit artifact router proxies all artifacts under the same domain.
// The API server's /ws/mmo path is forwarded by the router.
function resolveWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/mmo`;
}

// ── Singleton client ───────────────────────────────────────────────────────────
let ws: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _myId = "";
let _username = "";
let _map = "";
let _characterId: string | undefined;

function clearTimers() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

export function getMMOSocket(): WebSocket | null { return ws; }
export function getMMOId(): string { return _myId; }

export function connectMMO(username: string, map: string, characterId?: string) {
  _username    = username;
  _map         = map;
  _characterId = characterId;
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  clearTimers();

  if (!_myId) {
    _myId = sessionStorage.getItem("mmo_id") ?? crypto.randomUUID();
    sessionStorage.setItem("mmo_id", _myId);
  }

  const url = resolveWsUrl();
  ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    useMMOStore.getState().setConnected(true);
    ws!.send(JSON.stringify({ type: "join", id: _myId, username, map, characterId }));
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 25_000);
  });

  ws.addEventListener("message", (ev) => {
    try { handleMessage(JSON.parse(ev.data as string)); }
    catch { /* ignore */ }
  });

  ws.addEventListener("close", () => {
    clearTimers();
    useMMOStore.getState().setConnected(false);
    reconnectTimer = setTimeout(() => {
      connectMMO(_username, _map, _characterId);
    }, 3_000);
  });

  ws.addEventListener("error", () => ws?.close());
}

export function disconnectMMO() {
  clearTimers();
  ws?.close();
  ws = null;
  useMMOStore.getState().setConnected(false);
}

function handleMessage(msg: Record<string, unknown>) {
  const store = useMMOStore.getState();
  switch (msg.type) {
    case "welcome": {
      const m = msg as {
        yourId: string;
        players: Parameters<typeof store.upsertRemotePlayer>[0][];
        wave: Parameters<typeof store.setWave>[0];
        history: Parameters<typeof store.addChat>[0][];
      };
      store.setMyId(m.yourId);
      m.players.forEach((p) => store.upsertRemotePlayer(p));
      store.setWave(m.wave);
      m.history.forEach((c) => store.addChat(c));
      break;
    }
    case "snapshot":
      store.upsertRemotePlayer((msg as { data: Parameters<typeof store.upsertRemotePlayer>[0] }).data);
      break;
    case "player_left":
      store.removeRemotePlayer(msg.id as string);
      break;
    case "chat":
      store.addChat((msg as { msg: Parameters<typeof store.addChat>[0] }).msg);
      break;
    case "wave_update":
      store.setWave((msg as { wave: Parameters<typeof store.setWave>[0] }).wave);
      break;
  }
}

// ── Send helpers ───────────────────────────────────────────────────────────────
export function sendSnapshot(data: PlayerSnapshotPayload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "snapshot", data }));
  }
}

export function sendChat(username: string, text: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "chat", id: _myId, username, text }));
  }
}

export function sendWaveSync(wave: number, map: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "wave_sync", wave, map }));
  }
}
