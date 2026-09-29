import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Custom domain serves this repo from the site root.
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
