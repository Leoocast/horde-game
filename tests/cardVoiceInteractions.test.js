import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePlayerCombat } from "../src/engine/CombatResolver";
import { resolveCardVoiceCue, resolveCardVoiceCueBatch } from "../src/store/cardVoiceInteractions";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("Vaelor's entry cue layers his line with the stone impact", () => {
  const game = createTestGame("vaelor-entry-audio");
  const vaelor = cardFromDeck("vaelor_emerald_guardian", "player");

  const cue = resolveCardVoiceCue({
    type: "INVOKED",
    card: vaelor,
    previousGame: game,
  });

  assert.equal(cue?.sfx, "vaelorLinePlay");
  assert.deepEqual(cue?.additionalSfx, ["stoneCrash"]);
});

test("Countess entry interactions use card types instead of card names", () => {
  const beforeCountess = createTestGame("countess-voice-entry");
  const countess = cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player");
  const enterCue = resolveCardVoiceCue({
    type: "INVOKED",
    card: countess,
    previousGame: beforeCountess,
  });
  assert.equal(enterCue?.sfx, "countessEnter");

  const countessInPlay = createTestGame("countess-voice-human");
  addCard(countessInPlay, cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player"));
  const sentinel = cardFromDeck("sentinel_of_the_lunar_eye", "player");
  assert.equal(sentinel.subtypes.includes("Human"), true);
  assert.equal(
    resolveCardVoiceCue({
      type: "INVOKED",
      card: sentinel,
      previousGame: countessInPlay,
    })?.sfx,
    "countessHumans",
  );

  const nonHuman = cardFromDeck("guardian_of_the_night_threshold", "player");
  assert.equal(
    resolveCardVoiceCue({
      type: "INVOKED",
      card: nonHuman,
      previousGame: countessInPlay,
    }),
    undefined,
  );
});

test("Countess speaks exactly on her third confirmed attack", () => {
  const countess = cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player");
  assert.equal(resolveCardVoiceCue({ type: "ATTACKS", card: countess, attackNumber: 2 }), undefined);
  const thirdAttackCue = resolveCardVoiceCue({ type: "ATTACKS", card: countess, attackNumber: 3 });
  assert.equal(thirdAttackCue?.sfx, "countessThirdAttack");
  assert.equal(resolveCardVoiceCue({ type: "ATTACKS", card: countess, attackNumber: 4 }), undefined);
});

test("only one Countess claims the third-attack line in the same combat", () => {
  const first = cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player");
  const second = cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player");
  const matches = resolveCardVoiceCueBatch([
    { type: "ATTACKS", card: first, attackNumber: 3 },
    { type: "ATTACKS", card: second, attackNumber: 3 },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].cardId, first.instanceId);
  assert.equal(matches[0].cue.sfx, "countessThirdAttack");
});

test("Countess defense has half silence and evenly split spoken variants", () => {
  const countess = cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player");
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
  const countess = addCard(game, cardFromDeck("mirevna_countess_of_the_crimson_eclipse", "player"));
  addCard(game, customCard("countess_attack_observer", "host", { endurance: 99 }));

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
