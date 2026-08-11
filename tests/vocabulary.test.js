import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { DECK_REGISTRY } from "../src/data/decks";
import { localizedTypeLine } from "../src/i18n/cardLocalization";
import { traitVocabularyTooltip } from "../src/i18n/gameVocabulary";
import { canonicalizeRulesText } from "../src/i18n/rulesText";
import { translate, translationValues } from "../src/i18n/translations";

const LEGACY_VISIBLE_TERM = /(?:\b(?:horde|mana|lands?|creatures?|artifacts?|enchantments?|sorcer(?:y|ies)|instants?|librar(?:y|ies)|battlefields?|graveyards?|exile[ds]?|untap(?:ped|s|ping)?|tap(?:ped|s|ping)?|menace|reach|vigilance|deathtouch|first strike|skulk|trample|haste|lifesteal|toxic|mill(?:ed|s|ing)?|creates?)\b|\b(?:horda|maná|tierras?|criaturas?|artefactos?|encantamientos?|conjuros?|instantáneos?|bibliotecas?|cementerios?|exilio|amenaza|alcance|vigilancia|escurridizo|arrollar|prisa|tóxico|resistencia|crea|crear)\b|campo de batalla|toque mortal|dañar primero|robo de vida|mareo de invocación)/iu;

function assertUsesHostfallVocabulary(text, context) {
  assert.doesNotMatch(text, LEGACY_VISIBLE_TERM, `${context}: ${text}`);
}

test("localized interface copy contains no retired public vocabulary", () => {
  for (const language of ["en", "es"]) {
    for (const value of translationValues(language)) {
      assertUsesHostfallVocabulary(value, `${language} translation`);
    }
  }
});

test("the in-game Host counter uses the compact side label", () => {
  assert.equal(translate("en", "game.hostDeck"), "Host");
  assert.equal(translate("es", "game.hostDeck"), "Hueste");
  assert.equal(translate("en", "game.hostArchive"), "Host Archive");
  assert.equal(translate("es", "game.hostArchive"), "Archivo de la Hueste");
});

test("Flying explains that it can defend against other Flying Echoes", () => {
  assert.equal(traitVocabularyTooltip("FLYING", "en"), "Can defend against Echoes with Flying.");
  assert.equal(traitVocabularyTooltip("FLYING", "es"), "Puede defender contra Ecos con Volar.");
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
  const occurrences = sourceFiles
    .filter((file) => /tutorial/i.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(sourceRoot, file));

  assert.deepEqual(occurrences, []);
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
