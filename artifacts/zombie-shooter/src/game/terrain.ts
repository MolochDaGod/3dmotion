// ─── Terrain height utilities ─────────────────────────────────────────────────
// Single source of truth for the graveyard heightfield.
// Imported by Graveyard.tsx (physics + visual mesh),
// Zombie.tsx (Y pinning), Game.tsx (spawn positions),
// and Player.tsx (spawn height).
// Keeping these here — away from any React component file — lets Vite's Fast
// Refresh work correctly on all importing components.

export const TERRAIN_SIZE = 120;
export const TERRAIN_SEGS = 63; // 63 quad rows/cols → 64×64 vertex grid

/**
 * Height of the terrain surface (in world-space Y metres) at any (X, Z) point.
 * The centre combat zone (~12 m radius) is flat; hills ramp up toward the edges.
 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
  const nx = worldX / (TERRAIN_SIZE * 0.5);
  const nz = worldZ / (TERRAIN_SIZE * 0.5);
  const r2 = nx * nx + nz * nz;
  // Smooth ramp: flat at centre, full amplitude near the boundary
  const hillFade = Math.min(1, Math.max(0, (r2 - 0.08) / 0.27));
  return (
    Math.sin(nx * 4.1 + 1.7) * 0.70 +
    Math.sin(nz * 3.3 + 0.5) * 0.60 +
    Math.sin((nx + nz) * 2.4 + 2.1) * 0.45 +
    Math.sin(nx * 6.8 - nz * 4.2 + 0.8) * 0.20
  ) * hillFade;
}

/**
 * Build the Float32Array required by Rapier's HeightfieldCollider.
 * Layout: heights[row * (SEGS+1) + col] = Y at that grid vertex.
 * Row corresponds to Z, col to X.
 */
export function buildTerrainHeightArray(): Float32Array {
  const V = TERRAIN_SEGS + 1; // 64
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
