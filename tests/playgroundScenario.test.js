import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLANK_SCENARIO,
  addScenarioCard,
  buildScenarioGame,
  configureExactHordeTurn,
  snapshotBoard,
  snapshotScenario,
  validateScenario,
} from "../src/playground/scenario";
import { advancePhase } from "../src/engine/PhaseManager";
import { runHordeMain } from "../src/engine/HordeController";
import { MAX_PLAYER_LANDS } from "../src/engine/GameRules";
import { STORED_ENERGY_CAP } from "../src/engine/EnergySystem";

function scenario(overrides = {}) {
  return { ...BLANK_SCENARIO, ...overrides, zones: { ...BLANK_SCENARIO.zones, ...(overrides.zones ?? {}) } };
}

test("a blank scenario starts with full energy, empty zones and no setup turns", () => {
  const game = buildScenarioGame(scenario());

  assert.equal(game.player.hand.length, 0);
  assert.equal(game.horde.field.length, 0);
  assert.equal(game.setupTurnsRemaining, 0);
  assert.equal(game.openingHandAccepted, true);
  assert.equal(game.phase, "main");
  assert.equal(game.activeSide, "player");
  assert.equal(game.eventQueue.length, 0);
  assert.equal(game.winner, undefined);

  // The only permanents on a blank board are its energy sources: a board you cannot cast from is
  // not a useful place to start testing a card.
  assert.equal(game.player.field.length, MAX_PLAYER_LANDS);
  assert.ok(game.player.field.every((card) => card.cardTypes.includes("SOURCE") && !card.exhausted));
});

test("energy is configured as sources and stored energy, both clamped to the engine's caps", () => {
  const game = buildScenarioGame(scenario({ player: { life: 50, energy: 99, storedEnergy: 99 } }));

  assert.equal(game.player.field.filter((card) => card.cardTypes.includes("SOURCE")).length, MAX_PLAYER_LANDS);
  assert.equal(game.player.energyPool.stored, STORED_ENERGY_CAP);
  assert.deepEqual(game.player.energyPool, { available: 0, stored: STORED_ENERGY_CAP });
});

test("lands listed in a zone count against the energy field instead of stacking past the cap", () => {
  const game = buildScenarioGame(
    scenario({
      player: { life: 50, energy: MAX_PLAYER_LANDS, storedEnergy: 0 },
      zones: { playerBattlefield: [{ definitionId: "forest", amount: 2, tapped: true }] },
    }),
  );

  const lands = game.player.field.filter((card) => card.cardTypes.includes("SOURCE"));
  assert.equal(lands.length, MAX_PLAYER_LANDS);
  // The two the scenario asked for keep the state it asked for; the field only tops up the rest.
  assert.equal(lands.filter((card) => card.exhausted).length, 2);
});

test("zone entries become real card instances in the right zone", () => {
  const game = buildScenarioGame(
    scenario({
      player: { life: 12, energy: 0, storedEnergy: 3 },
      horde: { poisonCounters: 2 },
      zones: {
        playerHand: [{ definitionId: "giant_growth" }],
        playerBattlefield: [{ definitionId: "forest", amount: 3, tapped: true }],
        playerGraveyard: [{ definitionId: "llanowar_elves" }],
        hordeBattlefield: [{ definitionId: "zombie_token", amount: 2 }],
        hordeLibraryTop: [{ definitionId: "graf_harvest" }],
      },
    }),
  );

  assert.equal(game.player.life, 12);
  assert.equal(game.player.energyPool.stored, 3);
  assert.equal(game.horde.poisonCounters, 2);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["giant_growth"]);
  assert.equal(game.player.hand[0].zone, "hand");

  const lands = game.player.field;
  assert.equal(lands.length, 3);
  assert.ok(lands.every((card) => card.definitionId === "forest" && card.zone === "field" && card.exhausted));

  assert.deepEqual(game.player.memory.map((card) => card.definitionId), ["llanowar_elves"]);
  assert.equal(game.player.memory[0].zone, "memory");

  assert.equal(game.horde.field.length, 2);
  assert.ok(game.horde.field.every((card) => card.definitionId === "zombie_token" && card.controller === "horde"));
  // Scenario cards are assumed to be already in play, so they can act immediately.
  assert.ok(game.horde.field.every((card) => !card.stabilizing));

  assert.equal(game.horde.archive[0].definitionId, "graf_harvest");
});

test("instance ids are unique across every zone", () => {
  const game = buildScenarioGame(
    scenario({
      zones: {
        playerHand: [{ definitionId: "forest", amount: 2 }],
        playerBattlefield: [{ definitionId: "forest", amount: 4 }],
        playerGraveyard: [{ definitionId: "forest", amount: 2 }],
      },
    }),
  );

  const ids = [
    ...game.player.archive,
    ...game.player.hand,
    ...game.player.field,
    ...game.player.memory,
    ...game.horde.archive,
    ...game.horde.field,
  ].map((card) => card.instanceId);

  assert.equal(new Set(ids).size, ids.length);
});

test("copies beyond the deck's count are minted instead of silently dropped", () => {
  // The Zombie deck holds a single Graf Harvest; a scenario may still want three on the board.
  const game = buildScenarioGame(scenario({ zones: { hordeBattlefield: [{ definitionId: "graf_harvest", amount: 3 }] } }));

  assert.equal(game.horde.field.length, 3);
  assert.equal(new Set(game.horde.field.map((card) => card.instanceId)).size, 3);
});

test("rebuilding a scenario reproduces the exact same state, RNG included", () => {
  const definition = scenario({
    seed: "repeatable",
    zones: {
      playerBattlefield: [{ definitionId: "forest", amount: 4 }],
      hordeBattlefield: [{ definitionId: "zombie_token" }],
    },
  });

  const first = buildScenarioGame(definition);
  const second = buildScenarioGame(definition);
  assert.deepEqual(second, first);

  // And the same actions on top of a rebuild produce the same result: that is what makes
  // "restart scenario" trustworthy, since nothing is reverted — the state is built again.
  const playedFirst = runHordeMain(advancePhase(first, "main"));
  const playedSecond = runHordeMain(advancePhase(second, "main"));
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
  // Forest is in the deck, so the first copies come out of the library; Graf Harvest belongs to the
  // Horde deck only once, so the later copies have to be minted — both paths in one run.
  for (let round = 0; round < 3; round += 1) {
    game = addScenarioCard(game, "playerBattlefield", { definitionId: "forest", amount: 2 });
    game = addScenarioCard(game, "hordeBattlefield", { definitionId: "graf_harvest" });
  }

  assert.equal(game.player.field.length, 6);
  assert.equal(game.horde.field.length, 3);
  const ids = [...game.player.field, ...game.horde.field, ...game.player.archive, ...game.horde.archive].map((card) => card.instanceId);
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
  game = addScenarioCard(game, "playerHand", { definitionId: "giant_growth", amount: 2 });
  game = addScenarioCard(game, "hordeBattlefield", { definitionId: "zombie_token", amount: 3 });
  game = addScenarioCard(game, "playerGraveyard", { definitionId: "llanowar_elves" });
  game.player.life = 31;
  game.horde.poisonCounters = 4;

  const rebuilt = buildScenarioGame(snapshotScenario(game, BLANK_SCENARIO));

  const zoneIds = (cards) => cards.map((card) => card.definitionId).sort();
  assert.deepEqual(zoneIds(rebuilt.player.hand), zoneIds(game.player.hand));
  assert.deepEqual(zoneIds(rebuilt.player.field), zoneIds(game.player.field));
  assert.deepEqual(zoneIds(rebuilt.player.memory), zoneIds(game.player.memory));
  assert.deepEqual(zoneIds(rebuilt.horde.field), zoneIds(game.horde.field));
  assert.equal(rebuilt.player.life, 31);
  assert.equal(rebuilt.horde.poisonCounters, 4);
  assert.equal(rebuilt.player.energyPool.stored, 1);

  // The lands travel as ordinary battlefield entries, so the top-up field must not add a second set.
  assert.equal(rebuilt.player.field.filter((card) => card.cardTypes.includes("SOURCE")).length, 2);
});

test("saved boards preserve separate token waves around another summon", () => {
  let game = buildScenarioGame(scenario());
  game = addScenarioCard(game, "hordeBattlefield", { definitionId: "goblin_token_1_1_red", amount: 4 });
  game = addScenarioCard(game, "hordeBattlefield", { definitionId: "hobgoblin_bandit_lord" });
  game = addScenarioCard(game, "hordeBattlefield", { definitionId: "goblin_token_1_1_red", amount: 2 });

  const saved = snapshotBoard(game, BLANK_SCENARIO);
  assert.deepEqual(saved.zones.hordeBattlefield, [
    { definitionId: "goblin_token_1_1_red", amount: 4 },
    { definitionId: "hobgoblin_bandit_lord", amount: 1 },
    { definitionId: "goblin_token_1_1_red", amount: 2 },
  ]);

  const rebuilt = buildScenarioGame(saved);
  assert.deepEqual(
    rebuilt.horde.field.map((card) => card.definitionId),
    game.horde.field.map((card) => card.definitionId),
  );
});

test("saved boards keep only the hand and battlefields", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 2, storedEnergy: 1 } }));
  game = addScenarioCard(game, "playerHand", { definitionId: "giant_growth" });
  game = addScenarioCard(game, "hordeBattlefield", { definitionId: "zombie_token" });
  game = addScenarioCard(game, "playerGraveyard", { definitionId: "llanowar_elves" });
  game.player.life = 12;

  const saved = snapshotBoard(game, BLANK_SCENARIO);
  const rebuilt = buildScenarioGame(saved);

  assert.equal(rebuilt.player.hand.some((card) => card.definitionId === "giant_growth"), true);
  assert.equal(rebuilt.horde.field.some((card) => card.definitionId === "zombie_token"), true);
  assert.equal(rebuilt.player.memory.length, 0);
  assert.equal(rebuilt.player.life, BLANK_SCENARIO.player.life);
  assert.equal(rebuilt.player.energyPool.stored, 0);
});

test("Horde library queues preserve their authored top-to-bottom order", () => {
  const game = buildScenarioGame(scenario({
    zones: {
      hordeLibraryTop: [
        { definitionId: "graf_harvest" },
        { definitionId: "zombie_token" },
      ],
    },
  }));

  assert.deepEqual(game.horde.archive.slice(0, 2).map((card) => card.definitionId), ["graf_harvest", "zombie_token"]);
});

test("an exact queued Horde turn reveals duplicates and no extra deck card", () => {
  const queued = buildScenarioGame(scenario({
    zones: {
      hordeLibraryTop: [
        { definitionId: "graf_harvest" },
        { definitionId: "graf_harvest" },
      ],
    },
  }));
  const libraryBefore = queued.horde.archive.length;

  const resolved = runHordeMain(configureExactHordeTurn(queued, 2));

  assert.equal(resolved.horde.archive.length, libraryBefore - 2);
  assert.equal(resolved.horde.field.filter((card) => card.definitionId === "graf_harvest").length, 2);
});

test("a valid scenario reports no problems", () => {
  assert.deepEqual(validateScenario(scenario({ zones: { playerHand: [{ definitionId: "giant_growth" }] } })), []);
});
