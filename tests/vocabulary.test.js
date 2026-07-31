import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { DECK_REGISTRY } from "../src/data/decks";
import { localizedTypeLine } from "../src/i18n/cardLocalization";
import { canonicalizeRulesText } from "../src/i18n/rulesText";
import { translationValues } from "../src/i18n/translations";

const LEGACY_VISIBLE_TERM = /(?:\b(?:horde|mana|lands?|creatures?|artifacts?|enchantments?|sorcer(?:y|ies)|instants?|librar(?:y|ies)|battlefields?|graveyards?|exile[ds]?|untap(?:ped|s|ping)?|tap(?:ped|s|ping)?|menace|reach|vigilance|deathtouch|first strike|skulk|trample|haste|lifesteal|toxic|toughness|mill(?:ed|s|ing)?|creates?)\b|\b(?:horda|maná|tierras?|criaturas?|artefactos?|encantamientos?|conjuros?|instantáneos?|bibliotecas?|cementerios?|exilio|amenaza|alcance|vigilancia|escurridizo|arrollar|prisa|tóxico|resistencia|crea|crear)\b|campo de batalla|toque mortal|dañar primero|robo de vida|mareo de invocación)/iu;

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
