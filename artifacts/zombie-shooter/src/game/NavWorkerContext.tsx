/**
 * NavWorkerContext — shares a single NavGrid Web Worker across all Zombie instances.
 *
 * Usage in Game.tsx:
 *   <NavWorkerProvider obstacles={NAV_OBSTACLES}>
 *     ... zombies ...
 *   </NavWorkerProvider>
 *
 * Usage in Zombie.tsx:
 *   const { asyncGetPath } = useNavWorker();
 *   // Then in useFrame, when path timer fires:
 *   asyncGetPath(fx, fz, tx, tz).then((path) => { waypointsRef.current = path.slice(1); });
 */

import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import type { NavObstacle } from "./NavGrid";

// ── Types ────────────────────────────────────────────────────────────────────
type PathCallback = (path: [number, number][]) => void;

interface NavWorkerCtx {
  /** Request an A* path. Resolves when the worker responds. */
  asyncGetPath: (fx: number, fz: number, tx: number, tz: number) => Promise<[number, number][]>;
  /** True once the worker has finished initialising the grid. */
  ready: React.MutableRefObject<boolean>;
}

// ── Context ───────────────────────────────────────────────────────────────────
const NavWorkerContext = createContext<NavWorkerCtx>({
  asyncGetPath: () => Promise.resolve([]),
  ready: { current: false },
});

// ── Provider ──────────────────────────────────────────────────────────────────
interface Props {
  obstacles: NavObstacle[];
  children: ReactNode;
}

export function NavWorkerProvider({ obstacles, children }: Props) {
  const workerRef  = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, PathCallback>());
  const idRef      = useRef(0);
  const readyRef   = useRef(false);

  useEffect(() => {
    const worker = new Worker(
      new URL("./navWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, id, path } = e.data;
      if (type === "ready") {
        readyRef.current = true;
        return;
      }
      if (type === "path") {
        const cb = pendingRef.current.get(id);
        if (cb) { cb(path); pendingRef.current.delete(id); }
      }
    };

    worker.onerror = (err) => {
      console.error("[NavWorker] error:", err.message);
    };

    worker.postMessage({ type: "init", obstacles });

    return () => {
      worker.terminate();
      workerRef.current = null;
      readyRef.current  = false;
    };
  // obstacles is a stable module-level constant — no need to re-init
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const asyncGetPath = (
    fx: number, fz: number, tx: number, tz: number,
  ): Promise<[number, number][]> => {
    if (!readyRef.current || !workerRef.current) return Promise.resolve([]);
    const id = idRef.current++;
    return new Promise<[number, number][]>((resolve) => {
      pendingRef.current.set(id, resolve);
      workerRef.current!.postMessage({ type: "path", id, fx, fz, tx, tz });
    });
  };

  return (
    <NavWorkerContext.Provider value={{ asyncGetPath, ready: readyRef }}>
      {children}
    </NavWorkerContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useNavWorker(): NavWorkerCtx {
  return useContext(NavWorkerContext);
}
