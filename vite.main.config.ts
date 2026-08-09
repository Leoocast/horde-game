/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import { defineConfig } from "vite";

export default defineConfig((env) => {
  if (!("entry" in env.forgeConfigSelf)) throw new Error("The main Vite config requires a Forge build target.");
  return {
    build: {
      sourcemap: true,
      target: "node24",
      lib: {
        entry: env.forgeConfigSelf.entry,
        formats: ["es"],
        fileName: () => "main.mjs",
      },
      rollupOptions: {
        external: ["electron"],
      },
    },
  };
});
