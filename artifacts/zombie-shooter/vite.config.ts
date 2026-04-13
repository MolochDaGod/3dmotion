import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import path from "path";

const isReplit = !!process.env.REPL_ID;

function injectWasmPreload(base: string) {
  return {
    name: "inject-wasm-preload",
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string, ctx: { bundle?: Record<string, unknown> }) {
        if (!ctx.bundle) return html;
        const wasmEntry = Object.keys(ctx.bundle).find(
          (f) => f.toLowerCase().includes("rapier") && f.endsWith(".wasm"),
        );
        if (!wasmEntry) return html;
        const wasmUrl = `${base}${wasmEntry}`;
        const tag = `    <link rel="preload" href="${wasmUrl}" as="fetch" type="application/wasm" crossorigin="anonymous" />`;
        return html.replace("</head>", `${tag}\n  </head>`);
      },
    },
  };
}

const port = Number(process.env.PORT) || 5173;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    ...(isReplit
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
        ]
      : []),
    injectWasmPreload(basePath),
    ...(process.env.NODE_ENV !== "production" && isReplit
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei", "leva"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/three/") ||
            id.includes("/@react-three/fiber") ||
            id.includes("/@react-three/drei") ||
            id.includes("/@react-three/postprocessing") ||
            id.includes("/@dimforge/") ||
            id.includes("/@react-three/rapier")
          ) {
            return "vendor-3d";
          }
          if (
            id.includes("/zustand/") ||
            id.includes("/leva/")
          ) {
            return "vendor-state";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Forward WebSocket upgrade + REST calls to the API server
      "/ws/mmo": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
