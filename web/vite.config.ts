import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project site: https://rpacheco-1996.github.io/sports-finder/
export default defineConfig({
  base: "/sports-finder/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
