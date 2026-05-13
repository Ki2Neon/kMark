import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const env = process.env;
const host = env.TAURI_DEV_HOST;
const base = env.KMARK_BASE_PATH ?? "./";

// https://vite.dev/config/
export default defineConfig(async () => ({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@uiw/react-codemirror")) {
            return "codemirror-react";
          }

          if (id.includes("markdown-it") || id.includes("dompurify")) {
            return "markdown";
          }

          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
