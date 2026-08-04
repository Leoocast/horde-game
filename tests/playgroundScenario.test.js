import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLANK_SCENARIO,
  addScenarioCard,
  buildScenarioGame,
  configureExactHostTurn,
  snapshotBoard,
  snapshotScenario,
  validateScenario,
} from "../src/playground/scenario";
import { advancePhase } from "../src/engine/PhaseManager";
import { runHostMain } from "../src/engine/HostController";
import { MAX_PLAYER_LANDS } from "../src/engine/GameRules";
import { STORED_ENERGY_CAP } from "../src/engine/EnergySystem";

function scenario(overrides = {}) {
  return { ...BLANK_SCENARIO, ...overrides, zones: { ...BLANK_SCENARIO.zones, ...(overrides.zones ?? {}) } };
}

test("a blank scenario starts with full energy, empty zones and no setup turns", () => {
  const game = buildScenarioGame(scenario());

  assert.equal(game.player.hand.length, 0);
  assert.equal(game.host.field.length, 0);
  assert.equal(game.setupTurnsRemaining, 0);
  assert.equal(game.openingHandAccepted, true);
  assert.equal(game.phase, "main");
  assert.equal(game.activeSide, "player");
  assert.equal(game.eventQueue.length, 0);
  assert.equal(game.winner, undefined);

  // The only permanents on a blank board are its energy sources: a board you cannot cast from is
  // not a useful place to start testing a card.
  assert.equal(game.player.field.length, MAX_PLAYER_LANDS);
  assert.ok(game.player.field.every((card) => card.kinds.includes("SOURCE") && !card.exhausted));
});

test("scenario v4 preserves Host identity directly across runtime and snapshots", () => {
  const definition = scenario({
    activeSide: "host",
    phase: "host",
    hostTurnNumber: 4,
    host: { poisonCounters: 2 },
  });
  const game = buildScenarioGame(definition);

  assert.equal(game.activeSide, "host");
  assert.equal(game.phase, "host");
  assert.equal(game.hostTurnNumber, 4);
  assert.equal(game.host.poisonCounters, 2);

  const saved = snapshotScenario(game, definition);
  assert.equal(saved.activeSide, "host");
  assert.equal(saved.phase, "host");
  assert.equal(saved.hostTurnNumber, 4);
  assert.equal(saved.host.poisonCounters, 2);
});

test("energy is configured as sources and stored energy, both clamped to the engine's caps", () => {
  const game = buildScenarioGame(scenario({ player: { life: 50, energy: 99, storedEnergy: 99 } }));

  assert.equal(game.player.field.filter((card) => card.kinds.includes("SOURCE")).length, MAX_PLAYER_LANDS);
  assert.equal(game.player.energyPool.stored, STORED_ENERGY_CAP);
  assert.deepEqual(game.player.energyPool, { available: 0, stored: STORED_ENERGY_CAP });
});

test("lands listed in a zone count against the energy field instead of stacking past the cap", () => {
  const game = buildScenarioGame(
    scenario({
      player: { life: 50, energy: MAX_PLAYER_LANDS, storedEnergy: 0 },
      zones: { playerField: [{ definitionId: "deep_root_spring", amount: 2, exhausted: true }] },
    }),
  );

  const lands = game.player.field.filter((card) => card.kinds.includes("SOURCE"));
  assert.equal(lands.length, MAX_PLAYER_LANDS);
  // The two the scenario asked for keep the state it asked for; the field only tops up the rest.
  assert.equal(lands.filter((card) => card.exhausted).length, 2);
});

test("zone entries become real card instances in the right zone", () => {
  const game = buildScenarioGame(
    scenario({
      player: { life: 12, energy: 0, storedEnergy: 3 },
      host: { poisonCounters: 2 },
      zones: {
        playerHand: [{ definitionId: "first_tree_sap" }],
        playerField: [{ definitionId: "deep_root_spring", amount: 3, exhausted: true }],
        playerMemory: [{ definitionId: "first_dew_gatherers" }],
        hostField: [{ definitionId: "last_knell_dead", amount: 2 }],
        hostArchiveTop: [{ definitionId: "hollow_bell" }],
      },
    }),
  );

  assert.equal(game.player.life, 12);
  assert.equal(game.player.energyPool.stored, 3);
  assert.equal(game.host.poisonCounters, 2);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["first_tree_sap"]);
  assert.equal(game.player.hand[0].zone, "hand");

  const lands = game.player.field;
  assert.equal(lands.length, 3);
  assert.ok(lands.every((card) => card.definitionId === "deep_root_spring" && card.zone === "field" && card.exhausted));

  assert.deepEqual(game.player.memory.map((card) => card.definitionId), ["first_dew_gatherers"]);
  assert.equal(game.player.memory[0].zone, "memory");

  assert.equal(game.host.field.length, 2);
  assert.ok(game.host.field.every((card) => card.definitionId === "last_knell_dead" && card.controller === "host"));
  // Scenario cards are assumed to be already in play, so they can act immediately.
  assert.ok(game.host.field.every((card) => !card.stabilizing));

  assert.equal(game.host.archive[0].definitionId, "hollow_bell");
});

test("instance ids are unique across every zone", () => {
  const game = buildScenarioGame(
    scenario({
      zones: {
        playerHand: [{ definitionId: "deep_root_spring", amount: 2 }],
        playerField: [{ definitionId: "deep_root_spring", amount: 4 }],
        playerMemory: [{ definitionId: "deep_root_spring", amount: 2 }],
      },
    }),
  );

  const ids = [
    ...game.player.archive,
    ...game.player.hand,
    ...game.player.field,
    ...game.player.memory,
    ...game.host.archive,
    ...game.host.field,
  ].map((card) => card.instanceId);

  assert.equal(new Set(ids).size, ids.length);
});

test("copies beyond the deck's count are minted instead of silently dropped", () => {
  // The Zombie deck holds two copies of The Broken Headstone; a scenario may still want three on the board.
  const game = buildScenarioGame(scenario({ zones: { hostField: [{ definitionId: "hollow_bell", amount: 3 }] } }));

  assert.equal(game.host.field.length, 3);
  assert.equal(new Set(game.host.field.map((card) => card.instanceId)).size, 3);
});

test("rebuilding a scenario reproduces the exact same state, RNG included", () => {
  const definition = scenario({
    seed: "repeatable",
    zones: {
      playerField: [{ definitionId: "deep_root_spring", amount: 4 }],
      hostField: [{ definitionId: "last_knell_dead" }],
    },
  });

  const first = buildScenarioGame(definition);
  const second = buildScenarioGame(definition);
  assert.deepEqual(second, first);

  // And the same actions on top of a rebuild produce the same result: that is what makes
  // "restart scenario" trustworthy, since nothing is reverted — the state is built again.
  const playedFirst = runHostMain(advancePhase(first, "main"));
  const playedSecond = runHostMain(advancePhase(second, "main"));
  assert.deepEqual(playedSecond, playedFirst);
  assert.equal(playedFirst.currentRandomState, playedSecond.currentRandomState);
});

test("unknown cards are reported by validateScenario, not half-loaded", () => {
  const definition = scenario({ zones: { playerHand: [{ definitionId: "not_a_real_card" }] } });

  const problems = validateScenario(definition);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not_a_real_card/);
  assert.equal(buildScenarioGame(definition).player.hand.length, 0);
});

test("placing cards into a live game keeps instance ids unique across repeated adds", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } }));
  // Deep-Root Spring is in the deck, so the first copies come out of the library; The Broken Headstone belongs to the
  // Host deck only once, so the later copies have to be minted — both paths in one run.
  for (let round = 0; round < 3; round += 1) {
    game = addScenarioCard(game, "playerField", { definitionId: "deep_root_spring", amount: 2 });
    game = addScenarioCard(game, "hostField", { definitionId: "hollow_bell" });
  }

  assert.equal(game.player.field.length, 6);
  assert.equal(game.host.field.length, 3);
  const ids = [...game.player.field, ...game.host.field, ...game.player.archive, ...game.host.archive].map((card) => card.instanceId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(game.lastActionResult.ok, true);
});

test("placing an unknown card fails with a reason instead of doing nothing", () => {
  const game = addScenarioCard(buildScenarioGame(scenario()), "playerHand", { definitionId: "not_a_real_card" });

  assert.equal(game.lastActionResult.ok, false);
  assert.match(game.lastActionResult.reason, /not_a_real_card/);
  assert.equal(game.player.hand.length, 0);
});

test("snapshotting a live board and rebuilding it reproduces the same zones", () => {
  // This is what Save relies on: the thing stored is the board you are looking at, so placing a
  // card and saving can never disagree the way a separate draft did.
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 2, storedEnergy: 1 } }));
  game = addScenarioCard(game, "playerHand", { definitionId: "first_tree_sap", amount: 2 });
  game = addScenarioCard(game, "hostField", { definitionId: "last_knell_dead", amount: 3 });
  game = addScenarioCard(game, "playerMemory", { definitionId: "first_dew_gatherers" });
  game.player.life = 31;
  game.host.poisonCounters = 4;

  const rebuilt = buildScenarioGame(snapshotScenario(game, BLANK_SCENARIO));

  const zoneIds = (cards) => cards.map((card) => card.definitionId).sort();
  assert.deepEqual(zoneIds(rebuilt.player.hand), zoneIds(game.player.hand));
  assert.deepEqual(zoneIds(rebuilt.player.field), zoneIds(game.player.field));
  assert.deepEqual(zoneIds(rebuilt.player.memory), zoneIds(game.player.memory));
  assert.deepEqual(zoneIds(rebuilt.host.field), zoneIds(game.host.field));
  assert.equal(rebuilt.player.life, 31);
  assert.equal(rebuilt.host.poisonCounters, 4);
  assert.equal(rebuilt.player.energyPool.stored, 1);

  // The lands travel as ordinary battlefield entries, so the top-up field must not add a second set.
  assert.equal(rebuilt.player.field.filter((card) => card.kinds.includes("SOURCE")).length, 2);
});

test("saved boards preserve separate token waves around another summon", () => {
  let game = buildScenarioGame(scenario());
  game = addScenarioCard(game, "hostField", { definitionId: "ember_scrap_runner", amount: 4 });
  game = addScenarioCard(game, "hostField", { definitionId: "burning_tally_foreman" });
  game = addScenarioCard(game, "hostField", { definitionId: "ember_scrap_runner", amount: 2 });

  const saved = snapshotBoard(game, BLANK_SCENARIO);
  assert.deepEqual(saved.zones.hostField, [
    { definitionId: "ember_scrap_runner", amount: 4 },
    { definitionId: "burning_tally_foreman", amount: 1 },
    { definitionId: "ember_scrap_runner", amount: 2 },
  ]);

  const rebuilt = buildScenarioGame(saved);
  assert.deepEqual(
    rebuilt.host.field.map((card) => card.definitionId),
    game.host.field.map((card) => card.definitionId),
  );
});

test("saved boards keep only the hand and battlefields", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 2, storedEnergy: 1 } }));
  game = addScenarioCard(game, "playerHand", { definitionId: "first_tree_sap" });
  game = addScenarioCard(game, "hostField", { definitionId: "last_knell_dead" });
  game = addScenarioCard(game, "playerMemory", { definitionId: "first_dew_gatherers" });
  game.player.life = 12;

  const saved = snapshotBoard(game, BLANK_SCENARIO);
  const rebuilt = buildScenarioGame(saved);

  assert.equal(rebuilt.player.hand.some((card) => card.definitionId === "first_tree_sap"), true);
  assert.equal(rebuilt.host.field.some((card) => card.definitionId === "last_knell_dead"), true);
  assert.equal(rebuilt.player.memory.length, 0);
  assert.equal(rebuilt.player.life, BLANK_SCENARIO.player.life);
  assert.equal(rebuilt.player.energyPool.stored, 0);
});

test("Host library queues preserve their authored top-to-bottom order", () => {
  const game = buildScenarioGame(scenario({
    zones: {
      hostArchiveTop: [
        { definitionId: "hollow_bell" },
        { definitionId: "last_knell_dead" },
      ],
    },
  }));

  assert.deepEqual(game.host.archive.slice(0, 2).map((card) => card.definitionId), ["hollow_bell", "last_knell_dead"]);
});

test("an exact queued Host turn reveals duplicates and no extra deck card", () => {
  const queued = buildScenarioGame(scenario({
    zones: {
      hostArchiveTop: [
        { definitionId: "hollow_bell" },
        { definitionId: "hollow_bell" },
      ],
    },
  }));
  const libraryBefore = queued.host.archive.length;

  const resolved = runHostMain(configureExactHostTurn(queued, 2));

  assert.equal(resolved.host.archive.length, libraryBefore - 2);
  assert.equal(resolved.host.field.filter((card) => card.definitionId === "hollow_bell").length, 2);
});

test("a valid scenario reports no problems", () => {
  assert.deepEqual(validateScenario(scenario({ zones: { playerHand: [{ definitionId: "first_tree_sap" }] } })), []);
});
