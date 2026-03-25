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

createRoot(document.getElementById("root")!).render(<App />);
