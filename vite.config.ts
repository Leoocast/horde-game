import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), excludeSystemMetadata()],
});

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
