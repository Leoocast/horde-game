import test from "node:test";
import assert from "node:assert/strict";
import { lintDecks } from "../src/data/deckLint";
import { DECK_REGISTRY } from "../src/data/decks";
import { adaptHostfallDeck, HOSTFALL_DECK_SCHEMA_VERSION } from "../src/data/hostfallDeckAdapter";

const RETIRED_HOSTFALL_KEYS = new Set([
  "cardTypes",
  "colorIdentity",
  "colors",
  "keywords",
  "mana",
  "manaCost",
  "manaValue",
  "requiresNoSummoningSickness",
  "tap",
  "toughness",
]);

function assertNoLegacyAuthoring(value, path = "deck") {
  if (Array.isArray(value)) {
    return value.forEach((item, index) => assertNoLegacyAuthoring(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(RETIRED_HOSTFALL_KEYS.has(key), false, `${path}.${key} is a legacy authoring field`);
    assertNoLegacyAuthoring(nested, `${path}.${key}`);
  }
}

test("every deck ability is either fully engine-supported or explicitly marked", () => {
  const { errors } = lintDecks();
  const details = errors
    .map((issue) => `${issue.deckId} / ${issue.cardId} / ${issue.abilityId}: ${issue.message}`)
    .join("\n");
  assert.equal(errors.length, 0, `Deck lint found silent gaps:\n${details}`);
});

test("pending abilities are reported as WIP, not as errors", () => {
  const { reports } = lintDecks();
  for (const report of reports) {
    for (const row of report.cards) {
      if (row.pending.length > 0) assert.equal(row.status, "partial");
    }
  }
});

test("Mono Green is authored in Hostfall schema and adapts to the current engine", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "mono_green_ramp");
  assert.ok(entry);
  assert.equal(entry.raw.schemaVersion, HOSTFALL_DECK_SCHEMA_VERSION);
  assert.equal(entry.raw.side, "CHRONICLER");

  assertNoLegacyAuthoring(entry.raw);
  assert.doesNotMatch(
    JSON.stringify(entry.raw),
    /"(?:ADD_MANA|BATTLEFIELD|ENTERS_BATTLEFIELD|INSTANT|SORCERY|WHILE_SOURCE_ON_BATTLEFIELD|DEATHTOUCH|REACH|TRAMPLE|TOXIC_\d+)"/u,
  );

  const adapted = adaptHostfallDeck(entry.raw);
  const byId = Object.fromEntries(adapted.cards.map((card) => [card.id, card]));
  assert.deepEqual(byId.ichorspit_basilisk.keywords, ["DEATHTOUCH", "TOXIC_1"]);
  assert.deepEqual(byId.colossadactyl.keywords, ["REACH", "TRAMPLE"]);
  assert.deepEqual(byId.cosmic_hunger.cardTypes, ["Instant"]);
  assert.deepEqual(byId.ruthless_predation.cardTypes, ["Sorcery"]);
  assert.deepEqual(byId.forest.cardTypes, ["Land"]);
  assert.equal(byId.colossadactyl.manaCost, "{4}");
  assert.equal(byId.colossadactyl.manaValue, 4);
  assert.equal(byId.colossadactyl.toughness, 5);

  const energyAction = byId.llanowar_elves.abilities[0];
  assert.deepEqual(energyAction.cost, { tap: true });
  assert.deepEqual(energyAction.effects[0], { type: "ADD_MANA", player: "SELF", mana: { G: 1 } });

  const brokenWingsFilter = byId.broken_wings.abilities[0].targets[0].filters;
  assert.deepEqual(brokenWingsFilter.anyOf, [
    { cardTypes: ["Artifact"] },
    { cardTypes: ["Enchantment"] },
    { cardTypes: ["Creature"], keywords: ["FLYING"] },
  ]);
});

test("Vampires are authored in Hostfall schema and adapt to the current engine", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "vampire_chronicle_preview");
  assert.ok(entry);
  assert.equal(entry.raw.schemaVersion, HOSTFALL_DECK_SCHEMA_VERSION);
  assert.equal(entry.raw.side, "CHRONICLER");
  assertNoLegacyAuthoring(entry.raw);
  assert.doesNotMatch(
    JSON.stringify(entry.raw),
    /"(?:ADD_MANA|BATTLEFIELD|INSTANT|SORCERY|WHILE_SOURCE_ON_BATTLEFIELD|SOURCE_IS_UNTAPPED|DEATHTOUCH|LIFESTEAL|REACH|VIGILANCE|Creature|Instant|Land|Legendary|PLAYER|Sorcery)"/u,
  );

  const rawById = Object.fromEntries(entry.raw.cards.map((card) => [card.id, card]));
  assert.deepEqual(rawById.eternal_feast_countess.modifiers, ["CHRONICLE"]);
  assert.deepEqual(rawById.eternal_feast_countess.traits, ["FLYING", "ALERT"]);
  assert.equal(rawById.eternal_feast_countess.abilities[0].effects[0].keyword, "DRAIN");
  assert.equal(rawById.blood_page.abilities[0].conditions[1].type, "SOURCE_IS_READY");

  const adapted = adaptHostfallDeck(entry.raw);
  const byId = Object.fromEntries(adapted.cards.map((card) => [card.id, card]));
  assert.deepEqual(byId.eternal_feast_countess.cardTypes, ["Legendary", "Creature"]);
  assert.deepEqual(byId.eternal_feast_countess.keywords, ["FLYING", "VIGILANCE"]);
  assert.equal(byId.eternal_feast_countess.abilities[0].effects[0].keyword, "LIFESTEAL");
  assert.equal(byId.blood_page.abilities[0].conditions[1].type, "SOURCE_IS_UNTAPPED");
  assert.deepEqual(byId.crimson_impulse.cardTypes, ["Instant"]);
  assert.deepEqual(byId.blood_pact.cardTypes, ["Sorcery"]);
  assert.deepEqual(byId.crimson_energy.cardTypes, ["Land"]);
  assert.equal(byId.court_duelist.requiresNoSummoningSickness, undefined);
  assert.equal(byId.court_duelist.abilities[0].requiresNoSummoningSickness, true);
  assert.deepEqual(byId.tithe_acolyte.abilities[0].cost, { tap: true, life: 5 });
  assert.deepEqual(byId.tithe_acolyte.abilities[0].effects[0], {
    type: "ADD_MANA",
    player: "SELF",
    mana: { G: 1 },
  });
});
