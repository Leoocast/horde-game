import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createStaging } from "./electron-release-assets.mjs";
import {
  comparePackageManifests,
  createPackageManifest,
  packageManifestPath,
  projectRoot,
} from "./electron-release-manifest.mjs";

const forgeCli = path.join(projectRoot, "node_modules", "@electron-forge", "cli", "dist", "electron-forge.js");
const firstManifestPath = path.join(projectRoot, ".electron-staging", "unsigned-build-first.json");

createStaging();
runPackage();
const first = createPackageManifest();
fs.writeFileSync(firstManifestPath, `${JSON.stringify(first, null, 2)}\n`, "utf8");

runPackage();
const second = createPackageManifest();
const differences = comparePackageManifests(first, second);
if (differences.length) {
  console.error(JSON.stringify(differences, null, 2));
  throw new Error(`Unsigned Electron packages differ in ${differences.length} file(s).`);
}

fs.writeFileSync(packageManifestPath, `${JSON.stringify(second, null, 2)}\n`, "utf8");
console.log(`Unsigned Electron package is reproducible: ${second.totals.files} files, ${second.totals.bytes} bytes.`);

function runPackage() {
  const result = spawnSync(process.execPath, [forgeCli, "package", "--arch=x64", "--platform=win32"], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Electron Forge exited with code ${result.status}.`);
}
