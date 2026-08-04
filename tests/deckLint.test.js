import test from "node:test";
import assert from "node:assert/strict";
import { lintDecks, lintHostfallDeckSchema } from "../src/data/deckLint";
import { DECK_REGISTRY } from "../src/data/decks";
import { HOSTFALL_DECK_SCHEMA_VERSION, normalizeAuthoredDeck } from "../src/data/authoredDeckNormalizer";

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

test("every active card authors print metadata, bilingual flavor and an explicit print flag", () => {
  const collectorOwners = new Map();

  for (const entry of DECK_REGISTRY) {
    for (const card of [...entry.raw.cards, ...(entry.raw.tokens ?? [])]) {
      assert.match(
        card.collectorId,
        /^HFA1\d{3}$/u,
        `${entry.raw.id}/${card.id} lacks a valid Act I collectorId`,
      );
      const previous = collectorOwners.get(card.collectorId);
      assert.ok(
        !previous || previous === `${entry.raw.id}/${card.id}`,
        `${card.collectorId} is shared by ${previous} and ${entry.raw.id}/${card.id}`,
      );
      collectorOwners.set(card.collectorId, `${entry.raw.id}/${card.id}`);
      assert.equal(typeof card.flavorText?.en, "string", `${entry.raw.id}/${card.id} lacks flavorText.en`);
      assert.ok(card.flavorText.en.trim(), `${entry.raw.id}/${card.id} has empty flavorText.en`);
      assert.equal(typeof card.flavorText?.es, "string", `${entry.raw.id}/${card.id} lacks flavorText.es`);
      assert.ok(card.flavorText.es.trim(), `${entry.raw.id}/${card.id} has empty flavorText.es`);
      assert.equal(
        typeof card.showFlavorText,
        "boolean",
        `${entry.raw.id}/${card.id} must declare showFlavorText`,
      );
    }
  }

  assert.deepEqual(
    [...collectorOwners.keys()].sort(),
    Array.from({ length: 61 }, (_, index) => `HFA1${String(index + 1).padStart(3, "0")}`),
    "Act I collector IDs must remain continuous from HFA1001 through HFA1061",
  );
});

test("Hostfall schema rejects unknown version, side and canonical vocabulary", () => {
  const invalid = {
    schemaVersion: "1.0.1",
    id: "invalid",
    name: "Invalid",
    side: "PLAYER",
    cards: [],
  };
  assert.match(lintHostfallDeckSchema(invalid)[0].message, /Unsupported schemaVersion/u);

  const invalidVocabulary = {
    schemaVersion: HOSTFALL_DECK_SCHEMA_VERSION,
    id: "invalid-vocabulary",
    name: "Invalid vocabulary",
    side: "PLAYER",
    cards: [{
      id: "typos",
      name: "Typos",
      energyCost: { amount: 1 },
      kinds: ["ECH0"],
      modifiers: ["QUCIK"],
      traits: ["ALRET", "POISON_ONE"],
      eventObject: "permanent", // audit-allow retired-rules-rejection-fixture
      retiredTarget: { type: "ALL_CREATURES" }, // audit-allow retired-rules-rejection-fixture
      internalRuntimeType: { type: "HOST_GROUP_BUFF" },
      internalRuntimeEvent: { event: "ECHO_INVOKED" },
      nonStringType: { type: 42 },
      nonStringEvent: { event: null },
      activationMode: "HOST_DIRECTIVE",
      selectionRule: "CHEAPEST",
      selection: "PLAYER_CHOOSES", // audit-allow retired-rules-rejection-fixture
      targetPolicy: "FIRST",
      speed: "INSTANT",
      controller: "HORDE",
      abilities: [{
        id: "bad-grant",
        kind: "STATIC",
        zone: "BATTLEGROUND",
        effects: [{ type: "STATIC_GRANT_KEYWORD", keyword: "LETHL" }],
      }, {
        id: "bad-controller-context",
        kind: "SPELL",
        zone: "ARCHIVE",
        targets: [{ id: "target", zone: "FIELD", controller: "HOST" }],
        effects: [{ type: "CREATE_TOKEN", controller: "ANY" }],
      }],
    }],
  };
  const messages = lintHostfallDeckSchema(invalidVocabulary).map((issue) => issue.message).join("\n");
  assert.match(messages, /Unknown side "PLAYER"/u);
  assert.match(messages, /Unknown Hostfall kind "ECH0"/u);
  assert.match(messages, /Unknown Hostfall modifier "QUCIK"/u);
  assert.match(messages, /Unknown Hostfall trait "ALRET"/u);
  assert.match(messages, /Unknown Hostfall trait "POISON_ONE"/u);
  assert.match(messages, /Unknown Hostfall trait "LETHL"/u);
  assert.match(messages, /Unknown Hostfall zone "BATTLEGROUND"/u);
  assert.match(messages, /expected "echo"/u);
  assert.match(messages, /legacy value "ALL_CREATURES"/u); // audit-allow retired-rules-rejection-fixture
  assert.match(messages, /Unknown Hostfall authored type "HOST_GROUP_BUFF"/u);
  assert.match(messages, /Unknown Hostfall authored event "ECHO_INVOKED"/u);
  assert.match(messages, /Unknown Hostfall authored type "42"/u);
  assert.match(messages, /Unknown Hostfall authored event "null"/u);
  assert.match(messages, /Unknown Hostfall activationMode "HOST_DIRECTIVE"/u);
  assert.match(messages, /Unknown Hostfall selectionRule "CHEAPEST"/u);
  assert.match(messages, /Unknown Hostfall selection "PLAYER_CHOOSES"/u); // audit-allow retired-rules-rejection-fixture
  assert.match(messages, /Unknown Hostfall targetPolicy "FIRST"/u);
  assert.match(messages, /Unknown Hostfall speed "INSTANT"/u);
  assert.match(messages, /Unknown Hostfall controller "HORDE"/u);
  assert.match(messages, /Unknown Hostfall controller "HOST" at "card\.abilities\[1\]\.targets\[0\]\.controller"/u);
  assert.match(messages, /Unknown Hostfall controller "ANY" at "card\.abilities\[1\]\.effects\[0\]\.controller"/u);
  assert.match(messages, /non-empty flavorText\.en and flavorText\.es/u);
  assert.match(messages, /showFlavorText as a boolean/u);
});

test("Host rules reject unknown keys, unsafe divisors and malformed profiles", () => {
  const invalidRules = {
    schemaVersion: HOSTFALL_DECK_SCHEMA_VERSION,
    id: "invalid-host-rules",
    name: "Invalid Host rules",
    side: "HOST",
    rulesProfile: {
      revealCount: 0,
      damagePerArchiveDiscard: 0,
      poisonPerArchiveDiscard: 1.5,
      hostEchosHaveImpetus: "yes",
      swarmTokenSubtypes: [],
      surgeBonus: [],
      misspelledRule: 3,
    },
    cards: [{ id: "token", name: "Token", energyCost: { amount: 0 }, kinds: ["ECHO", "TOKEN"] }],
  };
  const messages = lintHostfallDeckSchema(invalidRules).map((issue) => issue.message).join("\n");
  assert.match(messages, /Unknown Host rule "misspelledRule"/u);
  assert.match(messages, /revealCount must be a positive integer/u);
  assert.match(messages, /damagePerArchiveDiscard must be a positive integer/u);
  assert.match(messages, /poisonPerArchiveDiscard must be a positive integer/u);
  assert.match(messages, /hostEchosHaveImpetus must be boolean/u);
  assert.match(messages, /swarmTokenSubtypes must be a non-empty array of non-empty strings/u);
  assert.match(messages, /surgeBonus must be an object/u);
});

test("El Pacto de Elarion keeps Hostfall card kinds and traits through authored normalization", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "last_rain");
  assert.ok(entry);
  assert.equal(entry.raw.schemaVersion, HOSTFALL_DECK_SCHEMA_VERSION);
  assert.equal(entry.raw.side, "CHRONICLER");

  assertNoLegacyAuthoring(entry.raw);
  assert.doesNotMatch(
    JSON.stringify(entry.raw),
    /"(?:ADD_MANA|BATTLEFIELD|ENTERS_BATTLEFIELD|INSTANT|SORCERY|WHILE_SOURCE_ON_BATTLEFIELD|DEATHTOUCH|REACH|TRAMPLE|TOXIC_\d+)"/u,
  );

  const normalizedAuthoring = normalizeAuthoredDeck(entry.raw);
  const byId = Object.fromEntries(normalizedAuthoring.cards.map((card) => [card.id, card]));
  assert.equal(normalizedAuthoring.name, "El Pacto de Elarion");
  assert.deepEqual(byId.arven_first_pack.energyCost, { amount: 4 });
  assert.equal(byId.arven_first_pack.power, 3);
  assert.equal(byId.arven_first_pack.endurance, 4);
  assert.deepEqual(byId.ancient_canopy_watchers.energyCost, { amount: 3 });
  assert.equal(byId.ancient_canopy_watchers.power, 3);
  assert.equal(byId.ancient_canopy_watchers.endurance, 3);
  assert.deepEqual(byId.black_sap_stalker.traits, ["LETHAL", "POISON_1"]);
  assert.deepEqual(byId.iria_voice_last_rain.modifiers, ["CHRONICLE"]);
  assert.equal(byId.iria_voice_last_rain.abilities[0].effects[1].amount, 3);
  assert.deepEqual(byId.arven_first_pack.traits, []);
  assert.deepEqual(byId.hollow_skybreaker.traits, ["SKYGUARD"]);
  assert.deepEqual(byId.orun_waking_root.traits, ["SKYGUARD"]);
  assert.deepEqual(byId.marked_prey.kinds, ["SPELL"]);
  assert.deepEqual(byId.marked_prey.modifiers, ["QUICK"]);
  assert.deepEqual(byId.oath_clearing.kinds, ["SPELL"]);
  assert.deepEqual(byId.oath_clearing.modifiers, []);
  assert.deepEqual(byId.deep_root_spring.kinds, ["SOURCE"]);
  assert.deepEqual(byId.hollow_skybreaker.energyCost, { amount: 4 });
  assert.equal(byId.hollow_skybreaker.endurance, 5);

  const energyAction = byId.first_dew_gatherers.abilities[0];
  assert.equal(energyAction.zone, "field");
  assert.deepEqual(energyAction.cost, { exhaust: true });
  assert.deepEqual(energyAction.effects[0], { type: "GAIN_ENERGY", player: "SELF", amount: 1 });

  const rootsTouchedSkyFilter = byId.roots_touched_sky.abilities[0].targets[0].filters;
  assert.deepEqual(rootsTouchedSkyFilter.anyOf, [
    { kinds: ["SUPPORT"] },
    { kinds: ["ECHO"], traits: ["FLYING"] },
  ]);
});

test("Vampires keep Hostfall card kinds, modifiers and traits through authored normalization", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "crimson_court");
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

  const normalizedAuthoring = normalizeAuthoredDeck(entry.raw);
  const byId = Object.fromEntries(normalizedAuthoring.cards.map((card) => [card.id, card]));
  assert.deepEqual(byId.eternal_feast_countess.kinds, ["ECHO"]);
  assert.deepEqual(byId.eternal_feast_countess.modifiers, ["CHRONICLE"]);
  assert.deepEqual(byId.eternal_feast_countess.traits, ["FLYING", "ALERT"]);
  assert.equal(byId.eternal_feast_countess.abilities[0].effects[0].keyword, "DRAIN");
  assert.equal(byId.blood_page.abilities[0].conditions[1].type, "SOURCE_IS_READY");
  assert.deepEqual(byId.crimson_impulse.kinds, ["SPELL"]);
  assert.deepEqual(byId.crimson_impulse.modifiers, ["QUICK"]);
  assert.deepEqual(byId.blood_pact.kinds, ["SPELL"]);
  assert.deepEqual(byId.crimson_energy.kinds, ["SOURCE"]);
  assert.equal(byId.court_duelist.requiresStabilized, undefined);
  assert.equal(byId.court_duelist.abilities[0].requiresStabilized, true);
  assert.deepEqual(byId.tithe_acolyte.abilities[0].cost, { exhaust: true, life: 5 });
  assert.deepEqual(byId.tithe_acolyte.abilities[0].effects[0], {
    type: "GAIN_ENERGY",
    player: "SELF",
    amount: 1,
  });
});

test("Zombies keep Hostfall card kinds and traits through authored normalization", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "hollow_bell_procession");
  assert.ok(entry);
  assert.equal(entry.raw.schemaVersion, HOSTFALL_DECK_SCHEMA_VERSION);
  assert.equal(entry.raw.side, "HOST");
  assert.equal(entry.raw.cards.reduce((total, card) => total + card.quantity, 0), 50);
  assertNoLegacyAuthoring(entry.raw);
  assert.doesNotMatch(
    JSON.stringify(entry.raw),
    /"(?:ANOTHER_CREATURE_YOU_CONTROL_DIED|BEGIN_UPKEEP|CARD_CAST|CAST_CARD_IS_NON_TOKEN|CREATURE_DIED|GRAVEYARD_COUNT_AT_LEAST|HORDE|MILL_SELF|PLAYER_CHOOSES|RETURN_SELF_FROM_GRAVEYARD_TO_BATTLEFIELD|TAP_HORDE_CREATURES_FOR_MANA)"/u,
  );

  const rawById = Object.fromEntries(entry.raw.cards.map((card) => [card.id, card]));
  assert.deepEqual(rawById.last_knell_dead.kinds, ["ECHO", "TOKEN"]);
  assert.deepEqual(rawById.last_knell_dead.energyCost, { amount: 2 });
  assert.deepEqual(rawById.hollow_bell.kinds, ["SUPPORT"]);
  assert.equal(rawById.hollow_bell.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(rawById.hollow_bell.abilities[1].trigger.event, "BEGIN_READY");
  assert.deepEqual(rawById.silent_bite_rats.traits, ["LETHAL", "FURTIVE"]);
  assert.equal(rawById.archive_carrion_crow.abilities[0].effects[0].type, "DISCARD_OWN_ARCHIVE_TO_MEMORY");
  assert.equal(rawById.last_march_marshal.abilities[1].trigger.event, "ECHO_DIED");
  assert.equal(entry.raw.rulesProfile.damagePerArchiveDiscard, 3);
  assert.equal(entry.raw.rulesProfile.poisonPerArchiveDiscard, 3);
  assert.equal(entry.raw.rulesProfile.hostEchosHaveImpetus, true);
  assert.equal(entry.raw.rulesProfile.surgeBonus.endurance, 0);

  const normalizedAuthoring = normalizeAuthoredDeck(entry.raw);
  const byId = Object.fromEntries(normalizedAuthoring.cards.map((card) => [card.id, card]));
  assert.equal(normalizedAuthoring.side, "HOST");
  assert.equal(normalizedAuthoring.rulesProfile.damagePerArchiveDiscard, 3);
  assert.equal(normalizedAuthoring.rulesProfile.poisonPerArchiveDiscard, 3);
  assert.equal(normalizedAuthoring.rulesProfile.hostEchosHaveImpetus, true);
  assert.equal(normalizedAuthoring.rulesProfile.surgeBonus.endurance, 0);
  assert.deepEqual(byId.last_knell_dead.kinds, ["ECHO", "TOKEN"]);
  assert.equal(byId.last_knell_dead.isToken, true);
  assert.deepEqual(byId.last_knell_dead.energyCost, { amount: 2 });
  assert.deepEqual(byId.hollow_bell.kinds, ["SUPPORT"]);
  assert.equal(byId.hollow_bell.abilities[0].effects[0].scope.controller, "HOST");
  assert.deepEqual(byId.hollow_bell.abilities[0].effects[0].scope.filters.kinds, ["ECHO"]);
  assert.equal(byId.hollow_bell.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(byId.hollow_bell.abilities[1].trigger.event, "BEGIN_READY");
  assert.deepEqual(byId.silent_bite_rats.traits, ["LETHAL", "FURTIVE"]);
  assert.equal(byId.archive_carrion_crow.abilities[0].effects[0].type, "DISCARD_OWN_ARCHIVE_TO_MEMORY");
  assert.equal(byId.last_march_marshal.abilities[1].trigger.event, "ECHO_DIED");
  assert.equal(byId.last_march_marshal.abilities[1].conditions[0].type, "ANOTHER_ALLIED_ECHO_DIED");
});

test("Goblins keep Hostfall card kinds, modifiers and traits through authored normalization", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "broken_forge_mutiny");
  assert.ok(entry);
  assert.equal(entry.raw.schemaVersion, HOSTFALL_DECK_SCHEMA_VERSION);
  assert.equal(entry.raw.side, "HOST");
  assert.equal(entry.raw.cards.reduce((total, card) => total + card.quantity, 0), 50);
  assertNoLegacyAuthoring(entry.raw);
  assert.doesNotMatch(
    JSON.stringify(entry.raw),
    /"(?:BEGIN_COMBAT|COUNT_PERMANENTS(?:_ENTERED_THIS_TURN)?|DEAL_DAMAGE_TO_OPPONENT_CREATURE|DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT|FIRST_STRIKE|HORDE|Legendary|MENACE|PERMANENT_DIED|REVEAL_HORDE_ROUND)"/u,
  );

  const rawById = Object.fromEntries(entry.raw.cards.map((card) => [card.id, card]));
  assert.deepEqual(rawById.ember_scrap_runner.kinds, ["ECHO", "TOKEN"]);
  assert.deepEqual(rawById.shift_hammer.kinds, ["SUPPORT"]);
  assert.equal(rawById.shift_hammer.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(rawById.first_siren_agitator.abilities[1].trigger.event, "BEGIN_BATTLE");
  assert.equal(rawById.open_another_gate.abilities[0].effects[0].options[1].effects[0].type, "REVEAL_HOST_ROUND");
  assert.equal(rawById.burning_tally_foreman.abilities[1].effects[0].type, "DEAL_DAMAGE_TO_OPPONENT_ECHO");
  assert.equal(rawById.burning_tally_foreman.abilities[1].effects[0].amount.type, "COUNT_ECHOS_INVOKED_THIS_TURN");
  assert.deepEqual(rawById.varka_revolt_axis.traits, ["REFLEX"]);
  assert.deepEqual(rawById.varka_revolt_axis.modifiers, ["CHRONICLE"]);
  assert.equal(rawById.repeating_blow_marshal.modifiers, undefined);
  assert.equal(rawById.brakka_growing_tally.modifiers, undefined);
  assert.equal(rawById.last_rivets_gunner.modifiers, undefined);
  assert.equal(rawById.last_rivets_gunner.abilities[0].trigger.event, "ECHO_DIED");
  assert.equal(rawById.last_rivets_gunner.abilities[0].conditions[0].eventObject, "echo");

  const normalizedAuthoring = normalizeAuthoredDeck(entry.raw);
  const byId = Object.fromEntries(normalizedAuthoring.cards.map((card) => [card.id, card]));
  assert.equal(normalizedAuthoring.side, "HOST");
  assert.equal(normalizedAuthoring.rulesProfile.damagePerArchiveDiscard, 3);
  assert.equal(normalizedAuthoring.rulesProfile.poisonPerArchiveDiscard, 3);
  assert.equal(normalizedAuthoring.rulesProfile.hostEchosHaveImpetus, true);
  assert.deepEqual(byId.ember_scrap_runner.kinds, ["ECHO", "TOKEN"]);
  assert.equal(byId.ember_scrap_runner.isToken, true);
  assert.deepEqual(byId.shift_hammer.kinds, ["SUPPORT"]);
  assert.equal(byId.shift_hammer.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(byId.first_siren_agitator.abilities[1].trigger.event, "BEGIN_BATTLE");
  assert.equal(byId.open_another_gate.abilities[0].effects[0].options[1].effects[0].type, "REVEAL_HOST_ROUND");
  assert.equal(byId.burning_tally_foreman.abilities[1].effects[0].type, "DEAL_DAMAGE_TO_OPPONENT_ECHO");
  assert.equal(byId.burning_tally_foreman.abilities[1].effects[0].amount.type, "COUNT_ECHOS_INVOKED_THIS_TURN");
  assert.deepEqual(byId.varka_revolt_axis.traits, ["REFLEX"]);
  assert.deepEqual(byId.varka_revolt_axis.modifiers, ["CHRONICLE"]);
  assert.deepEqual(byId.repeating_blow_marshal.kinds, ["ECHO"]);
  assert.deepEqual(byId.repeating_blow_marshal.modifiers, []);
  assert.deepEqual(byId.brakka_growing_tally.modifiers, []);
  assert.deepEqual(byId.last_rivets_gunner.modifiers, []);
  assert.equal(byId.last_rivets_gunner.abilities[0].trigger.event, "ECHO_DIED");
  assert.equal(byId.last_rivets_gunner.abilities[0].conditions[0].eventObject, "echo");
});
