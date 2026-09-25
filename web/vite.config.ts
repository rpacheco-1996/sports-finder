import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages sets VITE_BASE to the project path, e.g. /sports-finder/.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
