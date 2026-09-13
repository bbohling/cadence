import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * API dev port. Must match api/wrangler.jsonc's `dev.port`. Deliberately not
 * 8787 — the bigmini Bookshelf container owns that port on this machine.
 */
const API_PORT = process.env.API_PORT ?? "8014";
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);

/**
 * Vite configuration.
 *
 * - React plugin for JSX/fast-refresh
 * - Tailwind CSS v4 via the Vite plugin
 * - Path alias (@/) pointing to src/
 * - Dev server proxies /api to the Hono backend
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: WEB_PORT,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`, // wrangler dev
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          recharts: ["recharts"],
          router: ["@tanstack/react-router"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
