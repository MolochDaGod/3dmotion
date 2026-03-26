// ─── Terrain height utilities ─────────────────────────────────────────────────
// Single source of truth for heightfield geometry.
// Imported by Graveyard.tsx (legacy), PirateIsland.tsx, Zombie.tsx,
// Game.tsx (spawn positions), Player.tsx (spawn height).

export const TERRAIN_SIZE = 120;
export const TERRAIN_SEGS = 63; // 63 quad rows/cols → 64×64 vertex grid

// ─── Legacy graveyard heightmap ───────────────────────────────────────────────
/**
 * Height of the graveyard terrain surface at any (X, Z) point.
 * Flat combat zone in the centre; hills ramp up toward the edges.
 */
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

// ─── Pirate Island heightmap ───────────────────────────────────────────────────
/** Playable beach edge radius in metres */
export const ISLAND_RADIUS_M = 26;
/** Centre-of-island peak height in metres */
export const ISLAND_PEAK_H = 2.1;

/**
 * Height of the pirate island surface at any (X, Z) point.
 * - Centre: ~2.1 m above ocean level (0)
 * - Gentle noise on the interior for natural variation
 * - Smooth hermite fade to 0 at the shoreline (ISLAND_RADIUS_M)
 * - Returns -2 m beyond the shoreline (submerged ocean floor)
 *
 * Scale note: character Racalvin is 60 inches = 152.4 cm.
 * Meshy exports in centimetres → scale 0.01 → 1.524 Three.js units (metres). ✓
 */
export function getIslandHeight(worldX: number, worldZ: number): number {
  const r = Math.sqrt(worldX * worldX + worldZ * worldZ);
  if (r >= ISLAND_RADIUS_M) return -2.0; // ocean floor, always submerged

  // Hermite smoothstep: 0 at shoreline, 1 at centre
  const t = Math.max(0, 1 - r / ISLAND_RADIUS_M);
  const profile = t * t * (3 - 2 * t);

  // Gentle interior variation (blends out near the beach)
  const blend = Math.min(1, t * 2.5);
  const noise =
    Math.sin(worldX * 0.31 + 1.10) * 0.20 +
    Math.sin(worldZ * 0.27 + 0.82) * 0.20 +
    Math.sin((worldX - worldZ) * 0.19 + 2.04) * 0.12;

  return ISLAND_PEAK_H * profile + noise * profile * blend;
}

export function buildIslandHeightArray(): Float32Array {
  const V = TERRAIN_SEGS + 1; // 64
  const arr = new Float32Array(V * V);
  for (let row = 0; row < V; row++) {
    for (let col = 0; col < V; col++) {
      const wx = (col / TERRAIN_SEGS - 0.5) * TERRAIN_SIZE;
      const wz = (row / TERRAIN_SEGS - 0.5) * TERRAIN_SIZE;
      arr[row * V + col] = getIslandHeight(wx, wz);
    }
  }
  return arr;
}
