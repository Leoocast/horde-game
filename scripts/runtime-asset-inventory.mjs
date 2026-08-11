import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST_ROOT = path.join(ROOT, "dist");
const OUTPUT = path.join(ROOT, "docs", "data", "generated", "runtime_asset_inventory.json");
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");

if (WRITE === CHECK) {
  console.error("Use exactly one of --write or --check.");
  process.exit(2);
}
if (!fs.existsSync(DIST_ROOT)) {
  console.error("dist is missing; run build:web first.");
  process.exit(1);
}

const files = listFiles(DIST_ROOT)
  .map((file) => inventoryEntry(file))
  .sort((left, right) => left.path.localeCompare(right.path, "en"));
const categories = {};
for (const file of files) {
  const summary = categories[file.category] ?? { files: 0, bytes: 0 };
  summary.files += 1;
  summary.bytes += file.bytes;
  categories[file.category] = summary;
}

const inventory = {
  schemaVersion: 1,
  source: "build:web/dist",
  totals: {
    files: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  },
  categories: Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right, "en"))),
  files,
};
const serialized = `${JSON.stringify(inventory, null, 2)}\n`;

if (WRITE) {
  fs.writeFileSync(OUTPUT, serialized, "utf8");
  console.log(`Runtime asset inventory written: ${files.length} files, ${inventory.totals.bytes} bytes.`);
} else {
  if (!fs.existsSync(OUTPUT)) {
    console.error("Runtime asset inventory is missing; run with --write.");
    process.exit(1);
  }
  const current = fs.readFileSync(OUTPUT, "utf8").replaceAll("\r\n", "\n");
  if (current !== serialized) {
    console.error("Runtime asset inventory is stale; run with --write after build:web.");
    process.exit(1);
  }
  console.log(`Runtime asset inventory: OK (${files.length} files, ${inventory.totals.bytes} bytes).`);
}

function inventoryEntry(file) {
  const content = fs.readFileSync(file);
  const relative = path.relative(DIST_ROOT, file).replaceAll(path.sep, "/");
  return {
    path: relative,
    category: categoryFor(relative),
    bytes: content.byteLength,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
  };
}

function categoryFor(relative) {
  const extension = path.extname(relative).toLowerCase();
  if (relative === "index.html" || extension === ".css" || extension === ".js" || extension === ".mjs") return "app";
  if (relative.startsWith("cards/")) return "cards";
  if (relative.startsWith("fonts/")) return "fonts";
  if ([".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"].includes(extension)) return "audio";
  if ([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension)) return "images";
  return "other";
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}
