import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.VITE_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: api, changeOrigin: false },
      "/socket.io": { target: api, ws: true, changeOrigin: false },
    },
  },
  build: {
    // Auch ältere Smartphones (iOS 12+, Android 7+ mit aktuellem WebView) unterstützen.
    target: ["es2019", "chrome70", "safari12", "firefox68", "edge79"],
    cssTarget: ["chrome70", "safari12"],
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
