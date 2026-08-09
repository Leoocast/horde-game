/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: {
    // pnpm keeps Framer Motion's internal packages beside its real store path.
    preserveSymlinks: false,
  },
  define: {
    __HOSTFALL_DESKTOP__: "true",
  },
});
