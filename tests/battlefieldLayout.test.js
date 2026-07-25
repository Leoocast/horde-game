import assert from "node:assert/strict";
import { test } from "node:test";

import { groupBattlefieldCopies, holdCombatCasualties } from "../src/components/battlefieldLayout";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

// The battlefield holds a dead card's slot open ("a ghost") for the whole Horde sequence so the
// row never re-centers between attackers. These tests drive that logic the way a render pass
// does — one call per render, refs carried across calls.

function makeBoard() {
  return {
    casualties: { current: new Map() },
    previousCards: { current: [] },
    cardOrder: { current: new Map() },
  };
}

/** Mimics `renderCardStacks`: the creature row is the only row that registers an entry order,
 *  and it prunes every card that is not currently in that row on every render. */
function renderCreatureRow(board, displayedCards) {
  const creatures = displayedCards.filter((card) => card.cardTypes.includes("Creature"));
  const activeIds = new Set(creatures.map((card) => card.instanceId));
  for (const instanceId of [...board.cardOrder.current.keys()]) {
    if (!activeIds.has(instanceId)) board.cardOrder.current.delete(instanceId);
  }
  for (const card of creatures) {
    if (!board.cardOrder.current.has(card.instanceId)) {
      board.cardOrder.current.set(card.instanceId, board.cardOrder.current.size);
    }
  }
  return creatures;
}

function renderFrame(board, cards, holdCasualties) {
  const displayed = holdCombatCasualties(cards, holdCasualties, board.casualties, board.previousCards, board.cardOrder);
  return renderCreatureRow(board, displayed);
}

test("a horde death mid-sequence keeps its slot even with an other permanent on the board", () => {
  const game = createTestGame();
  const board = makeBoard();
  const zombieA = addCard(game, customCard("zombie_a", "horde", { subtypes: ["Zombie"], isToken: true }));
  const zombieB = addCard(game, customCard("zombie_b", "horde", { subtypes: ["Zombie"], isToken: true }));
  // Graf Harvest lives in the "other permanents" dock, so it never registers a creature-row order.
  const grafHarvest = addCard(game, cardFromDeck("graf_harvest", "horde"));

  renderFrame(board, [zombieA, zombieB, grafHarvest], true);
  const afterDeath = renderFrame(board, [zombieB, grafHarvest], true);

  assert.deepEqual(
    afterDeath.map((card) => card.instanceId),
    [zombieA.instanceId, zombieB.instanceId],
    "the dead zombie must still hold its slot; the enchantment must not consume it",
  );
});

test("a player defender's death mid-sequence keeps its slot even with lands on the board", () => {
  const game = createTestGame();
  const board = makeBoard();
  const blocker = addCard(game, customCard("blocker", "player"));
  const survivor = addCard(game, customCard("survivor", "player"));
  // Lands are drawn by the mana core, never by the creature row, so they too look "unregistered".
  const forests = Array.from({ length: 5 }, () => addCard(game, cardFromDeck("forest", "player")));

  renderFrame(board, [blocker, survivor, ...forests], true);
  const afterDeath = renderFrame(board, [survivor, ...forests], true);

  assert.deepEqual(
    afterDeath.map((card) => card.instanceId),
    [blocker.instanceId, survivor.instanceId],
    "the dead blocker must still hold its slot; lands must not consume it",
  );
});

test("held slots are released once the sequence ends", () => {
  const game = createTestGame();
  const board = makeBoard();
  const blocker = addCard(game, customCard("blocker", "player"));
  const survivor = addCard(game, customCard("survivor", "player"));

  renderFrame(board, [blocker, survivor], true);
  renderFrame(board, [survivor], true);
  const afterSequence = renderFrame(board, [survivor], false);

  assert.deepEqual(afterSequence.map((card) => card.instanceId), [survivor.instanceId]);
  assert.equal(board.casualties.current.size, 0);
});

test("a creature arriving mid-sequence still takes over a held slot", () => {
  const game = createTestGame();
  const board = makeBoard();
  const first = addCard(game, customCard("first", "horde"));
  const second = addCard(game, customCard("second", "horde"));
  const summoned = addCard(game, customCard("summoned", "horde"));

  renderFrame(board, [first, second], true);
  const afterDeath = renderFrame(board, [first], true);
  assert.equal(afterDeath.length, 2);

  const afterSummon = renderFrame(board, [first, summoned], true);
  assert.deepEqual(
    afterSummon.map((card) => card.instanceId),
    [first.instanceId, summoned.instanceId],
    "the arrival reuses the casualty's slot instead of landing past a hole",
  );
});

test("grouping stays frozen while the sequence runs, then settles afterwards", () => {
  const game = createTestGame();
  const cardOrder = new Map();
  const familyOrder = new Map();
  const groupKeys = new Map();
  const groupMeta = new Map();
  const left = addCard(game, customCard("ghoul", "horde", { power: 2, toughness: 2 }));
  const right = addCard(game, customCard("ghoul", "horde", { power: 2, toughness: 2 }));
  cardOrder.set(left.instanceId, 0);
  cardOrder.set(right.instanceId, 1);
  familyOrder.set(left.definitionId, 0);

  const before = groupBattlefieldCopies(game, [left, right], cardOrder, familyOrder, new Map(), new Map(), undefined, groupKeys, groupMeta, true);
  assert.equal(before.length, 1, "identical copies share one stack");

  // A lord dying mid-combat drops a buff: stats change, but the stacks must not re-key.
  right.temporaryPower = 3;
  const during = groupBattlefieldCopies(game, [left, right], cardOrder, familyOrder, new Map(), new Map(), undefined, groupKeys, groupMeta, true);
  assert.deepEqual(during.map((group) => group.key), before.map((group) => group.key));

  const after = groupBattlefieldCopies(game, [left, right], cardOrder, familyOrder, new Map(), new Map(), undefined, groupKeys, groupMeta, false);
  assert.equal(after.length, 2, "once the sequence is over the differing stats split the stack");
});
