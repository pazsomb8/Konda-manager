import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Dev only: Vite serves the UI on PORT (default 8001) and proxies /api to the
// backend on API_PORT (default 8002). Both bind to loopback only.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  const port = Number(env.PORT ?? 8001);
  const apiPort = Number(env.API_PORT ?? 8002);
  return {
    plugins: [react()],
    // Do not expose .env values to the browser bundle.
    envDir: "./no-env",
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        "/api": { target: `http://127.0.0.1:${apiPort}`, ws: true },
      },
    },
    build: { outDir: "dist", emptyOutDir: true },
  };
});
