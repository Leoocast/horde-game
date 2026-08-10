import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const outputPath = path.join(root, "THIRD_PARTY_NOTICES.txt");
const packages = new Map();

for (const name of Object.keys(rootPackage.dependencies ?? {}).sort()) visitPackage(path.join(root, "node_modules", ...name.split("/")));

const sections = [...packages.values()]
  .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`, "en"))
  .map(({ name, version, license, homepage, licenseText }) => [
    "=".repeat(78),
    `${name} ${version}`,
    `License: ${license}`,
    homepage ? `Project: ${homepage}` : undefined,
    "-".repeat(78),
    licenseText.trim(),
  ].filter(Boolean).join("\n"));

const header = [
  "HOSTFALL THIRD-PARTY SOFTWARE NOTICES",
  "",
  "This file covers JavaScript libraries bundled with Hostfall. Electron and Chromium",
  "notices are distributed separately as LICENSE and LICENSES.chromium.html beside",
  "Hostfall.exe. Game art, audio, fonts and other project content are not licensed by",
  "this file.",
  "",
].join("\n");

fs.writeFileSync(outputPath, `${header}${sections.join("\n\n")}\n`, "utf8");
console.log(`Third-party notices written: ${packages.size} packages.`);

function visitPackage(packageDirectory) {
  const realDirectory = fs.realpathSync(packageDirectory);
  const manifestPath = path.join(realDirectory, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const key = `${manifest.name}@${manifest.version}`;
  if (packages.has(key)) return;

  const licenseOverride = path.join(root, "legal", "third-party", `${manifest.name.replaceAll("/", "__")}.txt`);
  const licensePath = fs.existsSync(licenseOverride) ? licenseOverride : findLicense(realDirectory);
  packages.set(key, {
    name: manifest.name,
    version: manifest.version,
    license: typeof manifest.license === "string" ? manifest.license : "See included license text",
    homepage: typeof manifest.homepage === "string" ? manifest.homepage : undefined,
    licenseText: licensePath
      ? fs.readFileSync(licensePath, "utf8")
      : "LICENSE TEXT NOT SHIPPED BY THIS NPM PACKAGE. Complete owner/legal review before release.",
  });

  for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
    const nested = path.join(realDirectory, "node_modules", ...dependency.split("/"));
    const pnpmSibling = path.join(path.dirname(realDirectory), ...dependency.split("/"));
    const hoisted = path.join(root, "node_modules", ...dependency.split("/"));
    if (fs.existsSync(nested)) visitPackage(nested);
    else if (fs.existsSync(pnpmSibling)) visitPackage(pnpmSibling);
    else if (fs.existsSync(hoisted)) visitPackage(hoisted);
    else throw new Error(`Installed dependency ${dependency} required by ${key} was not found.`);
  }
}

function findLicense(directory) {
  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(?:copying|license|licence)(?:\.|$)/iu.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
  return candidates[0];
}
