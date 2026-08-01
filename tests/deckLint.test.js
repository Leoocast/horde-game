import test from "node:test";
import assert from "node:assert/strict";
import { lintDecks, lintHostfallDeckSchema } from "../src/data/deckLint";
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
      abilities: [{
        id: "bad-grant",
        kind: "STATIC",
        zone: "BATTLEGROUND",
        effects: [{ type: "STATIC_GRANT_KEYWORD", keyword: "LETHL" }],
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
});

test("Mono Green keeps Hostfall card kinds and traits at the runtime bridge", () => {
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
  assert.deepEqual(byId.ichorspit_basilisk.keywords, ["LETHAL", "POISON_1"]);
  assert.deepEqual(byId.colossadactyl.keywords, ["SKYGUARD", "OVERFLOW"]);
  assert.deepEqual(byId.cosmic_hunger.cardTypes, ["SPELL"]);
  assert.deepEqual(byId.cosmic_hunger.modifiers, ["QUICK"]);
  assert.deepEqual(byId.ruthless_predation.cardTypes, ["SPELL"]);
  assert.deepEqual(byId.ruthless_predation.modifiers, []);
  assert.deepEqual(byId.forest.cardTypes, ["SOURCE"]);
  assert.equal(byId.colossadactyl.manaCost, "{4}");
  assert.equal(byId.colossadactyl.manaValue, 4);
  assert.equal(byId.colossadactyl.toughness, 5);

  const energyAction = byId.llanowar_elves.abilities[0];
  assert.equal(energyAction.zone, "field");
  assert.deepEqual(energyAction.cost, { tap: true });
  assert.deepEqual(energyAction.effects[0], { type: "ADD_MANA", player: "SELF", mana: { G: 1 } });

  const brokenWingsFilter = byId.broken_wings.abilities[0].targets[0].filters;
  assert.deepEqual(brokenWingsFilter.anyOf, [
    { cardTypes: ["SUPPORT"] },
    { cardTypes: ["ECHO"], keywords: ["FLYING"] },
  ]);
});

test("Vampires keep Hostfall card kinds, modifiers and traits at the runtime bridge", () => {
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
  assert.deepEqual(byId.eternal_feast_countess.cardTypes, ["ECHO"]);
  assert.deepEqual(byId.eternal_feast_countess.modifiers, ["CHRONICLE"]);
  assert.deepEqual(byId.eternal_feast_countess.keywords, ["FLYING", "ALERT"]);
  assert.equal(byId.eternal_feast_countess.abilities[0].effects[0].keyword, "DRAIN");
  assert.equal(byId.blood_page.abilities[0].conditions[1].type, "SOURCE_IS_UNTAPPED");
  assert.deepEqual(byId.crimson_impulse.cardTypes, ["SPELL"]);
  assert.deepEqual(byId.crimson_impulse.modifiers, ["QUICK"]);
  assert.deepEqual(byId.blood_pact.cardTypes, ["SPELL"]);
  assert.deepEqual(byId.crimson_energy.cardTypes, ["SOURCE"]);
  assert.equal(byId.court_duelist.requiresNoSummoningSickness, undefined);
  assert.equal(byId.court_duelist.abilities[0].requiresNoSummoningSickness, true);
  assert.deepEqual(byId.tithe_acolyte.abilities[0].cost, { tap: true, life: 5 });
  assert.deepEqual(byId.tithe_acolyte.abilities[0].effects[0], {
    type: "ADD_MANA",
    player: "SELF",
    mana: { G: 1 },
  });
});

test("Zombies keep Hostfall card kinds and traits at the runtime bridge", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "horde_zombies");
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
  assert.deepEqual(rawById.zombie_token.kinds, ["ECHO", "TOKEN"]);
  assert.deepEqual(rawById.zombie_token.energyCost, { amount: 2 });
  assert.deepEqual(rawById.graf_harvest.kinds, ["SUPPORT"]);
  assert.equal(rawById.graf_harvest.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(rawById.graf_harvest.abilities[1].trigger.event, "BEGIN_READY");
  assert.deepEqual(rawById.rancid_rats.traits, ["LETHAL", "FURTIVE"]);
  assert.equal(rawById.crow_of_dark_tidings.abilities[0].effects[0].type, "DISCARD_OWN_ARCHIVE_TO_MEMORY");
  assert.equal(rawById.diregraf_captain.abilities[1].trigger.event, "ECHO_DIED");
  assert.equal(entry.raw.rulesProfile.damagePerArchiveDiscard, 3);
  assert.equal(entry.raw.rulesProfile.poisonPerArchiveDiscard, 3);
  assert.equal(entry.raw.rulesProfile.hostEchosHaveImpetus, true);
  assert.equal(entry.raw.rulesProfile.surgeBonus.endurance, 0);

  const adapted = adaptHostfallDeck(entry.raw);
  const byId = Object.fromEntries(adapted.cards.map((card) => [card.id, card]));
  assert.equal(adapted.side, "HORDE");
  assert.equal(adapted.rulesProfile.damagePerMill, 3);
  assert.equal(adapted.rulesProfile.poisonPerMill, 3);
  assert.equal(adapted.rulesProfile.hordeCreaturesHaveHaste, true);
  assert.equal(adapted.rulesProfile.surgeBonus.toughness, 0);
  assert.deepEqual(byId.zombie_token.cardTypes, ["ECHO", "TOKEN"]);
  assert.equal(byId.zombie_token.isToken, true);
  assert.equal(byId.zombie_token.manaValue, 2);
  assert.deepEqual(byId.graf_harvest.cardTypes, ["SUPPORT"]);
  assert.equal(byId.graf_harvest.abilities[0].effects[0].scope.controller, "HORDE");
  assert.deepEqual(byId.graf_harvest.abilities[0].effects[0].scope.filters.cardTypes, ["ECHO"]);
  assert.equal(byId.graf_harvest.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(byId.graf_harvest.abilities[1].trigger.event, "BEGIN_UPKEEP");
  assert.deepEqual(byId.rancid_rats.keywords, ["LETHAL", "FURTIVE"]);
  assert.equal(byId.crow_of_dark_tidings.abilities[0].effects[0].type, "MILL_SELF");
  assert.equal(byId.diregraf_captain.abilities[1].trigger.event, "CREATURE_DIED");
  assert.equal(byId.diregraf_captain.abilities[1].conditions[0].type, "ANOTHER_CREATURE_YOU_CONTROL_DIED");
});

test("Goblins keep Hostfall card kinds, modifiers and traits at the runtime bridge", () => {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === "goblin_assault_horde");
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
  assert.deepEqual(rawById.goblin_token_1_1_red.kinds, ["ECHO", "TOKEN"]);
  assert.deepEqual(rawById.goblin_war_drums.kinds, ["SUPPORT"]);
  assert.equal(rawById.goblin_war_drums.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(rawById.goblin_rabblemaster.abilities[1].trigger.event, "BEGIN_BATTLE");
  assert.equal(rawById.goblin_surprise.abilities[0].effects[0].options[1].effects[0].type, "REVEAL_HOST_ROUND");
  assert.equal(rawById.hobgoblin_bandit_lord.abilities[1].effects[0].type, "DEAL_DAMAGE_TO_OPPONENT_ECHO");
  assert.equal(rawById.hobgoblin_bandit_lord.abilities[1].effects[0].amount.type, "COUNT_ECHOS_INVOKED_THIS_TURN");
  assert.deepEqual(rawById.goblin_chainwhirler.traits, ["REFLEX"]);
  assert.deepEqual(rawById.general_kreat_the_boltbringer.modifiers, ["CHRONICLE"]);
  assert.equal(rawById.pashalik_mons.abilities[0].trigger.event, "ECHO_DIED");
  assert.equal(rawById.pashalik_mons.abilities[0].conditions[0].eventObject, "echo");

  const adapted = adaptHostfallDeck(entry.raw);
  const byId = Object.fromEntries(adapted.cards.map((card) => [card.id, card]));
  assert.equal(adapted.side, "HORDE");
  assert.equal(adapted.rulesProfile.damagePerMill, 3);
  assert.equal(adapted.rulesProfile.poisonPerMill, 3);
  assert.equal(adapted.rulesProfile.hordeCreaturesHaveHaste, true);
  assert.deepEqual(byId.goblin_token_1_1_red.cardTypes, ["ECHO", "TOKEN"]);
  assert.equal(byId.goblin_token_1_1_red.isToken, true);
  assert.deepEqual(byId.goblin_war_drums.cardTypes, ["SUPPORT"]);
  assert.equal(byId.goblin_war_drums.abilities[0].effects[0].keyword, "DAUNTING");
  assert.equal(byId.goblin_rabblemaster.abilities[1].trigger.event, "BEGIN_COMBAT");
  assert.equal(byId.goblin_surprise.abilities[0].effects[0].options[1].effects[0].type, "REVEAL_HORDE_ROUND");
  assert.equal(byId.hobgoblin_bandit_lord.abilities[1].effects[0].type, "DEAL_DAMAGE_TO_OPPONENT_CREATURE");
  assert.equal(byId.hobgoblin_bandit_lord.abilities[1].effects[0].amount.type, "COUNT_PERMANENTS_ENTERED_THIS_TURN");
  assert.deepEqual(byId.goblin_chainwhirler.keywords, ["REFLEX"]);
  assert.deepEqual(byId.general_kreat_the_boltbringer.cardTypes, ["ECHO"]);
  assert.deepEqual(byId.general_kreat_the_boltbringer.modifiers, ["CHRONICLE"]);
  assert.equal(byId.pashalik_mons.abilities[0].trigger.event, "CREATURE_DIED");
  assert.equal(byId.pashalik_mons.abilities[0].conditions[0].eventObject, "permanent");
});
