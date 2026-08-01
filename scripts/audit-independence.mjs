import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { verifyGenerationManifest } from "./card-generation-manifest.mjs";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const JSON_OUTPUT = process.argv.includes("--json");
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".svg", ".ts", ".tsx", ".txt"]);

const ACTIVE_DECK_FILES = [
  "src/data/decks/player/mono_green_ramp/mono_green_ramp.json",
  "src/data/decks/player/vampire_preview/vampire_preview.json",
  "src/data/decks/horde/zombies/horde-zombies.json",
  "src/data/decks/horde/goblins/goblin_assault_horde.json",
];

const DERIVED_DECK_FILES = [
  "src/data/decks/player/mono_green_ramp/mono_green_ramp.json",
  "src/data/decks/horde/zombies/horde-zombies.json",
  "src/data/decks/horde/goblins/goblin_assault_horde.json",
];

// This list is intentionally fixed. It must shrink as authored identities are replaced; deriving it
// from the current decks would make renamed cards continue to look "known" forever.
const DERIVED_CARD_NAMES = new Set([
  "Llanowar Elves",
  "Sunshower Druid",
  "Druid of the Cowl",
  "Ichorspit Basilisk",
  "Beast-Kin Ranger",
  "Magnigoth Sentry",
  "Colossadactyl",
  "Timberland Ancient",
  "Cosmic Hunger",
  "Ruthless Predation",
  "Broken Wings",
  "Giant Growth",
  "Forest",
  "Zombie Token",
  "Zombie Giant Token",
  "Graf Harvest",
  "Noosegraf Mob",
  "Rottenheart Ghoul",
  "Miasmic Mummy",
  "Smallpox",
  "Blighted Bat",
  "Stitchwing Skaab",
  "Advanced Stitchwing",
  "Crow of Dark Tidings",
  "Cursed Minotaur",
  "Thraben Foulbloods",
  "Hound of the Farbogs",
  "Rancid Rats",
  "Gavony Unhallowed",
  "Diregraf Captain",
  "Goblin Token",
  "Hobgoblin Bandit Lord",
  "Rundvelt Hordemaster",
  "Battle Cry Goblin",
  "Goblin War Drums",
  "Raid Bombardment",
  "Beetleback Chief",
  "Siege-Gang Commander",
  "Goblin Rabblemaster",
  "Goblin Surprise",
  "Mogg Mob",
  "Volley Veteran",
  "Goblin Chainwhirler",
  "Goblin Trashmaster",
  "General Kreat, the Boltbringer",
  "Krenko, Tin Street Kingpin",
  "Pashalik Mons",
]);

const LEGACY_AUTHORED_KEYS = new Set([
  "cardTypes",
  "colors",
  "coloredMana",
  "entersTapped",
  "genericMana",
  "keywords",
  "manaCost",
  "manaValue",
  "requiresNoSummoningSickness",
  "tap",
  "toughness",
]);

function absolute(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function walk(relativeRoot) {
  const root = absolute(relativeRoot);
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files.sort((a, b) => relative(a).localeCompare(relative(b)));
}

function textFiles(relativeRoots) {
  return relativeRoots
    .flatMap((root) => walk(root))
    .filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

function countPattern(content, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return content.match(new RegExp(pattern.source, flags))?.length ?? 0;
}

function scanTextPatterns(files, patterns) {
  let count = 0;
  const samples = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const { label, pattern } of patterns) {
      const matches = countPattern(content, pattern);
      if (matches === 0) continue;
      count += matches;
      samples.push(`${relative(file)} :: ${label} (${matches})`);
    }
  }
  return { count, samples: [...new Set(samples)].sort() };
}

function scanMatchedTerms(files, terms) {
  const matches = [];
  for (const term of terms) {
    const needle = term.toLocaleLowerCase("en");
    const matchingFiles = files
      .filter((file) => fs.readFileSync(file, "utf8").toLocaleLowerCase("en").includes(needle))
      .map(relative);
    if (matchingFiles.length > 0) matches.push({ term, files: matchingFiles });
  }
  return {
    count: matches.length,
    samples: matches.map(({ term, files: matchingFiles }) => `${term} :: ${matchingFiles.slice(0, 3).join(", ")}`),
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(absolute(relativePath), "utf8"));
}

function authoredKeyInventory() {
  const counts = new Map();
  const filesByKey = new Map();

  function visit(value, file) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, file);
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (LEGACY_AUTHORED_KEYS.has(key)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const files = filesByKey.get(key) ?? new Set();
        files.add(file);
        filesByKey.set(key, files);
      }
      visit(nested, file);
    }
  }

  for (const file of ACTIVE_DECK_FILES) visit(readJson(file), file);
  const entries = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    count: entries.reduce((total, [, keyCount]) => total + keyCount, 0),
    samples: entries.map(([key, keyCount]) => `${key}: ${keyCount} occurrence(s) in ${filesByKey.get(key).size} deck file(s)`),
  };
}

function derivedDefinitionInventory() {
  const definitions = [];
  for (const file of DERIVED_DECK_FILES) {
    const deck = readJson(file);
    const uniqueById = new Map(
      [...(deck.cards ?? []), ...(deck.tokens ?? [])].map((card) => [card.id, card]),
    );
    for (const card of uniqueById.values()) {
      if (DERIVED_CARD_NAMES.has(card.name)) definitions.push(`${deck.id}/${card.id} :: ${card.name}`);
    }
  }
  return { count: definitions.length, samples: definitions.sort() };
}

function assetInventory(relativeRoots) {
  const files = relativeRoots.flatMap(walk);
  const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
  return {
    count: files.length,
    samples: relativeRoots.map((root) => `${root}: ${walk(root).length} file(s)`).concat(`total size: ${(bytes / 1024 / 1024).toFixed(2)} MiB`),
  };
}

function finding(id, severity, phase, title, description, result) {
  return {
    id,
    severity,
    phase,
    title,
    description,
    count: result.count,
    samples: result.samples.slice(0, 80),
  };
}

const productionText = textFiles(["src"])
  .concat([absolute("index.html"), absolute("vite.config.js")].filter(fs.existsSync));
const activeConfigurationText = productionText
  .concat([absolute("package.json")].filter(fs.existsSync));
const toolText = textFiles(["dev/tools"]);
const distText = textFiles(["dist"]);
const internalText = textFiles(["src/engine", "src/store", "src/playground"]);
const testText = textFiles(["tests"]);

const explicitIpPatterns = [
  { label: "Magic", pattern: /\bMagic(?:\s*:\s*The Gathering|\s+The Gathering)?\b/iu },
  { label: "Wizards of the Coast", pattern: /Wizards\s+of\s+the\s+Coast/iu },
];
const remoteProviderPatterns = [
  { label: "remote card provider", pattern: /(?:api|cards)\.scryfall|\bscryfall\b/iu },
];
const internalLegacyPatterns = [
  { label: "legacy zones", pattern: /\b(?:library|battlefield|graveyard|exile)\b/iu },
  { label: "legacy resource model", pattern: /\b(?:mana|ManaPool|coloredMana|genericMana)\b/u },
  { label: "legacy card kinds", pattern: /\b(?:Creature|Land|Instant|Sorcery|Enchantment|Artifact)\b/u },
  { label: "legacy traits", pattern: /\b(?:REACH|VIGILANCE|MENACE|DEATHTOUCH|FIRST_STRIKE|SKULK|LIFESTEAL|TRAMPLE|HASTE|TOXIC(?:_\d+)?)\b/u },
  { label: "legacy states", pattern: /\b(?:tapped|summoningSickness)\b/u },
  { label: "legacy Host identity", pattern: /\bhorde\b/iu },
];

const derivedAssetRoots = [
  "public/cards/mono_green_ramp",
  "public/cards/zombies",
  "public/cards/goblins",
];
const derivedDistAssetRoots = [
  "dist/cards/mono_green_ramp",
  "dist/cards/zombies",
  "dist/cards/goblins",
];
const cardAssetFreshness = verifyGenerationManifest();
const provenanceFiles = walk("docs").filter((file) => /(?:resource|asset)[_-]?provenance/i.test(path.basename(file)));
const deprecatedCardTools = walk("dev/tools/Cards");

const checks = [
  finding(
    "production-explicit-ip",
    "blocker",
    "L1",
    "Explicit external-IP references in production source",
    "Source imported by the product still names Magic or Wizards.",
    scanTextPatterns(productionText, explicitIpPatterns),
  ),
  finding(
    "tool-explicit-ip",
    "blocker",
    "L1",
    "Explicit external-IP references in tools",
    "Developer tools still contain external credits or identifiers.",
    scanTextPatterns(toolText, explicitIpPatterns),
  ),
  finding(
    "dist-explicit-ip",
    "blocker",
    "L1",
    "Explicit external-IP references in the production build",
    "Compiled product files still name Magic or Wizards.",
    scanTextPatterns(distText, explicitIpPatterns),
  ),
  finding(
    "remote-card-provider",
    "blocker",
    "L1",
    "Remote card-provider references",
    "Runtime, tools and build must remain local-only.",
    scanTextPatterns([...productionText, ...toolText, ...distText], remoteProviderPatterns),
  ),
  finding(
    "deprecated-card-tools",
    "warning",
    "L1",
    "Candidate deprecated card-tool files",
    "The old dev/tools/Cards tree must be proven unused before deletion.",
    { count: deprecatedCardTools.length, samples: deprecatedCardTools.map(relative) },
  ),
  finding(
    "deprecated-card-tool-consumers",
    "warning",
    "L1",
    "Active consumers of the deprecated card-tool tree",
    "This must remain zero before L1 can delete the candidate tree.",
    scanTextPatterns(activeConfigurationText, [
      { label: "dev/tools/Cards reference", pattern: /(?:dev\/)?tools\/Cards\//u },
    ]),
  ),
  finding(
    "unverifiable-generated-pngs",
    "warning",
    "L6",
    "Generated card PNGs without a valid freshness proof",
    "Every checked-in PNG must match the current local data, renderer and source-art hashes.",
    {
      count: cardAssetFreshness.unverifiedPngs.length,
      samples: cardAssetFreshness.unverifiedPngs,
    },
  ),
  finding(
    "legacy-authored-schema",
    "blocker",
    "L3",
    "Legacy fields in active deck authoring",
    "Active deck JSON still uses the pre-Hostfall schema.",
    authoredKeyInventory(),
  ),
  finding(
    "legacy-internal-vocabulary",
    "warning",
    "L4",
    "Legacy vocabulary in engine consumers",
    "Engine, store and playground still model legacy zones, resources, traits and states.",
    scanTextPatterns(internalText, internalLegacyPatterns),
  ),
  finding(
    "derived-card-definitions",
    "blocker",
    "L5",
    "Known derived card definitions",
    "Authored identities in the three legacy decks still match the fixed inventory.",
    derivedDefinitionInventory(),
  ),
  finding(
    "derived-identities-in-dist",
    "blocker",
    "L5",
    "Known derived card names in the production build",
    "The compiled build still exposes known card identities.",
    scanMatchedTerms(distText, [...DERIVED_CARD_NAMES].sort()),
  ),
  finding(
    "derived-assets-in-public",
    "blocker",
    "L6",
    "Known derived asset files under public",
    "Vite copies these checked-in files into the production build.",
    assetInventory(derivedAssetRoots),
  ),
  finding(
    "derived-assets-in-dist",
    "blocker",
    "L6",
    "Known derived asset files in the production build",
    "The generated build contains the three legacy deck asset trees.",
    assetInventory(derivedDistAssetRoots),
  ),
  finding(
    "missing-resource-provenance",
    "blocker",
    "L6",
    "Missing resource-provenance registry",
    "No machine-readable art/audio/resource provenance registry was found.",
    {
      count: provenanceFiles.length === 0 ? 1 : 0,
      samples: provenanceFiles.length === 0 ? ["no resource/asset provenance registry found"] : provenanceFiles.map(relative),
    },
  ),
  finding(
    "legacy-test-vocabulary",
    "info",
    "L7",
    "Legacy vocabulary in tests",
    "Tests intentionally preserve current engine contracts and must be migrated with their domains.",
    scanTextPatterns(testText, internalLegacyPatterns),
  ),
];

const summary = {
  blockerCategories: checks.filter((check) => check.severity === "blocker" && check.count > 0).length,
  warningCategories: checks.filter((check) => check.severity === "warning" && check.count > 0).length,
  passingCategories: checks.filter((check) => check.count === 0).length,
};
const report = {
  mode: STRICT ? "strict" : "report-only",
  distPresent: fs.existsSync(absolute("dist")),
  summary,
  checks,
};

if (JSON_OUTPUT) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Hostfall independence audit (${report.mode})`);
  console.log(`dist: ${report.distPresent ? "present" : "missing — run the production build first"}`);
  console.log(`blocker categories: ${summary.blockerCategories}; warnings: ${summary.warningCategories}; passing: ${summary.passingCategories}`);
  for (const check of checks) {
    const status = check.count === 0 ? "PASS" : check.severity.toUpperCase();
    console.log(`\n[${status}] ${check.id} — ${check.title}: ${check.count}`);
    console.log(`  phase: ${check.phase}; ${check.description}`);
    for (const sample of check.samples.slice(0, 12)) console.log(`  - ${sample}`);
    if (check.samples.length > 12) console.log(`  - … ${check.samples.length - 12} more sample(s)`);
  }
  console.log("\nDefault mode is informational. Use --strict to fail while publication blockers remain.");
}

if (STRICT && summary.blockerCategories > 0) process.exitCode = 1;
