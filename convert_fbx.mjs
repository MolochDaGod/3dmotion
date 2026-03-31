/**
 * FBX → GLB converter using Three.js in Node.js
 * Geometry only — textures are stripped (re-apply in engine from original FBX).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Override fetch to serve local files
const _orig = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (url.startsWith("file://")) {
    const path = url.replace(/^file:\/\//, "");
    const buf  = readFileSync(path);
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
      text:        () => Promise.resolve(buf.toString("utf8")),
    };
  }
  return _orig?.(input, init);
};

// Minimal document mock
try {
  Object.defineProperty(globalThis, "document", {
    value: { createElement: (t) => t === "canvas" ? { getContext: () => null, style: {} } : { style: {} } },
    configurable: true, writable: true,
  });
} catch (_) {}

// FileReader mock (needed by GLTFExporter — uses onloadend, not onload)
try {
  Object.defineProperty(globalThis, "FileReader", {
    value: class FileReader {
      constructor() { this.result = null; this.onload = null; this.onloadend = null; }
      _done(result) {
        this.result = result;
        this.onloadend?.({ target: this });
        this.onload?.({ target: this });
      }
      readAsArrayBuffer(blob) {
        if (blob && typeof blob.arrayBuffer === "function") {
          blob.arrayBuffer().then((ab) => this._done(ab));
        } else if (blob instanceof ArrayBuffer) {
          setImmediate(() => this._done(blob));
        } else {
          const buf = Buffer.from(blob);
          setImmediate(() => this._done(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
        }
      }
      readAsDataURL(blob) {
        if (blob && typeof blob.arrayBuffer === "function") {
          blob.arrayBuffer().then((ab) => {
            const b64 = Buffer.from(ab).toString("base64");
            this._done(`data:application/octet-stream;base64,${b64}`);
          });
        }
      }
    },
    configurable: true, writable: true,
  });
} catch (_) {}

// ── Import three.js modules ───────────────────────────────────────────────────
const BASE = resolve("./node_modules/.pnpm/three@0.183.2/node_modules/three");

const { FBXLoader }    = await import(`${BASE}/examples/jsm/loaders/FBXLoader.js`);
const { GLTFExporter } = await import(`${BASE}/examples/jsm/exporters/GLTFExporter.js`);
const THREE_MOD        = await import(`${BASE}/build/three.module.js`);

// ── Patch ImageLoader to return a dummy 1×1 image ────────────────────────────
// This skips actual texture loading while allowing FBX parsing to complete.
THREE_MOD.ImageLoader.prototype.load = function(_url, onLoad, _onProgress, _onError) {
  // Return a trivial data object that satisfies Three.js's needs
  setImmediate(() => {
    onLoad?.({
      width: 1, height: 1, data: new Uint8ClampedArray(4).fill(128),
      addEventListener: () => {}, removeEventListener: () => {},
    });
  });
  return {};
};

const inputPath  = resolve(process.argv[2]);
const outputPath = resolve(process.argv[3]);
console.log(`[convert] Loading FBX: ${inputPath}`);

const loader = new FBXLoader();
loader.load(
  `file://${inputPath}`,
  (scene) => {
    console.log(`\n[convert] Parsed — exporting as binary GLB…`);

    // Strip textures (can't serialise raw pixel data without a renderer)
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!m) return;
        ["map","normalMap","roughnessMap","metalnessMap","emissiveMap","aoMap",
         "lightMap","bumpMap","displacementMap","alphaMap"].forEach((k) => { m[k] = null; });
      });
    });

    const exporter = new GLTFExporter();
    exporter.parse(scene,
      (glb) => {
        writeFileSync(outputPath, Buffer.from(glb));
        console.log(`[convert] ✓ Done → ${outputPath} (${(glb.byteLength/1024/1024).toFixed(2)} MB)`);
      },
      (err) => { console.error("[convert] Export error:", err); process.exit(1); },
      { binary: true, maxTextureSize: 1 },
    );
  },
  (p) => { if (p.total) process.stdout.write(`\r[convert] ${Math.round(p.loaded/p.total*100)}%  `); },
  (err) => { console.error("[convert] FBX error:", err); process.exit(1); },
);
