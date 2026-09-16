import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@whatsapp/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3001",
      "/users": "http://localhost:3001",
      "/conversations": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
