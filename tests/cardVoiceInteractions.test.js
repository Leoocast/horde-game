import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePlayerCombat } from "../src/engine/CombatResolver";
import { resolveCardVoiceCue, resolveCardVoiceCueBatch } from "../src/store/cardVoiceInteractions";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("Countess entry interactions use card types instead of card names", () => {
  const beforeCountess = createTestGame("countess-voice-entry");
  const countess = cardFromDeck("eternal_feast_countess", "player");
  const enterCue = resolveCardVoiceCue({
    type: "ENTERS_BATTLEFIELD",
    card: countess,
    previousGame: beforeCountess,
  });
  assert.equal(enterCue?.sfx, "countessEnter");

  const countessInPlay = createTestGame("countess-voice-human");
  addCard(countessInPlay, cardFromDeck("eternal_feast_countess", "player"));
  const sentinel = cardFromDeck("blood_sentinel", "player");
  assert.equal(sentinel.subtypes.includes("Human"), true);
  assert.equal(
    resolveCardVoiceCue({
      type: "ENTERS_BATTLEFIELD",
      card: sentinel,
      previousGame: countessInPlay,
    })?.sfx,
    "countessHumans",
  );

  const nonHuman = cardFromDeck("crypt_guardian", "player");
  assert.equal(
    resolveCardVoiceCue({
      type: "ENTERS_BATTLEFIELD",
      card: nonHuman,
      previousGame: countessInPlay,
    }),
    undefined,
  );
});

test("Countess speaks exactly on her third confirmed attack", () => {
  const countess = cardFromDeck("eternal_feast_countess", "player");
  assert.equal(resolveCardVoiceCue({ type: "ATTACKS", card: countess, attackNumber: 2 }), undefined);
  const thirdAttackCue = resolveCardVoiceCue({ type: "ATTACKS", card: countess, attackNumber: 3 });
  assert.equal(thirdAttackCue?.sfx, "countessThirdAttack");
  assert.equal(resolveCardVoiceCue({ type: "ATTACKS", card: countess, attackNumber: 4 }), undefined);
});

test("only one Countess claims the third-attack line in the same combat", () => {
  const first = cardFromDeck("eternal_feast_countess", "player");
  const second = cardFromDeck("eternal_feast_countess", "player");
  const matches = resolveCardVoiceCueBatch([
    { type: "ATTACKS", card: first, attackNumber: 3 },
    { type: "ATTACKS", card: second, attackNumber: 3 },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].cardId, first.instanceId);
  assert.equal(matches[0].cue.sfx, "countessThirdAttack");
});

test("Countess defense has half silence and evenly split spoken variants", () => {
  const countess = cardFromDeck("eternal_feast_countess", "player");
  assert.equal(
    resolveCardVoiceCue({ type: "BLOCKS", card: countess }, randomSequence(0.75)),
    undefined,
  );
  const pourCue = resolveCardVoiceCue(
    { type: "BLOCKS", card: countess },
    randomSequence(0.25, 0.1),
  );
  assert.equal(pourCue?.sfx, "countessPour");
  assert.equal(
    resolveCardVoiceCue({ type: "BLOCKS", card: countess }, randomSequence(0.25, 0.9))?.sfx,
    "countessWeak",
  );
});

test("player combat persists confirmed attack counts on each creature", () => {
  let game = createTestGame("countess-confirmed-attacks");
  const countess = addCard(game, cardFromDeck("eternal_feast_countess", "player"));
  addCard(game, customCard("countess_attack_observer", "horde", { toughness: 99 }));

  for (let expected = 1; expected <= 3; expected += 1) {
    game.combat.playerAttackers = [countess.instanceId];
    game = resolvePlayerCombat(game);
    const current = game.player.field.find((card) => card.instanceId === countess.instanceId);
    assert.equal(current?.attacksMade, expected);
  }
});

function randomSequence(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
