/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";

export function rendererViteConfig(command: "serve" | "build"): UserConfig {
  return {
    base: "./",
    // Development CSS still references /fonts/... directly, so Vite must serve the local public
    // directory. Release keeps it disabled: Forge stages the six runtime fonts as extraResources
    // and hostfall://app/fonts/... resolves them through the registered content root.
    publicDir: command === "serve" ? "public" : false,
    plugins: [react()],
    resolve: {
      // pnpm keeps Framer Motion's internal packages beside its real store path.
      preserveSymlinks: false,
    },
    server: {
      watch: {
        // Forge copies packaged media here. Windows can keep a playing MP3 locked, and asking
        // Vite's development watcher to subscribe to that file crashes `electron-forge start`
        // with EBUSY even though staging is not renderer source.
        ignored: ["**/.electron-staging/**"],
      },
    },
    define: {
      __HOSTFALL_DESKTOP__: "true",
    },
  };
}

export default defineConfig(({ command }) => rendererViteConfig(command));
