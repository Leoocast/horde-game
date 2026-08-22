import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GAME_ART_DATA_PATH = path.join(ROOT, "src", "data", "cardStudioGameArt.generated.json");
export const BATTLEFIELD_ART_VIEWPORT = Object.freeze({ width: 488, height: 434 });
export const DEFAULT_STUDIO_LANGUAGE = "es";
export const STUDIO_LANGUAGES = Object.freeze({
  es: Object.freeze({ code: "es", label: "Español", htmlLang: "es" }),
  en: Object.freeze({ code: "en", label: "English", htmlLang: "en" }),
});

export const STUDIO_DECKS = Object.freeze({
  pact_of_elarion: {
    directory: "dev/tools/Decks/pact_of_elarion",
    publicDirectory: "public/cards/pact_of_elarion",
  },
  uprising_of_the_graveless: {
    directory: "dev/tools/Decks/uprising_of_the_graveless",
    publicDirectory: "public/cards/uprising_of_the_graveless",
  },
  legion_of_varka: {
    directory: "dev/tools/Decks/legion_of_varka",
    publicDirectory: "public/cards/legion_of_varka",
  },
  court_of_the_crimson_eclipse: {
    directory: "dev/tools/Decks/court_of_the_crimson_eclipse",
    publicDirectory: "public/cards/court_of_the_crimson_eclipse",
  },
  hunters: {
    directory: "dev/tools/Decks/hunters",
    publicDirectory: "public/cards/hunters",
    previewOnly: true,
  },
});

const TRAIT_LABELS = Object.freeze({
  es: Object.freeze({
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
  }),
  en: Object.freeze({
    ALERT: "Alert",
    DAUNTING: "Daunting",
    DEATHTOUCH: "Lethal",
    DRAIN: "Drain",
    FIRST_STRIKE: "Reflex",
    FLYING: "Flying",
    FURTIVE: "Furtive",
    HASTE: "Impetus",
    IMPETUS: "Impetus",
    LETHAL: "Lethal",
    LIFESTEAL: "Drain",
    MENACE: "Daunting",
    OVERFLOW: "Overflow",
    REACH: "Skyguard",
    REFLEX: "Reflex",
    SKYGUARD: "Skyguard",
    SKULK: "Furtive",
    TRAMPLE: "Overflow",
    VIGILANCE: "Alert",
  }),
});

export function studioLanguagesForDeck(deckId) {
  const definition = STUDIO_DECKS[deckId];
  if (!definition) {
    throw new Error(`Estudio desconocido "${deckId}". Usa: ${Object.keys(STUDIO_DECKS).join(", ")}.`);
  }
  return definition.previewOnly ? [DEFAULT_STUDIO_LANGUAGE] : Object.keys(STUDIO_LANGUAGES);
}

export function resolveStudioLanguage(deckId, value = DEFAULT_STUDIO_LANGUAGE) {
  const language = String(value || DEFAULT_STUDIO_LANGUAGE).trim().toLowerCase();
  if (!Object.hasOwn(STUDIO_LANGUAGES, language)) {
    throw new Error(
      `Idioma de cartas desconocido "${language}". Usa: ${Object.keys(STUDIO_LANGUAGES).join(", ")}.`,
    );
  }
  if (!studioLanguagesForDeck(deckId).includes(language)) {
    throw new Error(`${deckId} todavía no tiene contenido de cartas en ${language}.`);
  }
  return language;
}

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

function initialPlusOneCounterAmount(card) {
  return (card.entersWithCounters ?? [])
    .filter((entry) => entry.counterType === "+1/+1")
    .reduce((total, entry) => total + Number(entry.amount ?? 0), 0);
}

function printedPower(card) {
  return card.power === null || card.power === undefined
    ? null
    : card.power + initialPlusOneCounterAmount(card);
}

function printedEndurance(card) {
  const endurance = authoredEndurance(card);
  return endurance === null
    ? null
    : endurance + initialPlusOneCounterAmount(card);
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
    gameArtConfig: path.join(directory, "game-art.config.json"),
    generatedData: path.join(directory, "deck-data.generated.js"),
    index: path.join(directory, "index.html"),
    publicDirectory: absolute(definition.publicDirectory),
  };
}

function energySymbols(text, language) {
  const pattern = language === "en"
    ? /Add (\d+) Energy/giu
    : /Agrega (\d+) de Energía/giu;
  return text.replace(pattern, (_match, rawAmount) => {
    const amount = Number(rawAmount);
    const verb = language === "en"
      ? (_match.startsWith("A") ? "Add" : "add")
      : (_match.startsWith("A") ? "Agrega" : "agrega");
    return amount > 0 && Number.isSafeInteger(amount)
      ? `${verb} ${"{E}".repeat(amount)}`
      : _match;
  });
}

function localizedCardName(runtimeCard, language) {
  const explicit = runtimeCard.localizedNames?.[language];
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (language === "en") return String(runtimeCard.name ?? "").trim();
  if (language === "es") {
    return String(runtimeCard.displayNameEs ?? runtimeCard.name ?? "").trim();
  }
  return "";
}

function englishTypeLine(runtimeCard) {
  const kinds = runtimeCard.kinds ?? [];
  const subtypes = (runtimeCard.subtypes ?? []).join(" ");
  let type = "Card";
  if (kinds.includes("ECHO")) {
    type = authoredIsChronicle(runtimeCard) ? "Chronicle Echo" : "Echo";
    if (authoredIsToken(runtimeCard)) type += " · Token";
  } else if (kinds.includes("SOURCE")) {
    type = "Source";
  } else if (kinds.includes("SUPPORT")) {
    type = "Support";
  } else if (kinds.includes("SPELL")) {
    type = runtimeCard.modifiers?.includes("QUICK") ? "Spell · Quick" : "Spell";
  }
  return subtypes && !kinds.includes("SPELL") && !kinds.includes("SUPPORT")
    ? `${type} — ${subtypes}`
    : type;
}

function localizedTypeLine(runtimeCard, presentation, language) {
  const explicit = presentation.typeLines?.[language];
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (language === "en") return englishTypeLine(runtimeCard);
  if (language === "es") return String(presentation.typeLineEs ?? "").trim();
  return "";
}

function visibleRules(runtimeCard, presentation, hiddenTraits, language) {
  if (Object.hasOwn(presentation, "rulesTextEs")) {
    throw new Error(
      `${runtimeCard.id}: rulesTextEs duplicaría las reglas del JSON runtime. Corrige gameText.es.`,
    );
  }

  const rawRules = energySymbols(String(runtimeCard.gameText?.[language] ?? "").trim(), language);
  const rules = /^(?:Sin efecto (?:activo )?adicional|No additional effect)\.$/iu.test(rawRules)
    ? []
    : rawRules.split("\n").filter(Boolean);
  const traitLabels = TRAIT_LABELS[language] ?? {};
  const traits = authoredTraits(runtimeCard)
    .filter((trait) => !hiddenTraits.has(trait))
    .filter((trait) => !/^POISON_\d+$/iu.test(trait))
    .map((trait) => traitLabels[trait] ?? trait);
  const poison = [
    ...authoredTraits(runtimeCard)
      .map((trait) => String(trait).match(/^POISON_(\d+)$/iu)?.[1]),
    ...(runtimeCard.abilities ?? [])
      .map((ability) => String(ability.customHandler ?? "").match(/^toxic_(\d+)$/iu)?.[1]),
  ]
    .filter((amount, index, amounts) => Boolean(amount) && amounts.indexOf(amount) === index)
    .map((amount) => `${language === "en" ? "Poison" : "Veneno"} ${amount}`);
  const visibleTraits = [...traits, ...poison];
  const traitLines = presentation.groupTraits && visibleTraits.length > 0
    ? [`${visibleTraits.join(". ")}.`]
    : visibleTraits;

  const lines = presentation.traitPlacement === "after-first-rule" && rules.length > 0
    ? [rules[0], ...traitLines, ...rules.slice(1)]
    : [...traitLines, ...rules];
  return lines.join("\n") || (language === "en" ? "No additional effect." : "Sin efecto adicional.");
}

/*
 * Encuadre de arte y motivo. Ambos son presentación pura: viven en studio.config.json,
 * nunca en el JSON runtime. Un valor por defecto no se emite, de modo que una carta sin
 * ajustar produce exactamente el mismo HTML —y el mismo PNG— que antes de existir esta feature.
 */
const MOTIF_SLOTS = Object.freeze(["head", "band", "stats"]);

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
      throw new Error(`${deckId}: motif.${slot} debe ser un objeto {x, y, zoom, rotation}.`);
    }
    const unknownKeys = Object.keys(value).filter(
      (key) => !["x", "y", "zoom", "rotation"].includes(key),
    );
    if (unknownKeys.length > 0) {
      throw new Error(`${deckId}: motif.${slot} no reconoce ${unknownKeys.join(", ")}.`);
    }
    const x = finiteNumber(`${deckId}.motif.${slot}.x`, value.x, 0);
    const y = finiteNumber(`${deckId}.motif.${slot}.y`, value.y, 0);
    const zoom = finiteNumber(`${deckId}.motif.${slot}.zoom`, value.zoom, 1);
    const rotation = finiteNumber(`${deckId}.motif.${slot}.rotation`, value.rotation, 0);
    if (zoom < 0.2 || zoom > 4) {
      throw new Error(`${deckId}: motif.${slot}.zoom debe estar entre 0.2 y 4.`);
    }
    if (rotation < -180 || rotation > 180) {
      throw new Error(`${deckId}: motif.${slot}.rotation debe estar entre -180 y 180.`);
    }
    if (x === 0 && y === 0 && zoom === 1 && rotation === 0) continue;
    motif[slot] = {
      x,
      y,
      ...(zoom === 1 ? {} : { zoom }),
      ...(rotation === 0 ? {} : { rotation }),
    };
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
    resolveStudioFullArt(`${deckId}/${card.id}`, card, false);
    resolveStudioHeaderFade(`${deckId}/${card.id}`, card, true);
    ids.add(card.id);
  }
}

export function normalizeBattlefieldArtFrame(label, raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: battlefieldArtFrame debe ser un objeto {zoom, x, y}.`);
  }
  const unknown = Object.keys(raw).filter((key) => !["zoom", "x", "y"].includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label}: battlefieldArtFrame no reconoce ${unknown.join(", ")}.`);
  }
  const zoom = finiteNumber(`${label}.battlefieldArtFrame.zoom`, raw.zoom, 1);
  const x = finiteNumber(`${label}.battlefieldArtFrame.x`, raw.x, 0);
  const y = finiteNumber(`${label}.battlefieldArtFrame.y`, raw.y, 0);
  if (zoom < 0.2 || zoom > 4) {
    throw new Error(`${label}: battlefieldArtFrame.zoom debe estar entre 0.2 y 4.`);
  }
  if (x < -BATTLEFIELD_ART_VIEWPORT.width || x > BATTLEFIELD_ART_VIEWPORT.width) {
    throw new Error(
      `${label}: battlefieldArtFrame.x debe estar entre -${BATTLEFIELD_ART_VIEWPORT.width} y ${BATTLEFIELD_ART_VIEWPORT.width}.`,
    );
  }
  if (y < -BATTLEFIELD_ART_VIEWPORT.height || y > BATTLEFIELD_ART_VIEWPORT.height) {
    throw new Error(
      `${label}: battlefieldArtFrame.y debe estar entre -${BATTLEFIELD_ART_VIEWPORT.height} y ${BATTLEFIELD_ART_VIEWPORT.height}.`,
    );
  }
  if (zoom === 1 && x === 0 && y === 0) return null;
  return { zoom, x, y };
}

export function normalizeGameArtConfig(deckId, raw, knownCardIds) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${deckId}: game-art.config.json debe ser un objeto.`);
  }
  if (raw.schemaVersion !== "1.0.0") {
    throw new Error(
      `${deckId}: schemaVersion de game-art.config.json no soportada: ${raw.schemaVersion}.`,
    );
  }
  if (!raw.cards || typeof raw.cards !== "object" || Array.isArray(raw.cards)) {
    throw new Error(`${deckId}: game-art.config.json debe declarar cards como objeto.`);
  }
  const known = new Set(knownCardIds);
  const cards = {};
  for (const [cardId, entry] of Object.entries(raw.cards)) {
    if (!known.has(cardId)) {
      throw new Error(`${deckId}: game-art.config.json contiene la carta desconocida ${cardId}.`);
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${deckId}/${cardId}: la entrada de game-art debe ser un objeto.`);
    }
    const unknown = Object.keys(entry).filter((key) => key !== "battlefieldArtFrame");
    if (unknown.length > 0) {
      throw new Error(`${deckId}/${cardId}: game-art no reconoce ${unknown.join(", ")}.`);
    }
    const frame = normalizeBattlefieldArtFrame(
      `${deckId}/${cardId}`,
      entry.battlefieldArtFrame,
    );
    if (frame) cards[cardId] = { battlefieldArtFrame: frame };
  }
  return { schemaVersion: "1.0.0", cards };
}

export function resolveStudioFullArt(label, presentation, fallback) {
  if (!Object.hasOwn(presentation, "fullArt")) return Boolean(fallback);
  if (typeof presentation.fullArt !== "boolean") {
    throw new Error(`${label}: fullArt debe ser booleano.`);
  }
  return presentation.fullArt;
}

export function resolveStudioHeaderFade(label, presentation, fallback = true) {
  if (!Object.hasOwn(presentation, "headerFade")) return Boolean(fallback);
  if (typeof presentation.headerFade !== "boolean") {
    throw new Error(`${label}: headerFade debe ser booleano.`);
  }
  return presentation.headerFade;
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

export function studioBattlefieldArtKinds(deckId) {
  const { config, paths } = loadStudioConfig(deckId);
  if (config.previewOnly) {
    return Object.fromEntries(config.cards.map((card) => [card.id, null]));
  }
  if (!config.runtimeDeck) throw new Error(`${deckId}: falta runtimeDeck.`);

  const runtimePath = path.resolve(paths.directory, config.runtimeDeck);
  const runtimeDeck = readJson(runtimePath);
  const runtimeById = new Map((runtimeDeck.cards ?? []).map((card) => [card.id, card]));
  return Object.fromEntries(config.cards.map((presentation) => {
    const runtimeCard = runtimeById.get(presentation.id);
    if (!runtimeCard) {
      throw new Error(`${deckId}: ${presentation.id} no existe en ${relative(runtimePath)}.`);
    }
    const kinds = runtimeCard.kinds ?? [];
    const battlefieldKind = kinds.includes("SUPPORT")
      ? "support"
      : kinds.includes("ECHO")
        ? "echo"
        : null;
    return [presentation.id, battlefieldKind];
  }));
}

export function loadGameArtConfig(deckId) {
  const paths = deckPaths(deckId);
  const { config: studioConfig } = loadStudioConfig(deckId);
  const config = normalizeGameArtConfig(
    deckId,
    readJson(paths.gameArtConfig),
    studioConfig.cards.map((card) => card.id),
  );
  return { config, paths };
}

function publicArtUrl(deckId, cardId, artCrop, paths) {
  if (!artCrop) throw new Error(`${deckId}/${cardId}: falta artCrop para el juego.`);
  const artPath = path.resolve(paths.directory, artCrop);
  const publicRoot = absolute("public");
  if (artPath !== publicRoot && !artPath.startsWith(publicRoot + path.sep)) {
    throw new Error(`${deckId}/${cardId}: artCrop debe vivir bajo public/.`);
  }
  if (!fs.existsSync(artPath)) {
    throw new Error(`${deckId}/${cardId}: no existe el arte ${relative(artPath)}.`);
  }
  return `/${path.relative(publicRoot, artPath).replaceAll(path.sep, "/")}`;
}

export function studioGameArt(deckId) {
  const { config: studioConfig, paths } = loadStudioConfig(deckId);
  const { config: gameArtConfig } = loadGameArtConfig(deckId);
  const gameEntries = gameArtConfig.cards;
  return Object.fromEntries(studioConfig.cards.map((card) => {
    const artCrop = card.artCrop ?? card.art_crop;
    const frame = gameEntries[card.id]?.battlefieldArtFrame ?? null;
    return [card.id, {
      artUrl: publicArtUrl(deckId, card.id, artCrop, paths),
      ...(frame ? { battlefieldArtFrame: frame } : {}),
    }];
  }));
}

export function generatedGameArtData() {
  const cards = {};
  for (const deckId of Object.keys(STUDIO_DECKS)) {
    for (const [cardId, presentation] of Object.entries(studioGameArt(deckId))) {
      if (Object.hasOwn(cards, cardId)) {
        throw new Error(`El id ${cardId} está duplicado entre estudios.`);
      }
      cards[cardId] = presentation;
    }
  }
  return `${JSON.stringify({ schemaVersion: "1.0.0", cards }, null, 2)}\n`;
}

export function buildStudioCards(deckId, requestedLanguage = DEFAULT_STUDIO_LANGUAGE) {
  const language = resolveStudioLanguage(deckId, requestedLanguage);
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
    const runtimeName = localizedCardName(runtimeCard, language);
    const runtimeTypeLine = localizedTypeLine(runtimeCard, presentation, language);
    const runtimeFlavor = String(runtimeCard.flavorText?.[language] ?? "").trim();
    const runtimeRules = String(runtimeCard.gameText?.[language] ?? "").trim();
    if (!runtimeName) {
      throw new Error(`${deckId}/${presentation.id}: falta el nombre localizado para ${language}.`);
    }
    if (!runtimeTypeLine) {
      throw new Error(`${deckId}/${presentation.id}: falta la línea de tipo para ${language}.`);
    }
    if (!runtimeRules) {
      throw new Error(`${deckId}/${presentation.id}: falta gameText.${language} en el JSON runtime.`);
    }
    if (!runtimeFlavor) {
      throw new Error(`${deckId}/${presentation.id}: falta flavorText.${language} en el JSON runtime.`);
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
    const defaultFullArt = isChronicle
      || isEnergy
      || (isToken && imageManifest.cards?.[runtimeCard.id]?.fullArt === true);
    const fullArt = resolveStudioFullArt(
      `${deckId}/${presentation.id}`,
      presentation,
      defaultFullArt,
    );
    const headerFade = resolveStudioHeaderFade(
      `${deckId}/${presentation.id}`,
      presentation,
      true,
    );
    return {
      id: runtimeCard.id,
      collectorId: runtimeCard.collectorId,
      artist,
      art_crop: presentation.artCrop,
      nombre: runtimeName,
      tipo: runtimeTypeLine,
      costo: authoredEnergyAmount(runtimeCard),
      atk: printedPower(runtimeCard),
      def: printedEndurance(runtimeCard),
      desc: visibleRules(runtimeCard, presentation, hiddenTraits, language),
      lore: runtimeFlavor,
      showFlavorText: runtimeCard.showFlavorText,
      cantidad: runtimeCard.quantity,
      ...(isToken ? { isToken: true } : {}),
      ...(isChronicle ? { isChronicle: true } : {}),
      ...(isEnergy ? { isEnergy: true } : {}),
      ...(fullArt ? { fullArt: true } : {}),
      ...(headerFade ? {} : { headerFade: false }),
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
  const languages = studioLanguagesForDeck(deckId);
  const cardsByLanguage = Object.fromEntries(
    languages.map((language) => [language, buildStudioCards(deckId, language)]),
  );
  const payload = {
    schemaVersion: "1.0.0",
    defaultLanguage: DEFAULT_STUDIO_LANGUAGE,
    languages: languages.map((language) => STUDIO_LANGUAGES[language]),
    cardsByLanguage,
  };
  const motif = studioMotif(deckId);
  return [
    "/* Generado por scripts/card-studio-data.mjs. No editar a mano. */",
    `window.HostfallDeckData = ${JSON.stringify(payload, null, 2)};`,
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
  const expectedGameArt = generatedGameArtData();
  const currentGameArt = fs.existsSync(GAME_ART_DATA_PATH)
    ? fs.readFileSync(GAME_ART_DATA_PATH, "utf8")
    : null;
  if (currentGameArt !== expectedGameArt) {
    stale.push(relative(GAME_ART_DATA_PATH));
    if (!check) fs.writeFileSync(GAME_ART_DATA_PATH, expectedGameArt);
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
    absolute("public/fonts/pact-of-elarion/cinzel-decorative-latin.woff2"),
    absolute("public/fonts/pact-of-elarion/cinzel-latin.woff2"),
    absolute("public/fonts/pact-of-elarion/lora-italic-latin.woff2"),
    absolute("public/fonts/pact-of-elarion/lora-normal-latin.woff2"),
    absolute("public/fonts/pact-of-elarion/oswald-latin.woff2"),
    absolute("public/fonts/pact-of-elarion/outfit-latin.woff2"),
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
  const motif = deckId === "court_of_the_crimson_eclipse"
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
