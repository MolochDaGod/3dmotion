import { create } from "zustand";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface RemotePlayer {
  id: string;
  username: string;
  x: number; y: number; z: number;
  yaw: number;
  map: string;
  anim: string;
  hp: number;
  characterId?: string;
  lastSeen: number;
}

export interface ChatEntry {
  id: string;
  username: string;
  text: string;
  ts: number;
}

export interface WaveState {
  wave: number;
  map: string;
  playerCount: number;
}

// ── Store ──────────────────────────────────────────────────────────────────────
interface MMOState {
  // Connection
  connected: boolean;
  myId: string;
  username: string;

  // World
  remotePlayers: Map<string, RemotePlayer>;
  chat: ChatEntry[];
  wave: WaveState;

  // Actions
  setConnected: (v: boolean) => void;
  setMyId: (id: string) => void;
  setUsername: (u: string) => void;
  upsertRemotePlayer: (snap: Omit<RemotePlayer, "lastSeen">) => void;
  removeRemotePlayer: (id: string) => void;
  addChat: (entry: ChatEntry) => void;
  setWave: (w: WaveState) => void;
}

export const useMMOStore = create<MMOState>((set) => ({
  connected: false,
  myId: "",
  username: localStorage.getItem("mmo_username") ?? "",

  remotePlayers: new Map(),
  chat: [],
  wave: { wave: 1, map: "island", playerCount: 1 },

  setConnected: (v) => set({ connected: v }),
  setMyId: (id) => set({ myId: id }),
  setUsername: (u) => {
    localStorage.setItem("mmo_username", u);
    set({ username: u });
  },

  upsertRemotePlayer: (snap) =>
    set((s) => {
      const m = new Map(s.remotePlayers);
      m.set(snap.id, { ...snap, lastSeen: Date.now() });
      return { remotePlayers: m };
    }),

  removeRemotePlayer: (id) =>
    set((s) => {
      const m = new Map(s.remotePlayers);
      m.delete(id);
      return { remotePlayers: m };
    }),

  addChat: (entry) =>
    set((s) => ({
      chat: [...s.chat.slice(-49), entry],
    })),

  setWave: (w) => set({ wave: w }),
}));
