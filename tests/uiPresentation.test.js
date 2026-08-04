import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { activeDefenseArrowLinks, isBehindInStackOrder, isFrontOfCardStack } from "../src/components/battlefieldLayout";
import { buffSurgeRenderMode } from "../src/components/buffSurgePolicy";
import { remainingArchiveDiscardPreview } from "../src/components/hostArchiveCounter";
import { memoryCardsNewestFirst, newestMemoryCard } from "../src/components/memoryPresentation";
import { CardTraitIcon } from "../src/components/CardTraitIcon";
import { cardLabelCamelCase } from "../src/i18n/cardLocalization";
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

test("only the front card in a visual stack owns the shared trait badges", () => {
  assert.equal(isFrontOfCardStack(0, 1), true);
  assert.equal(isFrontOfCardStack(0, 3), false);
  assert.equal(isFrontOfCardStack(1, 3), false);
  assert.equal(isFrontOfCardStack(2, 3), true);
});

test("shared trait badges render icons and preserve Poison amounts", () => {
  const flying = renderToStaticMarkup(createElement(CardTraitIcon, { keyword: "FLYING" }));
  const poison = renderToStaticMarkup(createElement(CardTraitIcon, { keyword: "POISON {3}", showAmount: true }));

  assert.match(flying, /<svg/);
  assert.match(poison, /<svg/);
  assert.match(poison, /<small[^>]*>3<\/small>/);
});

test("cards behind the front of a stack use the left defense-arrow anchor", () => {
  const back = { id: "back" };
  const middle = { id: "middle" };
  const front = { id: "front" };
  const slots = [back, middle, front];

  assert.equal(isBehindInStackOrder(back, slots), true);
  assert.equal(isBehindInStackOrder(middle, slots), true);
  assert.equal(isBehindInStackOrder(front, slots), false);
  assert.equal(isBehindInStackOrder(front, [front]), false);
});

test("card names and type lines use initial capitals on every word", () => {
  assert.equal(
    cardLabelCamelCase("tributo de los cuatro pesares", "es"),
    "Tributo De Los Cuatro Pesares",
  );
  assert.equal(
    cardLabelCamelCase("eco de crónica — elfo druida", "es"),
    "Eco De Crónica — Elfo Druida",
  );
});
