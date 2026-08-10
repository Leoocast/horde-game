import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { verifyGenerationManifest } from "./card-generation-manifest.mjs";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const JSON_OUTPUT = process.argv.includes("--json");
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".svg", ".ts", ".tsx", ".txt"]);

const ACTIVE_DECK_FILES = [
  "src/data/decks/player/pact_of_elarion/pact_of_elarion.json",
  "src/data/decks/player/court_of_the_crimson_eclipse/court_of_the_crimson_eclipse.json",
  "src/data/decks/host/uprising_of_the_graveless/uprising_of_the_graveless.json",
  "src/data/decks/host/legion_of_varka/legion_of_varka.json",
];

const DERIVED_DECK_FILES = [
  "src/data/decks/player/pact_of_elarion/pact_of_elarion.json",
  "src/data/decks/host/uprising_of_the_graveless/uprising_of_the_graveless.json",
  "src/data/decks/host/legion_of_varka/legion_of_varka.json",
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
  if (fs.statSync(root).isFile()) return [root];
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

function scanTextPatternsIgnoringTaggedLines(files, patterns, allowTag, allowedRelativeFiles) {
  let count = 0;
  const samples = [];
  const allowedFiles = new Set(allowedRelativeFiles);
  for (const file of files) {
    const mayUseTag = allowedFiles.has(relative(file));
    const content = fs.readFileSync(file, "utf8")
      .split(/\r?\n/u)
      .filter((line) => !(mayUseTag && line.includes(allowTag)))
      .join("\n");
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

function derivedDistIdentityInventory() {
  const named = scanMatchedTerms(
    distText,
    [...DERIVED_CARD_NAMES].filter((name) => name !== "Forest").sort(),
  );
  const genericNameId = scanTextPatterns(distText, [
    { label: "retired Forest card id", pattern: /["']forest["']/iu },
  ]);
  return {
    count: named.count + genericNameId.count,
    samples: [...named.samples, ...genericNameId.samples],
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

function finding(id, severity, scope, title, description, result) {
  return {
    id,
    severity,
    scope,
    title,
    description,
    count: result.count,
    samples: result.samples.slice(0, 80),
  };
}

const productionText = textFiles(["src"])
  .concat([absolute("index.html"), absolute("vite.config.ts")].filter(fs.existsSync));
const toolText = textFiles(["dev/tools"]);
const distText = textFiles(["dist"]);
const internalText = textFiles(["src/engine", "src/store", "src/playground"]);
const testText = textFiles(["tests"]);
const l41Text = [...productionText, ...testText]
  .filter((file) => relative(file) !== "src/data/deckLint.ts");
const l42Text = textFiles(["src", "tests"])
  .filter((file) => [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => relative(file) !== "src/data/deckLint.ts");
const l43Text = textFiles(["src", "tests"])
  .filter((file) => [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => ![
    "src/data/deckLint.ts",
    "src/data/authoredDeckNormalizer.ts",
    "src/i18n/rulesText.ts",
    "tests/deckLint.test.js",
    "tests/vocabulary.test.js",
  ].includes(relative(file)));
const l44Text = textFiles(["src", "tests"])
  .filter((file) => [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => ![
    "src/data/deckLint.ts",
    "src/data/authoredDeckNormalizer.ts",
    "src/i18n/rulesText.ts",
    "src/playground/panels/CardsPanel.tsx",
    "src/playground/scenario.ts",
    "tests/deckCardText.test.js",
    "tests/deckLint.test.js",
    "tests/playgroundScenario.test.js",
    "tests/vocabulary.test.js",
  ].includes(relative(file)));
const l45Text = textFiles(["src", "tests"])
  .filter((file) => [".js", ".json", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => relative(file) !== "src/data/deckLint.ts");
const l46CardStructureText = textFiles(["src", "tests"])
  .filter((file) => [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => !["src/data/deckLint.ts", "tests/deckLint.test.js"].includes(relative(file)));
const l46HostIdentityExcluded = new Set([
  "src/components/DeckInspector.tsx",
  "src/data/deckLint.ts",
  "src/data/decks.ts",
  "src/store/useAudioStore.ts",
  "src/store/useLanguageStore.ts",
  "src/utils/appPersistence.ts",
  "tests/deckCardText.test.js",
  "tests/deckLint.test.js",
  "tests/vocabulary.test.js",
]);
const l46HostIdentityText = textFiles(["src", "tests"])
  .filter((file) => [".css", ".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => !l46HostIdentityExcluded.has(relative(file)));
const l46PlaygroundContractText = textFiles(["src/playground", "tests"])
  .filter((file) => [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file).toLowerCase()))
  .filter((file) => relative(file).startsWith("src/playground/") || /^tests\/playground[^/]*\.test\.js$/u.test(relative(file)));

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
const l41LegacyPatterns = [
  {
    label: "legacy card-kind value",
    pattern: /["'](?:Creature|Land|Instant|Sorcery|Enchantment|Artifact|Legendary)["']/u,
  },
  {
    label: "legacy Trait value",
    pattern: /["'](?:REACH|VIGILANCE|MENACE|DEATHTOUCH|FIRST_STRIKE|SKULK|LIFESTEAL|TRAMPLE|HASTE|TOXIC(?:_\d+)?)["']/u,
  },
  {
    label: "retired runtime identifier",
    pattern: /\b(?:deathtouchDamage|getToxicAmount|resolvePlayerAttackerLifesteal)\b/u,
  },
];
const l42LegacyPatterns = [
  {
    label: "legacy GameState zone member",
    pattern: /(?:(?<=[A-Za-z0-9_$)\]])\.|\?\.)(?:library|battlefield|graveyard|exile)\b/u,
  },
  {
    label: "legacy CardInstance zone value",
    pattern: /\bzone\s*(?::|[!=]==?)\s*["'](?:library|battlefield|graveyard|exile)["']/u,
  },
  {
    label: "legacy state zone property",
    pattern: /(?:^|[,{}]\s*)(?:library|battlefield|graveyard|exile)\s*:/mu,
  },
];
const l43LegacyPatterns = [
  {
    label: "legacy Energy state or cost identifier",
    pattern: /\b(?:ManaPool|manaPool|manaCost|manaValue|genericMana|coloredMana|pendingStoredMana|STORED_MANA_CAP)\b/u,
  },
  {
    label: "legacy Energy helper or animation identifier",
    pattern: /\b(?:emptyManaPool|storedManaSpace|queueUnusedNormalMana|releasePendingStoredMana|addStoredMana|parseManaCost|canPayWithAutomaticMana|payManaAutomatically|grantManaForCard|ManaFlowAnimationState|manaFlowAnimation)\b/u,
  },
  {
    label: "legacy Energy effect identifier",
    pattern: /["']ADD_MANA(?:_DYNAMIC)?["']/u,
  },
];
const l44LegacyPatterns = [
  {
    label: "legacy card-state member access",
    pattern: /\.(?:tapped|entersTapped|summoningSickness|requiresNoSummoningSickness)\b/u,
  },
  {
    label: "legacy card-state property declaration",
    pattern: /(?:^|[,{};]\s*)(?:tapped|entersTapped|summoningSickness|requiresNoSummoningSickness)\s*[?:]/mu,
  },
  {
    label: "legacy Exhaust cost or readiness condition",
    pattern: /(?:\.cost\??\.tap\b|\bcost\s*:\s*\{[^}]*\btap\s*:|["']SOURCE_IS_UNTAPPED["'])/u,
  },
  {
    label: "retired state helper or accidental transitional identifier",
    pattern: /\b(?:untapSide|clearPlayerSummoningSickness|requiresNoStabilizing)\b/u,
  },
];
const l45LegacyPatterns = [
  {
    label: "legacy gameplay event discriminant",
    pattern: /["'](?:BEGIN_COMBAT|BEGIN_UPKEEP|CARD_CAST|CREATURE_DIED|CREATURE_ENTERS_BATTLEFIELD|ENTERS_BATTLEFIELD)["']/u,
  },
  {
    label: "legacy Action, condition or amount discriminant",
    pattern: /["'](?:ANOTHER_CREATURE_YOU_CONTROL_DIED|ANOTHER_CREATURE_YOU_CONTROL_ENTERED|ANOTHER_PERMANENT_YOU_CONTROL_ENTERED|CAST_CARD_IS_NON_TOKEN|CONTROL_ANOTHER_PERMANENT_MATCHING|COUNTERS_PUT_ON_PERMANENT|COUNT_PERMANENTS(?:_ENTERED_THIS_TURN)?|DEAL_DAMAGE_TO_OPPONENT_CREATURE|DEAL_DAMAGE_TO_OPPONENT_AND_CREATURES|DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT|EXILE_CARD_FROM_GRAVEYARD|GRAVEYARD_COUNT_AT_LEAST|GRAVEYARD_HAS_TOKEN_CREATURE_AND_NON_TOKEN_CREATURE|HORDE_DIRECTIVE_ONLY|HORDE_GROUP_BUFF|HORDE_INSPECT_TOP_GOBLIN|IGNORED_FOR_HORDE_MVP|LOWEST_EXCESS_MANA_THEN_LOWEST_TAP_PRIORITY|LOWEST_MANA_VALUE_THEN_RANDOM|MILL_HORDE|MILL_SELF|PERMANENT_DIED|PLAYER_CHOOSES|REVEAL_HORDE_ROUND|RETURN_SELF_FROM_GRAVEYARD_TO_BATTLEFIELD|TAP_HORDE_CREATURES_FOR_MANA|TARGET_CREATURE|ALL_CREATURES|HORDE_ATTACK_SEQUENCE_END)["']/u,
  },
  {
    label: "legacy Host rules contract",
    pattern: /\b(?:HordeRulesProfile|DEFAULT_HORDE_RULES|buildHordeRules|hordeRules|damagePerMill|poisonPerMill|hordeCreaturesHaveHaste|hordeDirective|hordeErrata|hordeVersion)\b/u,
  },
  {
    label: "retired event or Archive-discard helper",
    pattern: /\b(?:runEnterBattlefieldTriggers|findManualEnterTargetTrigger|hasEnterBattlefieldTrigger|deferEnterBattlefieldTriggers|scheduleHordeEnterTriggers|playBattlefieldEntryVoiceInteraction|findCardCastReactionSources|scheduleCardCastReaction|cardCastReactionMessage|millHorde|CARD_CAST_REACTION_RESOLVE_MS)\b/u,
  },
  {
    label: "legacy event object noun",
    pattern: /["']?eventObject["']?\s*:\s*["']permanent["']/u,
  },
  {
    label: "legacy speed downgrade in authored deck normalization",
    pattern: /nestedValue\s*===\s*["']QUICK["'][^\n]+["']INSTANT["']|nestedValue\s*===\s*["']MAIN["'][^\n]+["']SORCERY["']/u,
  },
];
const l46CardStructureLegacyPatterns = [
  {
    label: "legacy card structure field",
    pattern: /\b(?:baseToughness|cardTypes|chaosKeywords|keywords|temporaryKeywords|temporaryToughness|toughness|untilNextPlayerTurnToughness)\b/u,
  },
  {
    label: "legacy card structure helper or type",
    pattern: /\b(?:CardType|CardTypes|getPowerToughness|Keyword|Keywords)\b/u,
  },
];
const l46HostIdentityLegacyPatterns = [
  {
    label: "legacy Host identity word",
    pattern: /\bhorde\b/iu,
  },
  {
    label: "legacy Host technical identifier",
    pattern: /\b(?:horde[A-Z][A-Za-z0-9_]*|[A-Za-z0-9_]+Horde(?!master)[A-Za-z0-9_]*|[A-Z0-9_]*HORDE[A-Z0-9_]*)\b/u,
  },
];
const l46PlaygroundContractLegacyPatterns = [
  {
    label: "legacy Playground Host identity",
    pattern: /["']horde["']|\b(?:hordeDeckId|hordeTurnNumber|hordeBattlefield|hordeGraveyard|hordeExile|hordeLibraryTop)\b/u,
  },
  {
    label: "legacy Playground zone name",
    pattern: /\b(?:playerBattlefield|playerGraveyard|playerExile|playerLibraryTop)\b/u,
  },
  {
    label: "legacy Playground card state",
    pattern: /\b(?:tapped|summoningSickness)\b/u,
  },
  {
    label: "legacy Playground timeline step",
    pattern: /["']hordeTurn(?:Exact)?["']/u,
  },
  {
    label: "retired Playground storage namespace",
    pattern: /hostfall-playground-(?:(?:boards|replays):v1|scenarios:v1)/u,
  },
];

// These retired asset roots must not reappear now that every active deck has a final Hostfall path.
const legacyAssetRoots = [
  "public/cards/mono_green_ramp",
  "public/cards/zombies",
  "public/cards/goblins",
  "public/cards/last_rain",
  "public/cards/crimson_court",
  "public/cards/hollow_bell_procession",
  "public/cards/broken_forge_mutiny",
  "public/fonts/last-rain",
];
const legacyDistAssetRoots = [
  "dist/cards/mono_green_ramp",
  "dist/cards/zombies",
  "dist/cards/goblins",
  "dist/cards/last_rain",
  "dist/cards/crimson_court",
  "dist/cards/hollow_bell_procession",
  "dist/cards/broken_forge_mutiny",
  "dist/fonts/last-rain",
];
const cardAssetFreshness = verifyGenerationManifest();
const checks = [
  finding(
    "production-explicit-ip",
    "blocker",
    "identity",
    "Explicit external-IP references in production source",
    "Source imported by the product still names Magic or Wizards.",
    scanTextPatterns(productionText, explicitIpPatterns),
  ),
  finding(
    "tool-explicit-ip",
    "blocker",
    "identity",
    "Explicit external-IP references in tools",
    "Developer tools still contain external credits or identifiers.",
    scanTextPatterns(toolText, explicitIpPatterns),
  ),
  finding(
    "dist-explicit-ip",
    "blocker",
    "identity",
    "Explicit external-IP references in the production build",
    "Compiled product files still name Magic or Wizards.",
    scanTextPatterns(distText, explicitIpPatterns),
  ),
  finding(
    "remote-card-provider",
    "blocker",
    "providers",
    "Remote card-provider references",
    "Runtime, tools and build must remain local-only.",
    scanTextPatterns([...productionText, ...toolText, ...distText], remoteProviderPatterns),
  ),
  finding(
    "unverifiable-generated-pngs",
    "warning",
    "assets",
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
    "authoring",
    "Legacy fields in active deck authoring",
    "Active deck JSON still uses the pre-Hostfall schema.",
    authoredKeyInventory(),
  ),
  finding(
    "retired-card-model",
    "blocker",
    "card-model",
    "Legacy card kinds or Traits in active consumers",
    "Runtime, UI and tests must use Hostfall card-kind and Trait values; deckLint is the only rejection allowlist.",
    scanTextPatterns(l41Text, l41LegacyPatterns),
  ),
  finding(
    "retired-zones",
    "blocker",
    "zones",
    "Legacy zones in active runtime state",
    "GameState and CardInstance must use archive, field, memory and oblivion without parallel legacy arrays.",
    scanTextPatterns(l42Text, l42LegacyPatterns),
  ),
  finding(
    "retired-energy-model",
    "blocker",
    "energy",
    "Legacy Energy state or cost model in active consumers",
    "Runtime, UI, Playground and tests must use the numeric Hostfall Energy model; compatibility/rejection borders are excluded.",
    scanTextPatterns(l43Text, l43LegacyPatterns),
  ),
  finding(
    "retired-card-states",
    "blocker",
    "card-state",
    "Legacy card-state model in active runtime consumers",
    "Runtime consumers must use exhausted, stabilizing, exhaust and requiresStabilized; the Playground v4 boundary uses the same states.",
    scanTextPatterns(l44Text, l44LegacyPatterns),
  ),
  finding(
    "retired-actions-events-host-rules",
    "blocker",
    "rules",
    "Legacy Actions, events or Host rules in active runtime consumers",
    "Runtime, normalized data and tests must consume Hostfall event/effect discriminants and the canonical Host rules profile.",
    scanTextPatternsIgnoringTaggedLines(
      l45Text,
      l45LegacyPatterns,
      "audit-allow retired-rules-rejection-fixture",
      ["tests/deckLint.test.js"],
    ),
  ),
  finding(
    "retired-card-structure",
    "blocker",
    "card-structure",
    "Legacy card structure in runtime consumers",
    "Runtime, UI and tests must use kinds, traits and endurance without structural aliases.",
    scanTextPatterns(l46CardStructureText, l46CardStructureLegacyPatterns),
  ),
  finding(
    "retired-host-identity",
    "blocker",
    "host-identity",
    "Legacy Horde identity in runtime consumers",
    "Runtime state, engine, store, UI, Playground and tests must use Host identity.",
    scanTextPatternsIgnoringTaggedLines(
      l46HostIdentityText,
      l46HostIdentityLegacyPatterns,
      "audit-allow retired-host-compatibility",
      ["src/store/useGameStore.ts"],
    ),
  ),
  finding(
    "retired-playground-contract",
    "blocker",
    "playground",
    "Legacy Playground external contract",
    "Scenario v4, board files, replays and Playground storage must use Hostfall-native names without a migration path.",
    scanTextPatternsIgnoringTaggedLines(
      l46PlaygroundContractText,
      l46PlaygroundContractLegacyPatterns,
      "audit-allow retired-playground-storage",
      ["src/playground/scenarioStorage.ts"],
    ),
  ),
  finding(
    "legacy-internal-vocabulary",
    "warning",
    "internal-vocabulary",
    "Broad legacy-word matches in internal consumers",
    "Exact runtime contracts are clean; this broader scan reviews remaining contextual or technical strings.",
    scanTextPatterns(internalText, internalLegacyPatterns),
  ),
  finding(
    "derived-card-definitions",
    "blocker",
    "authored-identities",
    "Known derived card definitions",
    "Authored identities must not match the retired source inventory.",
    derivedDefinitionInventory(),
  ),
  finding(
    "derived-identities-in-dist",
    "blocker",
    "compiled-identities",
    "Legacy card-name strings in the production build",
    "The production build must not contain retired card-name strings.",
    derivedDistIdentityInventory(),
  ),
  finding(
    "derived-assets-in-public",
    "blocker",
    "assets",
    "Legacy card-asset roots under public",
    "Retired technical asset paths must not reappear.",
    assetInventory(legacyAssetRoots),
  ),
  finding(
    "derived-assets-in-dist",
    "blocker",
    "assets",
    "Legacy card-asset roots in the production build",
    "A production build must use the final Hostfall asset paths.",
    assetInventory(legacyDistAssetRoots),
  ),
  finding(
    "legacy-test-vocabulary",
    "info",
    "tests",
    "Negative legacy-vocabulary guards in tests",
    "Rejection fixtures intentionally retain retired terms so the canonical Hostfall contracts cannot regress.",
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
    console.log(`  scope: ${check.scope}; ${check.description}`);
    for (const sample of check.samples.slice(0, 12)) console.log(`  - ${sample}`);
    if (check.samples.length > 12) console.log(`  - … ${check.samples.length - 12} more sample(s)`);
  }
  console.log("\nDefault mode is informational. Use --strict as the final independence gate.");
}

if (STRICT && summary.blockerCategories > 0) process.exitCode = 1;
