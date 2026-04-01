/**
 * CollisionLayers.ts — compatibility shim.
 * Canonical collision constants have moved to data/collision.ts.
 * This file re-exports everything so existing consumers (Player.tsx,
 * PirateIsland.tsx, Graveyard.tsx) compile unchanged.
 */
export * from "./data/collision";
