#!/usr/bin/env node
/**
 * convert-textures.mjs
 * Converts PNG textures under public/models/ to WebP for ~50-75% size reduction.
 * Run via: pnpm --filter @workspace/zombie-shooter run convert-textures
 * Requires ImageMagick (magick CLI) — available in the Replit environment.
 */
import { execSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

const ROOT = new URL("../public/models", import.meta.url).pathname;

function walk(dir) {
  const entries = readdirSync(dir);
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (extname(name).toLowerCase() === ".png") {
      const out = full.replace(/\.png$/i, ".webp");
      try {
        execSync(`magick "${full}" -quality 85 "${out}"`, { stdio: "pipe" });
        const pngSize = statSync(full).size;
        const webpSize = statSync(out).size;
        const pct = Math.round((1 - webpSize / pngSize) * 100);
        console.log(`✓ ${basename(full)} → ${basename(out)} (${pct}% smaller)`);
      } catch {
        console.warn(`✗ Failed: ${full}`);
      }
    }
  }
}

walk(ROOT);
console.log("\nWebP conversion complete.");
