import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addEnergySource,
  addStoredEnergy,
  clearBattlefield,
  destroyCard,
  drainEnergy,
  drawPlayerCard,
  grantManaForCard,
  refillEnergy,
  resolveAllEvents,
  resolveNextEvent,
  sendCardToGraveyard,
} from "../src/playground/actions";
import { BLANK_SCENARIO, buildScenarioGame } from "../src/playground/scenario";
import { castCard } from "../src/engine/GameActions";
import { MAX_PLAYER_LANDS } from "../src/engine/GameRules";
import { STORED_MANA_CAP } from "../src/engine/ManaSystem";

function scenario(overrides = {}) {
  return { ...BLANK_SCENARIO, ...overrides, zones: { ...BLANK_SCENARIO.zones, ...(overrides.zones ?? {}) } };
}

test("drawing reports a reason instead of failing silently on an empty library", () => {
  const game = buildScenarioGame(scenario());
  game.player.library = [];

  const result = drawPlayerCard(game);
  assert.equal(result.ok, false);
  assert.match(result.reason, /library is empty/i);
  assert.equal(result.game.lastActionResult.ok, false);
});

test("energy sources are lands on the battlefield and stop at the land cap", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } }));
  assert.equal(game.player.battlefield.length, 0);

  for (let round = 0; round < MAX_PLAYER_LANDS; round += 1) {
    const result = addEnergySource(game);
    assert.equal(result.ok, true);
    game = result.game;
  }

  const lands = game.player.battlefield;
  assert.equal(lands.length, MAX_PLAYER_LANDS);
  assert.ok(lands.every((card) => card.cardTypes.includes("Land") && !card.tapped && !card.activatedThisTurn));

  // The cap is the game's, not the playground's: it must refuse with a reason, not silently pile on.
  const overflow = addEnergySource(game);
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason, new RegExp(`${MAX_PLAYER_LANDS} energy sources`));
  assert.equal(overflow.game.lastActionResult.ok, false);
});

test("drain taps every source and empties the pool; refill gives it all back", () => {
  const start = buildScenarioGame(scenario({ player: { life: 50, energy: MAX_PLAYER_LANDS, storedEnergy: 2 } }));
  assert.equal(start.player.manaPool.colorless, 2);

  const drained = drainEnergy(start);
  assert.equal(drained.ok, true);
  assert.ok(drained.game.player.battlefield.every((card) => card.tapped));
  assert.equal(drained.game.player.manaPool.colorless, 0);

  const refilled = refillEnergy(drained.game);
  assert.equal(refilled.ok, true);
  assert.ok(refilled.game.player.battlefield.every((card) => !card.tapped && !card.activatedThisTurn));
  assert.equal(refilled.game.player.energyActionUsedThisTurn, false);

  // Refilling untapped lands is not an error, but with no lands at all there is nothing to refill.
  const bare = refillEnergy(buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } })));
  assert.equal(bare.ok, false);
  assert.match(bare.reason, /no energy sources/i);
});

test("stored energy respects the engine's cap instead of growing forever", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, energy: 0, storedEnergy: 0 } }));

  for (let round = 0; round < STORED_MANA_CAP; round += 1) game = addStoredEnergy(game).game;
  assert.equal(game.player.manaPool.colorless, STORED_MANA_CAP);

  const overflow = addStoredEnergy(game);
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason, /cap/i);
});

test("play free grants exactly the printed cost and the card then casts through the normal path", () => {
  // No energy anywhere: the only way this cast can succeed is the granted mana.
  const start = buildScenarioGame(
    scenario({ player: { life: 50, energy: 0, storedEnergy: 0 }, zones: { playerHand: [{ definitionId: "llanowar_elves" }] } }),
  );
  const handId = start.player.hand[0].instanceId;

  const blocked = castCard(start, handId);
  assert.equal(blocked.lastActionResult.ok, false);
  assert.match(blocked.lastActionResult.reason, /not enough available mana/i);

  const granted = grantManaForCard(start, handId);
  assert.equal(granted.ok, true);
  const cast = castCard(granted.game, handId);
  assert.equal(cast.lastActionResult.ok, true);
  assert.equal(cast.player.battlefield.filter((card) => card.definitionId === "llanowar_elves").length, 1);
  // The grant is exact: casting spent all of it.
  assert.deepEqual(cast.player.manaPool, { green: 0, red: 0, blue: 0, white: 0, black: 0, colorless: 0 });
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

  const token = (game) => game.horde.battlefield.find((card) => card.definitionId === "goblin_token_1_1_red").instanceId;

  const destroyed = destroyCard(buildScenarioGame(definition), token(buildScenarioGame(definition)));
  const moved = sendCardToGraveyard(buildScenarioGame(definition), token(buildScenarioGame(definition)));

  // Pashalik Mons burns an opposing creature for each Goblin death; a 1/1 Llanowar Elves dies to it.
  assert.equal(destroyed.game.player.battlefield.length, 0);
  assert.equal(destroyed.game.player.graveyard.length, 1);

  // The raw move puts the same token in the graveyard without any death ever happening.
  assert.equal(moved.game.horde.graveyard.at(-1).definitionId, "goblin_token_1_1_red");
  assert.equal(moved.game.player.battlefield.length, 1);
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
  assert.equal(wiped.game.horde.battlefield.length, 0);
  assert.equal(wiped.game.horde.graveyard.length, 2);
  assert.ok(wiped.game.horde.graveyard.every((card) => card.zone === "graveyard"));
  assert.equal(wiped.game.player.battlefield.length, 1, "no death trigger ever fired");
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
    { id: "e1", type: "CARD_CAST", payload: { witnessIds: [] } },
    { id: "e2", type: "CARD_CAST", payload: { witnessIds: [] } },
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
    const token = game.horde.battlefield[0].instanceId;
    game = destroyCard(game, token).game;
    return drainEnergy(game).game;
  };

  assert.deepEqual(run(), run());
});
