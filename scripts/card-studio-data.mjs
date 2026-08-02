import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const STUDIO_DECKS = Object.freeze({
  last_rain: {
    directory: "dev/tools/Decks/last_rain",
    publicDirectory: "public/cards/last_rain",
  },
  hollow_bell_procession: {
    directory: "dev/tools/Decks/hollow_bell_procession",
    publicDirectory: "public/cards/hollow_bell_procession",
  },
  broken_forge_mutiny: {
    directory: "dev/tools/Decks/broken_forge_mutiny",
    publicDirectory: "public/cards/broken_forge_mutiny",
  },
  crimson_court: {
    directory: "dev/tools/Decks/crimson_court",
    publicDirectory: "public/cards/crimson_court",
  },
  hunters: {
    directory: "dev/tools/Decks/hunters",
    publicDirectory: "public/cards/hunters",
    previewOnly: true,
  },
});

const TRAIT_LABELS = Object.freeze({
  ALERT: "Alerta",
  DAUNTING: "Imponente",
  DEATHTOUCH: "Letal",
  DRAIN: "Drenar",
  FIRST_STRIKE: "Reflejos",
  FLYING: "Volar",
  FURTIVE: "Furtivo",
  HASTE: "Ímpetu",
  IMPETUS: "Ímpetu",
  LETHAL: "Letal",
  LIFESTEAL: "Drenar",
  MENACE: "Imponente",
  OVERFLOW: "Desborde",
  REACH: "Guardia aérea",
  REFLEX: "Reflejos",
  SKYGUARD: "Guardia aérea",
  SKULK: "Furtivo",
  TRAMPLE: "Desborde",
  VIGILANCE: "Alerta",
});

function authoredEnergyAmount(card) {
  if (typeof card.energyCost === "number") return card.energyCost;
  if (card.energyCost && typeof card.energyCost === "object") {
    return Number(card.energyCost.amount ?? 0);
  }
  return 0;
}

function authoredTraits(card) {
  return card.traits ?? [];
}

function authoredEndurance(card) {
  return card.endurance ?? null;
}

function authoredIsToken(card) {
  return Boolean(card.isToken || card.kinds?.includes("TOKEN"));
}

function authoredIsChronicle(card) {
  return Boolean(card.modifiers?.includes("CHRONICLE"));
}

function authoredIsEnergy(card) {
  return Boolean(card.kinds?.includes("SOURCE"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function deckPaths(deckId) {
  const definition = STUDIO_DECKS[deckId];
  if (!definition) {
    throw new Error(`Estudio desconocido "${deckId}". Usa: ${Object.keys(STUDIO_DECKS).join(", ")}.`);
  }
  const directory = absolute(definition.directory);
  return {
    ...definition,
    directory,
    config: path.join(directory, "studio.config.json"),
    generatedData: path.join(directory, "deck-data.generated.js"),
    index: path.join(directory, "index.html"),
    publicDirectory: absolute(definition.publicDirectory),
  };
}

function energySymbols(text) {
  return text.replace(/Gana (\d+) Energías?/giu, (_match, rawAmount) => {
    const amount = Number(rawAmount);
    return amount > 0 && Number.isSafeInteger(amount)
      ? `Gana ${"{E}".repeat(amount)}`
      : _match;
  });
}

function visibleRules(runtimeCard, presentation, hiddenTraits) {
  if (Object.hasOwn(presentation, "rulesTextEs")) {
    throw new Error(
      `${runtimeCard.id}: rulesTextEs duplicaría las reglas del JSON runtime. Corrige gameText.es.`,
    );
  }

  const rawRules = energySymbols(String(runtimeCard.gameText?.es ?? "").trim());
  const rules = /^Sin efecto (?:activo )?adicional\.$/u.test(rawRules)
    ? []
    : rawRules.split("\n").filter(Boolean);
  const traits = authoredTraits(runtimeCard)
    .filter((trait) => !hiddenTraits.has(trait))
    .filter((trait) => !/^POISON_\d+$/iu.test(trait))
    .map((trait) => TRAIT_LABELS[trait] ?? trait);
  const poison = [
    ...authoredTraits(runtimeCard)
      .map((trait) => String(trait).match(/^POISON_(\d+)$/iu)?.[1]),
    ...(runtimeCard.abilities ?? [])
      .map((ability) => String(ability.customHandler ?? "").match(/^toxic_(\d+)$/iu)?.[1]),
  ]
    .filter((amount, index, amounts) => Boolean(amount) && amounts.indexOf(amount) === index)
    .map((amount) => `Veneno ${amount}`);
  const visibleTraits = [...traits, ...poison];
  const traitLines = presentation.groupTraits && visibleTraits.length > 0
    ? [`${visibleTraits.join(". ")}.`]
    : visibleTraits;

  const lines = presentation.traitPlacement === "after-first-rule" && rules.length > 0
    ? [rules[0], ...traitLines, ...rules.slice(1)]
    : [...traitLines, ...rules];
  return lines.join("\n") || "Sin efecto adicional.";
}

/*
 * Encuadre de arte y motivo. Ambos son presentación pura: viven en studio.config.json,
 * nunca en el JSON runtime. Un valor por defecto no se emite, de modo que una carta sin
 * ajustar produce exactamente el mismo HTML —y el mismo PNG— que antes de existir esta feature.
 */
const MOTIF_SLOTS = Object.freeze(["head", "gem", "band", "stats"]);

function finiteNumber(label, value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}: debe ser un número finito, se recibió ${JSON.stringify(value)}.`);
  }
  return value;
}

function normalizeArtFrame(label, raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: artFrame debe ser un objeto {zoom, x, y}.`);
  }
  const unknown = Object.keys(raw).filter((key) => !["zoom", "x", "y"].includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label}: artFrame no reconoce ${unknown.join(", ")}.`);
  }
  const zoom = finiteNumber(`${label}.artFrame.zoom`, raw.zoom, 1);
  if (zoom <= 0) throw new Error(`${label}: artFrame.zoom debe ser mayor que 0.`);
  const x = finiteNumber(`${label}.artFrame.x`, raw.x, 0);
  const y = finiteNumber(`${label}.artFrame.y`, raw.y, 0);
  if (zoom === 1 && x === 0 && y === 0) return null;
  return { zoom, x, y };
}

function normalizeMotif(deckId, raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${deckId}: motif debe ser un objeto con slots ${MOTIF_SLOTS.join(", ")}.`);
  }
  const unknown = Object.keys(raw).filter((slot) => !MOTIF_SLOTS.includes(slot));
  if (unknown.length > 0) {
    throw new Error(`${deckId}: motif no reconoce el slot ${unknown.join(", ")}.`);
  }
  const motif = {};
  for (const slot of MOTIF_SLOTS) {
    const value = raw[slot];
    if (value === undefined || value === null) continue;
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${deckId}: motif.${slot} debe ser un objeto {x, y, size}.`);
    }
    const unknownKeys = Object.keys(value).filter((key) => !["x", "y", "size"].includes(key));
    if (unknownKeys.length > 0) {
      throw new Error(`${deckId}: motif.${slot} no reconoce ${unknownKeys.join(", ")}.`);
    }
    const x = finiteNumber(`${deckId}.motif.${slot}.x`, value.x, 0);
    const y = finiteNumber(`${deckId}.motif.${slot}.y`, value.y, 0);
    const size = value.size === undefined || value.size === null
      ? null
      : finiteNumber(`${deckId}.motif.${slot}.size`, value.size, null);
    if (size !== null && size <= 0) {
      throw new Error(`${deckId}: motif.${slot}.size debe ser un ancho en px mayor que 0.`);
    }
    if (x === 0 && y === 0 && size === null) continue;
    motif[slot] = { x, y, ...(size === null ? {} : { size }) };
  }
  return Object.keys(motif).length > 0 ? motif : null;
}

export function studioMotif(deckId) {
  const { config } = loadStudioConfig(deckId);
  return normalizeMotif(deckId, config.motif);
}

function validatePresentationCards(deckId, cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`${deckId}: studio.config.json debe declarar cards[].`);
  }
  const ids = new Set();
  for (const card of cards) {
    if (!card?.id || ids.has(card.id)) {
      throw new Error(`${deckId}: id de presentación ausente o duplicado: ${card?.id ?? "(vacío)"}.`);
    }
    ids.add(card.id);
  }
}

export function loadStudioConfig(deckId) {
  const paths = deckPaths(deckId);
  const config = readJson(paths.config);
  if (config.schemaVersion !== "1.0.0") {
    throw new Error(`${deckId}: schemaVersion de estudio no soportada: ${config.schemaVersion}.`);
  }
  validatePresentationCards(deckId, config.cards);
  return { config, paths };
}

export function buildStudioCards(deckId) {
  const { config, paths } = loadStudioConfig(deckId);
  if (config.previewOnly) {
    return config.cards.map((card) => {
      const artFrame = normalizeArtFrame(`${deckId}/${card.id}`, card.artFrame);
      const { artFrame: _ignored, ...rest } = card;
      return { ...rest, ...(artFrame ? { art_frame: artFrame } : {}) };
    });
  }
  if (!config.runtimeDeck) throw new Error(`${deckId}: falta runtimeDeck.`);

  const runtimePath = path.resolve(paths.directory, config.runtimeDeck);
  const runtimeDeck = readJson(runtimePath);
  const imageManifestPath = runtimePath.replace(/\.json$/u, "_images.json");
  const imageManifest = fs.existsSync(imageManifestPath)
    ? readJson(imageManifestPath)
    : { cards: {} };
  const runtimeById = new Map((runtimeDeck.cards ?? []).map((card) => [card.id, card]));
  if (runtimeById.size !== config.cards.length) {
    throw new Error(
      `${deckId}: runtime contiene ${runtimeById.size} cartas y presentación ${config.cards.length}.`,
    );
  }

  const hiddenTraits = new Set(config.hiddenTraits ?? []);
  const cards = config.cards.map((presentation) => {
    const runtimeCard = runtimeById.get(presentation.id);
    if (!runtimeCard) {
      throw new Error(`${deckId}: ${presentation.id} no existe en ${relative(runtimePath)}.`);
    }
    if (Object.hasOwn(presentation, "nameEs")) {
      throw new Error(
        `${deckId}/${presentation.id}: nameEs duplicaría el nombre del JSON runtime. Corrige displayNameEs.`,
      );
    }
    if (Object.hasOwn(presentation, "flavorTextEs") || Object.hasOwn(presentation, "lore")) {
      throw new Error(
        `${deckId}/${presentation.id}: el flavor debe vivir únicamente en flavorText del JSON runtime.`,
      );
    }
    const artFrame = normalizeArtFrame(`${deckId}/${presentation.id}`, presentation.artFrame);
    const runtimeFlavor = String(runtimeCard.flavorText?.es ?? "").trim();
    if (!runtimeFlavor) {
      throw new Error(`${deckId}/${presentation.id}: falta flavorText.es en el JSON runtime.`);
    }
    if (typeof runtimeCard.showFlavorText !== "boolean") {
      throw new Error(`${deckId}/${presentation.id}: showFlavorText debe ser booleano en el JSON runtime.`);
    }
    if (!/^HFA1\d{3}$/u.test(String(runtimeCard.collectorId ?? ""))) {
      throw new Error(
        `${deckId}/${presentation.id}: collectorId debe usar el formato HFA1 + tres dígitos.`,
      );
    }
    const artist = String(presentation.artist ?? config.defaultArtist ?? "").trim();
    if (!artist) {
      throw new Error(`${deckId}/${presentation.id}: falta el crédito de arte.`);
    }
    const isToken = authoredIsToken(runtimeCard);
    const isChronicle = authoredIsChronicle(runtimeCard);
    const isEnergy = authoredIsEnergy(runtimeCard);
    const fullArt = isChronicle
      || isEnergy
      || (isToken && imageManifest.cards?.[runtimeCard.id]?.fullArt === true);
    return {
      id: runtimeCard.id,
      collectorId: runtimeCard.collectorId,
      artist,
      art_crop: presentation.artCrop,
      nombre: runtimeCard.displayNameEs ?? runtimeCard.name,
      tipo: presentation.typeLineEs,
      costo: authoredEnergyAmount(runtimeCard),
      atk: runtimeCard.power ?? null,
      def: authoredEndurance(runtimeCard),
      desc: visibleRules(runtimeCard, presentation, hiddenTraits),
      lore: runtimeFlavor,
      showFlavorText: runtimeCard.showFlavorText,
      cantidad: runtimeCard.quantity,
      ...(isToken ? { isToken: true } : {}),
      ...(isChronicle ? { isChronicle: true } : {}),
      ...(isEnergy ? { isEnergy: true } : {}),
      ...(fullArt ? { fullArt: true } : {}),
      ...(artFrame ? { art_frame: artFrame } : {}),
    };
  });

  const missingPresentation = [...runtimeById.keys()].filter(
    (id) => !cards.some((card) => card.id === id),
  );
  if (missingPresentation.length > 0) {
    throw new Error(`${deckId}: faltan datos de presentación para ${missingPresentation.join(", ")}.`);
  }
  return cards;
}

export function generatedStudioData(deckId) {
  const cards = buildStudioCards(deckId);
  const motif = studioMotif(deckId);
  return [
    "/* Generado por scripts/card-studio-data.mjs. No editar a mano. */",
    `window.HostfallDeckData = ${JSON.stringify(cards, null, 2)};`,
    ...(motif ? [`window.HostfallDeckMotif = ${JSON.stringify(motif, null, 2)};`] : []),
    "",
  ].join("\n");
}

export function syncStudioData({ check = false, deckIds = Object.keys(STUDIO_DECKS) } = {}) {
  const stale = [];
  for (const deckId of deckIds) {
    const { paths } = loadStudioConfig(deckId);
    const expected = generatedStudioData(deckId);
    const current = fs.existsSync(paths.generatedData)
      ? fs.readFileSync(paths.generatedData, "utf8")
      : null;
    if (current === expected) continue;
    stale.push(relative(paths.generatedData));
    if (!check) fs.writeFileSync(paths.generatedData, expected);
  }
  return stale;
}

export function studioSourceFiles(deckId) {
  const { config, paths } = loadStudioConfig(deckId);
  const sourceFiles = [
    paths.config,
    paths.generatedData,
    paths.index,
    absolute("dev/tools/Decks/export_cards.cjs"),
    absolute("scripts/card-studio-data.mjs"),
    absolute("public/fonts/last-rain/cinzel-decorative-latin.woff2"),
    absolute("public/fonts/last-rain/cinzel-latin.woff2"),
    absolute("public/fonts/last-rain/lora-italic-latin.woff2"),
    absolute("public/fonts/last-rain/lora-normal-latin.woff2"),
    absolute("public/fonts/last-rain/oswald-latin.woff2"),
    absolute("public/fonts/last-rain/outfit-latin.woff2"),
  ];
  if (config.runtimeDeck) {
    const runtimePath = path.resolve(paths.directory, config.runtimeDeck);
    sourceFiles.push(runtimePath);
    const imageManifestPath = runtimePath.replace(/\.json$/u, "_images.json");
    if (fs.existsSync(imageManifestPath)) sourceFiles.push(imageManifestPath);
  }

  sourceFiles.push(
    absolute("dev/tools/Decks/deck-card-studio.css"),
    absolute("dev/tools/Decks/deck-card-studio.js"),
    absolute("dev/tools/Decks/deck-card-text.js"),
  );
  const motif = deckId === "crimson_court"
    ? "motivo.jpg"
    : deckId === "hunters"
      ? "motivo.webp"
      : "motivo.avif";
  sourceFiles.push(path.join(paths.directory, motif));

  const cards = buildStudioCards(deckId);
  for (const card of cards) {
    if (!card.art_crop) {
      throw new Error(
        `${deckId}/${card.id}: todavía no tiene arte. Cárgalo desde el estudio antes de exportar.`,
      );
    }
    if (/^https?:/iu.test(card.art_crop)) {
      throw new Error(`${deckId}/${card.id}: el arte debe ser local: ${card.art_crop}.`);
    }
    sourceFiles.push(path.resolve(paths.directory, card.art_crop));
  }
  const unique = [...new Set(sourceFiles.map((file) => path.resolve(file)))].sort();
  for (const file of unique) {
    if (!fs.existsSync(file)) throw new Error(`${deckId}: falta la entrada ${relative(file)}.`);
  }
  return unique;
}

function runCli() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const write = args.has("--write");
  if (check === write) {
    throw new Error("Usa exactamente uno de estos modos: --check o --write.");
  }
  const deckIds = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"));
  const stale = syncStudioData({
    check,
    deckIds: deckIds.length > 0 ? deckIds : Object.keys(STUDIO_DECKS),
  });
  if (check && stale.length > 0) {
    console.error("Datos generados desactualizados:");
    for (const file of stale) console.error(`- ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    stale.length === 0
      ? "Los datos de los estudios están actualizados."
      : `Se actualizaron ${stale.length} archivo(s) generado(s).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
