import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageJsonPath = path.resolve(__dirname, "package.json");
const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf-8");
const packageJson = JSON.parse(packageJsonRaw) as { version?: string };
const appVersion = packageJson.version ?? "0.0.0";

export default defineConfig({
  envDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8400',
        changeOrigin: true,
      }
    }
  }
})
