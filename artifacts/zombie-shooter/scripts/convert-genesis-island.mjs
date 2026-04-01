/**
 * convert-genesis-island.mjs
 *
 * Converts attached_assets/Terrain_1774999201051.fbx → public/models/genesis_island.glb
 *
 * Run from repo root:
 *   node artifacts/zombie-shooter/scripts/convert-genesis-island.mjs
 *
 * Also prints bounding box + suggested scale so terrain.ts / PirateIsland.tsx
 * can be updated with real numbers.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Browser shims (three.js FBXLoader / GLTFExporter need these) ─────────────
// Must be set BEFORE importing three.
globalThis.self        = globalThis;
globalThis.window      = globalThis;
try { globalThis.navigator = { userAgent: "node" }; } catch (_) {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, writable: true, configurable: true });
}
try { globalThis.performance = { now: () => Date.now() }; } catch (_) {}
// Minimal Image-like object (used both as globalThis.Image and for createElement('img'))
function makeImageEl() {
  return {
    src: "", width: 1, height: 1,
    style: {},
    addEventListener:    (type, fn) => { if (type === "load") setTimeout(() => { try { fn({ target: this }); } catch(_) {} }, 4); },
    removeEventListener: () => {},
  };
}
globalThis.document    = {
  createElement:      (tag) => {
    if (tag === "canvas") return { getContext: () => null, width: 0, height: 0 };
    if (tag === "img")    return makeImageEl();
    return { style: {}, addEventListener: () => {}, removeEventListener: () => {} };
  },
  createElementNS:    (_, tag) => ({ setAttribute: () => {} }),
  body:               { appendChild: () => {} },
};
globalThis.HTMLElement         = class {};
globalThis.HTMLCanvasElement   = class {};
globalThis.ImageBitmap         = class {};
globalThis.createImageBitmap   = async () => ({});
globalThis.Blob = class Blob {
  constructor(parts, opts) {
    // Concatenate ArrayBuffer parts into one Buffer
    const buffers = parts.map((p) => {
      if (p instanceof ArrayBuffer)          return Buffer.from(p);
      if (p instanceof Uint8Array)           return Buffer.from(p.buffer, p.byteOffset, p.byteLength);
      if (typeof p === "string")             return Buffer.from(p, opts?.encoding ?? "utf8");
      if (p && p.buffer instanceof ArrayBuffer) return Buffer.from(p.buffer, p.byteOffset, p.byteLength);
      return Buffer.from(String(p));
    });
    this._buf = Buffer.concat(buffers);
    this.size = this._buf.length;
    this.type = opts?.type ?? "";
  }
  arrayBuffer() { return Promise.resolve(this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength)); }
};
globalThis.URL = { createObjectURL: () => "blob:node" };
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    this.onloadend = this.onloadend || null;
    Promise.resolve().then(async () => {
      try {
        const ab    = await blob.arrayBuffer();
        this.result = ab;
        this.readyState = 2;
        if (this.onloadend) this.onloadend({ target: this });
      } catch (e) {
        if (this.onerror) this.onerror(e);
      }
    });
  }
  readAsDataURL(blob) {
    Promise.resolve().then(async () => {
      const ab  = await blob.arrayBuffer();
      const b64 = Buffer.from(ab).toString("base64");
      this.result = `data:${blob.type || "application/octet-stream"};base64,${b64}`;
      this.readyState = 2;
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
};

// Image mock — FBXLoader tries to set src and listen for load/error events
globalThis.Image = class Image {
  constructor() {
    this._listeners = {};
    this.src        = "";
    this.width      = 1;
    this.height     = 1;
  }
  addEventListener(type, fn) {
    this._listeners[type] = fn;
    if (type === "load") setTimeout(() => { try { fn(); } catch(_) {} }, 0);
  }
  removeEventListener() {}
};

globalThis.XMLHttpRequest = class {
  open()          {}
  send()          {}
  setRequestHeader() {}
};

// ─── Imports (after shims) ─────────────────────────────────────────────────────
const THREE = await import("three");
const { FBXLoader }    = await import("three/examples/jsm/loaders/FBXLoader.js");
const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");

// Patch three.js ImageLoader so it returns a stub 1×1 texture immediately
// (avoids DOM/browser texture-load machinery entirely)
THREE.ImageLoader.prototype.load = function(url, onLoad) {
  const stub = { src: url, width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) };
  if (onLoad) setTimeout(() => onLoad(stub), 0);
  return stub;
};

const __dir   = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, "../../..");

const FBX_IN   = resolve(repoRoot, "attached_assets/Terrain_1774999201051.fbx");
const GLB_DIR  = resolve(repoRoot, "artifacts/zombie-shooter/public/models");
const GLB_OUT  = resolve(GLB_DIR,  "genesis_island.glb");

console.log("Reading FBX …", FBX_IN);
const fbxBuf   = readFileSync(FBX_IN);
const fbxArray = fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength);

console.log("Parsing FBX …");
const loader = new FBXLoader();
let scene;
try {
  scene = loader.parse(fbxArray, "");
} catch (e) {
  console.error("FBXLoader.parse failed:", e.message);
  process.exit(1);
}

// ─── Measure bounding box ─────────────────────────────────────────────────────
const box    = new THREE.Box3().setFromObject(scene);
const size   = new THREE.Vector3();
const center = new THREE.Vector3();
box.getSize(size);
box.getCenter(center);

console.log("\n═══ FBX Bounding Box (raw units) ═══");
console.log(`  min: (${box.min.x.toFixed(1)}, ${box.min.y.toFixed(1)}, ${box.min.z.toFixed(1)})`);
console.log(`  max: (${box.max.x.toFixed(1)}, ${box.max.y.toFixed(1)}, ${box.max.z.toFixed(1)})`);
console.log(`  size: (${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)})`);
console.log(`  center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})`);

// ─── Suggest scale to fit 200 m world width ───────────────────────────────────
const TARGET_WIDTH_M = 200;
const suggestedScale = TARGET_WIDTH_M / Math.max(size.x, size.z);
const scaledSizeX    = size.x * suggestedScale;
const scaledSizeZ    = size.z * suggestedScale;
const scaledSizeY    = size.y * suggestedScale;
console.log(`\n  → Suggested GLB_SCALE (for ${TARGET_WIDTH_M} m world): ${suggestedScale.toExponential(4)}`);
console.log(`  → Scaled size: (${scaledSizeX.toFixed(1)} m, ${scaledSizeY.toFixed(1)} m, ${scaledSizeZ.toFixed(1)} m)`);
console.log(`  → Center offset X: ${(-center.x * suggestedScale).toFixed(3)}`);
console.log(`  → Center offset Z: ${(-center.z * suggestedScale).toFixed(3)}`);
console.log(`  → Center offset Y: ${(-box.min.y * suggestedScale).toFixed(3)}  (lifts min to y=0)`);

// ─── Sample heightmap grid (60×60 cells, world coords) ───────────────────────
// We walk every mesh face, project to XZ, and record max Y per cell.
console.log("\n  Sampling heightmap …");

const GRID_N = 63;  // 63 quads = 64 vertices per axis (matches terrain.ts)
const HW     = TARGET_WIDTH_M / 2;  // half-width in scaled world space
const cellW  = TARGET_WIDTH_M / GRID_N;

const heightGrid = new Float32Array((GRID_N + 1) * (GRID_N + 1)).fill(-999);

const s  = suggestedScale;
const cx = center.x * s;
const cz = center.z * s;
const cy = box.min.y * s;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();

scene.traverse((obj) => {
  if (!obj.isMesh) return;
  const geo = obj.geometry;
  if (!geo) return;
  const posAttr = geo.attributes.position;
  if (!posAttr) return;

  const idx = geo.index;
  const count = idx ? idx.count : posAttr.count;

  obj.updateWorldMatrix(true, false);
  const mat = obj.matrixWorld;

  for (let i = 0; i < count; i += 3) {
    const iA = idx ? idx.getX(i)     : i;
    const iB = idx ? idx.getX(i + 1) : i + 1;
    const iC = idx ? idx.getX(i + 2) : i + 2;

    _vA.fromBufferAttribute(posAttr, iA).applyMatrix4(mat).multiplyScalar(s);
    _vB.fromBufferAttribute(posAttr, iB).applyMatrix4(mat).multiplyScalar(s);
    _vC.fromBufferAttribute(posAttr, iC).applyMatrix4(mat).multiplyScalar(s);

    for (const v of [_vA, _vB, _vC]) {
      const wx = v.x - cx;
      const wy = v.y - cy;
      const wz = v.z - cz;
      if (Math.abs(wx) > HW || Math.abs(wz) > HW) continue;
      const col = Math.round((wx + HW) / TARGET_WIDTH_M * GRID_N);
      const row = Math.round((wz + HW) / TARGET_WIDTH_M * GRID_N);
      if (col < 0 || col > GRID_N || row < 0 || row > GRID_N) continue;
      const gi = row * (GRID_N + 1) + col;
      if (wy > heightGrid[gi]) heightGrid[gi] = wy;
    }
  }
});

// Fill missing cells (interpolate from neighbours)
let filled = 0;
for (let r = 0; r <= GRID_N; r++) {
  for (let c = 0; c <= GRID_N; c++) {
    const gi = r * (GRID_N + 1) + c;
    if (heightGrid[gi] > -900) continue;
    let sum = 0, cnt = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > GRID_N || nc < 0 || nc > GRID_N) continue;
        const ni = nr * (GRID_N + 1) + nc;
        if (heightGrid[ni] > -900) { sum += heightGrid[ni]; cnt++; }
      }
    }
    heightGrid[gi] = cnt > 0 ? sum / cnt : 0;
    filled++;
  }
}
console.log(`  Heightmap sampled. Filled ${filled} empty cells by interpolation.`);

// Print stats
let minH = Infinity, maxH = -Infinity;
for (const h of heightGrid) { if (h < minH) minH = h; if (h > maxH) maxH = h; }
console.log(`  Height range: ${minH.toFixed(2)} m → ${maxH.toFixed(2)} m`);

// Ground-truth min height — use this to adjust GLB_OFFSET_Y so terrain sits at y=0
const groundMin   = minH;
const correctedY  = parseFloat((-box.min.y * suggestedScale - groundMin).toFixed(4));
console.log(`  Terrain ground min: ${groundMin.toFixed(2)} m → corrected GLB_OFFSET_Y = ${correctedY}`);

// Normalize heightmap so minimum = 0
for (let i = 0; i < heightGrid.length; i++) heightGrid[i] -= groundMin;
const normMaxH = maxH - groundMin;
console.log(`  Normalized height range: 0.00 → ${normMaxH.toFixed(2)} m`);

// Write heightmap JSON (for terrain.ts to import) — goes in src/game/
const hmPath = resolve(__dir, "../src/game/genesis_island_heightmap.json");
writeFileSync(hmPath, JSON.stringify({
  gridN:        GRID_N,
  terrainSize:  TARGET_WIDTH_M,
  minH:         0,
  maxH:         normMaxH,
  heights:      Array.from(heightGrid),
}));
console.log("  Heightmap saved →", hmPath);

// ─── Export GLB ───────────────────────────────────────────────────────────────
console.log("\nExporting GLB …");
const exporter = new GLTFExporter();

const exportScene = scene.clone(true);

// Strip all textures from materials so GLTFExporter doesn't hit the "no valid
// image data" path (our stubs have no pixel data).  We keep the vertex colors
// and base colors only.
exportScene.traverse((obj) => {
  if (!obj.isMesh) return;
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  obj.material = mats.map((m) => {
    const base = new THREE.MeshStandardMaterial({
      color:     m?.color ?? new THREE.Color(0.6, 0.5, 0.35),
      roughness: 0.92,
      metalness: 0.0,
    });
    return base;
  });
  if (mats.length === 1) obj.material = obj.material[0];
});

await new Promise((resolve_p, reject) => {
  exporter.parse(
    exportScene,
    (result) => {
      mkdirSync(GLB_DIR, { recursive: true });
      const buf = Buffer.from(result);
      writeFileSync(GLB_OUT, buf);
      console.log(`GLB saved → ${GLB_OUT}  (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
      resolve_p();
    },
    (err) => reject(err),
    { binary: true, embedImages: false },
  );
});

console.log(`
═══ Copy these into PirateIsland.tsx ═══
const GLB_SCALE    = ${suggestedScale.toExponential(4)};
const GLB_OFFSET_X = ${(-center.x * suggestedScale).toFixed(4)};
const GLB_OFFSET_Y = ${correctedY};
const GLB_OFFSET_Z = ${(-center.z * suggestedScale).toFixed(4)};
export const TERRAIN_SIZE = ${TARGET_WIDTH_M};
(terrain height range after offset: 0 → ${normMaxH.toFixed(2)} m)
`);

console.log("Done!");
