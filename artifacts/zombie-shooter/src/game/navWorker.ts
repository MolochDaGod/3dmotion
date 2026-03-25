/**
 * navWorker.ts — Web Worker for A* pathfinding.
 *
 * Runs the NavGrid A* solver on a dedicated OS thread so it never
 * blocks the main render loop, even with 30+ zombies recalculating
 * paths simultaneously.
 *
 * Message protocol (main → worker):
 *   { type: "init",  obstacles: NavObstacle[] }
 *   { type: "path",  id: number, fx, fz, tx, tz: number }
 *
 * Message protocol (worker → main):
 *   { type: "ready" }
 *   { type: "path",  id: number, path: [number, number][] }
 *
 * Vite bundles this file (and its NavGrid + terrain imports) as an
 * isolated module chunk when referenced via:
 *   new Worker(new URL("./navWorker.ts", import.meta.url), { type: "module" })
 */

import { initNavGrid, getPath } from "./NavGrid";
import type { NavObstacle } from "./NavGrid";

interface InitMsg  { type: "init"; obstacles: NavObstacle[] }
interface PathMsg  { type: "path"; id: number; fx: number; fz: number; tx: number; tz: number }
type WorkerMsg = InitMsg | PathMsg;

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const msg = e.data;

  if (msg.type === "init") {
    initNavGrid(msg.obstacles);
    (self as unknown as Worker).postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "path") {
    const path = getPath(msg.fx, msg.fz, msg.tx, msg.tz);
    (self as unknown as Worker).postMessage({ type: "path", id: msg.id, path });
  }
};
