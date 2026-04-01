// ─── Terrain height utilities ─────────────────────────────────────────────────
// Single source of truth for heightfield geometry.
// Imported by Graveyard.tsx (legacy), PirateIsland.tsx, Zombie.tsx,
// Game.tsx (spawn positions), Player.tsx (spawn height).

// ── Graveyard constants (unchanged) ──────────────────────────────────────────
export const TERRAIN_SIZE = 120;   // graveyard world footprint in metres
export const TERRAIN_SEGS = 63;    // 63 quad rows/cols → 64×64 vertex grid

// ── Genesis Island constants ───────────────────────────────────────────────────
// Baked from Terrain_1774999201051.fbx (800 000 cm → 200 m game world).
export const GENESIS_TERRAIN_SIZE = 200;
export const GENESIS_TERRAIN_SEGS = 63;   // same grid density, bigger world

// ─── Legacy graveyard heightmap ───────────────────────────────────────────────
export function getTerrainHeight(worldX: number, worldZ: number): number {
  const nx = worldX / (TERRAIN_SIZE * 0.5);
  const nz = worldZ / (TERRAIN_SIZE * 0.5);
  const r2 = nx * nx + nz * nz;
  const hillFade = Math.min(1, Math.max(0, (r2 - 0.08) / 0.27));
  return (
    Math.sin(nx * 4.1 + 1.7) * 0.70 +
    Math.sin(nz * 3.3 + 0.5) * 0.60 +
    Math.sin((nx + nz) * 2.4 + 2.1) * 0.45 +
    Math.sin(nx * 6.8 - nz * 4.2 + 0.8) * 0.20
  ) * hillFade;
}

export function buildTerrainHeightArray(): Float32Array {
  const V = TERRAIN_SEGS + 1;
  const arr = new Float32Array(V * V);
  for (let row = 0; row < V; row++) {
    for (let col = 0; col < V; col++) {
      const wx = (col / TERRAIN_SEGS - 0.5) * TERRAIN_SIZE;
      const wz = (row / TERRAIN_SEGS - 0.5) * TERRAIN_SIZE;
      arr[row * V + col] = getTerrainHeight(wx, wz);
    }
  }
  return arr;
}

// ─── Genesis Island heightmap ─────────────────────────────────────────────────
//
// Heights are baked from the actual FBX mesh geometry via
// convert-genesis-island.mjs and stored as a raw Float32Array binary
// at /models/genesis_island_heights.bin (16 KB, 4096 floats, 64×64 grid).
//
// The binary is fetched once asynchronously and cached below.
// During the load window all queries fall back to 0 (ocean floor).
// PirateIsland.tsx calls preloadGenesisHeights() in its render so the
// Rapier heightfield collider is built with real data on first mount.

const _GN    = GENESIS_TERRAIN_SEGS;       // 63 quads → 64 vertices per axis
const _GSIZE = GENESIS_TERRAIN_SIZE;       // 200 m
const _GHALF = _GSIZE / 2;

let _gHeights: Float32Array | null = null; // null until the binary loads

/**
 * Fetch the binary heightmap exactly once.
 * Safe to call multiple times — only one fetch is made.
 */
let _fetchStarted = false;
export function preloadGenesisHeights(): void {
  if (_fetchStarted) return;
  _fetchStarted = true;
  fetch("/models/genesis_island_heights.bin")
    .then((r) => r.arrayBuffer())
    .then((ab) => { _gHeights = new Float32Array(ab); })
    .catch((e) => console.warn("[terrain] genesis heights failed to load:", e));
}

/**
 * Height (metres) of the Genesis Island surface at world (X, Z).
 * Uses bilinear interpolation over the baked 64×64 grid.
 * Returns 0 while the binary is still loading.
 */
export function getIslandHeight(worldX: number, worldZ: number): number {
  if (!_gHeights) return 0;
  if (Math.abs(worldX) > _GHALF || Math.abs(worldZ) > _GHALF) return 0;

  const ux = ((worldX + _GHALF) / _GSIZE) * _GN;
  const uz = ((worldZ + _GHALF) / _GSIZE) * _GN;

  const col0 = Math.max(0, Math.min(_GN - 1, Math.floor(ux)));
  const row0 = Math.max(0, Math.min(_GN - 1, Math.floor(uz)));
  const col1 = col0 + 1;
  const row1 = row0 + 1;
  const fx   = ux - col0;
  const fz   = uz - row0;

  const stride = _GN + 1; // 64
  const v00 = _gHeights[row0 * stride + col0];
  const v10 = _gHeights[row0 * stride + col1];
  const v01 = _gHeights[row1 * stride + col0];
  const v11 = _gHeights[row1 * stride + col1];

  return v00 * (1 - fx) * (1 - fz)
       + v10 * fx       * (1 - fz)
       + v01 * (1 - fx) * fz
       + v11 * fx       * fz;
}

export function isGenesisHeightsLoaded(): boolean { return _gHeights !== null; }

export function buildIslandHeightArray(): Float32Array {
  const V = GENESIS_TERRAIN_SEGS + 1; // 64
  const arr = new Float32Array(V * V);
  for (let row = 0; row < V; row++) {
    for (let col = 0; col < V; col++) {
      const wx = (col / GENESIS_TERRAIN_SEGS - 0.5) * GENESIS_TERRAIN_SIZE;
      const wz = (row / GENESIS_TERRAIN_SEGS - 0.5) * GENESIS_TERRAIN_SIZE;
      arr[row * V + col] = getIslandHeight(wx, wz);
    }
  }
  return arr;
}
