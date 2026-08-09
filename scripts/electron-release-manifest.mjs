import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const packageRoot = path.join(projectRoot, "out", "Electron Packages", "Hostfall-win32-x64");
export const packageManifestPath = `${packageRoot}.manifest.json`;

export function createPackageManifest(root = packageRoot) {
  if (!fs.existsSync(path.join(root, "Hostfall.exe"))) throw new Error(`Hostfall package is missing: ${root}`);
  const files = listFiles(root).map((filePath) => {
    const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
    const contents = fs.readFileSync(filePath);
    return {
      path: relativePath,
      category: categoryFor(relativePath),
      bytes: contents.byteLength,
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    };
  }).sort((left, right) => left.path.localeCompare(right.path, "en"));
  return {
    schemaVersion: 1,
    target: "win32-x64",
    productName: "Hostfall",
    version: JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version,
    totals: {
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
    },
    categories: summarizeCategories(files),
    files,
  };
}

export function comparePackageManifests(left, right) {
  const differences = [];
  const leftFiles = new Map(left.files.map((file) => [file.path, file]));
  const rightFiles = new Map(right.files.map((file) => [file.path, file]));
  for (const filePath of new Set([...leftFiles.keys(), ...rightFiles.keys()])) {
    const leftFile = leftFiles.get(filePath);
    const rightFile = rightFiles.get(filePath);
    if (!leftFile) differences.push({ path: filePath, change: "added" });
    else if (!rightFile) differences.push({ path: filePath, change: "removed" });
    else if (leftFile.bytes !== rightFile.bytes || leftFile.sha256 !== rightFile.sha256) {
      differences.push({ path: filePath, change: "modified", leftBytes: leftFile.bytes, rightBytes: rightFile.bytes });
    }
  }
  return differences.sort((leftEntry, rightEntry) => leftEntry.path.localeCompare(rightEntry.path, "en"));
}

function summarizeCategories(files) {
  const categories = {};
  for (const file of files) {
    const summary = categories[file.category] ?? { files: 0, bytes: 0 };
    summary.files += 1;
    summary.bytes += file.bytes;
    categories[file.category] = summary;
  }
  return Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function categoryFor(relativePath) {
  if (relativePath === "resources/app.asar") return "app";
  if (relativePath.startsWith("resources/audio/")) return "audio";
  if (relativePath.startsWith("resources/cards/")) return "cards";
  if (relativePath.startsWith("resources/fonts/")) return "fonts";
  if (relativePath.endsWith("LICENSE") || relativePath.includes("LICENSES") || relativePath.endsWith("NOTICES.txt")) return "notices";
  return "electron-runtime";
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : entry.isFile() ? [target] : [];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  const manifest = createPackageManifest();
  if (mode === "--write") {
    fs.writeFileSync(packageManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } else if (mode === "--check") {
    if (!fs.existsSync(packageManifestPath)) throw new Error("Electron package manifest is missing.");
    const expected = JSON.parse(fs.readFileSync(packageManifestPath, "utf8"));
    const differences = comparePackageManifests(expected, manifest);
    if (differences.length) throw new Error(`Electron package manifest is stale:\n${JSON.stringify(differences, null, 2)}`);
  } else {
    console.error("Use --write or --check.");
    process.exit(2);
  }
  console.log(`Electron package manifest: ${manifest.totals.files} files, ${manifest.totals.bytes} bytes.`);
}
