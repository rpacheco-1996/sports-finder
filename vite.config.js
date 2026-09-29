import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/",
  root: resolve(rootDir, "src"),
  publicDir: resolve(rootDir, "public"),
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
  server: { port: 5173 },
});
