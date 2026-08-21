import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST_ROOT = path.join(ROOT, "dist");
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".jsx", ".json", ".mjs", ".ts", ".tsx"]);
const SOURCE_FILES = [path.join(ROOT, "index.html"), ...listFiles(path.join(ROOT, "src"))]
  .filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
const DIST_FILES = fs.existsSync(DIST_ROOT)
  ? listFiles(DIST_ROOT).filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
  : [];

const failures = new Map();
const allowedExternalUrls = new Set();

for (const file of [...SOURCE_FILES, ...DIST_FILES]) {
  const text = fs.readFileSync(file, "utf8");
  scanRemoteResources(file, text);
  scanExternalUrlLiterals(file, text);
}

scanSourceAssetReferences();
scanBuiltAssetReferences();
scanReleaseForDeveloperTools();

const report = {
  sourceFiles: SOURCE_FILES.length,
  distFiles: DIST_FILES.length,
  allowedExternalUrls: [...allowedExternalUrls].sort(),
  failures: [...failures.values()].sort(),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log("Hostfall offline runtime audit");
  console.log(`source text files: ${report.sourceFiles}`);
  console.log(`dist text files: ${report.distFiles}`);
  console.log(`allowed navigation/diagnostic URLs: ${report.allowedExternalUrls.length}`);
  console.log(`blockers: ${report.failures.length}`);
  for (const issue of report.failures) console.log(`  - ${issue}`);
  if (report.failures.length === 0) console.log("Offline runtime audit: OK");
}

if (report.failures.length > 0) process.exitCode = 1;

function scanRemoteResources(file, text) {
  const patterns = [
    ["remote HTML resource", /<(?:audio|embed|iframe|img|link|object|script|source|video)\b[^>]*(?:data|href|src)\s*=\s*["']https?:\/\/[^"']+/gi],
    ["remote CSS import", /@import\s+(?:url\()?\s*["']?https?:\/\/[^\s"')]+/gi],
    ["remote CSS resource", /url\(\s*["']?https?:\/\/[^\s"')]+/gi],
    ["remote JavaScript resource", /(?:fetch|importScripts)\(\s*["']https?:\/\/[^"']+/gi],
    ["remote JavaScript URL", /new\s+(?:EventSource|WebSocket|URL)\(\s*["'](?:https?|wss?):\/\/[^"']+/gi],
  ];

  for (const [label, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) addFailure(file, text, match.index ?? 0, label);
  }
}

function scanExternalUrlLiterals(file, text) {
  const pattern = /https?:\/\/[^\s"'`<>\\)]+/g;
  for (const match of text.matchAll(pattern)) {
    const url = match[0];
    if (isAllowedNonResourceUrl(url)) {
      allowedExternalUrls.add(url);
      continue;
    }
    addFailure(file, text, match.index ?? 0, `unexpected external URL ${url}`);
  }
}

function isAllowedNonResourceUrl(url) {
  return url === "https://github.com/Leoocast"
    || url === "https://greensock.com"
    || url === "https://greensock.com/standard-license"
    || url.startsWith("https://react.dev/errors/")
    || url === "http://www.w3.org/1998/Math/MathML"
    || url === "http://www.w3.org/1999/xhtml"
    || url === "http://www.w3.org/1999/xlink"
    || url === "http://www.w3.org/XML/1998/namespace"
    || url === "http://www.w3.org/2000/svg";
}

function scanSourceAssetReferences() {
  for (const file of SOURCE_FILES) {
    const extension = path.extname(file).toLowerCase();
    const text = fs.readFileSync(file, "utf8");

    if ([".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(extension)) {
      const urlPattern = /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;
      for (const match of text.matchAll(urlPattern)) {
        const reference = match[1];
        if (isInlineOrRemote(reference)) continue;
        verifyPath(file, text, match.index ?? 0, reference, path.resolve(path.dirname(file), reference));
      }
    }

    if (extension === ".css") {
      const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
      for (const match of text.matchAll(cssUrlPattern)) {
        const reference = match[1].trim();
        if (isInlineOrRemote(reference) || reference.startsWith("#") || reference.startsWith("var(")) continue;
        const cleanReference = reference.split(/[?#]/, 1)[0];
        const resolved = cleanReference.startsWith("/")
          ? path.join(ROOT, "public", cleanReference.slice(1))
          : path.resolve(path.dirname(file), cleanReference);
        verifyPath(file, text, match.index ?? 0, reference, resolved);
      }
    }

    if (extension === ".json" && file.startsWith(path.join(ROOT, "src", "data"))) {
      const value = JSON.parse(text);
      for (const reference of collectPublicAssetPaths(value)) {
        const index = text.indexOf(reference);
        verifyPath(file, text, Math.max(0, index), reference, path.join(ROOT, "public", reference.slice(1)));
      }
    }
  }
}

function scanBuiltAssetReferences() {
  if (!fs.existsSync(DIST_ROOT)) {
    failures.set("dist-missing", "dist is missing; run build:web before the offline audit");
    return;
  }

  for (const file of listFiles(DIST_ROOT)) {
    if (path.basename(file) === ".DS_Store") {
      const relative = path.relative(ROOT, file).replaceAll(path.sep, "/");
      failures.set(relative, `${relative} — system metadata must not enter the release output`);
    }
  }

  for (const file of DIST_FILES) {
    const extension = path.extname(file).toLowerCase();
    if (extension !== ".css" && extension !== ".html") continue;
    const text = fs.readFileSync(file, "utf8");
    const pattern = extension === ".css"
      ? /url\(\s*["']?([^"')]+)["']?\s*\)/g
      : /(?:href|src)\s*=\s*["']([^"']+)["']/g;

    for (const match of text.matchAll(pattern)) {
      const reference = match[1].trim();
      if (isInlineOrRemote(reference) || reference.startsWith("#")) continue;
      const cleanReference = reference.split(/[?#]/, 1)[0];
      const resolved = cleanReference.startsWith("/")
        ? path.join(DIST_ROOT, cleanReference.slice(1))
        : path.resolve(path.dirname(file), cleanReference);
      verifyPath(file, text, match.index ?? 0, reference, resolved);
    }
  }
}

function scanReleaseForDeveloperTools() {
  if (!fs.existsSync(DIST_ROOT)) return;
  const markers = [
    "?playground",
    "PlaygroundScreen",
    "AudioLabScreen",
    "SeedExplorerScreen",
    "UIReferenceScreen",
    "ui-reference",
  ];
  for (const file of DIST_FILES.filter((entry) => [".html", ".js", ".mjs"].includes(path.extname(entry).toLowerCase()))) {
    const text = fs.readFileSync(file, "utf8");
    for (const marker of markers) {
      const index = text.indexOf(marker);
      if (index >= 0) addFailure(file, text, index, `developer-only marker ${JSON.stringify(marker)} in release`);
    }
  }
}

function collectPublicAssetPaths(value, paths = new Set()) {
  if (typeof value === "string") {
    if (/^\/(?:cards|fonts)\//.test(value)) paths.add(value);
    return paths;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectPublicAssetPaths(entry, paths);
    return paths;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectPublicAssetPaths(entry, paths);
  }
  return paths;
}

function verifyPath(file, text, index, reference, resolved) {
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    addFailure(file, text, index, `missing local asset ${JSON.stringify(reference)}`);
  }
}

function isInlineOrRemote(reference) {
  return /^(?:data:|https?:|wss?:)/i.test(reference);
}

function addFailure(file, text, index, message) {
  const line = text.slice(0, index).split(/\r?\n/).length;
  const relative = path.relative(ROOT, file).replaceAll(path.sep, "/");
  const value = `${relative}:${line} — ${message}`;
  failures.set(value, value);
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}
