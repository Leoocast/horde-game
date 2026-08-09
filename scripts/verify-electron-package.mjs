import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile, listPackage } from "@electron/asar";
import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.join(projectRoot, "out", "Electron Packages", "Hostfall-win32-x64");
const executablePath = path.join(packageRoot, "Hostfall.exe");
const resourcesPath = path.join(packageRoot, "resources");
const asarPath = path.join(resourcesPath, "app.asar");

assert.match(packageRoot, /\s/u, "The verification package path must exercise spaces.");
await stat(executablePath);
await stat(asarPath);

const fuses = await getCurrentFuseWire(executablePath);
const expectedFuses = new Map([
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
  [FuseV1Options.WasmTrapHandlers, FuseState.DISABLE],
]);
for (const [fuse, expected] of expectedFuses) assert.equal(fuses[fuse], expected, `Unexpected state for fuse ${fuse}`);

const asarEntries = listPackage(asarPath, { isPack: false }).map((entry) => entry.replaceAll("\\", "/").replace(/^\//u, ""));
assert.ok(asarEntries.includes(".vite/build/main.mjs"));
assert.ok(asarEntries.includes(".vite/build/preload.cjs"));
assert.ok(asarEntries.includes(".vite/renderer/main_window/index.html"));
assert.ok(asarEntries.some((entry) => entry.endsWith(".mp3")));
for (const forbidden of ["src/", "tests/", "dev/", "playground/", "audio-lab/", "card-studio/"]) {
  assert.equal(asarEntries.some((entry) => entry.toLowerCase().includes(forbidden)), false, `Forbidden package path: ${forbidden}`);
}

const resourceNames = (await readdir(resourcesPath)).sort();
assert.deepEqual(resourceNames, ["app.asar", "cards", "fonts"]);
const cardFiles = await collectFiles(path.join(resourcesPath, "cards"));
const fontFiles = await collectFiles(path.join(resourcesPath, "fonts"));
assert.ok(cardFiles.filter((file) => file.toLowerCase().endsWith(".png")).length >= 61);
assert.ok(fontFiles.filter((file) => file.toLowerCase().endsWith(".woff2")).length >= 6);

const packagedMetadata = JSON.parse(extractFile(asarPath, "package.json").toString("utf8"));
assert.equal(packagedMetadata.main, ".vite/build/main.mjs");

console.log(JSON.stringify({
  packageRoot,
  asarEntries: asarEntries.length,
  cardFiles: cardFiles.length,
  fontFiles: fontFiles.length,
  fuses: Object.fromEntries([...expectedFuses].map(([key, value]) => [FuseV1Options[key], value === FuseState.ENABLE ? "enabled" : "disabled"])),
}, null, 2));

async function collectFiles(root) {
  const files = [];
  await visit(root);
  return files;

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push(target);
    }
  }
}
