/**
 * SkillSystem.ts — compatibility shim.
 * Canonical definitions have moved to data/skills.ts.
 * This file re-exports everything so existing consumers compile unchanged.
 *
 * KEY FIX: data/skills.ts imports WeaponMode from data/weapons (NOT from
 * useGameStore), eliminating the circular coupling between skill data and
 * the Zustand store.
 */
export * from "./data/skills";
