import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), copyRuntimeAudio(), excludeSystemMetadata()],
  define: {
    __HOSTFALL_DESKTOP__: "false",
  },
});

function copyRuntimeAudio(): Plugin {
  return {
    name: "hostfall-copy-runtime-audio",
    closeBundle() {
      const manifestPath = path.resolve("src", "audio", "runtimeAudioAssets.json");
      const runtimeAudioAssets: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      collectStringLeaves(runtimeAudioAssets).forEach((logicalPath) => {
        if (!logicalPath.startsWith("/audio/")) throw new Error(`Invalid runtime audio path: ${logicalPath}`);
        const relativePath = logicalPath.slice("/audio/".length);
        const source = path.resolve("assets", relativePath);
        const destination = path.resolve("dist", "audio", relativePath);
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
          throw new Error(`Missing runtime audio asset: ${source}`);
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      });
    },
  };
}

function excludeSystemMetadata(): Plugin {
  return {
    name: "hostfall-exclude-system-metadata",
    closeBundle() {
      removeSystemMetadata(path.resolve("dist"));
    },
  };
}

function removeSystemMetadata(directory: string): void {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) removeSystemMetadata(target);
    else if (entry.name === ".DS_Store") fs.rmSync(target);
  }
}

function collectStringLeaves(value: unknown, leaves = new Set<string>()): Set<string> {
  if (typeof value === "string") leaves.add(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStringLeaves(entry, leaves));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStringLeaves(entry, leaves));
  return leaves;
}
