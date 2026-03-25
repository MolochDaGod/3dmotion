import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Service Worker ─────────────────────────────────────────────────────────────
// Explicitly register the Workbox-generated service worker (produced by
// vite-plugin-pwa with registerType: 'autoUpdate').  This gives us a clear
// registration point and lets the SW update silently in the background.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: false });
    })
    .catch(() => {
      // Non-fatal: app still works without the service worker
    });
}

// ── Critical-asset preloads ────────────────────────────────────────────────────
// Kick off early fetches for the two heaviest startup assets so the browser
// pipeline can start downloading them before Three.js requests them.
//
//  1. Player character FBX — ~4MB, loaded on every game start.
//  2. Rapier physics WASM  — loaded via a dynamic import inside the physics engine;
//     its hashed filename is not known at HTML-write time so we rely on the
//     service worker's CacheFirst rule for subsequent visits instead.
(function preloadCriticalAssets() {
  const base = import.meta.env.BASE_URL ?? "/";
  const strip = (p: string) => (p.endsWith("/") ? p.slice(0, -1) : p);

  const criticalFetch = [
    `${strip(base)}/models/character/corsair-king.fbx`,
  ];

  for (const href of criticalFetch) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.href = href;
    link.setAttribute("as", "fetch");
    link.setAttribute("crossorigin", "anonymous");
    document.head.appendChild(link);
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
