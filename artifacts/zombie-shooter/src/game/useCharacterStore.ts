import { create } from "zustand";
import {
  CHARACTER_REGISTRY,
  CharacterDef,
  getCharDef,
  nextCharId,
} from "./CharacterRegistry";

interface CharacterState {
  activeId: string;
  def: CharacterDef;
  /** AI characters fetched from the server (source="meshy") */
  aiChars: CharacterDef[];
  /** Combined list: static registry + AI chars */
  allChars: CharacterDef[];
  /** Cycle to the next character across all (static + AI). */
  cycleNext: () => void;
  /** Switch directly to a character by id. */
  setActive: (id: string) => void;
  /** Look up a character def from all available chars. */
  getAnyCharDef: (id: string) => CharacterDef;
  /** Fetch AI characters from the API and merge into aiChars (non-blocking). */
  fetchAiChars: () => void;
}

function buildAllChars(aiChars: CharacterDef[]): CharacterDef[] {
  return [...CHARACTER_REGISTRY, ...aiChars];
}

function getCharDefFromAll(id: string, allChars: CharacterDef[]): CharacterDef {
  return allChars.find((c) => c.id === id) ?? allChars[0];
}

function nextCharIdFromAll(currentId: string, allChars: CharacterDef[]): string {
  const ids = allChars.map((c) => c.id);
  const idx = ids.indexOf(currentId);
  return allChars[(idx + 1) % allChars.length].id;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  activeId: CHARACTER_REGISTRY[0].id,
  def: CHARACTER_REGISTRY[0],
  aiChars: [],
  allChars: CHARACTER_REGISTRY,

  cycleNext: () => {
    const { activeId, allChars } = get();
    const id = nextCharIdFromAll(activeId, allChars);
    set({ activeId: id, def: getCharDefFromAll(id, allChars) });
  },

  setActive: (id: string) => {
    const { allChars } = get();
    set({ activeId: id, def: getCharDefFromAll(id, allChars) });
  },

  getAnyCharDef: (id: string) => {
    const { allChars } = get();
    return getCharDefFromAll(id, allChars);
  },

  fetchAiChars: () => {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${baseUrl}/api/characters`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { characters: Array<{ id: string; name: string; meshUrl: string; scale: number; capsuleHH: number; capsuleR: number; color: string }> }) => {
        const aiChars: CharacterDef[] = data.characters.map((c) => ({
          id: c.id,
          name: c.name,
          mesh: c.meshUrl,
          scale: c.scale,
          capsuleHH: c.capsuleHH,
          capsuleR: c.capsuleR,
          color: c.color,
          source: "meshy" as const,
        }));
        const allChars = buildAllChars(aiChars);
        set({ aiChars, allChars });
      })
      .catch((err) => {
        console.warn("[CharacterStore] Could not fetch AI characters:", err);
      });
  },
}));

export { getCharDef, nextCharId };
