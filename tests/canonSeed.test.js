import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANON_SEED_COMPATIBILITY,
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
import { acceptOpeningHand, createInitialGame, mulliganOpeningHand } from "../src/engine/GameState";
import { endPlayerTurn } from "../src/engine/PhaseManager";
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

test("HF1-ELA-GRV-082-QC5 preserves the first Canon opening and Preparation draws", () => {
  const identity = decodeCanonSeed("HF1-ELA-GRV-082-QC5");
  let game = createInitialGame(
    getPlayerDeck(identity.playerDeckKey),
    getHostDeck(identity.hostDeckKey),
    identity.entropy,
    identity.preparationTurns,
    identity.difficulty,
    identity.gameMode,
  );
  assert.deepEqual(game.player.hand.map((card) => card.definitionId), [
    "river_of_elarion",
    "vaelor_emerald_guardian",
    "hydra_of_the_black_bough",
    "veiled_dawn_flower",
    "kaelor_stormcaller",
    "river_of_elarion",
    "kaelor_stormcaller",
  ]);
  assert.deepEqual(game.player.archive.map((card) => card.definitionId), [
    "shield_of_the_heir", "elixir_of_the_first_leaf", "liora_keeper_of_the_grove", "river_of_elarion",
    "clash_of_echoes", "the_judgment_of_elarion", "kaelor_stormcaller", "clash_of_echoes",
    "river_of_elarion", "echo_of_the_forgotten_city", "river_of_elarion", "the_judgment_of_elarion",
    "maela_watcher_of_the_heights", "liora_keeper_of_the_grove", "echo_of_the_forgotten_city",
    "aelyra_heir_of_elarion", "maela_watcher_of_the_heights", "hydra_of_the_black_bough",
    "river_of_elarion", "aelyra_heir_of_elarion", "river_of_elarion", "veiled_dawn_flower",
    "aelyra_heir_of_elarion", "river_of_elarion", "river_of_elarion", "elixir_of_the_first_leaf",
  ]);
  const expectedHostArchive = [
    "graveless_soldier", "return_to_memory", "graveless_soldier", "graveless_soldier",
    "harvester_of_the_fallen", "graveless_soldier", "mastiff_of_the_overflowing_ossuary",
    "graveless_titan", "graveless_titan", "winged_stalker_of_the_crypt", "graveless_soldier",
    "graveless_soldier", "ossuary_rider", "tribute_of_the_four_sorrows", "graveless_soldier",
    "three_eyed_corpse_gorger", "graveless_soldier", "barrow_wallbreaker", "spore_infested",
    "graveless_soldier", "memory_thief", "graveless_soldier", "nerezh_graveless_matriarch",
    "inexhaustible_ossuary", "graveless_soldier", "harvester_of_the_fallen",
    "nerezh_graveless_matriarch", "graveless_soldier", "return_to_memory", "graveless_titan",
    "graveless_titan", "graveless_soldier", "graveless_soldier", "graveless_soldier",
    "devourer_of_the_last_memory", "the_broken_headstone", "graveless_soldier", "memory_thief",
    "winged_stalker_of_the_crypt", "mastiff_of_the_overflowing_ossuary", "spore_infested",
    "graveless_soldier", "graveless_soldier", "graveless_soldier", "the_broken_headstone",
    "stitched_wing_spawn", "graveless_soldier", "devourer_of_the_last_memory",
    "tribute_of_the_four_sorrows", "graveless_soldier",
  ];
  assert.deepEqual(game.host.archive.map((card) => card.definitionId), expectedHostArchive);
  assert.equal(game.currentRandomState, 565679351);

  game = mulliganOpeningHand(game);
  assert.equal(game.mulligansTaken, 1);
  assert.deepEqual(game.player.hand.map((card) => card.definitionId), [
    "veiled_dawn_flower",
    "shield_of_the_heir",
    "river_of_elarion",
    "liora_keeper_of_the_grove",
    "river_of_elarion",
    "river_of_elarion",
  ]);
  assert.deepEqual(game.player.archive.slice(0, 12).map((card) => card.definitionId), [
    "hydra_of_the_black_bough",
    "vaelor_emerald_guardian",
    "aelyra_heir_of_elarion",
    "kaelor_stormcaller",
    "echo_of_the_forgotten_city",
    "river_of_elarion",
    "maela_watcher_of_the_heights",
    "aelyra_heir_of_elarion",
    "river_of_elarion",
    "clash_of_echoes",
    "river_of_elarion",
    "the_judgment_of_elarion",
  ]);
  assert.deepEqual(game.player.archive.map((card) => card.definitionId), [
    "hydra_of_the_black_bough", "vaelor_emerald_guardian", "aelyra_heir_of_elarion",
    "kaelor_stormcaller", "echo_of_the_forgotten_city", "river_of_elarion",
    "maela_watcher_of_the_heights", "aelyra_heir_of_elarion", "river_of_elarion",
    "clash_of_echoes", "river_of_elarion", "the_judgment_of_elarion", "river_of_elarion",
    "kaelor_stormcaller", "elixir_of_the_first_leaf", "kaelor_stormcaller",
    "echo_of_the_forgotten_city", "river_of_elarion", "liora_keeper_of_the_grove",
    "hydra_of_the_black_bough", "elixir_of_the_first_leaf", "clash_of_echoes",
    "aelyra_heir_of_elarion", "river_of_elarion", "the_judgment_of_elarion",
    "veiled_dawn_flower", "maela_watcher_of_the_heights",
  ]);
  assert.deepEqual(game.host.archive.map((card) => card.definitionId), expectedHostArchive);
  assert.equal(game.currentRandomState, 3653149192);

  game = acceptOpeningHand(game);
  game = endPlayerTurn(game);
  assert.equal(game.player.hand.at(-1)?.definitionId, "hydra_of_the_black_bough");
  game = endPlayerTurn(game);
  assert.equal(game.player.hand.at(-1)?.definitionId, "vaelor_emerald_guardian");
  game = endPlayerTurn(game);
  assert.equal(game.setupTurnsRemaining, 0);
  assert.equal(game.player.archive[0]?.definitionId, "aelyra_heir_of_elarion");
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
    deterministicRevision: CANON_SEED_COMPATIBILITY.HF1.deterministicRevision,
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

test("HF1-ELA-GRV-LE2-GPT has a manually fixed deterministic golden state", () => {
  const identity = decodeCanonSeed("HF1-ELA-GRV-LE2-GPT");
  const game = createInitialGame(
    getPlayerDeck(identity.playerDeckKey),
    getHostDeck(identity.hostDeckKey),
    identity.entropy,
    identity.preparationTurns,
    identity.difficulty,
    identity.gameMode,
  );

  assert.deepEqual(
    [...game.player.hand, ...game.player.archive].map((card) => card.definitionId),
    [
      "kaelor_stormcaller", "echo_of_the_forgotten_city", "clash_of_echoes", "aelyra_heir_of_elarion",
      "river_of_elarion", "the_judgment_of_elarion", "hydra_of_the_black_bough",
      "aelyra_heir_of_elarion", "maela_watcher_of_the_heights", "elixir_of_the_first_leaf",
      "liora_keeper_of_the_grove", "river_of_elarion", "veiled_dawn_flower", "aelyra_heir_of_elarion",
      "hydra_of_the_black_bough", "clash_of_echoes", "river_of_elarion", "kaelor_stormcaller",
      "veiled_dawn_flower", "liora_keeper_of_the_grove", "shield_of_the_heir",
      "maela_watcher_of_the_heights", "elixir_of_the_first_leaf", "river_of_elarion",
      "vaelor_emerald_guardian", "river_of_elarion", "kaelor_stormcaller", "river_of_elarion",
      "river_of_elarion", "echo_of_the_forgotten_city", "the_judgment_of_elarion",
      "river_of_elarion", "river_of_elarion",
    ],
  );
  assert.deepEqual(
    game.host.archive.map((card) => card.definitionId),
    [
      "ossuary_rider", "harvester_of_the_fallen", "graveless_soldier", "graveless_soldier",
      "mastiff_of_the_overflowing_ossuary", "graveless_soldier", "graveless_titan", "graveless_soldier",
      "graveless_soldier", "nerezh_graveless_matriarch", "devourer_of_the_last_memory",
      "graveless_soldier", "graveless_titan", "barrow_wallbreaker", "mastiff_of_the_overflowing_ossuary",
      "graveless_soldier", "tribute_of_the_four_sorrows", "the_broken_headstone", "graveless_titan",
      "the_broken_headstone", "graveless_soldier", "graveless_soldier", "devourer_of_the_last_memory",
      "memory_thief", "stitched_wing_spawn", "memory_thief", "tribute_of_the_four_sorrows",
      "winged_stalker_of_the_crypt", "return_to_memory", "graveless_soldier", "graveless_soldier",
      "graveless_soldier", "spore_infested", "graveless_titan", "graveless_soldier", "graveless_soldier",
      "graveless_soldier", "graveless_soldier", "winged_stalker_of_the_crypt", "return_to_memory",
      "graveless_soldier", "three_eyed_corpse_gorger", "nerezh_graveless_matriarch", "graveless_soldier",
      "harvester_of_the_fallen", "inexhaustible_ossuary", "graveless_soldier", "graveless_soldier",
      "spore_infested", "graveless_soldier",
    ],
  );
  assert.equal(game.currentRandomState, 1982697425);
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
