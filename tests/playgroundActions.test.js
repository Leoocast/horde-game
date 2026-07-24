import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addPlayerMana,
  clearPlayerMana,
  destroyCard,
  drawPlayerCard,
  grantManaForCard,
  resolveAllEvents,
  resolveNextEvent,
  sendCardToGraveyard,
} from "../src/playground/actions";
import { BLANK_SCENARIO, buildScenarioGame } from "../src/playground/scenario";
import { castCard } from "../src/engine/GameActions";

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

test("mana can be added per color and cleared", () => {
  let game = buildScenarioGame(scenario({ player: { life: 50, mana: { green: 2 } } }));

  game = addPlayerMana(game, "G", 3).game;
  assert.equal(game.player.manaPool.green, 5);

  game = addPlayerMana(game, "C").game;
  assert.equal(game.player.manaPool.colorless, 1);

  game = clearPlayerMana(game).game;
  assert.deepEqual(game.player.manaPool, { green: 0, red: 0, blue: 0, white: 0, black: 0, colorless: 0 });
});

test("play free grants exactly the printed cost and the card then casts through the normal path", () => {
  // No lands anywhere: the only way this cast can succeed is the granted mana.
  const start = buildScenarioGame(scenario({ zones: { playerHand: [{ definitionId: "llanowar_elves" }] } }));
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
    zones: { playerBattlefield: [{ definitionId: "forest", amount: 3 }], hordeBattlefield: [{ definitionId: "zombie_token" }] },
  });

  const run = () => {
    let game = buildScenarioGame(definition);
    game = drawPlayerCard(game).game;
    game = addPlayerMana(game, "G", 2).game;
    game = drawPlayerCard(game).game;
    const token = game.horde.battlefield[0].instanceId;
    game = destroyCard(game, token).game;
    return clearPlayerMana(game).game;
  };

  assert.deepEqual(run(), run());
});
