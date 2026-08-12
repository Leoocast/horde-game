import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { ContentCatalog } from "../src/content/ContentCatalog";
import { contentCatalog } from "../src/content/bootstrap";
import {
  GUIDED_LESSON_SCHEMA_VERSION,
  GuidedLessonRegistry,
  buildGuidedScenario,
  validateGuidedLesson,
} from "../src/guidance";

const PLAYER_DECK = "hostfall.core/pact_of_elarion";
const HOST_DECK = "hostfall.core/uprising_of_the_graveless";
const PLAYER_CARD = (id) => `${PLAYER_DECK}/${id}`;
const HOST_CARD = (id) => `${HOST_DECK}/${id}`;

test("an exact guided recipe keeps only its authored Hand and Archive order", () => {
  const lesson = builtinLesson();
  assert.deepEqual(validateGuidedLesson(lesson, contentCatalog), []);

  const first = buildGuidedScenario(lesson, contentCatalog);
  const second = buildGuidedScenario(lesson, contentCatalog);

  assert.deepEqual(first.game, second.game);
  assert.deepEqual(first.game.player.hand.map((card) => card.definitionId), [
    "river_of_elarion",
    "veiled_dawn_flower",
  ]);
  assert.deepEqual(first.game.player.archive.map((card) => card.definitionId), [
    "aelyra_heir_of_elarion",
    "liora_keeper_of_the_grove",
  ]);
  assert.deepEqual(first.game.host.archive.map((card) => card.definitionId), [
    "graveless_soldier",
    "graveless_titan",
  ]);
  assert.equal(allCards(first.game).length, Object.keys(lesson.cards).length);
  assert.equal(first.game.hostDeckOrderHash, "graveless_soldier|graveless_titan");
  assert.equal(first.bindings.source_initial.instanceId, "guided:exact-elarion:source_initial");
  assert.equal(first.bindings.draw_one.index, 0);
  assert.equal(first.bindings.draw_one.zone, "playerArchiveTopToBottom");
});

test("openingDeal accepts two or seven exact cards without filling the rest of the deck", () => {
  const two = buildGuidedScenario(builtinLesson(), contentCatalog);
  assert.equal(two.game.player.hand.length, 2);

  const sevenLesson = sevenCardLesson();
  assert.deepEqual(validateGuidedLesson(sevenLesson, contentCatalog), []);
  const seven = buildGuidedScenario(sevenLesson, contentCatalog);
  assert.equal(seven.game.player.hand.length, 7);
  assert.deepEqual(
    seven.game.player.hand.map((card) => card.definitionId),
    Array.from({ length: 7 }, () => "river_of_elarion"),
  );
  assert.equal(new Set(seven.game.player.hand.map((card) => card.instanceId)).size, 7);
  assert.equal(seven.game.player.archive.length, 0);
  assert.equal(allCards(seven.game).length, 8);
});

test("exact zones, Reserve and combat bindings rebuild a settled authored position", () => {
  const lesson = builtinLesson();
  lesson.scenario.activeSide = "host";
  lesson.scenario.phase = "combat";
  lesson.scenario.player.availableEnergy = 1;
  lesson.scenario.player.storedEnergy = 2;
  lesson.scenario.player.pendingStoredEnergy = 1;
  lesson.scenario.player.energyActionUsedThisTurn = true;
  lesson.scenario.zones.openingDeal = ["source_initial"];
  lesson.scenario.zones.playerArchiveTopToBottom = [];
  lesson.scenario.zones.playerField = ["echo_initial"];
  lesson.scenario.zones.playerMemory = ["draw_one"];
  lesson.scenario.zones.playerOblivion = ["draw_two"];
  lesson.scenario.zones.hostArchiveTopToBottom = [];
  lesson.scenario.zones.hostField = ["host_one"];
  lesson.scenario.zones.hostMemory = ["host_two"];
  lesson.cards.echo_initial.state = { enteredThisTurn: true, exhausted: false };
  lesson.scenario.combat.hostAttackers = ["host_one"];
  lesson.scenario.combat.blockers = { host_one: ["echo_initial"] };

  assert.deepEqual(validateGuidedLesson(lesson, contentCatalog), []);
  const { game, bindings } = buildGuidedScenario(lesson, contentCatalog);
  assert.deepEqual(game.player.energyPool, { available: 1, stored: 2 });
  assert.equal(game.player.pendingStoredEnergy, 1);
  assert.equal(game.player.energyActionUsedThisTurn, true);
  assert.deepEqual(game.player.memory.map((card) => card.definitionId), ["aelyra_heir_of_elarion"]);
  assert.deepEqual(game.player.oblivion.map((card) => card.definitionId), ["liora_keeper_of_the_grove"]);
  assert.deepEqual(game.host.memory.map((card) => card.definitionId), ["graveless_titan"]);
  assert.deepEqual(game.combat.hostAttackers, [bindings.host_one.instanceId]);
  assert.deepEqual(game.combat.blockers, { [bindings.host_one.instanceId]: [bindings.echo_initial.instanceId] });
  assert.deepEqual(game.fieldEntriesThisTurn.map((entry) => entry.instanceId), [bindings.echo_initial.instanceId]);
});

test("guided validation rejects unqualified keys, impossible copies, duplicate placement and unused aliases", () => {
  const unqualified = builtinLesson();
  unqualified.cards.source_initial.cardKey = "river_of_elarion";
  assert.ok(validateGuidedLesson(unqualified, contentCatalog).some((problem) => /unknown or unqualified/u.test(problem)));

  const tooMany = builtinLesson();
  tooMany.cards.flower_two = { cardKey: PLAYER_CARD("veiled_dawn_flower") };
  tooMany.cards.flower_three = { cardKey: PLAYER_CARD("veiled_dawn_flower") };
  tooMany.scenario.zones.openingDeal.push("flower_two", "flower_three");
  assert.ok(validateGuidedLesson(tooMany, contentCatalog).some((problem) => /uses 3 copies/u.test(problem)));

  const duplicated = builtinLesson();
  duplicated.scenario.zones.playerArchiveTopToBottom.push("source_initial");
  assert.ok(validateGuidedLesson(duplicated, contentCatalog).some((problem) => /appears in both/u.test(problem)));

  const tooManyRuntimeSources = sevenCardLesson();
  for (const index of [8, 9, 10]) {
    const alias = `source_${index}`;
    tooManyRuntimeSources.cards[alias] = { cardKey: PLAYER_CARD("river_of_elarion") };
    tooManyRuntimeSources.scenario.zones.openingDeal.push(alias);
  }
  assert.ok(validateGuidedLesson(tooManyRuntimeSources, contentCatalog).some((problem) => /deck contains 9/u.test(problem)));

  const unused = builtinLesson();
  unused.cards.never_placed = { cardKey: PLAYER_CARD("river_of_elarion") };
  assert.ok(validateGuidedLesson(unused, contentCatalog).some((problem) => /not placed in any zone/u.test(problem)));
});

test("step validation catches broken aliases, translations and graph edges before runtime", () => {
  const broken = builtinLesson();
  broken.steps[0].highlights[0].alias = "missing_copy";
  broken.steps[0].copy.titleKey = "missing.translation.key";
  broken.steps[1].nextStepId = "missing-step";
  const problems = validateGuidedLesson(broken, contentCatalog);
  assert.ok(problems.some((problem) => /undefined card alias/u.test(problem)));
  assert.ok(problems.some((problem) => /unknown title translation key/u.test(problem)));
  assert.ok(problems.some((problem) => /missing step/u.test(problem)));

  const implicitMulligan = builtinLesson();
  implicitMulligan.steps[1].allowedIntent.kind = "opening.mulligan";
  assert.ok(
    validateGuidedLesson(implicitMulligan, contentCatalog).some((problem) => /unknown intent kind/u.test(problem)),
    "mulligan must wait for an authored replacement-Hand schema instead of shuffling",
  );
});

test("step preconditions are declarative, exact and validated before orchestration", () => {
  const valid = builtinLesson();
  valid.steps[0].preconditions = [
    { kind: "card.inZone", cardAlias: "source_initial", side: "player", zone: "hand" },
    { kind: "phase.is", phase: "main" },
    { kind: "side.isActive", side: "player" },
    { kind: "setup.remaining", amount: 3 },
    { kind: "energy.available", amount: 0 },
    { kind: "energy.stored", amount: 0 },
  ];
  assert.deepEqual(validateGuidedLesson(valid, contentCatalog), []);

  const broken = builtinLesson();
  broken.steps[0].preconditions = [
    { kind: "card.inZone", cardAlias: "missing_copy", side: "host", zone: "hand" },
    { kind: "phase.is", phase: "mystery" },
    { kind: "energy.stored", amount: 99 },
    { kind: "mystery.condition" },
  ];
  const problems = validateGuidedLesson(broken, contentCatalog);
  assert.ok(problems.some((problem) => /undefined card alias "missing_copy"/u.test(problem)));
  assert.ok(problems.some((problem) => /unavailable zone "hand"/u.test(problem)));
  assert.ok(problems.some((problem) => /phase\.is uses an unknown phase/u.test(problem)));
  assert.ok(problems.some((problem) => /energy\.stored cannot exceed/u.test(problem)));
  assert.ok(problems.some((problem) => /unknown precondition kind/u.test(problem)));
});

test("Act steps require exact semantic scope for targets, abilities and combat", () => {
  const targetWithoutContext = builtinLesson();
  targetWithoutContext.steps[1].allowedIntent = { kind: "target.choose", targetAlias: "source_initial" };
  assert.ok(validateGuidedLesson(targetWithoutContext, contentCatalog).some((problem) => /requires a known context/u.test(problem)));

  const abilityWithoutId = builtinLesson();
  abilityWithoutId.steps[1].allowedIntent = { kind: "ability.activate", cardAlias: "flower_initial" };
  assert.ok(validateGuidedLesson(abilityWithoutId, contentCatalog).some((problem) => /requires abilityId/u.test(problem)));

  const combatWithoutSelection = builtinLesson();
  combatWithoutSelection.steps[1].allowedIntent = { kind: "combat.confirmArchiveAttack" };
  assert.ok(validateGuidedLesson(combatWithoutSelection, contentCatalog).some((problem) => /requires exact targetAliases/u.test(problem)));

  const toggleWithoutState = builtinLesson();
  toggleWithoutState.steps[1].allowedIntent = { kind: "combat.toggleAttacker", cardAlias: "flower_initial" };
  assert.ok(validateGuidedLesson(toggleWithoutState, contentCatalog).some((problem) => /requires the exact selected state/u.test(problem)));

  const unknownAssignment = builtinLesson();
  unknownAssignment.steps[1].allowedIntent = {
    kind: "combat.confirmDefense",
    assignments: [{ blockerAlias: "source_initial", attackerAlias: "missing_attacker" }],
  };
  assert.ok(validateGuidedLesson(unknownAssignment, contentCatalog).some((problem) => /undefined card alias "missing_attacker"/u.test(problem)));
});

test("one framework builds a synthetic deck recipe and ignores visible-name changes", () => {
  const firstCatalog = syntheticCatalog("Fixture Source");
  const renamedCatalog = syntheticCatalog("Renamed Source");
  const lesson = syntheticLesson();

  const registry = new GuidedLessonRegistry(firstCatalog, [lesson]);
  assert.equal(registry.require(lesson.id).id, lesson.id);
  assert.ok(Object.isFrozen(registry.lessons));
  assert.ok(Object.isFrozen(registry.lessons[0].scenario.zones.openingDeal));
  assert.throws(() => new GuidedLessonRegistry(firstCatalog, [lesson, lesson]), /Duplicate guided lesson/u);

  const first = buildGuidedScenario(lesson, firstCatalog);
  const renamed = buildGuidedScenario(lesson, renamedCatalog);
  assert.deepEqual(first.game.player.hand.map((card) => card.definitionId), ["fixture_source", "fixture_echo"]);
  assert.deepEqual(renamed.game.player.hand.map((card) => card.definitionId), ["fixture_source", "fixture_echo"]);
  assert.equal(first.game.player.hand[0].displayName, "Fixture Source");
  assert.equal(renamed.game.player.hand[0].displayName, "Renamed Source");
});

test("release guidance modules do not import the development Playground", () => {
  const guidanceRoot = path.resolve("src", "guidance");
  const files = fs.readdirSync(guidanceRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name));
  const imports = files
    .filter((file) => /(?:from\s+|import\s*)["'][^"']*playground/iu.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(guidanceRoot, file));
  assert.deepEqual(imports, []);
});

function builtinLesson() {
  return {
    schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
    id: "exact-elarion",
    revision: 1,
    mode: "required",
    startStepId: "intro",
    scenario: baseScenario({
      playerDeckKey: PLAYER_DECK,
      hostDeckKey: HOST_DECK,
      openingDeal: ["source_initial", "echo_initial"],
      playerArchiveTopToBottom: ["draw_one", "draw_two"],
      hostArchiveTopToBottom: ["host_one", "host_two"],
    }),
    cards: {
      source_initial: { cardKey: PLAYER_CARD("river_of_elarion") },
      echo_initial: { cardKey: PLAYER_CARD("veiled_dawn_flower") },
      draw_one: { cardKey: PLAYER_CARD("aelyra_heir_of_elarion") },
      draw_two: { cardKey: PLAYER_CARD("liora_keeper_of_the_grove") },
      host_one: { cardKey: HOST_CARD("graveless_soldier") },
      host_two: { cardKey: HOST_CARD("graveless_titan") },
    },
    steps: baseSteps("source_initial"),
  };
}

function sevenCardLesson() {
  const aliases = Array.from({ length: 7 }, (_, index) => `source_${index + 1}`);
  return {
    schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
    id: "seven-card-deal",
    revision: 1,
    mode: "optional",
    startStepId: "intro",
    scenario: baseScenario({
      playerDeckKey: PLAYER_DECK,
      hostDeckKey: HOST_DECK,
      openingDeal: aliases,
      hostArchiveTopToBottom: ["host_one"],
    }),
    cards: Object.fromEntries([
      ...aliases.map((alias) => [alias, { cardKey: PLAYER_CARD("river_of_elarion") }]),
      ["host_one", { cardKey: HOST_CARD("graveless_soldier") }],
    ]),
    steps: baseSteps("source_1"),
  };
}

function syntheticLesson() {
  return {
    schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
    id: "synthetic-recipe",
    revision: 1,
    mode: "optional",
    startStepId: "intro",
    scenario: baseScenario({
      playerDeckKey: "guidance.fixture/fixture_player",
      hostDeckKey: "guidance.fixture/fixture_host",
      openingDeal: ["fixture_source", "fixture_echo"],
      hostArchiveTopToBottom: ["fixture_threat"],
    }),
    cards: {
      fixture_source: { cardKey: "guidance.fixture/fixture_player/fixture_source" },
      fixture_echo: { cardKey: "guidance.fixture/fixture_player/fixture_echo" },
      fixture_threat: { cardKey: "guidance.fixture/fixture_host/fixture_threat" },
    },
    steps: baseSteps("fixture_source"),
  };
}

function baseScenario({
  playerDeckKey,
  hostDeckKey,
  openingDeal = [],
  playerArchiveTopToBottom = [],
  hostArchiveTopToBottom = [],
}) {
  return {
    seed: "guided-recipe-1",
    playerDeckKey,
    hostDeckKey,
    difficulty: "normal",
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    hostTurnNumber: 0,
    setupTurnsRemaining: 3,
    setupCompletePendingHost: false,
    openingHandAccepted: true,
    mulligansTaken: 0,
    player: {
      life: 50,
      availableEnergy: 0,
      storedEnergy: 0,
      pendingStoredEnergy: 0,
      energyActionUsedThisTurn: false,
      lifePaidThisTurn: 0,
      lifeLostThisTurn: 0,
    },
    host: { poisonCounters: 0 },
    zones: {
      openingDeal: [...openingDeal],
      playerArchiveTopToBottom: [...playerArchiveTopToBottom],
      playerField: [],
      playerMemory: [],
      playerOblivion: [],
      hostArchiveTopToBottom: [...hostArchiveTopToBottom],
      hostField: [],
      hostMemory: [],
      hostOblivion: [],
    },
    combat: { playerAttackers: [], hostAttackers: [], blockers: {} },
  };
}

function baseSteps(cardAlias) {
  return [
    {
      id: "intro",
      kind: "explain",
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "card", alias: cardAlias }],
      nextStepId: "play-source",
    },
    {
      id: "play-source",
      kind: "act",
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "card", alias: cardAlias }],
      allowedIntent: { kind: "card.play", cardAlias },
      nextStepId: "watch-source",
    },
    {
      id: "watch-source",
      kind: "observe",
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "surface", anchor: "player.field" }],
      expectedReceipt: { kind: "source.played", cardAlias },
    },
  ];
}

function allCards(game) {
  return [
    ...game.player.hand,
    ...game.player.archive,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.archive,
    ...game.host.field,
    ...game.host.memory,
    ...game.host.oblivion,
  ];
}

function syntheticCatalog(sourceName) {
  const cards = [
    fixtureCard("fixture_source", sourceName, "SOURCE", 8),
    fixtureCard("fixture_echo", "Fixture Echo", "ECHO", 2),
  ];
  const hostCards = [fixtureCard("fixture_threat", "Fixture Threat", "ECHO", 4)];
  return new ContentCatalog([{
    sourceId: "guidance-fixture",
    origin: "local",
    loadCandidates() {
      return [{
        descriptor: {
          packKey: "guidance.fixture.pack",
          packId: "guidance.fixture",
          origin: "local",
          revision: "1",
        },
        decks: [
          fixtureDeck("fixture_player", "player", cards, "ramp"),
          fixtureDeck("fixture_host", "host", hostCards, "zombie"),
        ],
      }];
    },
  }]);
}

function fixtureDeck(id, side, cards, theme) {
  return {
    label: id,
    raw: { schemaVersion: "1.0.0", id, name: id, side, cards },
    images: {
      provider: "local",
      cards: Object.fromEntries(cards.map((card) => [card.id, {
        source: "local",
        imageUrl: `cards/${id}/${card.id}.png`,
      }])),
    },
    presentation: {
      keyCardId: cards[0].id,
      theme,
      descriptionKey: theme === "ramp" ? "setup.descriptionRamp" : "setup.descriptionZombies",
      ...(side === "host" ? { encounterTone: "undead" } : {}),
    },
  };
}

function fixtureCard(id, name, kind, quantity) {
  return {
    id,
    name,
    flavorText: { en: "Fixture.", es: "Prueba." },
    showFlavorText: true,
    quantity,
    kinds: [kind],
    traits: [],
  };
}
