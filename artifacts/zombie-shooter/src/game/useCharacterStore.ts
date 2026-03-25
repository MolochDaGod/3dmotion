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
  /** Cycle to the next character in the registry. */
  cycleNext: () => void;
  /** Switch directly to a character by id. */
  setActive: (id: string) => void;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  activeId: CHARACTER_REGISTRY[0].id,
  def: CHARACTER_REGISTRY[0],

  cycleNext: () => {
    const id = nextCharId(get().activeId);
    set({ activeId: id, def: getCharDef(id) });
  },

  setActive: (id: string) => {
    set({ activeId: id, def: getCharDef(id) });
  },
}));
