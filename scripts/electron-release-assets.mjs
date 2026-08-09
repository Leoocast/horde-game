import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const stagingRoot = path.join(projectRoot, ".electron-staging", "resources");
export const stagingManifestPath = path.join(projectRoot, ".electron-staging", "runtime-resources-manifest.json");

const CARD_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const FONT_EXTENSIONS = new Set([".woff2"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav"]);

export function collectRuntimeResourcePlan() {
  const logicalPaths = new Set();
  const runtimeCardIds = new Set();
  const deckImageManifests = listFiles(path.join(projectRoot, "src", "data", "decks"))
    .filter((file) => file.endsWith("_images.json"));
  for (const jsonPath of deckImageManifests) {
    const manifest = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    collectLogicalPaths(manifest, "/cards/", logicalPaths);
    Object.keys(manifest.cards ?? {}).forEach((cardId) => runtimeCardIds.add(cardId));
  }
  const gameArt = JSON.parse(fs.readFileSync(path.join(projectRoot, "src", "data", "cardStudioGameArt.generated.json"), "utf8"));
  for (const cardId of runtimeCardIds) {
    const artUrl = gameArt.cards?.[cardId]?.artUrl;
    if (typeof artUrl !== "string") throw new Error(`Runtime card ${cardId} has no generated battlefield art URL.`);
    collectLogicalPaths(artUrl, "/cards/", logicalPaths);
  }

  const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
  for (const match of styles.matchAll(/url\(\s*["']?(\/fonts\/[^"')]+)["']?\s*\)/gu)) logicalPaths.add(match[1]);

  const audioManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "src", "audio", "runtimeAudioAssets.json"), "utf8"));
  if (audioManifest.schemaVersion !== 1) throw new Error("Unsupported runtime audio asset manifest.");
  collectLogicalPaths(audioManifest, "/audio/", logicalPaths);

  const entries = [...logicalPaths].sort((left, right) => left.localeCompare(right, "en")).map(createEntry);
  const destinations = new Set();
  for (const entry of entries) {
    if (destinations.has(entry.path)) throw new Error(`Duplicate release destination: ${entry.path}`);
    destinations.add(entry.path);
  }
  return entries;
}

export function createStaging() {
  assertSafeStagingPath(stagingRoot);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });

  const entries = collectRuntimeResourcePlan();
  for (const entry of entries) {
    const destination = path.join(stagingRoot, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(entry.sourcePath, destination);
  }
  const manifest = resourceManifest(entries);
  fs.writeFileSync(stagingManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function verifyStaging() {
  const expected = resourceManifest(collectRuntimeResourcePlan());
  if (!fs.existsSync(stagingManifestPath)) throw new Error("Runtime resource staging manifest is missing.");
  const recorded = JSON.parse(fs.readFileSync(stagingManifestPath, "utf8"));
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) throw new Error("Runtime resource staging manifest is stale.");

  const actualPaths = listFiles(stagingRoot)
    .map((file) => path.relative(stagingRoot, file).replaceAll(path.sep, "/"))
    .sort((left, right) => left.localeCompare(right, "en"));
  const expectedPaths = expected.files.map((entry) => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error("Runtime resource staging is outside its allowlist.");
  for (const entry of expected.files) {
    const staged = path.join(stagingRoot, ...entry.path.split("/"));
    if (sha256File(staged) !== entry.sha256) throw new Error(`Staged resource hash mismatch: ${entry.path}`);
  }
  return expected;
}

function createEntry(logicalPath) {
  if (!logicalPath.startsWith("/")) throw new Error(`Logical release path is not rooted: ${logicalPath}`);
  const relativePath = logicalPath.slice(1);
  if (relativePath.includes("\\") || relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe logical release path: ${logicalPath}`);
  }
  if (/hunters|exported-png/iu.test(relativePath)) throw new Error(`Developer-only asset entered release staging: ${relativePath}`);

  const root = relativePath.split("/", 1)[0];
  const extension = path.extname(relativePath).toLowerCase();
  let sourcePath;
  if (root === "cards") {
    if (!CARD_EXTENSIONS.has(extension)) throw new Error(`Unsupported card asset type: ${relativePath}`);
    sourcePath = path.join(projectRoot, "public", ...relativePath.split("/"));
  } else if (root === "fonts") {
    if (!FONT_EXTENSIONS.has(extension)) throw new Error(`Unsupported font asset type: ${relativePath}`);
    sourcePath = path.join(projectRoot, "public", ...relativePath.split("/"));
  } else if (root === "audio") {
    if (!AUDIO_EXTENSIONS.has(extension)) throw new Error(`Unsupported audio asset type: ${relativePath}`);
    sourcePath = path.join(projectRoot, "assets", ...relativePath.slice("audio/".length).split("/"));
  } else {
    throw new Error(`Unknown runtime resource root: ${root}`);
  }
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`Missing runtime resource: ${sourcePath}`);
  return { path: relativePath, sourcePath };
}

function resourceManifest(entries) {
  const files = entries.map(({ path: logicalPath, sourcePath }) => {
    const bytes = fs.statSync(sourcePath).size;
    return { path: logicalPath, bytes, sha256: sha256File(sourcePath) };
  });
  return {
    schemaVersion: 1,
    packKey: "builtin.hostfall.core",
    totals: {
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
    },
    categories: Object.fromEntries(["audio", "cards", "fonts"].map((category) => {
      const categoryFiles = files.filter((file) => file.path.startsWith(`${category}/`));
      return [category, { files: categoryFiles.length, bytes: categoryFiles.reduce((total, file) => total + file.bytes, 0) }];
    })),
    files,
  };
}

function collectLogicalPaths(value, prefix, paths) {
  if (typeof value === "string") {
    if (value.startsWith(prefix)) paths.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectLogicalPaths(entry, prefix, paths));
    return;
  }
  if (value && typeof value === "object") Object.values(value).forEach((entry) => collectLogicalPaths(entry, prefix, paths));
}

function assertSafeStagingPath(candidate) {
  const expectedParent = path.join(projectRoot, ".electron-staging");
  if (path.resolve(path.dirname(candidate)) !== path.resolve(expectedParent) || path.basename(candidate) !== "resources") {
    throw new Error(`Refusing to clear unexpected staging path: ${candidate}`);
  }
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : entry.isFile() ? [target] : [];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  const manifest = mode === "--stage" ? createStaging() : mode === "--check" ? verifyStaging() : undefined;
  if (!manifest) {
    console.error("Use --stage or --check.");
    process.exit(2);
  }
  console.log(`Electron runtime resources: ${manifest.totals.files} files, ${manifest.totals.bytes} bytes.`);
  for (const [category, summary] of Object.entries(manifest.categories)) {
    console.log(`  ${category}: ${summary.files} files, ${summary.bytes} bytes`);
  }
}
