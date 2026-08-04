import assert from "node:assert/strict";
import { test } from "node:test";

import { activeDefenseArrowLinks } from "../src/components/battlefieldLayout";
import { buffSurgeRenderMode } from "../src/components/buffSurgePolicy";
import { remainingArchiveDiscardPreview } from "../src/components/hostArchiveCounter";
import { memoryCardsNewestFirst, newestMemoryCard } from "../src/components/memoryPresentation";
import { addCard, createTestGame, customCard } from "./engineTestUtils";

test("the Host Archive counter counts attack discards down without displaying zero", () => {
  assert.equal(remainingArchiveDiscardPreview(7, 0), 7);
  assert.equal(remainingArchiveDiscardPreview(7, 1), 6);
  assert.equal(remainingArchiveDiscardPreview(7, 6), 1);
  assert.equal(remainingArchiveDiscardPreview(7, 7), undefined);
  assert.equal(remainingArchiveDiscardPreview(0, 0), undefined);
});

test("defense arrows disappear as soon as either combat endpoint leaves the field", () => {
  const game = createTestGame();
  const attacker = addCard(game, customCard("attacker", "host"));
  const blocker = addCard(game, customCard("blocker", "player"));
  game.combat.hostAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };

  assert.deepEqual(activeDefenseArrowLinks(game), [{
    attackerId: attacker.instanceId,
    blockerId: blocker.instanceId,
  }]);

  game.player.field = [];
  assert.deepEqual(activeDefenseArrowLinks(game), []);

  game.player.field = [blocker];
  game.host.field = [];
  assert.deepEqual(activeDefenseArrowLinks(game), []);
});

test("large group buffs use the lightweight renderer instead of one WebGL context per card", () => {
  assert.equal(buffSurgeRenderMode(1), "webgl");
  assert.equal(buffSurgeRenderMode(4), "webgl");
  assert.equal(buffSurgeRenderMode(5), "css");
  assert.equal(buffSurgeRenderMode(24), "css");
});

test("Memory presents the most recently moved card first without mutating game state", () => {
  const oldest = { instanceId: "oldest" };
  const middle = { instanceId: "middle" };
  const newest = { instanceId: "newest" };
  const memory = [oldest, middle, newest];

  assert.deepEqual(memoryCardsNewestFirst(memory), [newest, middle, oldest]);
  assert.equal(newestMemoryCard(memory), newest);
  assert.deepEqual(memory, [oldest, middle, newest]);
});
