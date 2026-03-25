#!/usr/bin/env node
/**
 * convert-textures.mjs
 * Converts PNG textures under public/models/ to WebP using the `sharp` library.
 *
 * Run via: pnpm --filter @workspace/zombie-shooter run convert-textures
 *
 * Output: A .webp sibling file is written alongside each .png.
 * The original .png files are kept as fallbacks for browsers that don't support WebP.
 * In game code, use the texPath() helper from manifest.ts to automatically prefer .webp.
 */
import { readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import sharp from "sharp";

const ROOT = new URL("../public/models", import.meta.url).pathname;

async function convertFile(pngPath) {
  const outPath = pngPath.replace(/\.png$/i, ".webp");
  await sharp(pngPath)
    .webp({ quality: 85 })
    .toFile(outPath);

  const pngSize  = statSync(pngPath).size;
  const webpSize = statSync(outPath).size;
  const pct      = Math.round((1 - webpSize / pngSize) * 100);
  const sign     = pct >= 0 ? "-" : "+";
  console.log(`  ${basename(pngPath)} → ${basename(outPath)}  (${sign}${Math.abs(pct)}%)`);
}

async function walk(dir) {
  const entries = readdirSync(dir);
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      await walk(full);
    } else if (extname(name).toLowerCase() === ".png") {
      await convertFile(full);
    }
  }
}

console.log(`Converting PNG textures in ${ROOT} ...\n`);
await walk(ROOT);
console.log("\nWebP conversion complete.");
console.log("Both .png and .webp files are kept; texPath() in the game selects");
console.log("the right format at runtime based on browser WebP support.");
