import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run build` writes into ../static, which FastAPI serves: one service to deploy.
// `npm run dev` proxies the API to uvicorn on :8000 for hot reload while designing.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../static", emptyOutDir: true, target: "es2020" },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
