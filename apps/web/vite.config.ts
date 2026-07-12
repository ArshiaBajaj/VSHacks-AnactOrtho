import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@courtvision/core": path.resolve(__dirname, "../../packages/core/src"),
      "@courtvision/vision": path.resolve(__dirname, "../../packages/vision/src"),
      "@courtvision/tokens": path.resolve(__dirname, "../../packages/tokens/src"),
      // Monorepo fix: always use the hoisted React 18 pair from the repo root.
      // apps/web had react@19 while react-dom@18 was hoisted → silent blank page.
      react: path.resolve(__dirname, "../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-dev-runtime", "react-dom/client", "zustand"],
    force: true,
  },
});
