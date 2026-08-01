import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addEnergySource,
  addStoredEnergy,
  clearBattlefield,
  destroyCard,
  drainEnergy,
  drawPlayerCard,
  grantEnergyForCard,
  refillEnergy,
  resolveAllEvents,
  resolveNextEvent,
  sendCardToGraveyard,
} from "../src/playground/actions";
import { BLANK_SCENARIO, buildScenarioGame } from "../src/playground/scenario";
import { castCard } from "../src/engine/GameActions";
import { MAX_PLAYER_LANDS } from "../src/engine/GameRules";
import { STORED_ENERGY_CAP } from "../src/engine/EnergySystem";

function scenario(overrides = {}) {
  return { ...BLANK_SCENARIO, ...overrides, zones: { ...BLANK_SCENARIO.zones, ...(overrides.zones ?? {}) } };
}

test("drawing reports a reason instead of failing silently on an empty library", () => {
  const game = buildScenarioGame(scenario());
  game.player.archive = [];

  const result = drawPlayerCard(game);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Archive is empty/i);
  assert.equal(result.game.lastActionResult.ok, false);
});

test("energy sources are lands on the battlefield and stop at the land cap", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } }));
  assert.equal(game.player.field.length, 0);

  for (let round = 0; round < MAX_PLAYER_LANDS; round += 1) {
    const result = addEnergySource(game);
    assert.equal(result.ok, true);
    game = result.game;
  }

  const lands = game.player.field;
  assert.equal(lands.length, MAX_PLAYER_LANDS);
  assert.ok(lands.every((card) => card.kinds.includes("SOURCE") && !card.exhausted && !card.activatedThisTurn));

  // The cap is the game's, not the playground's: it must refuse with a reason, not silently pile on.
  const overflow = addEnergySource(game);
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason, new RegExp(`${MAX_PLAYER_LANDS} energy sources`));
  assert.equal(overflow.game.lastActionResult.ok, false);
});

test("drain Exhausts every Source and empties the pool; refill readies them", () => {
  const start = buildScenarioGame(scenario({ player: { life: 50, energy: MAX_PLAYER_LANDS, storedEnergy: 2 } }));
  assert.equal(start.player.energyPool.stored, 2);

  const drained = drainEnergy(start);
  assert.equal(drained.ok, true);
  assert.ok(drained.game.player.field.every((card) => card.exhausted));
  assert.equal(drained.game.player.energyPool.stored, 0);

  const refilled = refillEnergy(drained.game);
  assert.equal(refilled.ok, true);
  assert.ok(refilled.game.player.field.every((card) => !card.exhausted && !card.activatedThisTurn));
  assert.equal(refilled.game.player.energyActionUsedThisTurn, false);

  // Refilling ready Sources is not an error, but with no Sources at all there is nothing to refill.
  const bare = refillEnergy(buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } })));
  assert.equal(bare.ok, false);
  assert.match(bare.reason, /no energy sources/i);
});

test("stored energy respects the engine's cap instead of growing forever", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } }));

  for (let round = 0; round < STORED_ENERGY_CAP; round += 1) game = addStoredEnergy(game).game;
  assert.equal(game.player.energyPool.stored, STORED_ENERGY_CAP);

  const overflow = addStoredEnergy(game);
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason, /cap/i);
});

test("play free grants exactly the printed cost and the card then casts through the normal path", () => {
  // No Energy anywhere: the only way this cast can succeed is the explicit Playground grant.
  const start = buildScenarioGame(
    scenario({ player: { life: 50, energy: 0, storedEnergy: 0 }, zones: { playerHand: [{ definitionId: "llanowar_elves" }] } }),
  );
  const handId = start.player.hand[0].instanceId;

  const blocked = castCard(start, handId);
  assert.equal(blocked.lastActionResult.ok, false);
  assert.match(blocked.lastActionResult.reason, /not enough available Energy/i);

  const granted = grantEnergyForCard(start, handId);
  assert.equal(granted.ok, true);
  const cast = castCard(granted.game, handId);
  assert.equal(cast.lastActionResult.ok, true);
  assert.equal(cast.player.field.filter((card) => card.definitionId === "llanowar_elves").length, 1);
  // The grant is exact: casting spent all of it.
  assert.deepEqual(cast.player.energyPool, { available: 0, stored: 0 });
});

test("destroy runs death triggers and to-graveyard does not", () => {
  const definition = scenario({
    hordeDeckId: "goblin_assault_horde",
    // No energy sources: the only player permanent is the creature this test is watching die.
    player: { life: 50, energy: 0, storedEnergy: 0 },
    zones: {
      hordeBattlefield: [{ definitionId: "pashalik_mons" }, { definitionId: "goblin_token_1_1_red" }],
      playerBattlefield: [{ definitionId: "llanowar_elves" }],
    },
  });

  const token = (game) => game.horde.field.find((card) => card.definitionId === "goblin_token_1_1_red").instanceId;

  const destroyed = destroyCard(buildScenarioGame(definition), token(buildScenarioGame(definition)));
  const moved = sendCardToGraveyard(buildScenarioGame(definition), token(buildScenarioGame(definition)));

  // Pashalik Mons burns an opposing creature for each Goblin death; a 1/1 Llanowar Elves dies to it.
  assert.equal(destroyed.game.player.field.length, 0);
  assert.equal(destroyed.game.player.memory.length, 1);

  // The raw move puts the same token in the graveyard without any death ever happening.
  assert.equal(moved.game.horde.memory.at(-1).definitionId, "goblin_token_1_1_red");
  assert.equal(moved.game.player.field.length, 1);
  assert.equal(moved.game.eventQueue.length, 0);
});

test("wiping a board is silent: nothing dies, so nothing triggers", () => {
  // Same Pashalik Mons setup as above. Destroying a Goblin burns a player creature; clearing the
  // table has to leave that creature alone, or tidying up between tests would change the test.
  const game = buildScenarioGame(
    scenario({
      hordeDeckId: "goblin_assault_horde",
      player: { life: 50, energy: 0, storedEnergy: 0 },
      zones: {
        hordeBattlefield: [{ definitionId: "pashalik_mons" }, { definitionId: "goblin_token_1_1_red" }],
        playerBattlefield: [{ definitionId: "llanowar_elves" }],
      },
    }),
  );

  const wiped = clearBattlefield(game, "horde");
  assert.equal(wiped.ok, true);
  assert.equal(wiped.game.horde.field.length, 0);
  assert.equal(wiped.game.horde.memory.length, 2);
  assert.ok(wiped.game.horde.memory.every((card) => card.zone === "memory"));
  assert.equal(wiped.game.player.field.length, 1, "no death trigger ever fired");
  assert.equal(wiped.game.eventQueue.length, 0);

  const again = clearBattlefield(wiped.game, "horde");
  assert.equal(again.ok, false);
  assert.match(again.reason, /already empty/i);
});

test("events resolve one at a time or all at once, and an empty queue says so", () => {
  const game = buildScenarioGame(scenario());

  assert.equal(resolveNextEvent(game).ok, false);
  assert.match(resolveNextEvent(game).reason, /queue is empty/i);
  assert.equal(resolveAllEvents(game).ok, false);

  game.eventQueue = [
    { id: "e1", type: "CARD_PLAYED", payload: { witnessIds: [] } },
    { id: "e2", type: "CARD_PLAYED", payload: { witnessIds: [] } },
  ];
  const stepped = resolveNextEvent(game);
  assert.equal(stepped.ok, true);
  assert.equal(stepped.game.eventQueue.length, 1);

  const drained = resolveAllEvents(stepped.game);
  assert.equal(drained.game.eventQueue.length, 0);
});

test("the same action sequence over two rebuilds lands on identical states", () => {
  // This is the property replay depends on: restart rebuilds the scenario, and re-running the
  // recorded steps has to reproduce the run exactly — including instance ids and RNG position.
  const definition = scenario({
    seed: "replayable",
    player: { life: 50, energy: 0, storedEnergy: 0 },
    zones: { playerBattlefield: [{ definitionId: "forest", amount: 3 }], hordeBattlefield: [{ definitionId: "zombie_token" }] },
  });

  const run = () => {
    let game = buildScenarioGame(definition);
    game = drawPlayerCard(game).game;
    game = addEnergySource(game).game;
    game = addStoredEnergy(game).game;
    game = drawPlayerCard(game).game;
    const token = game.horde.field[0].instanceId;
    game = destroyCard(game, token).game;
    return drainEnergy(game).game;
  };

  assert.deepEqual(run(), run());
});
