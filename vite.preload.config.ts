/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
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
});
