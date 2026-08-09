import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { FuseVersion, FuseV1Options } from "@electron/fuses";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimeResourcesRoot = path.join(projectRoot, ".electron-staging", "resources");
const windowsIconPath = path.join(projectRoot, "build", "icon.ico");

const config = {
  outDir: path.join("out", "Electron Packages"),
  packagerConfig: {
    asar: true,
    appBundleId: "com.hostfall.game",
    executableName: "Hostfall",
    icon: fs.existsSync(windowsIconPath) ? windowsIconPath : undefined,
    win32metadata: {
      CompanyName: "Hostfall",
      FileDescription: "Hostfall",
      InternalName: "Hostfall",
      OriginalFilename: "Hostfall.exe",
      ProductName: "Hostfall",
    },
    extraResource: [
      path.join(runtimeResourcesRoot, "audio"),
      path.join(runtimeResourcesRoot, "cards"),
      path.join(runtimeResourcesRoot, "fonts"),
      path.join(projectRoot, "THIRD_PARTY_NOTICES.txt"),
    ],
    junk: true,
    prune: true,
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ["win32"])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "electron/main.ts", config: "vite.main.config.ts" },
        { entry: "electron/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // Electron's stock Windows archive does not ship browser_v8_context_snapshot.bin.
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: false,
    }),
  ],
};

export default config;
