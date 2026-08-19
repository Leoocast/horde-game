import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANON_SEED_DECKS,
  CANON_SEED_ENTROPY_ALPHABET,
  CANON_SEED_ENTROPY_LENGTH,
  canonSeedPreparationTurns,
  decodeCanonSeed,
  encodeCanonSeed,
  isCanonSeed,
  normalizeCanonSeedEntropy,
} from "../src/content/CanonSeed";
import { contentCatalog } from "../src/content/bootstrap";
import { getHostDeck, getPlayerDeck } from "../src/data/decks";
import { createInitialGame } from "../src/engine/GameState";
import {
  DEFAULT_PLAYER_DECK_SOURCE_COUNT,
  prepareInitialDeckPools,
  shuffleInitialDeckOrder,
} from "../src/engine/InitialDeckOrder";

test("HF1 uses stable language-neutral deck codes", () => {
  assert.deepEqual(
    CANON_SEED_DECKS.map(({ code, side, qualifiedDeckKey }) => ({ code, side, qualifiedDeckKey })),
    [
      { code: "ELA", side: "player", qualifiedDeckKey: "hostfall.core/pact_of_elarion" },
      { code: "CEC", side: "player", qualifiedDeckKey: "hostfall.core/court_of_the_crimson_eclipse" },
      { code: "GRV", side: "host", qualifiedDeckKey: "hostfall.core/uprising_of_the_graveless" },
      { code: "VRK", side: "host", qualifiedDeckKey: "hostfall.core/legion_of_varka" },
    ],
  );
});

test("Canon Seed round-trips the agreed HF1 example", () => {
  const identity = decodeCanonSeed("hf1-ela-grv-le2-gpt");

  assert.deepEqual(identity, {
    canonCode: "HF1-ELA-GRV-LE2-GPT",
    format: "HF1",
    entropy: "LEGPT",
    playerDeckKey: "hostfall.core/pact_of_elarion",
    hostDeckKey: "hostfall.core/uprising_of_the_graveless",
    difficulty: "normal",
    preparationTurns: 3,
    gameMode: "standard",
    contentRevision: contentCatalog.revision,
    rulesetVersion: 1,
  });
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(
    encodeCanonSeed({
      entropy: identity.entropy,
      playerDeckKey: identity.playerDeckKey,
      hostDeckKey: identity.hostDeckKey,
      difficulty: identity.difficulty,
    }),
    identity.canonCode,
  );
});

test("Canon entropy is exactly five case-normalized base-36 characters", () => {
  assert.equal(CANON_SEED_ENTROPY_ALPHABET, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  assert.equal(CANON_SEED_ENTROPY_LENGTH, 5);
  assert.equal(normalizeCanonSeedEntropy("a0z9q"), "A0Z9Q");
  for (const invalid of ["ABCD", "ABCDEF", "AB CD", "AB-CD", "ÁBC12", "devwin"]) {
    assert.throws(() => normalizeCanonSeedEntropy(invalid), /exactly five/u);
  }
});

test("Canon Seed rejects malformed, localized, unknown and technical seed values", () => {
  for (const invalid of [
    " HF1-ELA-GRV-LE2-GPT",
    "HF1-ELA-GRV-LE2-GPT ",
    "HF2-ELA-GRV-LE2-GPT",
    "HF1-ELA-SIN-LE2-GPT",
    "HF1-GRV-ELA-LE2-GPT",
    "HF1-ELA-GRV-LE0-GPT",
    "HF1-ELA-GRV-LE2-GP!",
    "developer",
    "devlost",
    "devwin",
  ]) {
    assert.equal(isCanonSeed(invalid), false, invalid);
    assert.throws(() => decodeCanonSeed(invalid), /Canon Seed/u);
  }
});

test("HF1 difficulty derives Preparation and never serializes it independently", () => {
  assert.equal(canonSeedPreparationTurns("easy"), 4);
  assert.equal(canonSeedPreparationTurns("normal"), 3);
  assert.equal(canonSeedPreparationTurns("hard"), 2);

  for (const [difficulty, digit, preparationTurns] of [
    ["easy", "1", 4],
    ["normal", "2", 3],
    ["hard", "3", 2],
  ]) {
    const code = encodeCanonSeed({
      entropy: "LEGPT",
      playerDeckKey: "pact_of_elarion",
      hostDeckKey: "uprising_of_the_graveless",
      difficulty,
    });
    assert.equal(code, `HF1-ELA-GRV-LE${digit}-GPT`);
    assert.equal(decodeCanonSeed(code).preparationTurns, preparationTurns);
  }
});

test("difficulty changes rules but not the deck order encoded by the same entropy", () => {
  const orders = ["1", "2", "3"].map((difficultyCode) => {
    const identity = decodeCanonSeed(`HF1-ELA-GRV-LE${difficultyCode}-GPT`);
    const game = createInitialGame(
      getPlayerDeck(identity.playerDeckKey),
      getHostDeck(identity.hostDeckKey),
      identity.entropy,
      identity.preparationTurns,
      identity.difficulty,
      identity.gameMode,
    );
    return {
      player: [...game.player.hand, ...game.player.archive].map((card) => card.instanceId),
      host: game.host.archive.map((card) => card.instanceId),
      randomState: game.currentRandomState,
      setupTurns: game.setupTurnsRemaining,
    };
  });

  assert.deepEqual(orders[0].player, orders[1].player);
  assert.deepEqual(orders[1].player, orders[2].player);
  assert.deepEqual(orders[0].host, orders[1].host);
  assert.deepEqual(orders[1].host, orders[2].host);
  assert.equal(orders[0].randomState, orders[1].randomState);
  assert.equal(orders[1].randomState, orders[2].randomState);
  assert.deepEqual(orders.map(({ setupTurns }) => setupTurns), [4, 3, 2]);
});

test("the shared fast order matches createInitialGame in every builtin matchup", () => {
  const playerKeys = ["pact_of_elarion", "court_of_the_crimson_eclipse"];
  const hostKeys = ["uprising_of_the_graveless", "legion_of_varka"];

  for (const playerKey of playerKeys) {
    for (const hostKey of hostKeys) {
      const playerDeck = getPlayerDeck(playerKey);
      const hostDeck = getHostDeck(hostKey);
      const pools = prepareInitialDeckPools(playerDeck, hostDeck);
      const expectedSourceCount = playerDeck.gameplayLandCount ?? DEFAULT_PLAYER_DECK_SOURCE_COUNT;
      assert.equal(pools.player.filter((card) => card.kinds.includes("SOURCE")).length, expectedSourceCount);

      for (const seed of ["00000", "LEGPT", "Z9Y8X"]) {
        const expected = shuffleInitialDeckOrder(pools, seed);
        const game = createInitialGame(playerDeck, hostDeck, seed, 3, "normal", "standard");
        assert.deepEqual(
          [...game.player.hand, ...game.player.archive].map((card) => card.instanceId),
          expected.playerArchive.map((card) => card.instanceId),
          `${playerKey}/${hostKey}/${seed} player`,
        );
        assert.deepEqual(
          game.host.archive.map((card) => card.instanceId),
          expected.hostArchive.map((card) => card.instanceId),
          `${playerKey}/${hostKey}/${seed} host`,
        );
        assert.equal(game.currentRandomState, expected.randomState, `${playerKey}/${hostKey}/${seed} RNG`);
      }
    }
  }
});
