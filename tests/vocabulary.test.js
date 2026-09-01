import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { DECK_REGISTRY } from "../src/data/decks";
import { localizedTypeLine } from "../src/i18n/cardLocalization";
import { localizedDeckName } from "../src/i18n/deckLocalization";
import { IDENTITY_VOCABULARY, traitVocabularyTooltip } from "../src/i18n/gameVocabulary";
import { canonicalizeLogText, canonicalizeRulesText } from "../src/i18n/rulesText";
import { translate, translationValues } from "../src/i18n/translations";

const LEGACY_VISIBLE_TERM = /(?:\b(?:horde|mana|lands?|creatures?|artifacts?|enchantments?|sorcer(?:y|ies)|instants?|librar(?:y|ies)|battlefields?|graveyards?|exile[ds]?|untap(?:ped|s|ping)?|tap(?:ped|s|ping)?|menace|reach|vigilance|deathtouch|first strike|skulk|trample|haste|lifesteal|toxic|mill(?:ed|s|ing)?|creates?)\b|\b(?:horda|maná|tierras?|criaturas?|artefactos?|encantamientos?|conjuros?|instantáneos?|bibliotecas?|cementerios?|exilio|amenaza|alcance|vigilancia|escurridizo|arrollar|prisa|tóxico|resistencia|crea|crear)\b|campo de batalla|toque mortal|dañar primero|robo de vida|mareo de invocación)/iu;
const RETIRED_CONTINUITY_TERM = /\b(?:chapter|chapters|rewrite|rewrites|rewritten|rewriting|capítulo|capítulos|reescribir|reescribe|reescrito|reescrita|reescritura|reescrituras)\b/iu;

function assertUsesHostfallVocabulary(text, context) {
  assert.doesNotMatch(text, LEGACY_VISIBLE_TERM, `${context}: ${text}`);
}

test("localized interface copy contains no retired public vocabulary", () => {
  for (const language of ["en", "es"]) {
    for (const value of translationValues(language)) {
      assertUsesHostfallVocabulary(value, `${language} translation`);
      assert.doesNotMatch(value, RETIRED_CONTINUITY_TERM, `${language} continuity copy: ${value}`);
    }
  }
});

test("builtin deck identities follow the selected UI language", () => {
  assert.deepEqual(
    DECK_REGISTRY.map((entry) => [
      localizedDeckName(entry.deck, "es"),
      localizedDeckName(entry.deck, "en"),
    ]),
    [
      ["El Pacto de Elarion", "The Pact of Elarion"],
      ["La Corte del Eclipse Carmesí", "The Court of the Crimson Eclipse"],
      ["El Alzamiento de los Sinsepulcro", "The Uprising of the Graveless"],
      ["La Legión de Varka", "The Legion of Varka"],
    ],
  );
});

test("continuity identity has one explicit bilingual term per concept", () => {
  assert.deepEqual(IDENTITY_VOCABULARY, {
    CHRONICLER: { en: "Chronicler", es: "Cronista" },
    CHRONICLE: { en: "Chronicle", es: "Crónica" },
    HOST: { en: "Host", es: "Hueste" },
    INSCRIPTION: { en: "Inscription", es: "Inscripción" },
    FUTURE: { en: "Future", es: "Futuro" },
    VISION: { en: "Vision", es: "Visión" },
    SURGE: { en: "Surge", es: "Estampida" },
  });
  assert.equal("CHAPTER" in IDENTITY_VOCABULARY, false);
});

test("the public flow distinguishes Inscription, Future, Vision, Chronicle and Host", () => {
  assert.equal(translate("en", "threshold.seedLabel"), "Inscription");
  assert.equal(translate("es", "threshold.seedLabel"), "Inscripción");
  assert.equal(translate("en", "setup.prepare"), "Prepare a Future");
  assert.equal(translate("es", "setup.prepare"), "Preparar un Futuro");
  assert.equal(translate("en", "setup.beginChronicle"), "Contemplate This Future");
  assert.equal(translate("es", "setup.beginChronicle"), "Contemplar este Futuro");
  assert.equal(translate("en", "destiny.contemplateThisAgain"), "Contemplate This Future Again");
  assert.equal(translate("es", "destiny.contemplateThisAgain"), "Volver a contemplar este Futuro");
  assert.equal(translate("en", "destiny.seekAnotherFuture"), "Seek Another Future");
  assert.equal(translate("es", "destiny.seekAnotherFuture"), "Buscar otro Futuro");
  assert.equal(translate("en", "seeds.threadLabel"), "Visions of this Future");
  assert.equal(translate("es", "seeds.threadLabel"), "Visiones de este Futuro");
  assert.equal(translate("en", "result.visionPreservesFuture"), "This Vision preserved the Future");
  assert.equal(translate("es", "result.visionPreservesFuture"), "Esta Visión preservó el Futuro");
  assert.equal(translate("en", "setup.chronicleSide"), "Chronicle");
  assert.equal(translate("es", "setup.chronicleSide"), "Crónica");
  assert.equal(translate("en", "setup.playerSide"), "Chronicler");
  assert.equal(translate("es", "setup.playerSide"), "Cronista");
  assert.equal(translate("en", "setup.hostSide"), "Host");
  assert.equal(translate("es", "setup.hostSide"), "Hueste");
});

test("the Vision Record localizes its continuity terms", () => {
  const opening = "Vision begins. Chronicler draws 7 card(s). Preparation turns: 3.";
  const redraw = "Chronicler redraws the opening Hand for the 2nd time and draws 5 card(s).";
  const hostVolley = "Host attack volley deals 3 damage to the Chronicler.";
  assert.equal(canonicalizeLogText(opening, "en"), opening);
  assert.equal(canonicalizeLogText(opening, "es"), "La Visión comienza. El Cronista roba 7 carta(s). Turnos de Preparación: 3.");
  assert.equal(canonicalizeLogText(redraw, "es"), "El Cronista vuelve a robar la Mano inicial por 2.ª vez y roba 5 carta(s).");
  assert.equal(canonicalizeLogText(hostVolley, "es"), "La descarga del ataque de la Hueste hace 3 de daño al Cronista.");
});

test("deprecated Chaos keeps its existing copy outside the continuity homologation", () => {
  assert.equal(translate("en", "setup.prepareChaosAria"), "Prepare Chaos battle");
  assert.equal(translate("es", "setup.prepareChaosAria"), "Preparar batalla de Caos");
  assert.equal(translate("en", "encounter.chaos"), "The chronicle fractures");
  assert.equal(translate("es", "encounter.chaos"), "La crónica se fractura");
});

test("the in-game Host counter uses the compact side label", () => {
  assert.equal(translate("en", "game.hostDeck"), "Host");
  assert.equal(translate("es", "game.hostDeck"), "Hueste");
  assert.equal(translate("en", "game.hostArchive"), "Host Archive");
  assert.equal(translate("es", "game.hostArchive"), "Archivo de la Hueste");
});

test("Flying explains which Echoes may defend against it", () => {
  assert.equal(traitVocabularyTooltip("FLYING", "en"), "Cannot be defended except by an Echo with Flying or Skyguard.");
  assert.equal(traitVocabularyTooltip("FLYING", "es"), "No puede ser defendido excepto por un Eco con Volar o Guardia aérea.");
});

test("every authored card rule and type line has a clean Hostfall presentation", () => {
  for (const entry of DECK_REGISTRY) {
    const definitions = [...(entry.deck.cards ?? []), ...(entry.deck.tokens ?? [])];
    for (const card of definitions) {
      for (const language of ["en", "es"]) {
        assertUsesHostfallVocabulary(localizedTypeLine(card, language), `${entry.deck.id}/${card.id}/${language} type`);
        const authored = card.gameText?.[language] ?? card.gameText?.en;
        if (authored) {
          assertUsesHostfallVocabulary(
            canonicalizeRulesText(authored, language),
            `${entry.deck.id}/${card.id}/${language} rules`,
          );
        }
      }
      if (card.triggerMessage) {
        assertUsesHostfallVocabulary(
          canonicalizeRulesText(card.triggerMessage, "en"),
          `${entry.deck.id}/${card.id} trigger message`,
        );
      }
    }
  }
});

test("the retired tutorial cannot be reintroduced through a dormant source path", () => {
  const sourceRoot = path.resolve("src");
  const sourceFiles = fs.readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
  const relativeFiles = sourceFiles.map((file) => path.relative(sourceRoot, file).replaceAll("\\", "/"));
  const retiredPaths = ["components/TutorialGuide.tsx", "engine/Tutorial.ts"];
  assert.deepEqual(relativeFiles.filter((file) => retiredPaths.includes(file)), []);

  const magicSeedOccurrences = [];
  const retiredCardOccurrences = [];
  for (const file of sourceFiles) {
    const relative = path.relative(sourceRoot, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (/seed/iu.test(line) && /["']tutorial["']/iu.test(line)) {
        magicSeedOccurrences.push(`${relative}:${index + 1}`);
      }
      if (/\b(?:llanowar_elves|beast_kin_ranger)\b/iu.test(line)) {
        retiredCardOccurrences.push(`${relative}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(magicSeedOccurrences, [], "the retired seed-magic path returned");
  assert.deepEqual(retiredCardOccurrences, [], "retired hardcoded tutorial cards returned");
});

test("card images stay local and remote card-provider metadata cannot return", () => {
  const retiredProviderName = ["scry", "fall"].join("");
  const retiredMetadataKeys = new Set([
    retiredProviderName,
    "setCode",
    "collectorNumber",
    "lookupUrl",
    "lookupMode",
    "lookupQuery",
    "imagePath",
    "fallbackImagePath",
    "needsVerification",
    "verificationNote",
  ]);

  function assertNoRetiredMetadata(value, context) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoRetiredMetadata(item, `${context}[${index}]`));
      return;
    }
    for (const [key, nestedValue] of Object.entries(value)) {
      assert.ok(!retiredMetadataKeys.has(key), `${context} still contains ${key}`);
      assertNoRetiredMetadata(nestedValue, `${context}.${key}`);
    }
  }

  for (const entry of DECK_REGISTRY) {
    assert.equal(entry.images.provider, "local", `${entry.deck.id} must use the local image provider`);
    assertNoRetiredMetadata(entry.raw, entry.deck.id);

    const definitions = [...(entry.raw.cards ?? []), ...(entry.raw.tokens ?? [])];
    for (const card of definitions) {
      assert.ok(entry.images.cards[card.id], `${entry.deck.id}/${card.id} has no local image entry`);
    }

    for (const [cardId, image] of Object.entries(entry.images.cards)) {
      assert.equal(image.source, "local", `${entry.deck.id}/${cardId} must use a local image`);
      assert.match(image.imageUrl, /^\/cards\//, `${entry.deck.id}/${cardId} must point inside public/cards`);
      assert.ok(
        fs.existsSync(path.resolve("public", image.imageUrl.slice(1))),
        `${entry.deck.id}/${cardId} points to missing image ${image.imageUrl}`,
      );
      const englishDirectory = entry.images.defaults?.localizedImageDirectories?.en;
      assert.equal(englishDirectory, "en", `${entry.deck.id} must publish English card PNGs under en/`);
      const separator = image.imageUrl.lastIndexOf("/");
      const englishImageUrl = `${image.imageUrl.slice(0, separator + 1)}${englishDirectory}/${image.imageUrl.slice(separator + 1)}`;
      assert.ok(
        fs.existsSync(path.resolve("public", englishImageUrl.slice(1))),
        `${entry.deck.id}/${cardId} points to missing English image ${englishImageUrl}`,
      );
    }
  }

  const scanRoots = [path.resolve("src"), path.resolve("dev", "tools")];
  const retiredProviderPattern = new RegExp(retiredProviderName, "i");
  const providerReferences = scanRoots.flatMap((root) =>
    fs.readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:ts|tsx|js|json|html)$/.test(entry.name))
      .filter((entry) => retiredProviderPattern.test(fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8")))
      .map((entry) => path.relative(process.cwd(), path.join(entry.parentPath, entry.name))),
  );
  assert.deepEqual(providerReferences, []);

  for (const file of [path.resolve("src", "utils", "cardImages.ts"), path.resolve("src", "utils", "deckCardImages.ts")]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//i, `${path.basename(file)} must remain local-only`);
  }
});
