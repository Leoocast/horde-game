/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: mode !== "production",
    target: "node24",
    rollupOptions: {
      external: ["electron"],
      output: {
        format: "cjs",
        inlineDynamicImports: true,
        entryFileNames: "preload.cjs",
        chunkFileNames: "[name].cjs",
      },
    },
  },
}));
