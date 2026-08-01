import assert from "node:assert/strict";
import { test } from "node:test";

import { getHordeDeck, getPlayerDeck, hordeDeck, playerDeck } from "../src/data/decks";
import { normalizeDeck } from "../src/data/normalizeDeck";
import { localizedTraitLabel, localizedTypeLine } from "../src/i18n/cardLocalization";
import { canonicalizeRulesText } from "../src/i18n/rulesText";
import { buildHostRules } from "../src/engine/HostRules";
import { activateAbility, castCard, playLand, recycleEnergy } from "../src/engine/GameActions";
import { chaosTraitPool, prepareChaosDeck } from "../src/engine/ChaosMode";
import { applyHordeAttackEvent, buildHordeAttackEvents, isHordeAttackEventCurrent, prepareHordeAttackers, refreshHordeAttackEvent, resolveHordeCombat, resolvePlayerAttackerDrain, resolvePlayerAttackerPoison, resolvePlayerCombat } from "../src/engine/CombatResolver";
import { destroyMarkedCreatures, destroyPermanent, findManualInvokedTargetTrigger, pendingTriggerSources, resolveEffect, resolveEffects, resolveTriggeredEvent, runInvokedTriggers } from "../src/engine/EffectResolver";
import { drainEventQueue, enqueue } from "../src/engine/EventQueue";
import { collectStaticAuras, newlyCoveredAuras, snapshotStaticAuras } from "../src/engine/StaticAuras";
import { acceptOpeningHand, createInitialGame, expandDeck, mulliganOpeningHand, recordFieldEntry } from "../src/engine/GameState";
import { finishHordeTurn, revealHordeCardFromTop, runHordeMain } from "../src/engine/HordeController";
import { canAttack, hasTrait } from "../src/engine/Traits";
import { advancePhase, endPlayerTurn } from "../src/engine/PhaseManager";
import { getPowerEndurance, hordeInSurge } from "../src/engine/StaticEffects";
import { targetCandidates } from "../src/engine/Targeting";
import { queueUnusedNormalEnergy, releasePendingStoredEnergy } from "../src/engine/EnergySystem";
import { performPlayerDraw, startPlayerTurn, startPlayerTurnReady } from "../src/engine/TurnManager";
import { sortTraitsForDisplay } from "../src/utils/selectors";
import { getHandCardPresentationState } from "../src/components/handCardPresentation";
import { buffAnimationVariantForCard } from "../src/store/buffAnimation";
import { playerBuffSfxForAnimation } from "../src/store/playerAudioPolicy";
import { addCard, addForests, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("same seed produces the same player and Horde deck order", () => {
  const first = createInitialGame(playerDeck, hordeDeck, "repeatable-seed", 3);
  const second = createInitialGame(playerDeck, hordeDeck, "repeatable-seed", 3);

  assert.deepEqual(
    first.player.archive.map((card) => card.definitionId),
    second.player.archive.map((card) => card.definitionId),
  );
  assert.deepEqual(
    first.horde.archive.map((card) => card.definitionId),
    second.horde.archive.map((card) => card.definitionId),
  );
  assert.equal(first.currentRandomState, second.currentRandomState);
});

test("game state exposes only canonical Hostfall zones", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "canonical-zones", 3);
  for (const side of [game.player, game.horde]) {
    for (const retired of ["library", "battlefield", "graveyard", "exile"]) {
      assert.equal(Object.hasOwn(side, retired), false, `retired zone ${retired} leaked into GameState`);
    }
    for (const canonical of ["archive", "field", "memory", "oblivion"]) {
      assert.equal(Array.isArray(side[canonical]), true, `missing canonical zone ${canonical}`);
    }
  }
  assert.ok(game.player.archive.every((card) => card.zone === "archive"));
  assert.ok(game.player.hand.every((card) => card.zone === "hand"));
  assert.ok(game.horde.archive.every((card) => card.zone === "archive"));
});

test("the registered Vampire chronicle starts as its complete playable deck", () => {
  const vampireDeck = getPlayerDeck("vampire_chronicle_preview");
  const game = createInitialGame(vampireDeck, hordeDeck, "vampire-integration", 3);
  const card = (definitionId) => {
    const definition = vampireDeck.cards.find((candidate) => candidate.id === definitionId);
    assert.ok(definition, `Missing Vampire card ${definitionId}`);
    return definition;
  };
  const playerCards = [
    ...game.player.archive,
    ...game.player.hand,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
  ];

  assert.equal(vampireDeck.id, "vampire_chronicle_preview");
  assert.equal(vampireDeck.name, "La Corte Carmesí");
  assert.equal(playerCards.length, 40);
  assert.equal(game.player.hand.length, 7);
  assert.equal(playerCards.filter((candidate) => candidate.definitionId === "crimson_energy").length, 12);
  assert.deepEqual(
    ["crimson_energy", "tithe_acolyte", "eternal_feast_countess", "blood_pact", "crimson_impulse", "predatory_thirst"].map(
      (definitionId) => [definitionId, card(definitionId).quantity],
    ),
    [
      ["crimson_energy", 12],
      ["tithe_acolyte", 2],
      ["eternal_feast_countess", 2],
      ["blood_pact", 2],
      ["crimson_impulse", 2],
      ["predatory_thirst", 1],
    ],
  );
  assert.deepEqual(
    ["tithe_acolyte", "crimson_impulse", "drain_essence"].map(
      (definitionId) => [definitionId, card(definitionId).energyCost],
    ),
    [
      ["tithe_acolyte", 1],
      ["crimson_impulse", 1],
      ["drain_essence", 2],
    ],
  );
  assert.deepEqual(card("crypt_guardian").traits, ["SKYGUARD"]);
  assert.deepEqual(
    ["blood_page", "crimson_bat", "court_duelist", "blood_sentinel", "eternal_feast_countess"].map(
      (definitionId) => [definitionId, card(definitionId).power, card(definitionId).endurance],
    ),
    [
      ["blood_page", 1, 3],
      ["crimson_bat", 2, 2],
      ["court_duelist", 3, 3],
      ["blood_sentinel", 3, 4],
      ["eternal_feast_countess", 5, 5],
    ],
  );
  assert.deepEqual(card("blood_sentinel").traits, ["ALERT"]);
  assert.deepEqual(card("eternal_feast_countess").traits, ["FLYING", "ALERT"]);
});

test("Developer Mode uses the selected player deck's own Energy cards", () => {
  const vampireDeck = getPlayerDeck("vampire_chronicle_preview");
  const game = createInitialGame(vampireDeck, hordeDeck, "developer", 3);

  assert.deepEqual(
    game.player.field.map((card) => card.definitionId),
    ["crimson_energy", "crimson_energy", "crimson_energy", "crimson_energy"],
  );
  assert.equal(game.player.hand.length, 7);
  assert.equal(
    [...game.player.hand, ...game.player.archive, ...game.player.field]
      .some((card) => card.definitionId === "forest" || card.definitionId === "broken_wings"),
    false,
  );
});

test("every expanded card copy has a unique instance id", () => {
  const cards = [...expandDeck(playerDeck, "player"), ...expandDeck(hordeDeck, "horde")];
  const ids = cards.map((card) => card.instanceId);

  assert.equal(new Set(ids).size, ids.length);
});

test("mulligans redraw one fewer card deterministically down to one", () => {
  const first = createInitialGame(playerDeck, hordeDeck, "mulligan-seed", 3);
  const second = createInitialGame(playerDeck, hordeDeck, "mulligan-seed", 3);
  const initialCardTotal = first.player.hand.length + first.player.archive.length + first.player.field.length;

  assert.equal(first.openingHandAccepted, false);
  assert.equal(first.player.hand.length, 7);

  let firstResult = first;
  let secondResult = second;
  for (const expectedSize of [6, 5, 4, 3, 2, 1]) {
    firstResult = mulliganOpeningHand(firstResult);
    secondResult = mulliganOpeningHand(secondResult);
    assert.equal(firstResult.player.hand.length, expectedSize);
    assert.deepEqual(
      firstResult.player.hand.map((card) => card.instanceId),
      secondResult.player.hand.map((card) => card.instanceId),
    );
    assert.equal(firstResult.player.hand.length + firstResult.player.archive.length + firstResult.player.field.length, initialCardTotal);
  }

  const atMinimum = mulliganOpeningHand(firstResult);
  assert.equal(atMinimum.player.hand.length, 1);
  assert.equal(atMinimum.mulligansTaken, 6);
});

test("accepting an opening hand closes mulligan", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "keep-opening", 3);
  const accepted = acceptOpeningHand(game);
  const blockedMulligan = mulliganOpeningHand(accepted);
  assert.equal(accepted.openingHandAccepted, true);
  assert.deepEqual(blockedMulligan.player.hand.map((card) => card.instanceId), accepted.player.hand.map((card) => card.instanceId));
});

test("Chaos removes other permanents but keeps creatures, energy, instants, and sorceries", () => {
  const deck = {
    id: "chaos-filter",
    name: "Chaos Filter",
    side: "player",
    deckSize: 7,
    cards: [
      { id: "creature", name: "ECHO", kinds: ["ECHO"], traits: ["SKYGUARD"] },
      { id: "energy", name: "Energy", kinds: ["SOURCE"] },
      { id: "instant", name: "SPELL", kinds: ["SPELL"] },
      { id: "sorcery", name: "SPELL", kinds: ["SPELL"] },
      { id: "enchantment", name: "SUPPORT", kinds: ["SUPPORT"] },
      { id: "artifact", name: "SUPPORT", kinds: ["SUPPORT"] },
      { id: "planeswalker", name: "Planeswalker", kinds: ["Planeswalker"] },
    ],
  };

  const prepared = prepareChaosDeck(deck);

  assert.deepEqual(prepared.cards.map((card) => card.id), ["creature", "energy", "instant", "sorcery"]);
  assert.equal(prepared.deckSize, 4);
});

test("Chaos starts with one Source and no Stored Energy", () => {
  const chaosPlayerDeck = {
    id: "chaos-player",
    name: "Chaos Player",
    side: "player",
    deckSize: 16,
    cards: [
      { id: "chaos_forest", name: "Chaos Forest", quantity: 8, kinds: ["SOURCE"] },
      { id: "chaos_reacher", name: "Chaos Reacher", quantity: 4, kinds: ["ECHO"], traits: ["SKYGUARD"], power: 2, endurance: 2 },
      { id: "chaos_touch", name: "Chaos Touch", quantity: 4, kinds: ["ECHO"], traits: ["LETHAL"], power: 1, endurance: 1 },
    ],
  };
  const chaosHordeDeck = {
    id: "chaos-horde",
    name: "Chaos Horde",
    side: "horde",
    deckSize: 3,
    cards: [
      { id: "chaos_zombie", name: "Chaos Zombie", quantity: 2, isToken: true, kinds: ["ECHO"], traits: ["DAUNTING"], power: 2, endurance: 2 },
      { id: "chaos_harvest", name: "Chaos Harvest", kinds: ["SUPPORT"], effects: [{ type: "STATIC_GRANT_KEYWORD", keyword: "DAUNTING" }] },
    ],
  };

  const game = createInitialGame(chaosPlayerDeck, chaosHordeDeck, "chaos-opening", 4, "normal", "chaos");

  assert.equal(game.gameMode, "chaos");
  assert.equal(game.player.life, 35);
  assert.equal(game.setupTurnsRemaining, 0);
  assert.equal(game.player.field.filter((card) => card.kinds.includes("SOURCE")).length, 1);
  assert.equal(game.player.energyPool.stored, 0);
  assert.equal(game.player.hand.length, 7);
  assert.equal(game.player.archive.length, 8);
  assert.equal(game.horde.archive.some((card) => card.definitionId === "chaos_harvest"), false);

  performPlayerDraw(game);
  assert.equal(game.player.hand.length, 9);
  assert.equal(game.player.archive.length, 6);
});

test("standard games start the player at 50 life", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "standard-life", 4, "normal", "standard");

  assert.equal(game.player.life, 50);
});

test("Chaos mutations are deterministic, replace printed traits, and are shared by every copy", () => {
  const first = createInitialGame(playerDeck, hordeDeck, "shared-chaos", 0, "normal", "chaos");
  const second = createInitialGame(playerDeck, hordeDeck, "shared-chaos", 0, "normal", "chaos");

  assert.deepEqual(first.chaosMutations, second.chaosMutations);
  for (const side of ["player", "horde"]) {
    const cards = [...first[side].archive, ...(side === "player" ? first.player.hand : []), ...first[side].field];
    for (const card of cards.filter((item) => item.kinds.includes("ECHO"))) {
      assert.deepEqual(card.traits, first.chaosMutations[side][card.definitionId]);
      assert.deepEqual(card.chaosTraits, card.traits);
      assert.equal(new Set(card.traits).size, card.traits.length);
      assert.ok(card.traits.length >= 1);
    }
  }
});

test("Chaos never includes the Horde's implicit Haste in its mutation pool", () => {
  const deck = {
    id: "haste-pool",
    name: "Haste Pool",
    side: "horde",
    deckSize: 2,
    cards: [
      { id: "hasty", name: "Hasty", kinds: ["ECHO"], traits: ["IMPETUS"] },
      { id: "menacing", name: "Menacing", kinds: ["ECHO"], traits: ["DAUNTING"] },
    ],
  };

  assert.deepEqual(chaosTraitPool(deck), ["DAUNTING"]);
});

test("First strike mutations deal combat damage before a normal blocker can answer", () => {
  const game = createTestGame("first-strike-combat");
  const attacker = addCard(game, customCard("first_striker", "horde", { traits: ["REFLEX"], power: 2, endurance: 2 }));
  const blocker = addCard(game, customCard("normal_blocker", "player", { power: 2, endurance: 2 }));
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };

  const result = resolveHordeCombat(game);

  assert.equal(result.player.memory.some((card) => card.instanceId === blocker.instanceId), true);
  assert.equal(result.horde.field.some((card) => card.instanceId === attacker.instanceId), true);
  assert.equal(result.horde.field.find((card) => card.instanceId === attacker.instanceId)?.damageMarked, 0);
});

test("Goblin Chainwhirler survives a 4/3 blocker but dies to a 4/4 after first strike", () => {
  const resolveDuel = (endurance) => {
    const game = createTestGame(`chainwhirler-first-strike-${endurance}`);
    const chainwhirler = addCard(game, cardFromDeck("goblin_chainwhirler", "horde"));
    const blocker = addCard(game, customCard(`blocker_4_${endurance}`, "player", { power: 4, endurance }));
    game.combat.hordeAttackers = [chainwhirler.instanceId];
    game.combat.blockers = { [chainwhirler.instanceId]: [blocker.instanceId] };
    return { result: resolveHordeCombat(game), chainwhirler, blocker };
  };

  const versusFourThree = resolveDuel(3);
  assert.equal(versusFourThree.result.horde.field.some((card) => card.instanceId === versusFourThree.chainwhirler.instanceId), true);
  assert.equal(versusFourThree.result.player.memory.some((card) => card.instanceId === versusFourThree.blocker.instanceId), true);

  const versusFourFour = resolveDuel(4);
  assert.equal(versusFourFour.result.horde.memory.some((card) => card.instanceId === versusFourFour.chainwhirler.instanceId), true);
  assert.equal(versusFourFour.result.player.field.some((card) => card.instanceId === versusFourFour.blocker.instanceId), true);
});

test("Hostfall traits render with localized names", () => {
  assert.equal(localizedTraitLabel("REFLEX", "en"), "REFLEX");
  assert.equal(localizedTraitLabel("REFLEX", "es"), "REFLEJOS");
  assert.equal(localizedTraitLabel("SKYGUARD", "en"), "SKYGUARD");
  assert.equal(localizedTraitLabel("POISON_1", "es"), "VENENO 1");
});

test("Hostfall card kinds, modifiers and authored rules render through the public vocabulary", () => {
  assert.equal(localizedTypeLine({ kinds: ["ECHO"], modifiers: ["CHRONICLE"], subtypes: ["Vampire", "Noble"] }, "en"), "Echo · Chronicle — Vampire Noble");
  assert.equal(localizedTypeLine({ kinds: ["SPELL"], modifiers: ["QUICK"], subtypes: [] }, "es"), "Hechizo · Rápido");
  assert.equal(
    canonicalizeRulesText("When this creature enters, Horde creatures gain Menace until end of turn.", "en"),
    "When this Echo is Invoked, Host Echoes gain Daunting until the end of the turn.",
  );
});

test("keyword display order keeps Menace first and remains stable", () => {
  assert.deepEqual(
    sortTraitsForDisplay(["ALERT", "POISON_1", "DAUNTING", "LETHAL", "FLYING"]),
    ["DAUNTING", "FLYING", "LETHAL", "ALERT", "POISON_1"],
  );
});

test("discard selection stays raised while the hovered hand card layers above it", () => {
  assert.deepEqual(
    getHandCardPresentationState({ index: 1, hovered: false, selectedForDiscard: true, dragging: false }),
    { raised: true, zIndex: 90 },
  );
  assert.deepEqual(
    getHandCardPresentationState({ index: 3, hovered: true, selectedForDiscard: false, dragging: false }),
    { raised: true, zIndex: 100 },
  );
  assert.deepEqual(
    getHandCardPresentationState({ index: 4, hovered: false, selectedForDiscard: false, dragging: false }),
    { raised: false, zIndex: 5 },
  );
});

test("standard games keep nine energy cards in the player deck", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "no-lands", 3);
  const cards = [...game.player.hand, ...game.player.archive, ...game.player.field];

  assert.equal(cards.length, 33);
  assert.equal(cards.filter((card) => card.kinds.includes("SOURCE")).length, 9);
});

test("unused Source Energy stays pending until the Horde turn ends", () => {
  const game = createTestGame();
  const lands = addForests(game, 5);
  lands[0].exhausted = true;

  assert.equal(queueUnusedNormalEnergy(game), 3);
  assert.equal(game.player.pendingStoredEnergy, 3);
  assert.equal(game.player.energyPool.stored, 0);
  assert.equal(queueUnusedNormalEnergy(game), 0);
  assert.equal(releasePendingStoredEnergy(game), 3);
  assert.equal(game.player.pendingStoredEnergy, 0);
  assert.equal(game.player.energyPool.stored, 3);
});

test("spent Sources do not become Stored Energy", () => {
  const game = createTestGame();
  const lands = addForests(game, 3);
  for (const land of lands) {
    land.exhausted = true;
    land.activatedThisTurn = true;
  }

  const hordeTurn = endPlayerTurn(game);
  const nextPlayerTurn = finishHordeTurn(hordeTurn);

  assert.equal(hordeTurn.player.pendingStoredEnergy, 0);
  assert.equal(nextPlayerTurn.player.energyPool.stored, 0);
});

test("unused Energy from an earlier setup turn does not refill Stored Energy", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "setup-reserve", 2);
  const lands = addForests(game, 3);

  const finalSetupTurn = endPlayerTurn(game);
  assert.equal(finalSetupTurn.setupTurnsRemaining, 1);
  assert.equal(finalSetupTurn.player.pendingStoredEnergy, 0);

  for (const land of lands) {
    const currentLand = finalSetupTurn.player.field.find((card) => card.instanceId === land.instanceId);
    currentLand.exhausted = true;
    currentLand.activatedThisTurn = true;
  }
  const hordeTurn = endPlayerTurn(finalSetupTurn);
  const nextPlayerTurn = finishHordeTurn(hordeTurn);

  assert.equal(hordeTurn.player.pendingStoredEnergy, 0);
  assert.equal(nextPlayerTurn.player.energyPool.stored, 0);
});

test("Llanowar and Druid fill Stored Energy immediately, then pending Source Energy appears after the Host", () => {
  const game = createTestGame();
  addForests(game, 1);
  const llanowar = addCard(game, cardFromDeck("llanowar_elves", "player"));
  const druid = addCard(game, cardFromDeck("druid_of_the_cowl", "player"));
  const afterLlanowar = activateAbility(game, llanowar.instanceId, "llanowar_elves_add_green");
  const afterAbilities = activateAbility(afterLlanowar, druid.instanceId, "druid_of_the_cowl_add_green");

  const hordeTurn = endPlayerTurn(afterAbilities);
  const nextPlayerTurn = finishHordeTurn(hordeTurn);

  assert.equal(afterAbilities.player.energyPool.stored, 2);
  assert.equal(afterAbilities.player.field.find((card) => card.instanceId === llanowar.instanceId)?.exhausted, true);
  assert.equal(afterAbilities.player.field.find((card) => card.instanceId === druid.instanceId)?.exhausted, true);
  assert.equal(hordeTurn.player.energyPool.stored, 2);
  assert.equal(hordeTurn.player.pendingStoredEnergy, 1);
  assert.equal(nextPlayerTurn.player.pendingStoredEnergy, 0);
  assert.equal(nextPlayerTurn.player.energyPool.stored, 3);
});

test("Stored Energy can pay a creature cost", () => {
  const game = createTestGame();
  game.player.energyPool.stored = 1;
  const llanowar = addCard(game, cardFromDeck("llanowar_elves", "player", "hand"), "player", "hand");

  const result = castCard(game, llanowar.instanceId);

  assert.equal(result.player.hand.some((card) => card.instanceId === llanowar.instanceId), false);
  assert.equal(result.player.field.some((card) => card.instanceId === llanowar.instanceId), true);
  assert.equal(result.player.energyPool.stored, 0);
});

test("manually generated Source Energy is visible in the pool and is spent before Stored Energy", () => {
  const game = createTestGame();
  game.player.energyPool.stored = 1;
  const forest = addCard(game, cardFromDeck("forest", "player"));
  const llanowar = addCard(game, cardFromDeck("llanowar_elves", "player", "hand"), "player", "hand");

  const generated = activateAbility(game, forest.instanceId, "forest_add_green");
  assert.deepEqual(generated.player.energyPool, { available: 1, stored: 1 });

  const result = castCard(generated, llanowar.instanceId);

  assert.equal(result.lastActionResult?.ok, true);
  assert.deepEqual(result.player.energyPool, { available: 0, stored: 1 });
  assert.equal(result.player.field.find((card) => card.instanceId === forest.instanceId)?.exhausted, true);
});

test("the player draws one card normally after setup", () => {
  const game = createTestGame();
  addCard(game, customCard("held_card", "player", { zone: "hand" }), "player", "hand");
  addCard(game, customCard("draw_one", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("leave_in_library", "player", { zone: "archive" }), "player", "archive");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["held_card", "draw_one"]);
  assert.deepEqual(game.player.archive.map((card) => card.definitionId), ["leave_in_library"]);
});

test("easy mode draws two cards every turn after setup", () => {
  const game = createTestGame();
  game.difficulty = "easy";
  addCard(game, customCard("held_card", "player", { zone: "hand" }), "player", "hand");
  addCard(game, customCard("easy_draw_1", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("easy_draw_2", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("easy_stays_in_deck", "player", { zone: "archive" }), "player", "archive");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["held_card", "easy_draw_1", "easy_draw_2"]);
  assert.deepEqual(game.player.archive.map((card) => card.definitionId), ["easy_stays_in_deck"]);
});

test("the player draws two after setup when the turn starts with an empty hand", () => {
  const game = createTestGame();
  addCard(game, customCard("empty_hand_draw_1", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("empty_hand_draw_2", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("empty_hand_stays_in_deck", "player", { zone: "archive" }), "player", "archive");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["empty_hand_draw_1", "empty_hand_draw_2"]);
  assert.deepEqual(game.player.archive.map((card) => card.definitionId), ["empty_hand_stays_in_deck"]);
});

test("an empty hand still draws only one during setup", () => {
  const game = createTestGame();
  game.setupTurnsRemaining = 1;
  addCard(game, customCard("setup_draw", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("setup_stays_in_deck", "player", { zone: "archive" }), "player", "archive");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["setup_draw"]);
  assert.deepEqual(game.player.archive.map((card) => card.definitionId), ["setup_stays_in_deck"]);
});

test("recycling puts an energy on the bottom, draws one, and uses the Energy action", () => {
  const game = createTestGame();
  const energy = addCard(game, cardFromDeck("forest", "player", "hand"), "player", "hand");
  const nextDraw = addCard(game, customCard("recycle_draw", "player", { zone: "archive" }), "player", "archive");

  const result = recycleEnergy(game, energy.instanceId);

  assert.equal(result.player.hand.some((card) => card.instanceId === energy.instanceId), false);
  assert.equal(result.player.hand.some((card) => card.instanceId === nextDraw.instanceId), true);
  assert.equal(result.player.archive.at(-1)?.instanceId, energy.instanceId);
  assert.equal(result.player.energyActionUsedThisTurn, true);
});

test("playing or recycling an energy consumes the same once-per-turn action", () => {
  const game = createTestGame();
  const playedEnergy = addCard(game, cardFromDeck("forest", "player", "hand"), "player", "hand");
  const blockedRecycle = addCard(game, cardFromDeck("forest", "player", "hand"), "player", "hand");
  addCard(game, customCard("would_be_drawn", "player", { zone: "archive" }), "player", "archive");

  const afterPlay = playLand(game, playedEnergy.instanceId);
  const afterBlockedRecycle = recycleEnergy(afterPlay, blockedRecycle.instanceId);

  assert.equal(afterPlay.player.energyActionUsedThisTurn, true);
  assert.equal(afterBlockedRecycle.player.hand.some((card) => card.instanceId === blockedRecycle.instanceId), true);
  assert.equal(afterBlockedRecycle.player.archive.some((card) => card.definitionId === "would_be_drawn"), true);
});

test("energy cannot be recycled during setup and no more than four can be in play", () => {
  const setupGame = createTestGame();
  setupGame.setupTurnsRemaining = 1;
  const setupEnergy = addCard(setupGame, cardFromDeck("forest", "player", "hand"), "player", "hand");
  const blockedDuringSetup = recycleEnergy(setupGame, setupEnergy.instanceId);

  assert.equal(blockedDuringSetup.player.hand.some((card) => card.instanceId === setupEnergy.instanceId), true);

  const cappedGame = createTestGame();
  addForests(cappedGame, 4);
  const fifthEnergy = addCard(cappedGame, cardFromDeck("forest", "player", "hand"), "player", "hand");
  const blockedAtCap = playLand(cappedGame, fifthEnergy.instanceId);

  assert.equal(blockedAtCap.player.field.filter((card) => card.kinds.includes("SOURCE")).length, 4);
  assert.equal(blockedAtCap.player.hand.some((card) => card.instanceId === fifthEnergy.instanceId), true);
});

test("automatic payment spends Source Energy before Stored Energy", () => {
  const game = createTestGame();
  game.player.energyPool.stored = 3;
  const [land] = addForests(game, 1);
  const energyEcho = addCard(game, cardFromDeck("llanowar_elves", "player"));
  const spell = addCard(
    game,
    customCard("three_energy_spell", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      energyCost: 3,
    }),
    "player",
    "hand",
  );

  const result = castCard(game, spell.instanceId);

  assert.equal(result.player.memory.some((card) => card.instanceId === spell.instanceId), true);
  assert.equal(result.player.field.find((card) => card.instanceId === land.instanceId)?.exhausted, true);
  assert.equal(result.player.field.find((card) => card.instanceId === energyEcho.instanceId)?.exhausted, false);
  assert.deepEqual(result.player.energyPool, { available: 0, stored: 1 });
});

test("Crimson Energy is a universal source that pays generic costs before stored energy", () => {
  const game = createTestGame();
  game.player.energyPool.stored = 1;
  const firstEnergy = addCard(game, cardFromDeck("crimson_energy", "player"));
  const secondEnergy = addCard(game, cardFromDeck("crimson_energy", "player"));
  const spell = addCard(
    game,
    customCard("crimson_two_energy_spell", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      energyCost: 2,
    }),
    "player",
    "hand",
  );

  const result = castCard(game, spell.instanceId);

  assert.equal(firstEnergy.kinds.includes("SOURCE"), true);
  assert.equal(result.player.memory.some((card) => card.instanceId === spell.instanceId), true);
  assert.equal(result.player.field.find((card) => card.instanceId === firstEnergy.instanceId)?.exhausted, true);
  assert.equal(result.player.field.find((card) => card.instanceId === secondEnergy.instanceId)?.exhausted, true);
  assert.equal(result.player.energyPool.stored, 1);
});

test("spell life costs normalize from deck abilities and can never reduce the player to zero", () => {
  const normalized = normalizeDeck({
    id: "life-cost-normalization",
    name: "Life Cost Normalization",
    side: "player",
    cards: [
      {
        id: "normalized_life_spell",
        name: "Normalized Life Spell",
        kinds: ["SPELL"],
        abilities: [
          {
            id: "normalized_life_spell_cast",
            kind: "SPELL",
            cost: { life: 3 },
            effects: [{ type: "DRAW_CARD", amount: 1 }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(normalized.cards[0].additionalCost, { life: 3 });

  const game = createTestGame();
  game.player.life = 3;
  const [land] = addForests(game, 1);
  const spell = addCard(
    game,
    customCard("life_spell_at_zero", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      energyCost: 1,
      additionalCost: { life: 3 },
    }),
    "player",
    "hand",
  );

  const result = castCard(game, spell.instanceId);

  assert.equal(result.lastActionResult?.ok, false);
  assert.match(result.lastActionResult?.reason ?? "", /1 life/i);
  assert.equal(result.player.life, 3);
  assert.equal(result.player.lifePaidThisTurn, 0);
  assert.equal(result.player.hand.some((card) => card.instanceId === spell.instanceId), true);
  assert.equal(result.player.field.find((card) => card.instanceId === land.instanceId)?.exhausted, false);
});

test("Countess pays half the player's life rounded up as an additional cost", () => {
  const game = createTestGame("countess-half-life-cost");
  game.player.life = 11;
  addForests(game, 6);
  const page = addCard(game, cardFromDeck("blood_page", "player"));
  const countess = addCard(game, cardFromDeck("eternal_feast_countess", "player", "hand"), "player", "hand");

  const result = castCard(game, countess.instanceId);
  const permanent = result.player.field.find((card) => card.instanceId === countess.instanceId);

  assert.equal(result.lastActionResult?.ok, true);
  assert.equal(result.player.life, 5);
  assert.equal(result.player.lifePaidThisTurn, 6);
  assert.deepEqual(getPowerEndurance(result, permanent), { power: 5, endurance: 5 });
  assert.equal(hasTrait(result, permanent, "FLYING"), true);
  assert.equal(hasTrait(result, permanent, "DRAIN"), true);
  assert.equal(hasTrait(result, permanent, "ALERT"), true);
  assert.equal(result.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 2);

  const lethal = createTestGame("countess-half-life-cost-at-one");
  lethal.player.life = 1;
  addForests(lethal, 6);
  const blockedCountess = addCard(
    lethal,
    cardFromDeck("eternal_feast_countess", "player", "hand"),
    "player",
    "hand",
  );
  const rejected = castCard(lethal, blockedCountess.instanceId);

  assert.equal(rejected.lastActionResult?.ok, false);
  assert.match(rejected.lastActionResult?.reason ?? "", /1 life/i);
  assert.equal(rejected.player.life, 1);
  assert.equal(rejected.player.lifePaidThisTurn, 0);
  assert.equal(rejected.player.hand.some((card) => card.instanceId === blockedCountess.instanceId), true);
  assert.equal(rejected.player.field.filter((card) => card.kinds.includes("SOURCE")).every((card) => !card.exhausted), true);
});

test("Countess has Lifesteal while attacking but not while blocking", () => {
  const attack = createTestGame("countess-turn-lifesteal-attack");
  attack.player.life = 10;
  const attackingCountess = addCard(attack, cardFromDeck("eternal_feast_countess", "player"));
  attack.combat.playerAttackers = [attackingCountess.instanceId];

  assert.equal(hasTrait(attack, attackingCountess, "DRAIN"), true);
  assert.equal(resolvePlayerCombat(attack).player.life, 15);

  const defense = createTestGame("countess-turn-lifesteal-defense");
  defense.player.life = 10;
  defense.activeSide = "horde";
  defense.phase = "combat";
  const attacker = addCard(defense, customCard("countess_horde_attacker", "horde", {
    power: 2,
    endurance: 6,
  }));
  const blockingCountess = addCard(defense, cardFromDeck("eternal_feast_countess", "player"));
  defense.combat.hordeAttackers = [attacker.instanceId];
  defense.combat.blockers = { [attacker.instanceId]: [blockingCountess.instanceId] };

  assert.equal(hasTrait(defense, blockingCountess, "DRAIN"), false);
  const [impact] = buildHordeAttackEvents(defense);
  assert.equal(impact.playerLifeGain, 0);
  assert.equal(applyHordeAttackEvent(defense, impact).player.life, 10);
});

test("Blood Pact pays five life as an additional cost, draws two cards, and triggers Blood Page", () => {
  const game = createTestGame("blood-pact-resolution");
  game.player.life = 10;
  addForests(game, 1);
  const page = addCard(game, cardFromDeck("blood_page", "player"));
  const pact = addCard(game, cardFromDeck("blood_pact", "player", "hand"), "player", "hand");
  addCard(game, customCard("blood_pact_draw_one", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("blood_pact_draw_two", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("blood_pact_library_tail", "player", { zone: "archive" }), "player", "archive");

  const result = castCard(game, pact.instanceId);

  assert.equal(result.lastActionResult?.ok, true);
  assert.equal(result.player.life, 5);
  assert.equal(result.player.lifePaidThisTurn, 5);
  assert.equal(
    result.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
    2,
  );
  assert.deepEqual(
    result.player.hand.map((card) => card.definitionId),
    ["blood_pact_draw_one", "blood_pact_draw_two"],
  );
  assert.deepEqual(result.player.archive.map((card) => card.definitionId), ["blood_pact_library_tail"]);
  assert.equal(result.player.memory.some((card) => card.instanceId === pact.instanceId), true);
});

test("Blood Pact cannot be cast when paying five life would reduce the player to zero", () => {
  const game = createTestGame("blood-pact-lethal");
  game.player.life = 5;
  addForests(game, 1);
  const pact = addCard(game, cardFromDeck("blood_pact", "player", "hand"), "player", "hand");
  addCard(game, customCard("blood_pact_lethal_draw_one", "player", { zone: "archive" }), "player", "archive");
  addCard(game, customCard("blood_pact_lethal_draw_two", "player", { zone: "archive" }), "player", "archive");

  const result = castCard(game, pact.instanceId);

  assert.equal(result.lastActionResult?.ok, false);
  assert.match(result.lastActionResult?.reason ?? "", /1 life/i);
  assert.equal(result.player.life, 5);
  assert.equal(result.player.lifePaidThisTurn, 0);
  assert.equal(result.player.hand.some((card) => card.instanceId === pact.instanceId), true);
  assert.equal(result.player.archive.length, 2);
  assert.equal(result.player.field.filter((card) => card.kinds.includes("SOURCE")).every((card) => !card.exhausted), true);
  assert.equal(result.winner, undefined);
});

test("Crimson Impulse pays two life and grants an ally +2/+2 and Flying for the turn", () => {
  const game = createTestGame("crimson-impulse-resolution");
  game.player.life = 10;
  addForests(game, 1);
  const ally = addCard(game, customCard("crimson_impulse_ally", "player", { power: 2, endurance: 3 }));
  const page = addCard(game, cardFromDeck("blood_page", "player"));
  const enemy = addCard(game, customCard("crimson_impulse_enemy", "horde"));
  const impulse = addCard(game, cardFromDeck("crimson_impulse", "player", "hand"), "player", "hand");
  const requirement = impulse.requiresTargets[0];

  assert.ok(requirement);
  assert.deepEqual(
    targetCandidates(game, "player", requirement).map((card) => card.instanceId),
    [ally.instanceId, page.instanceId],
  );

  const cast = castCard(game, impulse.instanceId, {
    targets: { targetCreature: ally.instanceId },
  });

  assert.equal(cast.lastActionResult?.ok, true);
  assert.equal(cast.player.life, 8);
  assert.equal(cast.player.lifePaidThisTurn, 2);
  assert.deepEqual(
    getPowerEndurance(cast, cast.player.field.find((card) => card.instanceId === ally.instanceId)),
    { power: 4, endurance: 5 },
  );
  assert.equal(hasTrait(cast, cast.player.field.find((card) => card.instanceId === ally.instanceId), "FLYING"), true);
  assert.equal(
    cast.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
    2,
  );
  assert.equal(cast.horde.field.find((card) => card.instanceId === enemy.instanceId)?.temporaryPower, 0);

  const cleaned = advancePhase(cast, "end");
  assert.deepEqual(
    getPowerEndurance(cleaned, cleaned.player.field.find((card) => card.instanceId === ally.instanceId)),
    { power: 2, endurance: 3 },
  );
  assert.equal(hasTrait(cleaned, cleaned.player.field.find((card) => card.instanceId === ally.instanceId), "FLYING"), false);
});

test("Crimson Impulse rejects an enemy target before spending Energy or life", () => {
  const game = createTestGame("crimson-impulse-illegal-target");
  game.player.life = 10;
  addForests(game, 1);
  const enemy = addCard(game, customCard("crimson_impulse_illegal_enemy", "horde"));
  const impulse = addCard(game, cardFromDeck("crimson_impulse", "player", "hand"), "player", "hand");

  const result = castCard(game, impulse.instanceId, {
    targets: { targetCreature: enemy.instanceId },
  });

  assert.equal(result.lastActionResult?.ok, false);
  assert.match(result.lastActionResult?.reason ?? "", /target/i);
  assert.equal(result.player.life, 10);
  assert.equal(result.player.lifePaidThisTurn, 0);
  assert.equal(result.player.hand.some((card) => card.instanceId === impulse.instanceId), true);
  assert.equal(result.player.field.filter((card) => card.kinds.includes("SOURCE")).every((card) => !card.exhausted), true);
  assert.equal(result.horde.field.find((card) => card.instanceId === enemy.instanceId)?.temporaryPower, 0);
});

test("Drain Essence can damage either side and always recovers two life", () => {
  const game = createTestGame("drain-essence-any-creature");
  game.player.life = 10;
  addForests(game, 2);
  const guardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
  const enemy = addCard(game, customCard("drain_essence_enemy", "horde", { endurance: 3 }));
  const land = game.player.field.find((card) => card.kinds.includes("SOURCE"));
  const drain = addCard(game, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");
  const requirement = drain.requiresTargets[0];

  assert.ok(requirement);
  assert.deepEqual(
    targetCandidates(game, "player", requirement).map((card) => card.instanceId),
    [guardian.instanceId, enemy.instanceId],
  );
  assert.equal(targetCandidates(game, "player", requirement).some((card) => card.instanceId === land?.instanceId), false);

  const guardianDrain = castCard(game, drain.instanceId, {
    targets: { targetCreature: guardian.instanceId },
  });
  const damagedGuardian = guardianDrain.player.field.find((card) => card.instanceId === guardian.instanceId);

  assert.equal(guardianDrain.lastActionResult?.ok, true);
  assert.equal(guardianDrain.player.life, 14);
  assert.equal(damagedGuardian?.damageMarked, 3);
  assert.equal(guardianDrain.player.field.some((card) => card.instanceId === guardian.instanceId), true);

  const enemyGame = createTestGame("drain-essence-enemy-kill");
  enemyGame.player.life = 10;
  addForests(enemyGame, 2);
  const lethalEnemy = addCard(enemyGame, customCard("drain_essence_lethal_enemy", "horde", { endurance: 3 }));
  const secondDrain = addCard(enemyGame, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");
  const enemyDrain = castCard(enemyGame, secondDrain.instanceId, {
    targets: { targetCreature: lethalEnemy.instanceId },
  });

  assert.equal(enemyDrain.player.life, 12);
  assert.equal(enemyDrain.horde.field.find((card) => card.instanceId === lethalEnemy.instanceId)?.damageMarked, 3);
  destroyMarkedCreatures(enemyDrain);
  assert.equal(enemyDrain.horde.memory.some((card) => card.instanceId === lethalEnemy.instanceId), true);
});

test("Drain Essence can kill an allied creature but rejects noncreature targets atomically", () => {
  const game = createTestGame("drain-essence-allied-kill");
  game.player.life = 10;
  addForests(game, 2);
  const page = addCard(game, cardFromDeck("blood_page", "player"));
  const drain = addCard(game, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");

  const alliedDrain = castCard(game, drain.instanceId, {
    targets: { targetCreature: page.instanceId },
  });

  assert.equal(alliedDrain.player.life, 12);
  assert.equal(alliedDrain.player.field.find((card) => card.instanceId === page.instanceId)?.damageMarked, 3);
  destroyMarkedCreatures(alliedDrain);
  assert.equal(alliedDrain.player.memory.some((card) => card.instanceId === page.instanceId), true);

  const invalid = createTestGame("drain-essence-invalid-target");
  invalid.player.life = 10;
  const [land] = addForests(invalid, 2);
  const invalidDrain = addCard(invalid, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");
  const rejected = castCard(invalid, invalidDrain.instanceId, {
    targets: { targetCreature: land.instanceId },
  });

  assert.equal(rejected.lastActionResult?.ok, false);
  assert.equal(rejected.player.life, 10);
  assert.equal(rejected.player.hand.some((card) => card.instanceId === invalidDrain.instanceId), true);
  assert.equal(rejected.player.field.filter((card) => card.kinds.includes("SOURCE")).every((card) => !card.exhausted), true);
});

test("TARGET_ECHO excludes Supports even without authored card-type filters", () => {
  const game = createTestGame("target-echo-contract");
  const echo = addCard(game, customCard("target_echo", "player"));
  addCard(game, customCard("target_support", "player", { kinds: ["SUPPORT"] }));

  assert.deepEqual(
    targetCandidates(game, "player", { id: "target", type: "TARGET_ECHO", controller: "ANY" })
      .map((card) => card.instanceId),
    [echo.instanceId],
  );
});

test("random opponent Echo damage never targets a Support", () => {
  const game = createTestGame("random-echo-damage-contract");
  const source = addCard(game, customCard("random_echo_damage_source", "horde"));
  addCard(game, customCard("random_echo_damage_support", "player", { kinds: ["SUPPORT"] }));
  const effect = { type: "DEAL_DAMAGE_TO_RANDOM_OPPONENT_ECHO", amount: 2 };

  resolveEffect(game, effect, { source, side: "horde" });
  assert.equal(game.eventQueue.some((event) => event.type === "BURN_DAMAGE"), false);

  const echo = addCard(game, customCard("random_echo_damage_target", "player"));
  resolveEffect(game, effect, { source, side: "horde" });
  const burn = game.eventQueue.find((event) => event.type === "BURN_DAMAGE");
  assert.equal(burn?.payload?.targetId, echo.instanceId);
});

test("COUNT_ECHOS ignores Supports even without authored filters", () => {
  const game = createTestGame("count-echos-contract");
  const source = addCard(game, customCard("count_echos_source", "horde"));
  addCard(game, customCard("count_echos_ally", "horde"));
  addCard(game, customCard("count_echos_support", "horde", { kinds: ["SUPPORT"] }));
  addCard(game, customCard("count_echos_target", "player"));

  resolveEffect(game, {
    type: "DEAL_DAMAGE_TO_OPPONENT_ECHO",
    amount: { type: "COUNT_ECHOS", controller: "SELF" },
    animation: "BURN",
  }, { source, side: "horde" });

  const burn = game.eventQueue.find((event) => event.type === "BURN_DAMAGE");
  assert.equal(burn?.payload?.amount, 2);
});

test("COUNT_ECHOS_INVOKED_THIS_TURN ignores Support arrivals", () => {
  const game = createTestGame("count-invoked-echos-contract");
  const source = addCard(game, customCard("count_invoked_source", "horde"));
  const echo = addCard(game, customCard("count_invoked_echo", "horde"));
  const support = addCard(game, customCard("count_invoked_support", "horde", { kinds: ["SUPPORT"] }));
  addCard(game, customCard("count_invoked_target", "player"));
  recordFieldEntry(game, echo);
  recordFieldEntry(game, support);

  resolveEffect(game, {
    type: "DEAL_DAMAGE_TO_OPPONENT_ECHO",
    amount: { type: "COUNT_ECHOS_INVOKED_THIS_TURN", controller: "SELF" },
    animation: "BURN",
  }, { source, side: "horde" });

  const burn = game.eventQueue.find((event) => event.type === "BURN_DAMAGE");
  assert.equal(burn?.payload?.amount, 1);
});

test("Predatory Thirst grants temporary Lifesteal to every allied creature", () => {
  const game = createTestGame("predatory-thirst-attack");
  game.player.life = 10;
  addForests(game, 2);
  const firstAlly = addCard(game, customCard("predatory_thirst_attacker_one", "player", {
    power: 2,
    endurance: 3,
  }));
  const secondAlly = addCard(game, customCard("predatory_thirst_attacker_two", "player", {
    power: 1,
    endurance: 2,
  }));
  const alliedSupport = addCard(game, customCard("predatory_thirst_support", "player", { kinds: ["SUPPORT"] }));
  const enemy = addCard(game, customCard("predatory_thirst_enemy", "horde"));
  const thirst = addCard(game, cardFromDeck("predatory_thirst", "player", "hand"), "player", "hand");

  assert.deepEqual(thirst.requiresTargets, []);
  const cast = castCard(game, thirst.instanceId);
  const firstBuffed = cast.player.field.find((card) => card.instanceId === firstAlly.instanceId);
  const secondBuffed = cast.player.field.find((card) => card.instanceId === secondAlly.instanceId);

  assert.equal(cast.lastActionResult?.ok, true);
  assert.deepEqual(getPowerEndurance(cast, firstBuffed), { power: 2, endurance: 3 });
  assert.deepEqual(getPowerEndurance(cast, secondBuffed), { power: 1, endurance: 2 });
  assert.equal(hasTrait(cast, firstBuffed, "DRAIN"), true);
  assert.equal(hasTrait(cast, secondBuffed, "DRAIN"), true);
  assert.equal(hasTrait(cast, cast.player.field.find((card) => card.instanceId === alliedSupport.instanceId), "DRAIN"), false);
  assert.equal(hasTrait(cast, cast.horde.field.find((card) => card.instanceId === enemy.instanceId), "DRAIN"), false);

  cast.phase = "combat";
  cast.combat.playerAttackers = [firstAlly.instanceId, secondAlly.instanceId];
  const combat = resolvePlayerCombat(cast);
  assert.equal(combat.player.life, 13);

  const cleaned = advancePhase(combat, "end");
  assert.equal(hasTrait(cleaned, cleaned.player.field.find((card) => card.instanceId === firstAlly.instanceId), "DRAIN"), false);
  assert.equal(hasTrait(cleaned, cleaned.player.field.find((card) => card.instanceId === secondAlly.instanceId), "DRAIN"), false);
});

test("Predatory Thirst grants defensive Lifesteal without requiring a target", () => {
  const game = createTestGame("predatory-thirst-defense");
  game.player.life = 10;
  addForests(game, 2);
  const ally = addCard(game, customCard("predatory_thirst_blocker", "player", {
    power: 2,
    endurance: 4,
  }));
  const attacker = addCard(game, customCard("predatory_thirst_horde_attacker", "horde", {
    power: 2,
    endurance: 4,
  }));
  const thirst = addCard(game, cardFromDeck("predatory_thirst", "player", "hand"), "player", "hand");
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];

  const cast = castCard(game, thirst.instanceId);
  cast.combat.blockers = { [attacker.instanceId]: [ally.instanceId] };
  const [impact] = buildHordeAttackEvents(cast);
  const afterImpact = applyHordeAttackEvent(cast, impact);

  assert.equal(cast.lastActionResult?.ok, true);
  assert.equal(impact.playerLifeGain, 2);
  assert.equal(afterImpact.player.life, 12);
  assert.equal(afterImpact.player.field.some((card) => card.instanceId === ally.instanceId), true);
});

test("Final Banquet destroys only a Horde creature and loses its last known effective power", () => {
  const game = createTestGame("final-banquet-effective-power");
  game.player.life = 20;
  addForests(game, 3);
  const page = addCard(game, cardFromDeck("blood_page", "player"));
  const ally = addCard(game, customCard("final_banquet_ally", "player"));
  const target = addCard(game, customCard("final_banquet_target", "horde", {
    power: 2,
    endurance: 5,
  }));
  target.counters["+1/+1"] = 1;
  target.temporaryPower = 2;
  const nonCreature = addCard(game, customCard("final_banquet_enchantment", "horde", {
    kinds: ["SUPPORT"],
    power: 0,
    endurance: 0,
  }));
  const banquet = addCard(game, cardFromDeck("final_banquet", "player", "hand"), "player", "hand");
  const requirement = banquet.requiresTargets[0];

  assert.ok(requirement);
  assert.deepEqual(
    targetCandidates(game, "player", requirement).map((card) => card.instanceId),
    [target.instanceId],
  );
  assert.equal(targetCandidates(game, "player", requirement).some((card) => card.instanceId === ally.instanceId), false);
  assert.equal(targetCandidates(game, "player", requirement).some((card) => card.instanceId === nonCreature.instanceId), false);

  const result = castCard(game, banquet.instanceId, {
    targets: { targetCreature: target.instanceId },
  });

  assert.equal(result.lastActionResult?.ok, true);
  assert.equal(result.player.life, 15);
  assert.equal(result.player.lifePaidThisTurn, 0);
  assert.equal(result.player.lifeLostThisTurn, 5);
  assert.equal(result.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 2);
  assert.equal(result.horde.field.some((card) => card.instanceId === target.instanceId), false);
  assert.equal(result.horde.memory.some((card) => card.instanceId === target.instanceId), true);
});

test("Final Banquet rejects allied targets before paying Energy", () => {
  const game = createTestGame("final-banquet-invalid-target");
  game.player.life = 20;
  addForests(game, 3);
  const ally = addCard(game, customCard("final_banquet_invalid_ally", "player"));
  const banquet = addCard(game, cardFromDeck("final_banquet", "player", "hand"), "player", "hand");

  const result = castCard(game, banquet.instanceId, {
    targets: { targetCreature: ally.instanceId },
  });

  assert.equal(result.lastActionResult?.ok, false);
  assert.equal(result.player.life, 20);
  assert.equal(result.player.hand.some((card) => card.instanceId === banquet.instanceId), true);
  assert.equal(result.player.field.filter((card) => card.kinds.includes("SOURCE")).every((card) => !card.exhausted), true);
});

test("Final Banquet can be cast during Horde combat as an Instant", () => {
  const game = createTestGame("final-banquet-instant");
  game.player.life = 20;
  addForests(game, 3);
  const attacker = addCard(game, customCard("final_banquet_attacker", "horde", {
    power: 2,
    endurance: 4,
  }));
  const banquet = addCard(game, cardFromDeck("final_banquet", "player", "hand"), "player", "hand");
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];

  const result = castCard(game, banquet.instanceId, {
    targets: { targetCreature: attacker.instanceId },
  });

  assert.equal(result.lastActionResult?.ok, true);
  assert.equal(result.player.life, 18);
  assert.equal(result.horde.field.some((card) => card.instanceId === attacker.instanceId), false);
  assert.equal(result.horde.memory.some((card) => card.instanceId === attacker.instanceId), true);
});

test("Final Banquet can cause a lethal life loss after destroying its target", () => {
  const game = createTestGame("final-banquet-lethal-loss");
  game.player.life = 4;
  addForests(game, 3);
  const target = addCard(game, customCard("final_banquet_lethal_target", "horde", {
    power: 4,
    endurance: 4,
  }));
  const banquet = addCard(game, cardFromDeck("final_banquet", "player", "hand"), "player", "hand");

  const result = castCard(game, banquet.instanceId, {
    targets: { targetCreature: target.instanceId },
  });

  assert.equal(result.player.life, 0);
  assert.equal(result.winner, "horde");
  assert.equal(result.horde.memory.some((card) => card.instanceId === target.instanceId), true);
});

test("Final Banquet preserves Horde death triggers after the destruction", () => {
  const game = createTestGame("final-banquet-death-trigger");
  game.player.life = 20;
  addForests(game, 3);
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  const banquet = addCard(game, cardFromDeck("final_banquet", "player", "hand"), "player", "hand");

  const result = castCard(game, banquet.instanceId, {
    targets: { targetCreature: rundvelt.instanceId },
  });

  assert.equal(result.player.life, 19);
  assert.equal(result.horde.memory.some((card) => card.instanceId === rundvelt.instanceId), true);
  assert.equal(result.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 1);
  assert.equal(result.horde.archive.length, 0);
});

test("life payment is atomic with Energy, emits LIFE_PAID, accumulates, and resets next turn", () => {
  const unaffordable = createTestGame();
  unaffordable.player.life = 10;
  const energyLockedSpell = addCard(
    unaffordable,
    customCard("energy_locked_life_spell", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      energyCost: 1,
      additionalCost: { life: 3 },
    }),
    "player",
    "hand",
  );

  const failedForEnergy = castCard(unaffordable, energyLockedSpell.instanceId);

  assert.equal(failedForEnergy.player.life, 10);
  assert.equal(failedForEnergy.player.lifePaidThisTurn, 0);

  const game = createTestGame();
  game.player.life = 4;
  addForests(game, 1);
  const witness = addCard(
    game,
    customCard("life_payment_witness", "player", {
      effects: [
        {
          type: "TRIGGERED_ABILITY",
          trigger: "LIFE_PAID",
          effect: { type: "PUT_COUNTER", target: "SELF", counterType: "+1/+1", amount: 1 },
        },
      ],
    }),
  );
  const spell = addCard(
    game,
    customCard("pay_three_life_spell", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      energyCost: 1,
      additionalCost: { life: 3 },
    }),
    "player",
    "hand",
  );

  const paid = castCard(game, spell.instanceId);

  assert.equal(paid.lastActionResult?.ok, true);
  assert.equal(paid.player.life, 1);
  assert.equal(paid.player.lifePaidThisTurn, 3);
  assert.equal(paid.player.lifeLostThisTurn, 3);
  assert.equal(paid.player.field.find((card) => card.instanceId === witness.instanceId)?.counters["+1/+1"], 1);

  const nextTurn = structuredClone(paid);
  startPlayerTurn(nextTurn);
  assert.equal(nextTurn.player.lifePaidThisTurn, 0);
  assert.equal(nextTurn.player.lifeLostThisTurn, 0);
});

test("activated life costs are atomic and obey the one-life minimum", () => {
  const game = createTestGame();
  game.player.life = 3;
  game.player.energyPool.stored = 1;
  const acolyte = addCard(
    game,
    customCard("life_cost_activator", "player", {
      activatedAbilities: [
        {
          id: "pay_life_activation",
          cost: { exhaust: true, energy: 1, life: 3 },
          effect: { type: "PUMP_UNTIL_END_OF_TURN", target: "SELF", power: 1, endurance: 1 },
        },
      ],
    }),
  );

  const blocked = activateAbility(game, acolyte.instanceId, "pay_life_activation");

  assert.equal(blocked.lastActionResult?.ok, false);
  assert.equal(blocked.player.life, 3);
  assert.equal(blocked.player.lifePaidThisTurn, 0);
  assert.equal(blocked.player.energyPool.stored, 1);
  assert.equal(blocked.player.field.find((card) => card.instanceId === acolyte.instanceId)?.exhausted, false);
  assert.equal(blocked.player.field.find((card) => card.instanceId === acolyte.instanceId)?.activatedThisTurn, false);

  game.player.life = 4;
  const paid = activateAbility(game, acolyte.instanceId, "pay_life_activation");
  const activated = paid.player.field.find((card) => card.instanceId === acolyte.instanceId);

  assert.equal(paid.lastActionResult?.ok, true);
  assert.equal(paid.player.life, 1);
  assert.equal(paid.player.lifePaidThisTurn, 3);
  assert.equal(paid.player.energyPool.stored, 0);
  assert.equal(activated?.exhausted, true);
  assert.equal(activated?.activatedThisTurn, true);
  assert.equal(activated?.temporaryPower, 1);
});

test("Tithe Acolyte exhausts and pays five life to generate one stored Energy", () => {
  const game = createTestGame();
  game.player.life = 10;
  const acolyte = addCard(game, cardFromDeck("tithe_acolyte", "player"));

  const result = activateAbility(game, acolyte.instanceId, "tithe_acolyte_generate");
  const activated = result.player.field.find((card) => card.instanceId === acolyte.instanceId);

  assert.equal(result.lastActionResult?.ok, true);
  assert.equal(result.player.life, 5);
  assert.equal(result.player.lifePaidThisTurn, 5);
  assert.equal(result.player.energyPool.stored, 1);
  assert.equal(activated?.exhausted, true);
  assert.equal(activated?.activatedThisTurn, true);

  const fullReserve = createTestGame();
  fullReserve.player.life = 10;
  fullReserve.player.energyPool.stored = 3;
  const blockedAcolyte = addCard(fullReserve, cardFromDeck("tithe_acolyte", "player"));

  const blocked = activateAbility(fullReserve, blockedAcolyte.instanceId, "tithe_acolyte_generate");
  const unchanged = blocked.player.field.find((card) => card.instanceId === blockedAcolyte.instanceId);

  assert.equal(blocked.lastActionResult?.ok, false);
  assert.equal(blocked.player.life, 10);
  assert.equal(blocked.player.lifePaidThisTurn, 0);
  assert.equal(blocked.player.energyPool.stored, 3);
  assert.equal(unchanged?.exhausted, false);
  assert.equal(unchanged?.activatedThisTurn, false);
});

test("Court Duelist keeps +3/+1 through Horde combat and loses it at the next player turn", () => {
  const freshGame = createTestGame();
  freshGame.player.life = 10;
  const freshDuelist = addCard(freshGame, cardFromDeck("court_duelist", "player"));
  freshDuelist.stabilizing = true;

  const blockedBySickness = activateAbility(freshGame, freshDuelist.instanceId, "court_duelist_blood_rush");
  const unchangedFreshDuelist = blockedBySickness.player.field.find((card) => card.instanceId === freshDuelist.instanceId);

  assert.equal(blockedBySickness.lastActionResult?.ok, false);
  assert.equal(blockedBySickness.player.life, 10);
  assert.equal(blockedBySickness.player.lifePaidThisTurn, 0);
  assert.equal(unchangedFreshDuelist?.temporaryPower, 0);
  assert.equal(unchangedFreshDuelist?.activatedThisTurn, false);

  const game = createTestGame();
  game.player.life = 10;
  const duelist = addCard(game, cardFromDeck("court_duelist", "player"));

  const buffed = activateAbility(game, duelist.instanceId, "court_duelist_blood_rush");
  const activeDuelist = buffed.player.field.find((card) => card.instanceId === duelist.instanceId);

  assert.equal(buffed.lastActionResult?.ok, true);
  assert.equal(buffed.player.life, 7);
  assert.equal(buffed.player.lifePaidThisTurn, 3);
  assert.equal(activeDuelist?.exhausted, false);
  assert.equal(activeDuelist?.activatedThisTurn, true);
  assert.deepEqual(getPowerEndurance(buffed, activeDuelist), { power: 6, endurance: 4 });

  const repeated = activateAbility(buffed, duelist.instanceId, "court_duelist_blood_rush");
  assert.equal(repeated.lastActionResult?.ok, false);
  assert.equal(repeated.player.life, 7);
  assert.equal(repeated.player.lifePaidThisTurn, 3);
  assert.deepEqual(
    getPowerEndurance(repeated, repeated.player.field.find((card) => card.instanceId === duelist.instanceId)),
    { power: 6, endurance: 4 },
  );

  const hordeTurn = endPlayerTurn(repeated);
  assert.deepEqual(
    getPowerEndurance(hordeTurn, hordeTurn.player.field.find((card) => card.instanceId === duelist.instanceId)),
    { power: 6, endurance: 4 },
  );
  const attacker = addCard(hordeTurn, customCard("court_duelist_defended_attacker", "horde", {
    power: 1,
    endurance: 6,
  }));
  hordeTurn.phase = "combat";
  hordeTurn.combat.hordeAttackers = [attacker.instanceId];
  hordeTurn.combat.blockers = { [attacker.instanceId]: [duelist.instanceId] };
  const [impact] = buildHordeAttackEvents(hordeTurn);
  assert.equal(impact.attackerDamageMarked, 6);
  assert.equal(impact.attackerDies, true);

  const nextTurn = structuredClone(hordeTurn);
  startPlayerTurnReady(nextTurn);
  const readyDuelist = nextTurn.player.field.find((card) => card.instanceId === duelist.instanceId);
  assert.equal(readyDuelist?.activatedThisTurn, false);
  assert.deepEqual(getPowerEndurance(nextTurn, readyDuelist), { power: 3, endurance: 3 });

  const usedAgain = activateAbility(nextTurn, duelist.instanceId, "court_duelist_blood_rush");
  assert.equal(usedAgain.lastActionResult?.ok, true);
  assert.equal(usedAgain.player.life, 4);
  assert.equal(usedAgain.player.lifePaidThisTurn, 3);
});

test("Blood Page gets +2/+0 from the first life loss of each turn", () => {
  const game = createTestGame();
  game.player.life = 20;
  const firstPage = addCard(game, cardFromDeck("blood_page", "player"));
  const secondPage = addCard(game, cardFromDeck("blood_page", "player"));
  const duelist = addCard(game, cardFromDeck("court_duelist", "player"));
  const acolyte = addCard(game, cardFromDeck("tithe_acolyte", "player"));

  const firstPayment = activateAbility(game, duelist.instanceId, "court_duelist_blood_rush");

  for (const page of [firstPage, secondPage]) {
    const current = firstPayment.player.field.find((card) => card.instanceId === page.instanceId);
    assert.equal(current?.temporaryPower, 2);
    assert.deepEqual(getPowerEndurance(firstPayment, current), { power: 3, endurance: 3 });
  }

  const latePage = addCard(firstPayment, cardFromDeck("blood_page", "player"));
  const secondPayment = activateAbility(firstPayment, acolyte.instanceId, "tithe_acolyte_generate");

  assert.equal(secondPayment.player.life, 12);
  assert.equal(secondPayment.player.lifePaidThisTurn, 8);
  assert.equal(secondPayment.player.lifeLostThisTurn, 8);
  assert.equal(secondPayment.player.field.find((card) => card.instanceId === firstPage.instanceId)?.temporaryPower, 2);
  assert.equal(secondPayment.player.field.find((card) => card.instanceId === secondPage.instanceId)?.temporaryPower, 2);
  assert.equal(secondPayment.player.field.find((card) => card.instanceId === latePage.instanceId)?.temporaryPower, 0);

  const cleaned = advancePhase(secondPayment, "end");
  assert.equal(cleaned.player.field.find((card) => card.instanceId === firstPage.instanceId)?.temporaryPower, 0);
  assert.equal(cleaned.player.field.find((card) => card.instanceId === secondPage.instanceId)?.temporaryPower, 0);

  const defense = createTestGame();
  defense.player.life = 10;
  const defendingPage = addCard(defense, cardFromDeck("blood_page", "player"));
  const attacker = addCard(defense, customCard("life_payment_attacker", "horde"), "horde");
  defense.player.lifePaidThisTurn = 3;
  defense.player.lifeLostThisTurn = 3;
  const hordeTurn = endPlayerTurn(defense);
  assert.equal(hordeTurn.player.lifePaidThisTurn, 0);
  assert.equal(hordeTurn.player.lifeLostThisTurn, 0);
  hordeTurn.phase = "combat";
  hordeTurn.combat.hordeAttackers = [attacker.instanceId];
  const instant = addCard(
    hordeTurn,
    customCard("defensive_life_payment", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      modifiers: ["QUICK"],
      additionalCost: { life: 2 },
    }),
    "player",
    "hand",
  );

  const paidDuringHordeTurn = castCard(hordeTurn, instant.instanceId);

  assert.equal(paidDuringHordeTurn.lastActionResult?.ok, true);
  assert.equal(paidDuringHordeTurn.player.life, 8);
  assert.equal(paidDuringHordeTurn.player.lifePaidThisTurn, 2);
  assert.equal(paidDuringHordeTurn.player.lifeLostThisTurn, 2);
  assert.equal(paidDuringHordeTurn.player.field.find((card) => card.instanceId === defendingPage.instanceId)?.temporaryPower, 2);
});

test("Blood Page does not trigger from the first life loss while exhausted", () => {
  const game = createTestGame("blood-page-exhausted");
  game.player.life = 20;
  const exhaustedPage = addCard(game, cardFromDeck("blood_page", "player"));
  const readyPage = addCard(game, cardFromDeck("blood_page", "player"));
  const duelist = addCard(game, cardFromDeck("court_duelist", "player"));
  exhaustedPage.exhausted = true;

  const result = activateAbility(game, duelist.instanceId, "court_duelist_blood_rush");

  assert.equal(result.lastActionResult?.ok, true);
  assert.equal(
    result.player.field.find((card) => card.instanceId === exhaustedPage.instanceId)?.temporaryPower,
    0,
  );
  assert.equal(
    result.player.field.find((card) => card.instanceId === readyPage.instanceId)?.temporaryPower,
    2,
  );
});

test("Blood Page can take an early Horde hit and use the buff against a later attacker", () => {
  const game = createTestGame("blood-page-mid-combat-buff");
  game.player.life = 10;
  const page = addCard(game, cardFromDeck("blood_page", "player"));
  const firstAttacker = addCard(game, customCard("blood_page_unblocked_attacker", "horde", {
    power: 1,
    endurance: 4,
  }));
  const laterAttacker = addCard(game, customCard("blood_page_blocked_attacker", "horde", {
    power: 2,
    endurance: 3,
  }));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [firstAttacker.instanceId, laterAttacker.instanceId];
  game.combat.blockers = { [laterAttacker.instanceId]: [page.instanceId] };

  const planned = buildHordeAttackEvents(game);
  assert.equal(planned[0].playerDamage, 1);
  assert.equal(planned[1].attackerDies, false);

  const afterHit = applyHordeAttackEvent(game, planned[0]);
  drainEventQueue(afterHit);
  const buffedPage = afterHit.player.field.find((card) => card.instanceId === page.instanceId);
  assert.equal(afterHit.player.life, 9);
  assert.equal(afterHit.player.lifeLostThisTurn, 1);
  assert.equal(buffedPage?.temporaryPower, 2);
  assert.deepEqual(getPowerEndurance(afterHit, buffedPage), { power: 3, endurance: 3 });

  const refreshedBlock = refreshHordeAttackEvent(afterHit, planned[1]);
  assert.ok(refreshedBlock);
  assert.equal(refreshedBlock.attackerDies, true);
  assert.equal(refreshedBlock.attackerDamageMarked, 3);

  const afterBlock = applyHordeAttackEvent(afterHit, refreshedBlock);
  assert.equal(afterBlock.horde.memory.some((card) => card.instanceId === laterAttacker.instanceId), true);
});

test("player triggers can stay queued and resolve one source at a time for presentation beats", () => {
  const game = createTestGame();
  game.player.life = 20;
  const firstPage = addCard(game, cardFromDeck("blood_page", "player"));
  const secondPage = addCard(game, cardFromDeck("blood_page", "player"));
  const duelist = addCard(game, cardFromDeck("court_duelist", "player"));

  const deferred = activateAbility(game, duelist.instanceId, "court_duelist_blood_rush", {
    deferReactiveTriggers: true,
  });
  const queuedLifeLoss = deferred.eventQueue.find((event) => event.type === "LIFE_LOST");

  assert.equal(deferred.lastActionResult?.ok, true);
  assert.equal(deferred.player.life, 17);
  assert.equal(deferred.player.field.find((card) => card.instanceId === firstPage.instanceId)?.temporaryPower, 0);
  assert.equal(deferred.player.field.find((card) => card.instanceId === secondPage.instanceId)?.temporaryPower, 0);
  assert.ok(queuedLifeLoss);
  assert.deepEqual(
    pendingTriggerSources(deferred, queuedLifeLoss).map((card) => card.instanceId),
    [firstPage.instanceId, secondPage.instanceId],
  );

  resolveTriggeredEvent(deferred, queuedLifeLoss, undefined, firstPage.instanceId);

  assert.equal(deferred.player.field.find((card) => card.instanceId === firstPage.instanceId)?.temporaryPower, 2);
  assert.equal(deferred.player.field.find((card) => card.instanceId === secondPage.instanceId)?.temporaryPower, 0);
  assert.deepEqual(
    pendingTriggerSources(deferred, queuedLifeLoss).map((card) => card.instanceId),
    [secondPage.instanceId],
  );

  resolveTriggeredEvent(deferred, queuedLifeLoss, undefined, secondPage.instanceId);

  assert.equal(deferred.player.field.find((card) => card.instanceId === secondPage.instanceId)?.temporaryPower, 2);
  assert.deepEqual(pendingTriggerSources(deferred, queuedLifeLoss), []);
});

test("a failed cast does not move cards, Exhaust Sources, or spend Energy", () => {
  const game = createTestGame();
  const [land] = addForests(game, 1);
  const spell = addCard(
    game,
    customCard("unaffordable_spell", "player", {
      zone: "hand",
      kinds: ["SPELL"],
      energyCost: 3,
    }),
    "player",
    "hand",
  );
  const energyBefore = structuredClone(game.player.energyPool);

  const result = castCard(game, spell.instanceId);

  assert.equal(result.player.hand.some((card) => card.instanceId === spell.instanceId), true);
  assert.equal(result.player.memory.length, 0);
  assert.equal(result.player.field.find((card) => card.instanceId === land.instanceId)?.exhausted, false);
  assert.deepEqual(result.player.energyPool, energyBefore);
});

test("Giant Growth applies +3/+3 and cleanup removes the temporary buff", () => {
  const game = createTestGame();
  addForests(game, 1);
  const creature = addCard(game, customCard("test_bear", "player", { power: 2, endurance: 2 }));
  const spell = addCard(game, cardFromDeck("giant_growth", "player", "hand"), "player", "hand");

  const cast = castCard(game, spell.instanceId, { targets: { targetCreature: creature.instanceId } });
  const buffed = cast.player.field.find((card) => card.instanceId === creature.instanceId);

  assert.deepEqual(getPowerEndurance(cast, buffed), { power: 5, endurance: 5 });
  assert.equal(cast.player.memory.some((card) => card.instanceId === spell.instanceId), true);

  const cleaned = advancePhase(cast, "end");
  const restored = cleaned.player.field.find((card) => card.instanceId === creature.instanceId);
  assert.deepEqual(getPowerEndurance(cleaned, restored), { power: 2, endurance: 2 });
});

test("Broken Wings only offers legal permanent types and destroys Graf Harvest", () => {
  const game = createTestGame();
  addForests(game, 3);
  const grafHarvest = addCard(game, cardFromDeck("graf_harvest", "horde"));
  const flyer = addCard(game, customCard("test_flyer", "horde", { traits: ["FLYING"] }));
  const groundCreature = addCard(game, customCard("test_ground_creature", "horde"));
  const spell = addCard(game, cardFromDeck("broken_wings", "player", "hand"), "player", "hand");
  const requirement = spell.requiresTargets[0];

  const candidateIds = targetCandidates(game, "player", requirement).map((card) => card.instanceId);
  assert.equal(candidateIds.includes(grafHarvest.instanceId), true);
  assert.equal(candidateIds.includes(flyer.instanceId), true);
  assert.equal(candidateIds.includes(groundCreature.instanceId), false);

  const result = castCard(game, spell.instanceId, { targets: { targetPermanent: grafHarvest.instanceId } });
  assert.equal(result.horde.field.some((card) => card.instanceId === grafHarvest.instanceId), false);
  assert.equal(result.horde.memory.some((card) => card.instanceId === grafHarvest.instanceId), true);
});

test("Cosmic Hunger deals source power and preserves deathtouch for death cleanup", () => {
  const game = createTestGame();
  addForests(game, 2);
  const source = addCard(game, customCard("deathtouch_source", "player", { traits: ["LETHAL"], power: 1, endurance: 1 }));
  const target = addCard(game, customCard("large_target", "horde", { power: 0, endurance: 8 }));
  const spell = addCard(game, cardFromDeck("cosmic_hunger", "player", "hand"), "player", "hand");

  const result = castCard(game, spell.instanceId, {
    targets: { sourceCreature: source.instanceId, damageTarget: target.instanceId },
  });
  const damagedTarget = result.horde.field.find((card) => card.instanceId === target.instanceId);

  assert.equal(damagedTarget.damageMarked, 1);
  assert.equal(damagedTarget.lethalDamage, true);
  destroyMarkedCreatures(result);
  assert.equal(result.horde.memory.some((card) => card.instanceId === target.instanceId), true);
});

test("Ruthless Predation buffs first, then both creatures deal simultaneous damage", () => {
  const game = createTestGame();
  addForests(game, 2);
  const friendly = addCard(game, customCard("friendly_fighter", "player", { power: 2, endurance: 2 }));
  const enemy = addCard(game, customCard("enemy_fighter", "horde", { power: 3, endurance: 3 }));
  const spell = addCard(game, cardFromDeck("ruthless_predation", "player", "hand"), "player", "hand");

  const result = castCard(game, spell.instanceId, {
    targets: { yourCreature: friendly.instanceId, opponentCreature: enemy.instanceId },
  });
  const survivingFriendly = result.player.field.find((card) => card.instanceId === friendly.instanceId);
  const damagedEnemy = result.horde.field.find((card) => card.instanceId === enemy.instanceId);

  assert.deepEqual(getPowerEndurance(result, survivingFriendly), { power: 3, endurance: 4 });
  assert.equal(survivingFriendly.damageMarked, 3);
  assert.equal(damagedEnemy.damageMarked, 3);
  destroyMarkedCreatures(result);
  assert.equal(result.player.field.some((card) => card.instanceId === friendly.instanceId), true);
  assert.equal(result.horde.memory.some((card) => card.instanceId === enemy.instanceId), true);

  const cleaned = advancePhase(result, "end");
  const restoredFriendly = cleaned.player.field.find((card) => card.instanceId === friendly.instanceId);
  assert.deepEqual(getPowerEndurance(cleaned, restoredFriendly), { power: 2, endurance: 2 });
  assert.equal(restoredFriendly.damageMarked, 0);
});

test("Ruthless Predation can stage its buff before the deferred fight impact", () => {
  const game = createTestGame();
  addForests(game, 2);
  const friendly = addCard(game, customCard("staged_friendly_fighter", "player", { power: 2, endurance: 2 }));
  const enemy = addCard(game, customCard("staged_enemy_fighter", "horde", { power: 1, endurance: 5 }));
  const spell = addCard(game, cardFromDeck("ruthless_predation", "player", "hand"), "player", "hand");
  const targets = {
    yourCreature: friendly.instanceId,
    opponentCreature: enemy.instanceId,
  };

  const staged = castCard(game, spell.instanceId, {
    targets,
    deferFightResolution: true,
  });
  const buffedFriendly = staged.player.field.find((card) => card.instanceId === friendly.instanceId);
  const untouchedEnemy = staged.horde.field.find((card) => card.instanceId === enemy.instanceId);

  assert.deepEqual(getPowerEndurance(staged, buffedFriendly), { power: 3, endurance: 4 });
  assert.equal(buffedFriendly.damageMarked, 0);
  assert.equal(untouchedEnemy.damageMarked, 0);
  assert.equal(staged.player.memory.some((card) => card.instanceId === spell.instanceId), true);

  resolveEffects(
    staged,
    spell.effects.filter((effect) => effect.type === "FIGHT_SIMULTANEOUS"),
    { source: spell, side: "player", targets },
  );
  assert.equal(buffedFriendly.damageMarked, 1);
  assert.equal(untouchedEnemy.damageMarked, 3);
});

test("Sunshower Druid can target itself, adds one counter, and gains one life", () => {
  const game = createTestGame();
  addForests(game, 1);
  const druid = addCard(game, cardFromDeck("sunshower_druid", "player", "hand"), "player", "hand");

  const result = castCard(game, druid.instanceId);
  const permanent = result.player.field.find((card) => card.instanceId === druid.instanceId);
  const manualTrigger = findManualInvokedTargetTrigger(permanent);
  assert.ok(manualTrigger, "Sunshower Druid should expose its manual enter trigger");
  resolveEffect(result, manualTrigger.effect, {
    source: permanent,
    side: "player",
    targets: { target: permanent.instanceId, targetCreature: permanent.instanceId },
  });

  assert.equal(permanent.counters["+1/+1"], 1);
  assert.equal(result.player.life, 31);
  assert.deepEqual(getPowerEndurance(result, permanent), { power: 1, endurance: 3 });
});

test("Graf Harvest grants Menace only while it remains on the battlefield", () => {
  const game = createTestGame();
  const grafHarvest = addCard(game, cardFromDeck("graf_harvest", "horde"));
  const zombie = addCard(game, cardFromDeck("zombie_token", "horde"));
  const nonZombie = addCard(game, customCard("horde_non_zombie", "horde"));

  assert.equal(hasTrait(game, zombie, "DAUNTING"), true);
  assert.equal(hasTrait(game, nonZombie, "DAUNTING"), false);

  destroyPermanent(game, grafHarvest);
  assert.equal(hasTrait(game, zombie, "DAUNTING"), false);
});

test("Toxic adds poison on player combat and every three poison mills one card", () => {
  const game = createTestGame();
  const basilisk = addCard(game, cardFromDeck("ichorspit_basilisk", "player"));
  for (let index = 0; index < 3; index += 1) {
    addCard(game, customCard(`horde_library_${index}`, "horde", { zone: "archive" }), "horde", "archive");
  }
  game.combat.playerAttackers = [basilisk.instanceId];

  const combatResult = resolvePlayerCombat(game);
  assert.equal(combatResult.horde.poisonCounters, 1);
  assert.equal(combatResult.horde.memory.length, 0);

  combatResult.horde.poisonCounters = 3;
  const turnResult = endPlayerTurn(combatResult);
  assert.equal(turnResult.horde.poisonCounters, 0);
  assert.equal(turnResult.horde.memory.length, 1);
  assert.equal(turnResult.horde.archive.length, 2);
});

test("mono-green growth cards select the intended presentation intensity", () => {
  assert.equal(buffAnimationVariantForCard("sunshower_druid"), "growth-strong");
  assert.equal(buffAnimationVariantForCard("beast_kin_ranger"), "growth-strong");
  assert.equal(buffAnimationVariantForCard("giant_growth"), "growth-strong");
  assert.equal(buffAnimationVariantForCard("ruthless_predation"), "growth-strong");
  assert.equal(buffAnimationVariantForCard("ruthless_predation", true), "growth-preview");
  assert.equal(buffAnimationVariantForCard("predatory_thirst"), "default");
});

test("only organic branch buffs replace the player's default buff audio", () => {
  assert.equal(playerBuffSfxForAnimation("growth-strong"), "monoGreenBuff");
  assert.equal(playerBuffSfxForAnimation("growth-soft"), "monoGreenBuff");
  assert.equal(playerBuffSfxForAnimation("default"), "buff");
});

test("animated Toxic lands at its attack impact and is not applied twice at combat cleanup", () => {
  const game = createTestGame("toxic-player-impact");
  const basilisk = addCard(game, cardFromDeck("ichorspit_basilisk", "player"));
  game.combat.playerAttackers = [basilisk.instanceId];

  const animatedImpact = resolvePlayerAttackerPoison(game, basilisk.instanceId);
  const animatedResult = resolvePlayerCombat(animatedImpact, { skipPoison: true });

  assert.equal(game.horde.poisonCounters, 0);
  assert.equal(animatedImpact.horde.poisonCounters, 1);
  assert.equal(animatedResult.horde.poisonCounters, 1);
  assert.equal(animatedResult.combat.playerAttackers.length, 0);
});

test("Lifesteal restores the combat damage a player attacker deals to the Horde", () => {
  const game = createTestGame("lifesteal-player-attack");
  game.player.life = 10;
  const bat = addCard(game, cardFromDeck("crimson_bat", "player"));
  bat.temporaryPower = 2;
  game.combat.playerAttackers = [bat.instanceId];

  const result = resolvePlayerCombat(game);
  const animatedImpact = resolvePlayerAttackerDrain(game, bat.instanceId);
  const animatedResult = resolvePlayerCombat(animatedImpact, { skipDrain: true });

  assert.equal(result.player.life, 14);
  assert.equal(result.combat.playerAttackers.length, 0);
  assert.equal(animatedImpact.player.life, 14);
  assert.equal(animatedResult.player.life, 14);
  assert.equal(animatedResult.combat.playerAttackers.length, 0);
});

test("Lifesteal resolves on a blocking impact, including simultaneous lethal combat", () => {
  const game = createTestGame("lifesteal-blocking");
  game.player.life = 10;
  const attacker = addCard(game, customCard("lifesteal_horde_attacker", "horde", {
    power: 2,
    endurance: 2,
  }));
  const bat = addCard(game, cardFromDeck("crimson_bat", "player"));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [bat.instanceId] };

  const [impact] = buildHordeAttackEvents(game);
  const result = applyHordeAttackEvent(game, impact);

  assert.equal(impact.playerLifeGain, 2);
  assert.equal(result.player.life, 12);
  assert.equal(result.player.field.some((card) => card.instanceId === bat.instanceId), false);
  assert.equal(result.horde.field.some((card) => card.instanceId === attacker.instanceId), false);
  assert.equal(result.horde.memory.some((card) => card.instanceId === attacker.instanceId), true);
});

test("Lifesteal gains nothing when first strike kills the blocker before it deals damage", () => {
  const game = createTestGame("lifesteal-blocked-by-first-strike");
  game.player.life = 10;
  const attacker = addCard(game, customCard("first_strike_horde_attacker", "horde", {
    traits: ["REFLEX"],
    power: 2,
    endurance: 2,
  }));
  const bat = addCard(game, cardFromDeck("crimson_bat", "player"));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [bat.instanceId] };

  const [impact] = buildHordeAttackEvents(game);
  const result = applyHordeAttackEvent(game, impact);

  assert.equal(impact.playerLifeGain, 0);
  assert.equal(result.player.life, 10);
  assert.equal(result.player.field.some((card) => card.instanceId === bat.instanceId), false);
  assert.equal(result.horde.field.find((card) => card.instanceId === attacker.instanceId)?.damageMarked, 0);
});

test("Crypt Guardian reacts only when that Guardian survives combat damage, before deaths from the same impact", () => {
  const game = createTestGame("crypt-guardian-survives-blocking");
  game.player.life = 10;
  const attacker = addCard(game, customCard("crypt_attacker", "horde", {
    power: 1,
    endurance: 2,
  }));
  const guardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
  const idleGuardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [guardian.instanceId] };

  const [impact] = buildHordeAttackEvents(game);
  const afterImpact = applyHordeAttackEvent(game, impact);

  assert.deepEqual(
    afterImpact.eventQueue.map((event) => event.type),
    ["SURVIVED_DAMAGE", "THIS_DIES", "ECHO_DIED"],
  );
  assert.deepEqual(
    pendingTriggerSources(afterImpact, afterImpact.eventQueue[0]).map((source) => source.instanceId),
    [guardian.instanceId],
  );
  assert.equal(afterImpact.player.life, 10);

  resolveTriggeredEvent(afterImpact, afterImpact.eventQueue[0], undefined, guardian.instanceId);
  assert.equal(afterImpact.player.life, 12);
  assert.equal(
    pendingTriggerSources(afterImpact, afterImpact.eventQueue[0]).some(
      (source) => source.instanceId === idleGuardian.instanceId,
    ),
    false,
  );
});

test("Crypt Guardian does not react when the damage event kills it", () => {
  const game = createTestGame("crypt-guardian-dies-blocking");
  game.player.life = 10;
  const attacker = addCard(game, customCard("crypt_lethal_attacker", "horde", {
    power: 4,
    endurance: 4,
  }));
  const guardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [guardian.instanceId] };

  const [impact] = buildHordeAttackEvents(game);
  const afterImpact = applyHordeAttackEvent(game, impact);

  assert.equal(
    afterImpact.eventQueue.some(
      (event) => event.type === "SURVIVED_DAMAGE" && event.sourceId === guardian.instanceId,
    ),
    false,
  );
  assert.equal(afterImpact.player.life, 10);
  assert.equal(afterImpact.player.field.some((card) => card.instanceId === guardian.instanceId), false);
});

test("Crypt Guardian reacts to every nonlethal Goblin damage event without a per-turn limit", () => {
  const game = createTestGame("crypt-guardian-unlimited-goblin-damage");
  game.player.life = 10;
  const guardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
  const goblin = addCard(game, customCard("crypt_guardian_burn_goblin", "horde", {
    subtypes: ["Goblin"],
  }));
  for (let index = 0; index < 2; index += 1) {
    enqueue(game, {
      type: "BURN_VOLLEY_DAMAGE",
      sourceId: goblin.instanceId,
      payload: {
        sourceSide: "horde",
        targetPlayer: true,
        targetIds: [guardian.instanceId],
        amount: 1,
      },
    });
  }

  drainEventQueue(game);

  assert.equal(game.player.field.find((card) => card.instanceId === guardian.instanceId)?.damageMarked, 2);
  assert.equal(game.player.life, 12);
  assert.equal(game.eventQueue.length, 0);
});

test("Horde reveal stops at a non-token and Surge adds exactly two reveals", () => {
  const normal = createTestGame("normal-reveal");
  addCard(normal, customCard("normal_token_1", "horde", { zone: "archive", isToken: true }), "horde", "archive");
  addCard(normal, customCard("normal_token_2", "horde", { zone: "archive", isToken: true }), "horde", "archive");
  addCard(normal, customCard("normal_non_token", "horde", { zone: "archive" }), "horde", "archive");
  addCard(normal, customCard("normal_unrevealed", "horde", { zone: "archive", isToken: true }), "horde", "archive");

  const normalResult = runHordeMain(normal);
  assert.equal(normalResult.horde.field.length, 3);
  assert.deepEqual(normalResult.horde.archive.map((card) => card.definitionId), ["normal_unrevealed"]);

  const surge = createTestGame("surge-reveal");
  surge.hordeTurnNumber = 9;
  for (let index = 0; index < 5; index += 1) {
    addCard(surge, customCard(`surge_token_${index}`, "horde", { zone: "archive", isToken: true }), "horde", "archive");
  }
  for (let index = 0; index < 6; index += 1) {
    addCard(surge, customCard(`surge_grave_${index}`, "horde", { zone: "memory" }), "horde", "memory");
  }

  const surgeResult = runHordeMain(surge);
  assert.equal(surge.hordeTurnNumber, 9);
  assert.equal(surgeResult.hordeTurnNumber, 10);
  assert.equal(surgeResult.horde.field.length, 5);
  assert.equal(surgeResult.horde.archive.length, 0);
});

test("Goblin static lords and War Drums apply only to the intended Horde creatures", () => {
  const game = createTestGame("goblin-static-effects");
  const hobgoblin = addCard(game, cardFromDeck("hobgoblin_bandit_lord", "horde"));
  const warDrums = addCard(game, cardFromDeck("goblin_war_drums", "horde"));
  const goblin = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const nonGoblin = addCard(game, customCard("not_a_goblin", "horde", { power: 2, endurance: 2 }));

  assert.deepEqual(getPowerEndurance(game, hobgoblin), { power: 2, endurance: 3 });
  assert.deepEqual(getPowerEndurance(game, goblin), { power: 2, endurance: 2 });
  assert.deepEqual(getPowerEndurance(game, nonGoblin), { power: 2, endurance: 2 });
  assert.equal(hasTrait(game, goblin, "DAUNTING"), true);
  assert.equal(hasTrait(game, nonGoblin, "DAUNTING"), true);

  destroyPermanent(game, warDrums);
  assert.equal(hasTrait(game, goblin, "DAUNTING"), false);
});

test("Hobgoblin Bandit Lord burns for Goblins that entered this Horde turn", () => {
  const game = createTestGame("hobgoblin-entered-goblins");
  const target = addCard(game, customCard("hobgoblin_burn_target", "player", { endurance: 8 }));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  addCard(game, cardFromDeck("hobgoblin_bandit_lord", "horde", "archive"), "horde", "archive");

  const firstTurn = runHordeMain(game);
  assert.equal(firstTurn.player.field.find((card) => card.instanceId === target.instanceId)?.damageMarked, 3);

  addCard(firstTurn, cardFromDeck("hobgoblin_bandit_lord", "horde", "archive"), "horde", "archive");
  const secondTurn = runHordeMain(firstTurn);
  assert.equal(secondTurn.player.field.find((card) => card.instanceId === target.instanceId)?.damageMarked, 4);
});

test("Beetleback Chief and Siege-Gang Commander create their Goblin tokens on entry", () => {
  const beetlebackGame = createTestGame("beetleback-entry");
  const beetleback = addCard(beetlebackGame, cardFromDeck("beetleback_chief", "horde"));
  runInvokedTriggers(beetlebackGame, beetleback);
  drainEventQueue(beetlebackGame);
  assert.equal(beetlebackGame.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 2);

  const siegeGangGame = createTestGame("siege-gang-entry");
  const siegeGang = addCard(siegeGangGame, cardFromDeck("siege_gang_commander", "horde"));
  runInvokedTriggers(siegeGangGame, siegeGang);
  drainEventQueue(siegeGangGame);
  assert.equal(siegeGangGame.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 3);
});

test("Noosegraf Mob reacts once to each non-token card played and ignores tokens", () => {
  const game = createTestGame("noosegraf-card-played");
  const mob = addCard(game, cardFromDeck("noosegraf_mob", "horde"));

  for (const sourceId of ["player-non-token", "host-non-token"]) {
    enqueue(game, { type: "CARD_PLAYED", sourceId, payload: { nonToken: true } });
    drainEventQueue(game);
  }
  enqueue(game, { type: "CARD_PLAYED", sourceId: "played-token", payload: { nonToken: false } });
  drainEventQueue(game);

  assert.equal(mob.counters["+1/+1"], 3);
  assert.equal(game.horde.field.filter((card) => card.definitionId === "zombie_token").length, 2);
});

test("Noosegraf Mob observes real Chronicler plays and Host reveals exactly once", () => {
  const game = createTestGame("noosegraf-real-play-paths");
  addCard(game, cardFromDeck("noosegraf_mob", "horde"));
  const spell = addCard(game, customCard("noosegraf_test_spell", "player", {
    zone: "hand",
    kinds: ["SPELL"],
  }), "player", "hand");

  const afterSpell = castCard(game, spell.instanceId);
  assert.equal(afterSpell.horde.field.find((card) => card.definitionId === "noosegraf_mob")?.counters["+1/+1"], 4);
  assert.equal(afterSpell.horde.field.filter((card) => card.definitionId === "zombie_token").length, 1);

  addCard(afterSpell, customCard("noosegraf_host_reveal", "horde", { zone: "archive" }), "horde", "archive");
  const afterReveal = revealHordeCardFromTop(afterSpell);
  assert.equal(afterReveal.horde.field.find((card) => card.definitionId === "noosegraf_mob")?.counters["+1/+1"], 3);
  assert.equal(afterReveal.horde.field.filter((card) => card.definitionId === "zombie_token").length, 2);
});

test("Crow discards two Host Archive cards when Invoked and two more when it dies", () => {
  const game = createTestGame("crow-archive-discard");
  const crow = addCard(game, cardFromDeck("crow_of_dark_tidings", "horde"));
  for (let index = 0; index < 4; index += 1) {
    addCard(game, customCard(`crow_archive_${index}`, "horde", { zone: "archive" }), "horde", "archive");
  }

  runInvokedTriggers(game, crow);
  assert.equal(game.horde.archive.length, 2);
  drainEventQueue(game);

  destroyPermanent(game, crow);
  assert.deepEqual(game.eventQueue.map((event) => event.type), ["THIS_DIES", "ECHO_DIED"]);
  drainEventQueue(game);

  assert.equal(game.horde.archive.length, 0);
  assert.equal(game.horde.memory.filter((card) => card.definitionId.startsWith("crow_archive_")).length, 4);
});

test("destroying a Support does not emit Echo death events", () => {
  const game = createTestGame("support-destroyed-not-died");
  const support = addCard(game, customCard("destroyed_support", "horde", { kinds: ["SUPPORT"] }));

  destroyPermanent(game, support);

  assert.deepEqual(game.eventQueue, []);
});

test("Memory threshold effects turn on exactly at seven Host cards", () => {
  const game = createTestGame("memory-threshold");
  const thraben = addCard(game, cardFromDeck("thraben_foulbloods", "horde"));
  for (let index = 0; index < 6; index += 1) {
    addCard(game, customCard(`memory_card_${index}`, "horde", { zone: "memory" }), "horde", "memory");
  }

  assert.deepEqual(getPowerEndurance(game, thraben), { power: 3, endurance: 2 });
  assert.equal(hasTrait(game, thraben, "DAUNTING"), false);

  addCard(game, customCard("memory_card_6", "horde", { zone: "memory" }), "horde", "memory");
  assert.deepEqual(getPowerEndurance(game, thraben), { power: 4, endurance: 3 });
  assert.equal(hasTrait(game, thraben, "DAUNTING"), true);
});

test("Siege-Gang Commander and Pashalik Mons omit their sacrifice modes", () => {
  const siegeGang = cardFromDeck("siege_gang_commander", "horde");
  const pashalik = cardFromDeck("pashalik_mons", "horde");

  assert.deepEqual(siegeGang.activatedAbilities, []);
  assert.deepEqual(pashalik.activatedAbilities, []);
});

test("Goblin Surprise pumps an existing army or starts another normal reveal round", () => {
  const pumpGame = createTestGame("goblin-surprise-pump");
  const firstGoblin = addCard(pumpGame, cardFromDeck("goblin_token_1_1_red", "horde"));
  const secondGoblin = addCard(pumpGame, cardFromDeck("goblin_token_1_1_red", "horde"));
  addCard(pumpGame, cardFromDeck("goblin_surprise", "horde", "archive"), "horde", "archive");

  const pumped = runHordeMain(pumpGame);
  assert.equal(pumped.horde.field.find((card) => card.instanceId === firstGoblin.instanceId)?.temporaryPower, 2);
  assert.equal(pumped.horde.field.find((card) => card.instanceId === secondGoblin.instanceId)?.temporaryPower, 2);

  const animatedPumpGame = createTestGame("goblin-surprise-animated-pump");
  const animatedGoblin = addCard(animatedPumpGame, cardFromDeck("goblin_token_1_1_red", "horde"));
  addCard(animatedPumpGame, cardFromDeck("goblin_surprise", "horde", "archive"), "horde", "archive");

  const pendingPump = runHordeMain(animatedPumpGame, { deferInvokedTriggers: true });
  assert.equal(pendingPump.horde.field.find((card) => card.instanceId === animatedGoblin.instanceId)?.temporaryPower, 0);
  assert.deepEqual(
    pendingPump.eventQueue.find((event) => event.type === "HOST_GROUP_BUFF")?.payload?.affectedIds,
    [animatedGoblin.instanceId],
  );
  drainEventQueue(pendingPump);
  assert.equal(pendingPump.horde.field.find((card) => card.instanceId === animatedGoblin.instanceId)?.temporaryPower, 2);

  const revealGame = createTestGame("goblin-surprise-reveal");
  addCard(revealGame, cardFromDeck("goblin_surprise", "horde", "archive"), "horde", "archive");
  for (let index = 0; index < 4; index += 1) {
    addCard(revealGame, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  }

  const revealResult = runHordeMain(revealGame);
  assert.equal(revealResult.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 3);
  assert.equal(revealResult.horde.archive.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 1);
  assert.equal(revealResult.hordeTurnNumber, 1, "the extra reveal is part of the same Horde turn");
});

test("Volley Veteran damages a chosen opposing creature equal to the Horde's Goblin count", () => {
  const game = createTestGame("volley-veteran-entry");
  const fragile = addCard(game, customCard("volley_target", "player", { endurance: 2 }));
  const sturdy = addCard(game, customCard("volley_survivor", "player", { endurance: 4 }));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const veteran = addCard(game, cardFromDeck("volley_veteran", "horde"));

  runInvokedTriggers(game, veteran);
  drainEventQueue(game);

  assert.equal(game.player.field.some((card) => card.instanceId === fragile.instanceId), false);
  assert.equal(game.player.field.find((card) => card.instanceId === sturdy.instanceId)?.damageMarked, 0);
});

test("Goblin Rabblemaster creates its combat token before Horde attackers are declared", () => {
  const game = createTestGame("rabblemaster-combat-token");
  const rabblemaster = addCard(game, cardFromDeck("goblin_rabblemaster", "horde"));

  const result = prepareHordeAttackers(game);
  const tokens = result.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(tokens.length, 1);
  assert.deepEqual(new Set(result.combat.hordeAttackers), new Set([rabblemaster.instanceId, tokens[0].instanceId]));
  assert.equal(tokens[0].exhausted, true);
});

test("Goblin token waves attack in chronological visual order", () => {
  const game = createTestGame("goblin-wave-attack-order");
  const firstWave = Array.from(
    { length: 4 },
    () => addCard(game, cardFromDeck("goblin_token_1_1_red", "horde")),
  );
  const creatureBetweenWaves = addCard(game, cardFromDeck("hobgoblin_bandit_lord", "horde"));
  const secondWave = Array.from(
    { length: 2 },
    () => addCard(game, cardFromDeck("goblin_token_1_1_red", "horde")),
  );

  const result = prepareHordeAttackers(game);

  assert.deepEqual(result.combat.hordeAttackers, [
    ...firstWave.map((card) => card.instanceId),
    creatureBetweenWaves.instanceId,
    ...secondWave.map((card) => card.instanceId),
  ]);
});

test("Horde attackers follow summon order instead of regrouping identical definitions", () => {
  const game = createTestGame("horde-summon-order");
  const firstCopy = addCard(game, customCard("repeated_raider", "horde", { subtypes: ["Goblin"] }));
  const summonedBetween = addCard(game, cardFromDeck("hobgoblin_bandit_lord", "horde"));
  const secondCopy = addCard(game, customCard("repeated_raider", "horde", { subtypes: ["Goblin"] }));

  const result = prepareHordeAttackers(game);

  assert.deepEqual(result.combat.hordeAttackers, [
    firstCopy.instanceId,
    summonedBetween.instanceId,
    secondCopy.instanceId,
  ]);
});

test("Goblin Rabblemaster counts every other attacking Goblin after attack tokens enter", () => {
  const game = createTestGame("rabblemaster-attack-buff");
  const rabblemaster = addCard(game, cardFromDeck("goblin_rabblemaster", "horde"));
  addCard(game, cardFromDeck("general_kreat_the_boltbringer", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  const result = prepareHordeAttackers(game);
  const currentRabblemaster = result.horde.field.find((card) => card.instanceId === rabblemaster.instanceId);

  assert.ok(currentRabblemaster);
  assert.equal(result.combat.hordeAttackers.length, 5);
  assert.deepEqual(getPowerEndurance(result, currentRabblemaster), { power: 6, endurance: 2 });
});

test("Battle Cry Goblin gives Horde Goblins +1/+0 until end of turn on entry", () => {
  const game = createTestGame("battle-cry-entry-pump");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  addCard(game, cardFromDeck("battle_cry_goblin", "horde", "archive"), "horde", "archive");

  const result = runHordeMain(game);
  const battleCry = result.horde.field.find((card) => card.definitionId === "battle_cry_goblin");
  const token = result.horde.field.find((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(battleCry?.temporaryPower, 1);
  assert.equal(battleCry?.temporaryEndurance, 0);
  assert.equal(token?.temporaryPower, 1);
  assert.equal(token?.temporaryEndurance, 0);
  assert.equal(result.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 1);
});

test("General Kreat creates one attacking token and damages the player when it enters", () => {
  const game = createTestGame("general-kreat-attack");
  addCard(game, cardFromDeck("general_kreat_the_boltbringer", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  const result = prepareHordeAttackers(game);
  const goblinTokens = result.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(goblinTokens.length, 2);
  assert.equal(result.combat.hordeAttackers.length, 3);
  assert.equal(result.player.life, 29);
});

test("General Kreat queues a separate player Burn for each other creature entering", () => {
  const game = createTestGame("general-kreat-separate-burns");
  addCard(game, cardFromDeck("general_kreat_the_boltbringer", "horde"));

  const resolveCreatureEntry = (definitionId) => {
    const creature = addCard(game, customCard(definitionId, "horde", { subtypes: ["Goblin"] }));
    runInvokedTriggers(game, creature);
    const enterEvent = game.eventQueue.shift();
    assert.equal(enterEvent?.type, "ECHO_INVOKED");
    resolveTriggeredEvent(game, enterEvent);
    return game.eventQueue.shift();
  };

  const firstBurn = resolveCreatureEntry("general_kreat_first_arrival");
  assert.equal(game.player.life, 30);
  assert.equal(firstBurn?.type, "BURN_VOLLEY_DAMAGE");
  assert.equal(firstBurn?.payload?.targetPlayer, true);
  resolveTriggeredEvent(game, firstBurn);
  assert.equal(game.player.life, 29);
  drainEventQueue(game);

  const secondBurn = resolveCreatureEntry("general_kreat_second_arrival");
  assert.equal(game.player.life, 29);
  assert.equal(secondBurn?.type, "BURN_VOLLEY_DAMAGE");
  resolveTriggeredEvent(game, secondBurn);
  assert.equal(game.player.life, 28);
  drainEventQueue(game);
});

test("only Echo invocations broadcast ECHO_INVOKED", () => {
  const game = createTestGame("echo-invoked-only");
  const support = addCard(game, customCard("test_support", "horde", { kinds: ["SUPPORT"] }));

  runInvokedTriggers(game, support);

  assert.equal(game.eventQueue.some((event) => event.type === "ECHO_INVOKED"), false);
});

test("Raid Bombardment defers one damage per small Goblin attacker until combat ends", () => {
  const game = createTestGame("raid-bombardment");
  const raid = addCard(game, cardFromDeck("raid_bombardment", "horde"));
  const smallGoblin = addCard(game, customCard("small_goblin", "horde", { subtypes: ["Goblin"], power: 1 }));
  const mediumGoblin = addCard(game, customCard("medium_goblin", "horde", { subtypes: ["Goblin"], power: 2 }));
  addCard(game, customCard("large_goblin", "horde", { subtypes: ["Goblin"], power: 3 }));
  addCard(game, customCard("small_non_goblin", "horde", { subtypes: ["Warrior"], power: 1 }));

  const declared = prepareHordeAttackers(game);

  assert.equal(declared.player.life, 30);
  assert.deepEqual(declared.combat.pendingDamageVolleys, [{
    sourceId: raid.instanceId,
    attackerIds: [smallGoblin.instanceId, mediumGoblin.instanceId],
    amountPerAttacker: 1,
  }]);

  const result = resolveHordeCombat(declared);
  assert.equal(result.player.life, 21);
  assert.deepEqual(result.combat.pendingDamageVolleys, []);
});

test("Krenko grows before creating tokens equal to its new power", () => {
  const game = createTestGame("krenko-attack");
  const krenko = addCard(game, cardFromDeck("krenko_tin_street_kingpin", "horde"));

  const result = prepareHordeAttackers(game);
  const currentKrenko = result.horde.field.find((card) => card.instanceId === krenko.instanceId);
  const tokens = result.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(currentKrenko?.counters["+1/+1"], 1);
  assert.deepEqual(getPowerEndurance(result, currentKrenko), { power: 2, endurance: 3 });
  assert.equal(tokens.length, 2);
  assert.equal(tokens.every((card) => card.exhausted && result.combat.hordeAttackers.includes(card.instanceId)), true);
});

test("Goblin Chainwhirler queues one simultaneous Burn volley to the player and opposing creatures", () => {
  const game = createTestGame("chainwhirler-entry");
  const fragile = addCard(game, customCard("fragile_player_creature", "player", { endurance: 1 }));
  const sturdy = addCard(game, customCard("sturdy_player_creature", "player", { endurance: 2 }));
  const chainwhirler = addCard(game, cardFromDeck("goblin_chainwhirler", "horde"));

  runInvokedTriggers(game, chainwhirler, undefined, { deferSelfTriggers: true });
  const enterEvent = game.eventQueue.shift();
  assert.ok(enterEvent);
  resolveTriggeredEvent(game, enterEvent);

  assert.equal(game.player.life, 30);
  assert.equal(fragile.damageMarked, 0);
  assert.equal(sturdy.damageMarked, 0);
  const volleyEvent = game.eventQueue.find((event) => event.type === "BURN_VOLLEY_DAMAGE");
  assert.ok(volleyEvent);
  assert.equal(volleyEvent.payload?.targetPlayer, true);
  assert.deepEqual(volleyEvent.payload?.targetIds, [fragile.instanceId, sturdy.instanceId]);

  drainEventQueue(game);

  assert.equal(game.player.life, 29);
  assert.equal(game.player.field.some((card) => card.instanceId === fragile.instanceId), false);
  assert.equal(game.player.field.find((card) => card.instanceId === sturdy.instanceId)?.damageMarked, 1);
});

test("Diregraf Captain queues an oil Burn before the player loses life", () => {
  const game = createTestGame("diregraf-captain-oil-burn");
  const captain = addCard(game, cardFromDeck("diregraf_captain", "horde"));
  const zombie = addCard(game, cardFromDeck("zombie_token", "horde"));

  destroyPermanent(game, zombie);
  const deathIndex = game.eventQueue.findIndex((event) => event.type === "ECHO_DIED");
  assert.notEqual(deathIndex, -1);
  const [deathEvent] = game.eventQueue.splice(deathIndex, 1);
  resolveTriggeredEvent(game, deathEvent, undefined, captain.instanceId);

  assert.equal(game.player.life, 30, "life loss waits for the projectile impact");
  const oilBurnIndex = game.eventQueue.findIndex((event) => event.type === "BURN_PLAYER_LIFE_LOSS");
  assert.notEqual(oilBurnIndex, -1);
  const [oilBurn] = game.eventQueue.splice(oilBurnIndex, 1);
  assert.equal(oilBurn.sourceId, captain.instanceId);
  assert.equal(oilBurn.payload?.targetPlayer, true);
  assert.equal(oilBurn.payload?.amount, 1);
  assert.equal(oilBurn.payload?.variant, "oil");

  resolveTriggeredEvent(game, oilBurn);
  assert.equal(game.player.life, 29);
});

test("Pashalik Mons burns a random opposing creature separately for each Goblin death", () => {
  const anotherGoblinDies = createTestGame("pashalik-other-dies");
  addCard(anotherGoblinDies, cardFromDeck("pashalik_mons", "horde"));
  const burnTarget = addCard(anotherGoblinDies, customCard("pashalik_burn_target", "player", { endurance: 5 }));
  const firstGoblin = addCard(anotherGoblinDies, cardFromDeck("goblin_token_1_1_red", "horde"));
  const secondGoblin = addCard(anotherGoblinDies, cardFromDeck("goblin_token_1_1_red", "horde"));
  destroyPermanent(anotherGoblinDies, firstGoblin);
  drainEventQueue(anotherGoblinDies);
  assert.equal(burnTarget.damageMarked, 1);
  assert.equal(burnTarget.flags.burnSmoke, true);

  destroyPermanent(anotherGoblinDies, secondGoblin);
  drainEventQueue(anotherGoblinDies);
  assert.equal(burnTarget.damageMarked, 2);
  assert.equal(anotherGoblinDies.player.life, 30);

  const cleaned = advancePhase(anotherGoblinDies, "end");
  assert.equal(cleaned.player.field.find((card) => card.instanceId === burnTarget.instanceId)?.flags.burnSmoke, undefined);
});

test("Pashalik resolves a combat death before the next Horde combat event", () => {
  const game = createTestGame("pashalik-combat-timing");
  addCard(game, cardFromDeck("pashalik_mons", "horde"));
  const goblin = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const blocker = addCard(game, customCard("pashalik_combat_blocker", "player", { power: 3, endurance: 5 }));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [goblin.instanceId];
  game.combat.blockers = { [goblin.instanceId]: [blocker.instanceId] };

  const [combatEvent] = buildHordeAttackEvents(game);
  const afterImpact = applyHordeAttackEvent(game, combatEvent);

  assert.equal(afterImpact.horde.field.some((card) => card.instanceId === goblin.instanceId), false);
  assert.equal(afterImpact.eventQueue.some((event) => event.type === "ECHO_DIED"), true);

  drainEventQueue(afterImpact);
  assert.equal(afterImpact.player.field.find((card) => card.instanceId === blocker.instanceId)?.damageMarked, 2);
});

test("a blocker removed between Horde impacts cannot deal ghost combat damage", () => {
  const game = createTestGame("goblin-no-ghost-blocker");
  const attacker = addCard(game, customCard("later_attacker", "horde", { power: 2, endurance: 3 }));
  const blocker = addCard(game, customCard("burned_future_blocker", "player", { power: 5, endurance: 2 }));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };
  const [event] = buildHordeAttackEvents(game);

  destroyPermanent(game, blocker);
  assert.equal(isHordeAttackEventCurrent(game, event), false);

  const resolved = applyHordeAttackEvent(game, event);
  assert.equal(resolved.horde.field.find((card) => card.instanceId === attacker.instanceId)?.damageMarked, 0);
  assert.equal(resolved.player.life, 30);
});

test("Rundvelt Hordemaster resolves exactly once when it dies", () => {
  const game = createTestGame("rundvelt-self-dies");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");

  destroyPermanent(game, rundvelt);
  drainEventQueue(game);

  assert.equal(game.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 1);
  assert.equal(game.horde.archive.length, 1);
  assert.equal(game.horde.oblivion.length, 0);
});

test("Rundvelt moves a non-Goblin inspection to the bottom of the Archive", () => {
  const game = createTestGame("rundvelt-non-goblin-bottom");
  addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  const support = addCard(game, cardFromDeck("goblin_war_drums", "horde", "archive"), "horde", "archive");
  const futureGoblin = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  drainEventQueue(game);

  assert.deepEqual(
    game.horde.archive.map((card) => card.instanceId),
    [futureGoblin.instanceId, support.instanceId],
  );
  assert.equal(support.zone, "archive");
  assert.equal(game.horde.oblivion.length, 0);
  assert.equal(game.horde.field.some((card) => card.instanceId === support.instanceId), false);
});

test("one Goblin death gives Rundvelt and Pashalik a separate resolution each", () => {
  const game = createTestGame("goblin-death-two-reactors");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  const pashalik = addCard(game, cardFromDeck("pashalik_mons", "horde"));
  addCard(game, customCard("player_blocker", "player", { power: 2, endurance: 4 }), "player");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "ECHO_DIED");
  const reactors = pendingTriggerSources(game, death).map((source) => source.instanceId);
  assert.deepEqual(new Set(reactors), new Set([rundvelt.instanceId, pashalik.instanceId]));

  // Each beat resolves exactly one reactor, so the other still owes its own animation.
  resolveTriggeredEvent(game, death, undefined, pashalik.instanceId);
  assert.deepEqual(
    pendingTriggerSources(game, death).map((source) => source.instanceId),
    [rundvelt.instanceId],
  );
  assert.equal(game.horde.archive.length, 1, "Rundvelt must not inspect before its own beat");

  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);
  assert.equal(pendingTriggerSources(game, death).length, 0);
  assert.equal(game.horde.archive.length, 0);
});

test("a creature that enters because of a death does not react to that death", () => {
  const game = createTestGame("no-reaction-to-own-summon");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, customCard("player_blocker", "player", { power: 2, endurance: 4 }), "player");
  // Rundvelt inspects the top card on a Goblin death; that card is Pashalik, who also reacts to
  // Goblin deaths. Pashalik was not in play when the Goblin died, so it must never react to it.
  addCard(game, cardFromDeck("pashalik_mons", "horde", "archive"), "horde", "archive");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "ECHO_DIED");

  // Mirrors the animated beat loop, which re-derives the reactors after every beat. A plain
  // drain collects its sources up front and would hide this.
  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);
  const pashalik = game.horde.field.find((card) => card.definitionId === "pashalik_mons");
  assert.ok(pashalik, "Rundvelt must have Invoked Pashalik onto the battlefield");
  assert.deepEqual(
    pendingTriggerSources(game, death).map((source) => source.definitionId),
    [],
    "Pashalik entered after the death and must not be queued as a reactor",
  );

  drainEventQueue(game);
  assert.equal(game.player.field[0].damageMarked, 0, "Pashalik must not burn for the death that summoned it");
});

test("a creature summoned by an effect still announces its own enter trigger", () => {
  const game = createTestGame("effect-summon-enter-trigger");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, cardFromDeck("beetleback_chief", "horde", "archive"), "horde", "archive");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "ECHO_DIED");
  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);

  const chief = game.horde.field.find((card) => card.definitionId === "beetleback_chief");
  assert.ok(chief, "Rundvelt must have Invoked Beetleback Chief onto the battlefield");
  // The tokens must NOT already be there: the Chief owes its own beat first, exactly as it
  // would arriving through the normal Horde reveal.
  assert.equal(game.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 0);
  const entered = game.eventQueue.find((event) => event.type === "INVOKED" && event.sourceId === chief.instanceId);
  assert.ok(entered, "the Chief's enter trigger must be queued for its own beat");
  assert.deepEqual(
    pendingTriggerSources(game, entered).map((source) => source.instanceId),
    [chief.instanceId],
    "only the card that entered reacts to its own arrival",
  );

  drainEventQueue(game);
  assert.equal(game.horde.field.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 2);
});

test("an effect that queues a follow-up keeps it ahead of the other reactors", () => {
  const game = createTestGame("spawned-event-priority");
  const pashalik = addCard(game, cardFromDeck("pashalik_mons", "horde"));
  addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, customCard("burn_target", "player", { power: 1, endurance: 4 }), "player");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "ECHO_DIED");
  const queuedBefore = new Set(game.eventQueue.map((event) => event.id));

  // Pashalik's trigger does not damage directly, it queues a BURN_DAMAGE event. The animated
  // runner puts anything a beat spawned ahead of the reactors still waiting on the parent, so
  // one card's effect never splits in half around another card's.
  resolveTriggeredEvent(game, death, undefined, pashalik.instanceId);
  const spawned = game.eventQueue.filter((event) => !queuedBefore.has(event.id));

  assert.deepEqual(spawned.map((event) => event.type), ["BURN_DAMAGE"]);
  assert.equal(pendingTriggerSources(game, death).length, 1, "Rundvelt still owes its own beat");
});

test("a resolved trigger source is never resolved a second time by a bulk drain", () => {
  const game = createTestGame("trigger-source-resolved-once");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "archive"), "horde", "archive");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "ECHO_DIED");
  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);
  drainEventQueue(game);

  assert.equal(game.horde.archive.length, 1);
});

test("static auras only announce the creatures that newly fell under them", () => {
  const game = createTestGame("static-aura-coverage");
  addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  const first = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  const before = collectStaticAuras(game, "horde");
  const buff = before.find((aura) => aura.power === 1 && aura.endurance === 1);
  assert.ok(buff, "Rundvelt's +1/+1 must be visible as a static aura");
  assert.deepEqual(buff.affectedIds, [first.instanceId]);
  assert.equal(buff.controller, "horde");

  const snapshot = snapshotStaticAuras(before);
  assert.equal(newlyCoveredAuras(collectStaticAuras(game, "horde"), snapshot).length, 0);

  const second = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const announced = newlyCoveredAuras(collectStaticAuras(game, "horde"), snapshot);
  assert.deepEqual(
    announced.map((aura) => aura.affectedIds),
    [[second.instanceId]],
    "only the newly covered Goblin is worth announcing",
  );
});

test("a static aura losing a creature is not announced again", () => {
  const game = createTestGame("static-aura-shrinks");
  addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  const first = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const snapshot = snapshotStaticAuras(collectStaticAuras(game, "horde"));

  destroyPermanent(game, first);

  assert.equal(newlyCoveredAuras(collectStaticAuras(game, "horde"), snapshot).length, 0);
});

test("Horde turn six has a one-card Mini Surge", () => {
  const miniSurge = createTestGame("mini-surge-reveal");
  miniSurge.hordeTurnNumber = 5;
  for (let index = 0; index < 4; index += 1) {
    addCard(miniSurge, customCard(`mini_surge_token_${index}`, "horde", { zone: "archive", isToken: true }), "horde", "archive");
  }

  const miniSurgeResult = runHordeMain(miniSurge);

  assert.equal(miniSurgeResult.hordeTurnNumber, 6);
  assert.equal(miniSurgeResult.horde.field.length, 4);
  assert.equal(miniSurgeResult.horde.archive.length, 0);
  assert.equal(miniSurgeResult.log.some((entry) => entry.includes("Mini Surge")), true);

  const followingTurn = createTestGame("after-mini-surge-reveal");
  followingTurn.hordeTurnNumber = 6;
  for (let index = 0; index < 4; index += 1) {
    addCard(followingTurn, customCard(`after_mini_surge_token_${index}`, "horde", { zone: "archive", isToken: true }), "horde", "archive");
  }

  const followingResult = runHordeMain(followingTurn);
  assert.equal(followingResult.hordeTurnNumber, 7);
  assert.equal(followingResult.horde.field.length, 3);
  assert.equal(followingResult.horde.archive.length, 1);
});

test("Host rule defaults are isolated and reject unsafe runtime overrides", () => {
  const first = buildHostRules();
  first.swarmTokenSubtypes.push("Goblin");
  const second = buildHostRules();
  const defensive = buildHostRules({
    revealCount: 0,
    damagePerArchiveDiscard: 0,
    poisonPerArchiveDiscard: -1,
    swarmTokenSubtypes: [],
    surgeBonus: [],
  });

  assert.deepEqual(second.swarmTokenSubtypes, ["Zombie"]);
  assert.equal(defensive.revealCount, 3);
  assert.equal(defensive.damagePerArchiveDiscard, 3);
  assert.equal(defensive.poisonPerArchiveDiscard, 3);
  assert.deepEqual(defensive.swarmTokenSubtypes, ["Zombie"]);
  assert.equal(defensive.surgeBonus, undefined);
});

test("non-default Host rules drive damage, Poison and Impetus behavior", () => {
  const combatGame = createTestGame("custom-host-damage-threshold");
  combatGame.hostRules = buildHostRules({ damagePerArchiveDiscard: 2 });
  const attacker = addCard(combatGame, customCard("custom_rule_attacker", "player", { power: 3 }));
  for (let index = 0; index < 3; index += 1) {
    addCard(combatGame, customCard(`custom_damage_archive_${index}`, "horde", { zone: "archive" }), "horde", "archive");
  }
  combatGame.combat.playerAttackers = [attacker.instanceId];
  const afterCombat = resolvePlayerCombat(combatGame);
  assert.equal(afterCombat.horde.archive.length, 2);
  assert.equal(afterCombat.horde.memory.length, 1);

  const poisonGame = createTestGame("custom-host-poison-threshold");
  poisonGame.hostRules = buildHostRules({ poisonPerArchiveDiscard: 4 });
  poisonGame.horde.poisonCounters = 7;
  for (let index = 0; index < 3; index += 1) {
    addCard(poisonGame, customCard(`custom_poison_archive_${index}`, "horde", { zone: "archive" }), "horde", "archive");
  }
  const afterPoison = endPlayerTurn(poisonGame);
  assert.equal(afterPoison.horde.archive.length, 2);
  assert.equal(afterPoison.horde.memory.length, 1);
  assert.equal(afterPoison.horde.poisonCounters, 3);

  const impetusGame = createTestGame("custom-host-impetus");
  impetusGame.hostRules = buildHostRules({ hostEchosHaveImpetus: false });
  addCard(impetusGame, customCard("custom_host_echo", "horde", { zone: "archive" }), "horde", "archive");
  addCard(impetusGame, customCard("custom_host_archive_guard", "horde", { zone: "archive" }), "horde", "archive");
  const afterReveal = revealHordeCardFromTop(impetusGame);
  const revealed = afterReveal.horde.field.find((card) => card.definitionId === "custom_host_echo");
  assert.ok(revealed);
  assert.equal(revealed.stabilizing, true);
  assert.equal(hasTrait(afterReveal, revealed, "IMPETUS"), false);
  assert.equal(canAttack(afterReveal, revealed), false);

  const afterReady = finishHordeTurn(afterReveal);
  const readied = afterReady.horde.field.find((card) => card.instanceId === revealed.instanceId);
  assert.ok(readied);
  assert.equal(readied.stabilizing, false);
  assert.equal(canAttack(afterReady, readied), true);
});

test("Surge depends only on reaching the tenth Horde turn", () => {
  const game = createTestGame("surge-clock");
  game.hordeTurnNumber = 9;
  for (let index = 0; index < 20; index += 1) {
    addCard(game, customCard(`surge_clock_grave_${index}`, "horde", { zone: "memory" }), "horde", "memory");
  }

  assert.equal(hordeInSurge(game), false);

  game.hordeTurnNumber = 10;
  assert.equal(hordeInSurge(game), true);
});

test("Horde Zombies gain +1/+0 continuously from Surge onward", () => {
  const game = createTestGame("surge-zombie-power");
  // The surge bonus is deck data, not an engine rule: it comes from the zombie deck's profile.
  game.hostRules = buildHostRules(hordeDeck.rulesProfile);
  const hordeZombie = addCard(game, customCard("surge_zombie", "horde", { subtypes: ["Zombie"], power: 2, endurance: 2 }));
  const hordeNonZombie = addCard(game, customCard("surge_bat", "horde", { subtypes: ["Bat"], power: 2, endurance: 2 }));
  const playerZombie = addCard(game, customCard("player_zombie", "player", { subtypes: ["Zombie"], power: 2, endurance: 2 }));

  game.hordeTurnNumber = 6;
  assert.deepEqual(getPowerEndurance(game, hordeZombie), { power: 2, endurance: 2 });

  game.hordeTurnNumber = 10;
  assert.deepEqual(getPowerEndurance(game, hordeZombie), { power: 3, endurance: 2 });
  assert.deepEqual(getPowerEndurance(game, hordeNonZombie), { power: 2, endurance: 2 });
  assert.deepEqual(getPowerEndurance(game, playerZombie), { power: 2, endurance: 2 });

  game.hordeTurnNumber = 12;
  assert.deepEqual(getPowerEndurance(game, hordeZombie), { power: 3, endurance: 2 });
});

test("the surge stat bonus is per-deck: the goblin horde gets none", () => {
  const game = createTestGame("surge-goblin-power");
  game.hostRules = buildHostRules(getHordeDeck("goblin_assault_horde").rulesProfile);
  const goblin = addCard(game, customCard("surge_goblin", "horde", { subtypes: ["Goblin"], power: 2, endurance: 2 }));

  game.hordeTurnNumber = 10;
  assert.equal(hordeInSurge(game), true);
  assert.deepEqual(getPowerEndurance(game, goblin), { power: 2, endurance: 2 });
});

test("revealing one Horde card plays that card and nothing else", () => {
  // The Playground's "play this card" for the Horde. Running a Horde turn instead would untap,
  // reveal up to three of the loaded deck's own cards and advance the clock — so playing a single
  // Goblin token would drag a whole Zombie turn along with it.
  const game = createTestGame("horde-single-reveal");
  // Three in the library: a turn would reveal all three, a single reveal takes exactly one.
  for (let index = 0; index < 3; index += 1) {
    addCard(game, customCard(`horde_stack_${index}`, "horde", { zone: "archive", isToken: true }), "horde", "archive");
  }
  const before = { turn: game.hordeTurnNumber, phase: game.phase, side: game.activeSide };
  const libraryBefore = game.horde.archive.length;
  const top = game.horde.archive[0];

  const next = revealHordeCardFromTop(game);

  assert.equal(next.lastActionResult.ok, true);
  assert.equal(next.horde.archive.length, libraryBefore - 1, "exactly one card left the library");
  assert.equal(next.hordeTurnNumber, before.turn, "a single reveal is not a turn");
  assert.equal(next.phase, before.phase);
  assert.equal(next.activeSide, before.side);
  assert.equal(next.combat.hordeAttackers.length, 0, "nothing is declared as an attacker");
  // The card itself really entered, through the Horde's own play path.
  const landed = [...next.horde.field, ...next.horde.memory].some((card) => card.instanceId === top.instanceId);
  assert.ok(landed, `${top.name} should have entered play or gone to the graveyard`);
});

test("revealing from an empty Host Archive reports a reason instead of doing nothing", () => {
  const game = createTestGame("horde-single-reveal-empty");
  game.horde.archive = [];

  const next = revealHordeCardFromTop(game);
  assert.equal(next.lastActionResult.ok, false);
  assert.match(next.lastActionResult.reason, /Host Archive is empty/i);
});

test("Chaos Surge begins on the eighth Horde turn", () => {
  const game = createTestGame("chaos-surge-clock");
  game.gameMode = "chaos";
  game.hordeTurnNumber = 7;
  assert.equal(hordeInSurge(game), false);

  game.hordeTurnNumber = 8;
  assert.equal(hordeInSurge(game), true);
});
