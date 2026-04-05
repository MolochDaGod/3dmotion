// ─── NavGrid — Grid-based A* pathfinding for zombie AI ───────────────────────
// Builds a 2D walkability grid over the terrain at startup, then answers
// getPath(fromX, fromZ, toX, toZ) requests using A* with 8-directional movement
// and simple visibility smoothing.

// ── Grid parameters ───────────────────────────────────────────────────────────
// CELL is now configurable via initNavGrid so large maps (e.g. 2000 m island)
// can use a coarser grid (e.g. 10 m/cell) without inflating A* search space.
let CELL   = 2.0; // world units per cell — set by initNavGrid

// Module-level state — set by initNavGrid, used by all pathfinding calls.
let _N:      number = 60;   // cells per axis (default: 120 m / 2 = 60)
let _ORIGIN: number = -60;  // world X/Z of cell (0,0) left edge
let _grid:   Uint8Array | null = null;

function idx(col: number, row: number): number { return row * _N + col; }
function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < _N && row >= 0 && row < _N;
}

function worldToCell(wx: number, wz: number): [number, number] {
  return [
    Math.floor((wx - _ORIGIN) / CELL),
    Math.floor((wz - _ORIGIN) / CELL),
  ];
}

function cellCenter(col: number, row: number): [number, number] {
  return [_ORIGIN + (col + 0.5) * CELL, _ORIGIN + (row + 0.5) * CELL];
}

// Mark all cells within `radius` world-units of (wx,wz) as blocked
function markObstacle(grid: Uint8Array, wx: number, wz: number, radius: number) {
  const cellR = Math.ceil(radius / CELL) + 1;
  const [cc, cr] = worldToCell(wx, wz);
  for (let dr = -cellR; dr <= cellR; dr++) {
    for (let dc = -cellR; dc <= cellR; dc++) {
      const col = cc + dc;
      const row = cr + dr;
      if (!inBounds(col, row)) continue;
      const [cx, cz] = cellCenter(col, row);
      const dx = cx - wx;
      const dz = cz - wz;
      if (Math.sqrt(dx * dx + dz * dz) <= radius) {
        grid[idx(col, row)] = 1;
      }
    }
  }
}

// ── Public init — call once at scene startup ──────────────────────────────────
export interface NavObstacle {
  x: number;
  z: number;
  radius: number;
}

/**
 * Initialise (or re-initialise) the nav grid.
 * @param obstacles    List of circular obstacles (palm trees, props, etc.)
 * @param terrainSize  World size of the terrain in metres (default 120 for graveyard).
 * @param cellSize     World units per grid cell (default 2). Use larger values
 *                     (e.g. 10) for very large maps to keep A* fast.
 */
export function initNavGrid(
  obstacles:   NavObstacle[],
  terrainSize: number = 120,
  cellSize:    number = 2,
): void {
  CELL    = cellSize;
  _N      = Math.ceil(terrainSize / CELL);
  _ORIGIN = -terrainSize / 2;

  const grid = new Uint8Array(_N * _N); // all walkable by default

  // Mark boundary ring as blocked (matches CuboidCollider walls)
  const BORDER = 2; // cells
  for (let r = 0; r < _N; r++) {
    for (let c = 0; c < _N; c++) {
      if (r < BORDER || r >= _N - BORDER || c < BORDER || c >= _N - BORDER) {
        grid[idx(c, r)] = 1;
      }
    }
  }

  // Mark obstacle footprints
  for (const o of obstacles) {
    markObstacle(grid, o.x, o.z, o.radius);
  }

  _grid = grid;
}

export function isNavReady(): boolean { return _grid !== null; }

// ── A* (8-directional) ────────────────────────────────────────────────────────
// Returns world-space [x,z] waypoints from start to goal, smoothed.
// Returns [] if no path exists (caller falls back to straight-line).

const SQRT2 = Math.SQRT2;

// Tiny binary min-heap for A* open set
class MinHeap {
  private _data: { f: number; i: number }[] = [];
  push(item: { f: number; i: number }) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }
  pop(): { f: number; i: number } | undefined {
    const top = this._data[0];
    const last = this._data.pop()!;
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  get size() { return this._data.length; }
  private _bubbleUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._data[p].f <= this._data[i].f) break;
      [this._data[p], this._data[i]] = [this._data[i], this._data[p]];
      i = p;
    }
  }
  private _sinkDown(i: number) {
    const n = this._data.length;
    while (true) {
      let min = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[min].f) min = l;
      if (r < n && this._data[r].f < this._data[min].f) min = r;
      if (min === i) break;
      [this._data[min], this._data[i]] = [this._data[i], this._data[min]];
      i = min;
    }
  }
}

function octile(dc: number, dr: number): number {
  const a = Math.abs(dc), b = Math.abs(dr);
  return a < b ? SQRT2 * a + b - a : SQRT2 * b + a - b;
}

const DIRS: [number, number, number][] = [
  [ 1,  0, 1      ], [-1,  0, 1      ], [ 0,  1, 1      ], [ 0, -1, 1      ],
  [ 1,  1, SQRT2  ], [ 1, -1, SQRT2  ], [-1,  1, SQRT2  ], [-1, -1, SQRT2  ],
];

export function getPath(
  fromX: number, fromZ: number,
  toX: number,   toZ: number,
): [number, number][] {
  if (!_grid) return [];

  const [fc, fr] = worldToCell(fromX, fromZ);
  const [tc, tr] = worldToCell(toX,   toZ);
  if (!inBounds(fc, fr) || !inBounds(tc, tr)) return [];

  // If goal cell is blocked, try to find nearest walkable cell
  let goalC = tc, goalR = tr;
  if (_grid[idx(goalC, goalR)] === 1) {
    let found = false;
    outer: for (let d = 1; d <= 4; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
          const c2 = tc + dc, r2 = tr + dr;
          if (inBounds(c2, r2) && _grid[idx(c2, r2)] === 0) {
            goalC = c2; goalR = r2; found = true; break outer;
          }
        }
      }
    }
    if (!found) return [];
  }

  // Source cell walkability check
  let srcC = fc, srcR = fr;
  if (_grid[idx(srcC, srcR)] === 1) {
    outer2: for (let d = 1; d <= 3; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
          const c2 = fc + dc, r2 = fr + dr;
          if (inBounds(c2, r2) && _grid[idx(c2, r2)] === 0) {
            srcC = c2; srcR = r2; break outer2;
          }
        }
      }
    }
  }

  if (srcC === goalC && srcR === goalR) return [];

  const gScore   = new Float32Array(_N * _N).fill(Infinity);
  const cameFrom = new Int32Array(_N * _N).fill(-1);
  const open     = new MinHeap();

  const startI = idx(srcC, srcR);
  gScore[startI] = 0;
  open.push({ f: octile(goalC - srcC, goalR - srcR), i: startI });

  const goalI   = idx(goalC, goalR);
  const MAX_ITER = 8000; // bumped to handle larger 200 m grid
  let iter = 0;

  while (open.size > 0 && iter++ < MAX_ITER) {
    const { i: ci } = open.pop()!;
    if (ci === goalI) break;

    const cr = Math.floor(ci / _N);
    const cc = ci % _N;
    const cg = gScore[ci];

    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (!inBounds(nc, nr) || _grid[idx(nc, nr)] === 1) continue;

      // Prevent diagonal cutting through corners
      if (dc !== 0 && dr !== 0) {
        if (_grid[idx(cc + dc, cr)] === 1 || _grid[idx(cc, cr + dr)] === 1) continue;
      }

      const ni = idx(nc, nr);
      const ng = cg + cost;
      if (ng < gScore[ni]) {
        gScore[ni]    = ng;
        cameFrom[ni]  = ci;
        open.push({ f: ng + octile(goalC - nc, goalR - nr), i: ni });
      }
    }
  }

  // No path found
  if (cameFrom[goalI] === -1 && goalI !== startI) return [];

  // Reconstruct path
  const raw: [number, number][] = [];
  let cur = goalI;
  while (cur !== -1) {
    const r = Math.floor(cur / _N);
    const c = cur % _N;
    raw.unshift(cellCenter(c, r));
    cur = cameFrom[cur];
  }

  // ── Visibility smoothing (string-pull) ───────────────────────────────────
  if (raw.length <= 2) return raw;

  function hasLoS(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az;
    const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const [c, r] = worldToCell(ax + dx * t, az + dz * t);
      if (!inBounds(c, r) || _grid![idx(c, r)] === 1) return false;
    }
    return true;
  }

  const smooth: [number, number][] = [raw[0]];
  let si = 0;
  while (si < raw.length - 1) {
    let farthest = si + 1;
    for (let j = si + 2; j < raw.length; j++) {
      if (hasLoS(raw[si][0], raw[si][1], raw[j][0], raw[j][1])) {
        farthest = j;
      }
    }
    smooth.push(raw[farthest]);
    si = farthest;
  }

  return smooth;
}
