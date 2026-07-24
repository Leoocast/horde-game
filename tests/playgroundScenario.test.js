import assert from "node:assert/strict";
import { test } from "node:test";

import { BLANK_SCENARIO, addScenarioCard, buildScenarioGame, validateScenario } from "../src/playground/scenario";
import { advancePhase } from "../src/engine/PhaseManager";
import { runHordeMain } from "../src/engine/HordeController";

function scenario(overrides = {}) {
  return { ...BLANK_SCENARIO, ...overrides, zones: { ...BLANK_SCENARIO.zones, ...(overrides.zones ?? {}) } };
}

test("a blank scenario starts with empty zones and no setup turns", () => {
  const game = buildScenarioGame(scenario());

  assert.equal(game.player.hand.length, 0);
  assert.equal(game.player.battlefield.length, 0);
  assert.equal(game.horde.battlefield.length, 0);
  assert.equal(game.setupTurnsRemaining, 0);
  assert.equal(game.openingHandAccepted, true);
  assert.equal(game.phase, "main");
  assert.equal(game.activeSide, "player");
  assert.equal(game.eventQueue.length, 0);
  assert.equal(game.winner, undefined);
});

test("zone entries become real card instances in the right zone", () => {
  const game = buildScenarioGame(
    scenario({
      player: { life: 12, mana: { green: 3 } },
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
  assert.equal(game.player.manaPool.green, 3);
  assert.equal(game.horde.poisonCounters, 2);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["giant_growth"]);
  assert.equal(game.player.hand[0].zone, "hand");

  const lands = game.player.battlefield;
  assert.equal(lands.length, 3);
  assert.ok(lands.every((card) => card.definitionId === "forest" && card.zone === "battlefield" && card.tapped));

  assert.deepEqual(game.player.graveyard.map((card) => card.definitionId), ["llanowar_elves"]);
  assert.equal(game.player.graveyard[0].zone, "graveyard");

  assert.equal(game.horde.battlefield.length, 2);
  assert.ok(game.horde.battlefield.every((card) => card.definitionId === "zombie_token" && card.controller === "horde"));
  // Scenario cards are assumed to be already in play, so they can act immediately.
  assert.ok(game.horde.battlefield.every((card) => !card.summoningSickness));

  assert.equal(game.horde.library[0].definitionId, "graf_harvest");
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
    ...game.player.library,
    ...game.player.hand,
    ...game.player.battlefield,
    ...game.player.graveyard,
    ...game.horde.library,
    ...game.horde.battlefield,
  ].map((card) => card.instanceId);

  assert.equal(new Set(ids).size, ids.length);
});

test("copies beyond the deck's count are minted instead of silently dropped", () => {
  // The Zombie deck holds a single Graf Harvest; a scenario may still want three on the board.
  const game = buildScenarioGame(scenario({ zones: { hordeBattlefield: [{ definitionId: "graf_harvest", amount: 3 }] } }));

  assert.equal(game.horde.battlefield.length, 3);
  assert.equal(new Set(game.horde.battlefield.map((card) => card.instanceId)).size, 3);
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
  let game = buildScenarioGame(scenario());
  // Forest is in the deck, so the first copies come out of the library; Graf Harvest belongs to the
  // Horde deck only once, so the later copies have to be minted — both paths in one run.
  for (let round = 0; round < 3; round += 1) {
    game = addScenarioCard(game, "playerBattlefield", { definitionId: "forest", amount: 2 });
    game = addScenarioCard(game, "hordeBattlefield", { definitionId: "graf_harvest" });
  }

  assert.equal(game.player.battlefield.length, 6);
  assert.equal(game.horde.battlefield.length, 3);
  const ids = [...game.player.battlefield, ...game.horde.battlefield, ...game.player.library, ...game.horde.library].map((card) => card.instanceId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(game.lastActionResult.ok, true);
});

test("placing an unknown card fails with a reason instead of doing nothing", () => {
  const game = addScenarioCard(buildScenarioGame(scenario()), "playerHand", { definitionId: "not_a_real_card" });

  assert.equal(game.lastActionResult.ok, false);
  assert.match(game.lastActionResult.reason, /not_a_real_card/);
  assert.equal(game.player.hand.length, 0);
});

test("a valid scenario reports no problems", () => {
  assert.deepEqual(validateScenario(scenario({ zones: { playerHand: [{ definitionId: "giant_growth" }] } })), []);
});
