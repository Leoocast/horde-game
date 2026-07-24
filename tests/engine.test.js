import assert from "node:assert/strict";
import { test } from "node:test";

import { hordeDeck, playerDeck } from "../src/data/decks";
import { activateAbility, castCard, playLand, recycleEnergy } from "../src/engine/GameActions";
import { chaosKeywordPool, prepareChaosDeck } from "../src/engine/ChaosMode";
import { applyHordeAttackEvent, buildHordeAttackEvents, isHordeAttackEventCurrent, prepareHordeAttackers, resolveHordeCombat, resolvePlayerCombat } from "../src/engine/CombatResolver";
import { destroyMarkedCreatures, destroyPermanent, findManualEnterTargetTrigger, pendingTriggerSources, resolveEffect, resolveTriggeredEvent, runEnterBattlefieldTriggers } from "../src/engine/EffectResolver";
import { drainEventQueue } from "../src/engine/EventQueue";
import { collectStaticAuras, newlyCoveredAuras, snapshotStaticAuras } from "../src/engine/StaticAuras";
import { acceptOpeningHand, createInitialGame, expandDeck, mulliganOpeningHand } from "../src/engine/GameState";
import { finishHordeTurn, runHordeMain } from "../src/engine/HordeController";
import { hasKeyword } from "../src/engine/Keywords";
import { advancePhase, endPlayerTurn } from "../src/engine/PhaseManager";
import { getPowerToughness, hordeInSurge } from "../src/engine/StaticEffects";
import { targetCandidates } from "../src/engine/Targeting";
import { queueUnusedNormalMana, releasePendingStoredMana } from "../src/engine/ManaSystem";
import { performPlayerDraw } from "../src/engine/TurnManager";
import { addCard, addForests, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("same seed produces the same player and Horde deck order", () => {
  const first = createInitialGame(playerDeck, hordeDeck, "repeatable-seed", 3);
  const second = createInitialGame(playerDeck, hordeDeck, "repeatable-seed", 3);

  assert.deepEqual(
    first.player.library.map((card) => card.definitionId),
    second.player.library.map((card) => card.definitionId),
  );
  assert.deepEqual(
    first.horde.library.map((card) => card.definitionId),
    second.horde.library.map((card) => card.definitionId),
  );
  assert.equal(first.currentRandomState, second.currentRandomState);
});

test("every expanded card copy has a unique instance id", () => {
  const cards = [...expandDeck(playerDeck, "player"), ...expandDeck(hordeDeck, "horde")];
  const ids = cards.map((card) => card.instanceId);

  assert.equal(new Set(ids).size, ids.length);
});

test("mulligans redraw one fewer card deterministically down to one", () => {
  const first = createInitialGame(playerDeck, hordeDeck, "mulligan-seed", 3);
  const second = createInitialGame(playerDeck, hordeDeck, "mulligan-seed", 3);
  const initialCardTotal = first.player.hand.length + first.player.library.length + first.player.battlefield.length;

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
    assert.equal(firstResult.player.hand.length + firstResult.player.library.length + firstResult.player.battlefield.length, initialCardTotal);
  }

  const atMinimum = mulliganOpeningHand(firstResult);
  assert.equal(atMinimum.player.hand.length, 1);
  assert.equal(atMinimum.mulligansTaken, 6);
});

test("accepting an opening hand closes mulligan while tutorial skips it", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "keep-opening", 3);
  const accepted = acceptOpeningHand(game);
  const blockedMulligan = mulliganOpeningHand(accepted);
  const tutorial = createInitialGame(playerDeck, hordeDeck, "tutorial", 3);

  assert.equal(accepted.openingHandAccepted, true);
  assert.deepEqual(blockedMulligan.player.hand.map((card) => card.instanceId), accepted.player.hand.map((card) => card.instanceId));
  assert.equal(tutorial.openingHandAccepted, true);
});

test("Chaos removes other permanents but keeps creatures, energy, instants, and sorceries", () => {
  const deck = {
    id: "chaos-filter",
    name: "Chaos Filter",
    side: "player",
    deckSize: 7,
    cards: [
      { id: "creature", name: "Creature", cardTypes: ["Creature"], keywords: ["REACH"] },
      { id: "energy", name: "Energy", cardTypes: ["Land"] },
      { id: "instant", name: "Instant", cardTypes: ["Instant"] },
      { id: "sorcery", name: "Sorcery", cardTypes: ["Sorcery"] },
      { id: "enchantment", name: "Enchantment", cardTypes: ["Enchantment"] },
      { id: "artifact", name: "Artifact", cardTypes: ["Artifact"] },
      { id: "planeswalker", name: "Planeswalker", cardTypes: ["Planeswalker"] },
    ],
  };

  const prepared = prepareChaosDeck(deck);

  assert.deepEqual(prepared.cards.map((card) => card.id), ["creature", "energy", "instant", "sorcery"]);
  assert.equal(prepared.deckSize, 4);
});

test("Chaos starts with one energy and no stored mana", () => {
  const chaosPlayerDeck = {
    id: "chaos-player",
    name: "Chaos Player",
    side: "player",
    deckSize: 16,
    cards: [
      { id: "chaos_forest", name: "Chaos Forest", quantity: 8, cardTypes: ["Land"] },
      { id: "chaos_reacher", name: "Chaos Reacher", quantity: 4, cardTypes: ["Creature"], keywords: ["REACH"], power: 2, toughness: 2 },
      { id: "chaos_touch", name: "Chaos Touch", quantity: 4, cardTypes: ["Creature"], keywords: ["DEATHTOUCH"], power: 1, toughness: 1 },
    ],
  };
  const chaosHordeDeck = {
    id: "chaos-horde",
    name: "Chaos Horde",
    side: "horde",
    deckSize: 3,
    cards: [
      { id: "chaos_zombie", name: "Chaos Zombie", quantity: 2, isToken: true, cardTypes: ["Creature"], keywords: ["MENACE"], power: 2, toughness: 2 },
      { id: "chaos_harvest", name: "Chaos Harvest", cardTypes: ["Enchantment"], effects: [{ type: "STATIC_GRANT_KEYWORD", keyword: "MENACE" }] },
    ],
  };

  const game = createInitialGame(chaosPlayerDeck, chaosHordeDeck, "chaos-opening", 4, "normal", "chaos");

  assert.equal(game.gameMode, "chaos");
  assert.equal(game.player.life, 35);
  assert.equal(game.setupTurnsRemaining, 0);
  assert.equal(game.player.battlefield.filter((card) => card.cardTypes.includes("Land")).length, 1);
  assert.equal(game.player.manaPool.colorless, 0);
  assert.equal(game.player.hand.length, 7);
  assert.equal(game.player.library.length, 8);
  assert.equal(game.horde.library.some((card) => card.definitionId === "chaos_harvest"), false);

  performPlayerDraw(game);
  assert.equal(game.player.hand.length, 9);
  assert.equal(game.player.library.length, 6);
});

test("standard games start the player at 50 life", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "standard-life", 4, "normal", "standard");

  assert.equal(game.player.life, 50);
});

test("Chaos mutations are deterministic, replace printed keywords, and are shared by every copy", () => {
  const first = createInitialGame(playerDeck, hordeDeck, "shared-chaos", 0, "normal", "chaos");
  const second = createInitialGame(playerDeck, hordeDeck, "shared-chaos", 0, "normal", "chaos");

  assert.deepEqual(first.chaosMutations, second.chaosMutations);
  for (const side of ["player", "horde"]) {
    const cards = [...first[side].library, ...(side === "player" ? first.player.hand : []), ...first[side].battlefield];
    for (const card of cards.filter((item) => item.cardTypes.includes("Creature"))) {
      assert.deepEqual(card.keywords, first.chaosMutations[side][card.definitionId]);
      assert.deepEqual(card.chaosKeywords, card.keywords);
      assert.equal(new Set(card.keywords).size, card.keywords.length);
      assert.ok(card.keywords.length >= 1);
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
      { id: "hasty", name: "Hasty", cardTypes: ["Creature"], keywords: ["HASTE"] },
      { id: "menacing", name: "Menacing", cardTypes: ["Creature"], keywords: ["MENACE"] },
    ],
  };

  assert.deepEqual(chaosKeywordPool(deck), ["MENACE"]);
});

test("First strike mutations deal combat damage before a normal blocker can answer", () => {
  const game = createTestGame("first-strike-combat");
  const attacker = addCard(game, customCard("first_striker", "horde", { keywords: ["FIRST_STRIKE"], power: 2, toughness: 2 }));
  const blocker = addCard(game, customCard("normal_blocker", "player", { power: 2, toughness: 2 }));
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };

  const result = resolveHordeCombat(game);

  assert.equal(result.player.graveyard.some((card) => card.instanceId === blocker.instanceId), true);
  assert.equal(result.horde.battlefield.some((card) => card.instanceId === attacker.instanceId), true);
  assert.equal(result.horde.battlefield.find((card) => card.instanceId === attacker.instanceId)?.damageMarked, 0);
});

test("standard games keep nine energy cards in the player deck", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "no-lands", 3);
  const cards = [...game.player.hand, ...game.player.library, ...game.player.battlefield];

  assert.equal(cards.length, 33);
  assert.equal(cards.filter((card) => card.cardTypes.includes("Land")).length, 9);
});

test("unused normal mana stays pending until the Horde turn ends", () => {
  const game = createTestGame();
  const lands = addForests(game, 5);
  lands[0].tapped = true;

  assert.equal(queueUnusedNormalMana(game), 3);
  assert.equal(game.player.pendingStoredMana, 3);
  assert.equal(game.player.manaPool.colorless, 0);
  assert.equal(queueUnusedNormalMana(game), 0);
  assert.equal(releasePendingStoredMana(game), 3);
  assert.equal(game.player.pendingStoredMana, 0);
  assert.equal(game.player.manaPool.colorless, 3);
});

test("spent lands do not become stored mana", () => {
  const game = createTestGame();
  const lands = addForests(game, 3);
  for (const land of lands) {
    land.tapped = true;
    land.activatedThisTurn = true;
  }

  const hordeTurn = endPlayerTurn(game);
  const nextPlayerTurn = finishHordeTurn(hordeTurn);

  assert.equal(hordeTurn.player.pendingStoredMana, 0);
  assert.equal(nextPlayerTurn.player.manaPool.colorless, 0);
});

test("unused mana from an earlier setup turn does not refill yellow mana", () => {
  const game = createInitialGame(playerDeck, hordeDeck, "setup-reserve", 2);
  const lands = addForests(game, 3);

  const finalSetupTurn = endPlayerTurn(game);
  assert.equal(finalSetupTurn.setupTurnsRemaining, 1);
  assert.equal(finalSetupTurn.player.pendingStoredMana, 0);

  for (const land of lands) {
    const currentLand = finalSetupTurn.player.battlefield.find((card) => card.instanceId === land.instanceId);
    currentLand.tapped = true;
    currentLand.activatedThisTurn = true;
  }
  const hordeTurn = endPlayerTurn(finalSetupTurn);
  const nextPlayerTurn = finishHordeTurn(hordeTurn);

  assert.equal(hordeTurn.player.pendingStoredMana, 0);
  assert.equal(nextPlayerTurn.player.manaPool.colorless, 0);
});

test("Llanowar and Druid fill stored mana immediately, then pending land mana appears after the Horde", () => {
  const game = createTestGame();
  addForests(game, 1);
  const llanowar = addCard(game, cardFromDeck("llanowar_elves", "player"));
  const druid = addCard(game, cardFromDeck("druid_of_the_cowl", "player"));
  const afterLlanowar = activateAbility(game, llanowar.instanceId, "llanowar_elves_add_green");
  const afterAbilities = activateAbility(afterLlanowar, druid.instanceId, "druid_of_the_cowl_add_green");

  const hordeTurn = endPlayerTurn(afterAbilities);
  const nextPlayerTurn = finishHordeTurn(hordeTurn);

  assert.equal(afterAbilities.player.manaPool.colorless, 2);
  assert.equal(afterAbilities.player.battlefield.find((card) => card.instanceId === llanowar.instanceId)?.tapped, true);
  assert.equal(afterAbilities.player.battlefield.find((card) => card.instanceId === druid.instanceId)?.tapped, true);
  assert.equal(hordeTurn.player.manaPool.colorless, 2);
  assert.equal(hordeTurn.player.pendingStoredMana, 1);
  assert.equal(nextPlayerTurn.player.pendingStoredMana, 0);
  assert.equal(nextPlayerTurn.player.manaPool.colorless, 3);
});

test("stored yellow mana can pay a colored creature cost", () => {
  const game = createTestGame();
  game.player.manaPool.colorless = 1;
  const llanowar = addCard(game, cardFromDeck("llanowar_elves", "player", "hand"), "player", "hand");

  const result = castCard(game, llanowar.instanceId);

  assert.equal(result.player.hand.some((card) => card.instanceId === llanowar.instanceId), false);
  assert.equal(result.player.battlefield.some((card) => card.instanceId === llanowar.instanceId), true);
  assert.equal(result.player.manaPool.colorless, 0);
});

test("the player draws one card normally after setup", () => {
  const game = createTestGame();
  addCard(game, customCard("held_card", "player", { zone: "hand" }), "player", "hand");
  addCard(game, customCard("draw_one", "player", { zone: "library" }), "player", "library");
  addCard(game, customCard("leave_in_library", "player", { zone: "library" }), "player", "library");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["held_card", "draw_one"]);
  assert.deepEqual(game.player.library.map((card) => card.definitionId), ["leave_in_library"]);
});

test("easy mode draws two cards every turn after setup", () => {
  const game = createTestGame();
  game.difficulty = "easy";
  addCard(game, customCard("held_card", "player", { zone: "hand" }), "player", "hand");
  addCard(game, customCard("easy_draw_1", "player", { zone: "library" }), "player", "library");
  addCard(game, customCard("easy_draw_2", "player", { zone: "library" }), "player", "library");
  addCard(game, customCard("easy_stays_in_deck", "player", { zone: "library" }), "player", "library");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["held_card", "easy_draw_1", "easy_draw_2"]);
  assert.deepEqual(game.player.library.map((card) => card.definitionId), ["easy_stays_in_deck"]);
});

test("the player draws two after setup when the turn starts with an empty hand", () => {
  const game = createTestGame();
  addCard(game, customCard("empty_hand_draw_1", "player", { zone: "library" }), "player", "library");
  addCard(game, customCard("empty_hand_draw_2", "player", { zone: "library" }), "player", "library");
  addCard(game, customCard("empty_hand_stays_in_deck", "player", { zone: "library" }), "player", "library");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["empty_hand_draw_1", "empty_hand_draw_2"]);
  assert.deepEqual(game.player.library.map((card) => card.definitionId), ["empty_hand_stays_in_deck"]);
});

test("an empty hand still draws only one during setup", () => {
  const game = createTestGame();
  game.setupTurnsRemaining = 1;
  addCard(game, customCard("setup_draw", "player", { zone: "library" }), "player", "library");
  addCard(game, customCard("setup_stays_in_deck", "player", { zone: "library" }), "player", "library");

  performPlayerDraw(game);

  assert.deepEqual(game.player.hand.map((card) => card.definitionId), ["setup_draw"]);
  assert.deepEqual(game.player.library.map((card) => card.definitionId), ["setup_stays_in_deck"]);
});

test("recycling puts an energy on the bottom, draws one, and uses the Energy action", () => {
  const game = createTestGame();
  const energy = addCard(game, cardFromDeck("forest", "player", "hand"), "player", "hand");
  const nextDraw = addCard(game, customCard("recycle_draw", "player", { zone: "library" }), "player", "library");

  const result = recycleEnergy(game, energy.instanceId);

  assert.equal(result.player.hand.some((card) => card.instanceId === energy.instanceId), false);
  assert.equal(result.player.hand.some((card) => card.instanceId === nextDraw.instanceId), true);
  assert.equal(result.player.library.at(-1)?.instanceId, energy.instanceId);
  assert.equal(result.player.energyActionUsedThisTurn, true);
});

test("playing or recycling an energy consumes the same once-per-turn action", () => {
  const game = createTestGame();
  const playedEnergy = addCard(game, cardFromDeck("forest", "player", "hand"), "player", "hand");
  const blockedRecycle = addCard(game, cardFromDeck("forest", "player", "hand"), "player", "hand");
  addCard(game, customCard("would_be_drawn", "player", { zone: "library" }), "player", "library");

  const afterPlay = playLand(game, playedEnergy.instanceId);
  const afterBlockedRecycle = recycleEnergy(afterPlay, blockedRecycle.instanceId);

  assert.equal(afterPlay.player.energyActionUsedThisTurn, true);
  assert.equal(afterBlockedRecycle.player.hand.some((card) => card.instanceId === blockedRecycle.instanceId), true);
  assert.equal(afterBlockedRecycle.player.library.some((card) => card.definitionId === "would_be_drawn"), true);
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

  assert.equal(blockedAtCap.player.battlefield.filter((card) => card.cardTypes.includes("Land")).length, 4);
  assert.equal(blockedAtCap.player.hand.some((card) => card.instanceId === fifthEnergy.instanceId), true);
});

test("automatic payment spends normal land mana before stored yellow mana", () => {
  const game = createTestGame();
  game.player.manaPool.colorless = 3;
  const [land] = addForests(game, 1);
  const manaCreature = addCard(game, cardFromDeck("llanowar_elves", "player"));
  const spell = addCard(
    game,
    customCard("three_mana_spell", "player", {
      zone: "hand",
      cardTypes: ["Sorcery"],
      manaCost: "{2}{G}",
    }),
    "player",
    "hand",
  );

  const result = castCard(game, spell.instanceId);

  assert.equal(result.player.graveyard.some((card) => card.instanceId === spell.instanceId), true);
  assert.equal(result.player.battlefield.find((card) => card.instanceId === land.instanceId)?.tapped, true);
  assert.equal(result.player.battlefield.find((card) => card.instanceId === manaCreature.instanceId)?.tapped, false);
  assert.deepEqual(result.player.manaPool, {
    green: 0,
    red: 0,
    blue: 0,
    white: 0,
    black: 0,
    colorless: 1,
  });
});

test("a failed cast does not move cards, tap mana sources, or spend mana", () => {
  const game = createTestGame();
  const [land] = addForests(game, 1);
  const spell = addCard(
    game,
    customCard("unaffordable_spell", "player", {
      zone: "hand",
      cardTypes: ["Sorcery"],
      manaCost: "{2}{G}",
    }),
    "player",
    "hand",
  );
  const manaBefore = structuredClone(game.player.manaPool);

  const result = castCard(game, spell.instanceId);

  assert.equal(result.player.hand.some((card) => card.instanceId === spell.instanceId), true);
  assert.equal(result.player.graveyard.length, 0);
  assert.equal(result.player.battlefield.find((card) => card.instanceId === land.instanceId)?.tapped, false);
  assert.deepEqual(result.player.manaPool, manaBefore);
});

test("Giant Growth applies +3/+3 and cleanup removes the temporary buff", () => {
  const game = createTestGame();
  addForests(game, 1);
  const creature = addCard(game, customCard("test_bear", "player", { power: 2, toughness: 2 }));
  const spell = addCard(game, cardFromDeck("giant_growth", "player", "hand"), "player", "hand");

  const cast = castCard(game, spell.instanceId, { targets: { targetCreature: creature.instanceId } });
  const buffed = cast.player.battlefield.find((card) => card.instanceId === creature.instanceId);

  assert.deepEqual(getPowerToughness(cast, buffed), { power: 5, toughness: 5 });
  assert.equal(cast.player.graveyard.some((card) => card.instanceId === spell.instanceId), true);

  const cleaned = advancePhase(cast, "end");
  const restored = cleaned.player.battlefield.find((card) => card.instanceId === creature.instanceId);
  assert.deepEqual(getPowerToughness(cleaned, restored), { power: 2, toughness: 2 });
});

test("Broken Wings only offers legal permanent types and destroys Graf Harvest", () => {
  const game = createTestGame();
  addForests(game, 3);
  const grafHarvest = addCard(game, cardFromDeck("graf_harvest", "horde"));
  const flyer = addCard(game, customCard("test_flyer", "horde", { keywords: ["FLYING"] }));
  const groundCreature = addCard(game, customCard("test_ground_creature", "horde"));
  const spell = addCard(game, cardFromDeck("broken_wings", "player", "hand"), "player", "hand");
  const requirement = spell.requiresTargets[0];

  const candidateIds = targetCandidates(game, "player", requirement).map((card) => card.instanceId);
  assert.equal(candidateIds.includes(grafHarvest.instanceId), true);
  assert.equal(candidateIds.includes(flyer.instanceId), true);
  assert.equal(candidateIds.includes(groundCreature.instanceId), false);

  const result = castCard(game, spell.instanceId, { targets: { targetPermanent: grafHarvest.instanceId } });
  assert.equal(result.horde.battlefield.some((card) => card.instanceId === grafHarvest.instanceId), false);
  assert.equal(result.horde.graveyard.some((card) => card.instanceId === grafHarvest.instanceId), true);
});

test("Cosmic Hunger deals source power and preserves deathtouch for death cleanup", () => {
  const game = createTestGame();
  addForests(game, 2);
  const source = addCard(game, customCard("deathtouch_source", "player", { keywords: ["DEATHTOUCH"], power: 1, toughness: 1 }));
  const target = addCard(game, customCard("large_target", "horde", { power: 0, toughness: 8 }));
  const spell = addCard(game, cardFromDeck("cosmic_hunger", "player", "hand"), "player", "hand");

  const result = castCard(game, spell.instanceId, {
    targets: { sourceCreature: source.instanceId, damageTarget: target.instanceId },
  });
  const damagedTarget = result.horde.battlefield.find((card) => card.instanceId === target.instanceId);

  assert.equal(damagedTarget.damageMarked, 1);
  assert.equal(damagedTarget.deathtouchDamage, true);
  destroyMarkedCreatures(result);
  assert.equal(result.horde.graveyard.some((card) => card.instanceId === target.instanceId), true);
});

test("Ruthless Predation buffs first, then both creatures deal simultaneous damage", () => {
  const game = createTestGame();
  addForests(game, 2);
  const friendly = addCard(game, customCard("friendly_fighter", "player", { power: 2, toughness: 2 }));
  const enemy = addCard(game, customCard("enemy_fighter", "horde", { power: 3, toughness: 3 }));
  const spell = addCard(game, cardFromDeck("ruthless_predation", "player", "hand"), "player", "hand");

  const result = castCard(game, spell.instanceId, {
    targets: { yourCreature: friendly.instanceId, opponentCreature: enemy.instanceId },
  });
  const survivingFriendly = result.player.battlefield.find((card) => card.instanceId === friendly.instanceId);
  const damagedEnemy = result.horde.battlefield.find((card) => card.instanceId === enemy.instanceId);

  assert.deepEqual(getPowerToughness(result, survivingFriendly), { power: 3, toughness: 4 });
  assert.equal(survivingFriendly.damageMarked, 3);
  assert.equal(damagedEnemy.damageMarked, 3);
  destroyMarkedCreatures(result);
  assert.equal(result.player.battlefield.some((card) => card.instanceId === friendly.instanceId), true);
  assert.equal(result.horde.graveyard.some((card) => card.instanceId === enemy.instanceId), true);

  const cleaned = advancePhase(result, "end");
  const restoredFriendly = cleaned.player.battlefield.find((card) => card.instanceId === friendly.instanceId);
  assert.deepEqual(getPowerToughness(cleaned, restoredFriendly), { power: 2, toughness: 2 });
  assert.equal(restoredFriendly.damageMarked, 0);
});

test("Sunshower Druid can target itself, adds one counter, and gains one life", () => {
  const game = createTestGame();
  addForests(game, 1);
  const druid = addCard(game, cardFromDeck("sunshower_druid", "player", "hand"), "player", "hand");

  const result = castCard(game, druid.instanceId);
  const permanent = result.player.battlefield.find((card) => card.instanceId === druid.instanceId);
  const manualTrigger = findManualEnterTargetTrigger(permanent);
  assert.ok(manualTrigger, "Sunshower Druid should expose its manual enter trigger");
  resolveEffect(result, manualTrigger.effect, {
    source: permanent,
    side: "player",
    targets: { target: permanent.instanceId, targetCreature: permanent.instanceId },
  });

  assert.equal(permanent.counters["+1/+1"], 1);
  assert.equal(result.player.life, 31);
  assert.deepEqual(getPowerToughness(result, permanent), { power: 1, toughness: 3 });
});

test("Graf Harvest grants Menace only while it remains on the battlefield", () => {
  const game = createTestGame();
  const grafHarvest = addCard(game, cardFromDeck("graf_harvest", "horde"));
  const zombie = addCard(game, cardFromDeck("zombie_token", "horde"));
  const nonZombie = addCard(game, customCard("horde_non_zombie", "horde"));

  assert.equal(hasKeyword(game, zombie, "MENACE"), true);
  assert.equal(hasKeyword(game, nonZombie, "MENACE"), false);

  destroyPermanent(game, grafHarvest);
  assert.equal(hasKeyword(game, zombie, "MENACE"), false);
});

test("Toxic adds poison on player combat and every three poison mills one card", () => {
  const game = createTestGame();
  const basilisk = addCard(game, cardFromDeck("ichorspit_basilisk", "player"));
  for (let index = 0; index < 3; index += 1) {
    addCard(game, customCard(`horde_library_${index}`, "horde", { zone: "library" }), "horde", "library");
  }
  game.combat.playerAttackers = [basilisk.instanceId];

  const combatResult = resolvePlayerCombat(game);
  assert.equal(combatResult.horde.poisonCounters, 1);
  assert.equal(combatResult.horde.graveyard.length, 0);

  combatResult.horde.poisonCounters = 3;
  const turnResult = endPlayerTurn(combatResult);
  assert.equal(turnResult.horde.poisonCounters, 0);
  assert.equal(turnResult.horde.graveyard.length, 1);
  assert.equal(turnResult.horde.library.length, 2);
});

test("Horde reveal stops at a non-token and Surge adds exactly two reveals", () => {
  const normal = createTestGame("normal-reveal");
  addCard(normal, customCard("normal_token_1", "horde", { zone: "library", isToken: true }), "horde", "library");
  addCard(normal, customCard("normal_token_2", "horde", { zone: "library", isToken: true }), "horde", "library");
  addCard(normal, customCard("normal_non_token", "horde", { zone: "library" }), "horde", "library");
  addCard(normal, customCard("normal_unrevealed", "horde", { zone: "library", isToken: true }), "horde", "library");

  const normalResult = runHordeMain(normal);
  assert.equal(normalResult.horde.battlefield.length, 3);
  assert.deepEqual(normalResult.horde.library.map((card) => card.definitionId), ["normal_unrevealed"]);

  const surge = createTestGame("surge-reveal");
  surge.hordeTurnNumber = 9;
  for (let index = 0; index < 5; index += 1) {
    addCard(surge, customCard(`surge_token_${index}`, "horde", { zone: "library", isToken: true }), "horde", "library");
  }
  for (let index = 0; index < 6; index += 1) {
    addCard(surge, customCard(`surge_grave_${index}`, "horde", { zone: "graveyard" }), "horde", "graveyard");
  }

  const surgeResult = runHordeMain(surge);
  assert.equal(surge.hordeTurnNumber, 9);
  assert.equal(surgeResult.hordeTurnNumber, 10);
  assert.equal(surgeResult.horde.battlefield.length, 5);
  assert.equal(surgeResult.horde.library.length, 0);
});

test("Goblin static lords and War Drums apply only to the intended Horde creatures", () => {
  const game = createTestGame("goblin-static-effects");
  const hobgoblin = addCard(game, cardFromDeck("hobgoblin_bandit_lord", "horde"));
  const warDrums = addCard(game, cardFromDeck("goblin_war_drums", "horde"));
  const goblin = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const nonGoblin = addCard(game, customCard("not_a_goblin", "horde", { power: 2, toughness: 2 }));

  assert.deepEqual(getPowerToughness(game, hobgoblin), { power: 2, toughness: 3 });
  assert.deepEqual(getPowerToughness(game, goblin), { power: 2, toughness: 2 });
  assert.deepEqual(getPowerToughness(game, nonGoblin), { power: 2, toughness: 2 });
  assert.equal(hasKeyword(game, goblin, "MENACE"), true);
  assert.equal(hasKeyword(game, nonGoblin, "MENACE"), true);

  destroyPermanent(game, warDrums);
  assert.equal(hasKeyword(game, goblin, "MENACE"), false);
});

test("Beetleback Chief and Siege-Gang Commander create their Goblin tokens on entry", () => {
  const beetlebackGame = createTestGame("beetleback-entry");
  const beetleback = addCard(beetlebackGame, cardFromDeck("beetleback_chief", "horde"));
  runEnterBattlefieldTriggers(beetlebackGame, beetleback);
  drainEventQueue(beetlebackGame);
  assert.equal(beetlebackGame.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 2);

  const siegeGangGame = createTestGame("siege-gang-entry");
  const siegeGang = addCard(siegeGangGame, cardFromDeck("siege_gang_commander", "horde"));
  runEnterBattlefieldTriggers(siegeGangGame, siegeGang);
  drainEventQueue(siegeGangGame);
  assert.equal(siegeGangGame.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 3);
});

test("Goblin Surprise chooses the Horde mode with more immediate attack power", () => {
  const pumpGame = createTestGame("goblin-surprise-pump");
  const firstGoblin = addCard(pumpGame, cardFromDeck("goblin_token_1_1_red", "horde"));
  const secondGoblin = addCard(pumpGame, cardFromDeck("goblin_token_1_1_red", "horde"));
  addCard(pumpGame, cardFromDeck("goblin_surprise", "horde", "library"), "horde", "library");

  const pumped = runHordeMain(pumpGame);
  assert.equal(pumped.horde.battlefield.find((card) => card.instanceId === firstGoblin.instanceId)?.temporaryPower, 2);
  assert.equal(pumped.horde.battlefield.find((card) => card.instanceId === secondGoblin.instanceId)?.temporaryPower, 2);

  const tokenGame = createTestGame("goblin-surprise-tokens");
  addCard(tokenGame, cardFromDeck("goblin_surprise", "horde", "library"), "horde", "library");

  const tokenResult = runHordeMain(tokenGame);
  assert.equal(tokenResult.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 2);
});

test("Volley Veteran damages a chosen opposing creature equal to the Horde's Goblin count", () => {
  const game = createTestGame("volley-veteran-entry");
  const fragile = addCard(game, customCard("volley_target", "player", { toughness: 2 }));
  const sturdy = addCard(game, customCard("volley_survivor", "player", { toughness: 4 }));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const veteran = addCard(game, cardFromDeck("volley_veteran", "horde"));

  runEnterBattlefieldTriggers(game, veteran);
  drainEventQueue(game);

  assert.equal(game.player.battlefield.some((card) => card.instanceId === fragile.instanceId), false);
  assert.equal(game.player.battlefield.find((card) => card.instanceId === sturdy.instanceId)?.damageMarked, 0);
});

test("Goblin Rabblemaster creates its combat token before Horde attackers are declared", () => {
  const game = createTestGame("rabblemaster-combat-token");
  const rabblemaster = addCard(game, cardFromDeck("goblin_rabblemaster", "horde"));

  const result = prepareHordeAttackers(game);
  const tokens = result.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(tokens.length, 1);
  assert.deepEqual(new Set(result.combat.hordeAttackers), new Set([rabblemaster.instanceId, tokens[0].instanceId]));
  assert.equal(tokens[0].tapped, true);
});

test("Goblin Rabblemaster counts every other attacking Goblin after attack tokens enter", () => {
  const game = createTestGame("rabblemaster-attack-buff");
  const rabblemaster = addCard(game, cardFromDeck("goblin_rabblemaster", "horde"));
  addCard(game, cardFromDeck("general_kreat_the_boltbringer", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  const result = prepareHordeAttackers(game);
  const currentRabblemaster = result.horde.battlefield.find((card) => card.instanceId === rabblemaster.instanceId);

  assert.ok(currentRabblemaster);
  assert.equal(result.combat.hordeAttackers.length, 5);
  assert.deepEqual(getPowerToughness(result, currentRabblemaster), { power: 6, toughness: 2 });
});

test("Battle Cry Goblin creates a tapped attacking token only at six declared power", () => {
  const belowThreshold = createTestGame("battle-cry-below");
  addCard(belowThreshold, cardFromDeck("battle_cry_goblin", "horde"));
  addCard(belowThreshold, customCard("three_power_goblin", "horde", { subtypes: ["Goblin"], power: 3 }));

  const belowResult = prepareHordeAttackers(belowThreshold);
  assert.equal(belowResult.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 0);

  const threshold = createTestGame("battle-cry-threshold");
  addCard(threshold, cardFromDeck("battle_cry_goblin", "horde"));
  addCard(threshold, customCard("four_power_goblin", "horde", { subtypes: ["Goblin"], power: 4 }));

  const thresholdResult = prepareHordeAttackers(threshold);
  const token = thresholdResult.horde.battlefield.find((card) => card.definitionId === "goblin_token_1_1_red");
  assert.ok(token);
  assert.equal(token.tapped, true);
  assert.equal(thresholdResult.combat.hordeAttackers.includes(token.instanceId), true);
});

test("General Kreat creates one attacking token and damages the player when it enters", () => {
  const game = createTestGame("general-kreat-attack");
  addCard(game, cardFromDeck("general_kreat_the_boltbringer", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  const result = prepareHordeAttackers(game);
  const goblinTokens = result.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(goblinTokens.length, 2);
  assert.equal(result.combat.hordeAttackers.length, 3);
  assert.equal(result.player.life, 29);
});

test("Raid Bombardment counts only declared attackers with power two or less", () => {
  const game = createTestGame("raid-bombardment");
  addCard(game, cardFromDeck("raid_bombardment", "horde"));
  addCard(game, customCard("small_attacker", "horde", { power: 1 }));
  addCard(game, customCard("medium_attacker", "horde", { power: 2 }));
  addCard(game, customCard("large_attacker", "horde", { power: 3 }));

  const result = prepareHordeAttackers(game);

  assert.equal(result.player.life, 28);
});

test("Krenko grows before creating tokens equal to its new power", () => {
  const game = createTestGame("krenko-attack");
  const krenko = addCard(game, cardFromDeck("krenko_tin_street_kingpin", "horde"));

  const result = prepareHordeAttackers(game);
  const currentKrenko = result.horde.battlefield.find((card) => card.instanceId === krenko.instanceId);
  const tokens = result.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red");

  assert.equal(currentKrenko?.counters["+1/+1"], 1);
  assert.deepEqual(getPowerToughness(result, currentKrenko), { power: 2, toughness: 3 });
  assert.equal(tokens.length, 2);
  assert.equal(tokens.every((card) => card.tapped && result.combat.hordeAttackers.includes(card.instanceId)), true);
});

test("Goblin Chainwhirler damages the player and every opposing creature on entry", () => {
  const game = createTestGame("chainwhirler-entry");
  const fragile = addCard(game, customCard("fragile_player_creature", "player", { toughness: 1 }));
  const sturdy = addCard(game, customCard("sturdy_player_creature", "player", { toughness: 2 }));
  const chainwhirler = addCard(game, cardFromDeck("goblin_chainwhirler", "horde"));

  runEnterBattlefieldTriggers(game, chainwhirler);
  drainEventQueue(game);

  assert.equal(game.player.life, 29);
  assert.equal(game.player.battlefield.some((card) => card.instanceId === fragile.instanceId), false);
  assert.equal(game.player.battlefield.find((card) => card.instanceId === sturdy.instanceId)?.damageMarked, 1);
});

test("Pashalik Mons burns a random opposing creature separately for each Goblin death", () => {
  const anotherGoblinDies = createTestGame("pashalik-other-dies");
  addCard(anotherGoblinDies, cardFromDeck("pashalik_mons", "horde"));
  const burnTarget = addCard(anotherGoblinDies, customCard("pashalik_burn_target", "player", { toughness: 5 }));
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
  assert.equal(cleaned.player.battlefield.find((card) => card.instanceId === burnTarget.instanceId)?.flags.burnSmoke, undefined);
});

test("Pashalik resolves a combat death before the next Horde combat event", () => {
  const game = createTestGame("pashalik-combat-timing");
  addCard(game, cardFromDeck("pashalik_mons", "horde"));
  const goblin = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));
  const blocker = addCard(game, customCard("pashalik_combat_blocker", "player", { power: 3, toughness: 5 }));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [goblin.instanceId];
  game.combat.blockers = { [goblin.instanceId]: [blocker.instanceId] };

  const [combatEvent] = buildHordeAttackEvents(game);
  const afterImpact = applyHordeAttackEvent(game, combatEvent);

  assert.equal(afterImpact.horde.battlefield.some((card) => card.instanceId === goblin.instanceId), false);
  assert.equal(afterImpact.eventQueue.some((event) => event.type === "CREATURE_DIED"), true);

  drainEventQueue(afterImpact);
  assert.equal(afterImpact.player.battlefield.find((card) => card.instanceId === blocker.instanceId)?.damageMarked, 2);
});

test("a blocker removed between Horde impacts cannot deal ghost combat damage", () => {
  const game = createTestGame("goblin-no-ghost-blocker");
  const attacker = addCard(game, customCard("later_attacker", "horde", { power: 2, toughness: 3 }));
  const blocker = addCard(game, customCard("burned_future_blocker", "player", { power: 5, toughness: 2 }));
  game.activeSide = "horde";
  game.phase = "combat";
  game.combat.hordeAttackers = [attacker.instanceId];
  game.combat.blockers = { [attacker.instanceId]: [blocker.instanceId] };
  const [event] = buildHordeAttackEvents(game);

  destroyPermanent(game, blocker);
  assert.equal(isHordeAttackEventCurrent(game, event), false);

  const resolved = applyHordeAttackEvent(game, event);
  assert.equal(resolved.horde.battlefield.find((card) => card.instanceId === attacker.instanceId)?.damageMarked, 0);
  assert.equal(resolved.player.life, 30);
});

test("Rundvelt Hordemaster resolves exactly once when it dies", () => {
  const game = createTestGame("rundvelt-self-dies");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");

  destroyPermanent(game, rundvelt);
  drainEventQueue(game);

  assert.equal(game.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 1);
  assert.equal(game.horde.library.length, 1);
});

test("one Goblin death gives Rundvelt and Pashalik a separate resolution each", () => {
  const game = createTestGame("goblin-death-two-reactors");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  const pashalik = addCard(game, cardFromDeck("pashalik_mons", "horde"));
  addCard(game, customCard("player_blocker", "player", { power: 2, toughness: 4 }), "player");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "CREATURE_DIED");
  const reactors = pendingTriggerSources(game, death).map((source) => source.instanceId);
  assert.deepEqual(new Set(reactors), new Set([rundvelt.instanceId, pashalik.instanceId]));

  // Each beat resolves exactly one reactor, so the other still owes its own animation.
  resolveTriggeredEvent(game, death, undefined, pashalik.instanceId);
  assert.deepEqual(
    pendingTriggerSources(game, death).map((source) => source.instanceId),
    [rundvelt.instanceId],
  );
  assert.equal(game.horde.library.length, 1, "Rundvelt must not exile before its own beat");

  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);
  assert.equal(pendingTriggerSources(game, death).length, 0);
  assert.equal(game.horde.library.length, 0);
});

test("a creature that enters because of a death does not react to that death", () => {
  const game = createTestGame("no-reaction-to-own-summon");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, customCard("player_blocker", "player", { power: 2, toughness: 4 }), "player");
  // Rundvelt exiles the top card on a Goblin death; that card is Pashalik, who also reacts to
  // Goblin deaths. Pashalik was not in play when the Goblin died, so it must never react to it.
  addCard(game, cardFromDeck("pashalik_mons", "horde", "library"), "horde", "library");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "CREATURE_DIED");

  // Mirrors the animated beat loop, which re-derives the reactors after every beat. A plain
  // drain collects its sources up front and would hide this.
  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);
  const pashalik = game.horde.battlefield.find((card) => card.definitionId === "pashalik_mons");
  assert.ok(pashalik, "Rundvelt must have put Pashalik onto the battlefield");
  assert.deepEqual(
    pendingTriggerSources(game, death).map((source) => source.definitionId),
    [],
    "Pashalik entered after the death and must not be queued as a reactor",
  );

  drainEventQueue(game);
  assert.equal(game.player.battlefield[0].damageMarked, 0, "Pashalik must not burn for the death that summoned it");
});

test("a creature summoned by an effect still announces its own enter trigger", () => {
  const game = createTestGame("effect-summon-enter-trigger");
  const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, cardFromDeck("beetleback_chief", "horde", "library"), "horde", "library");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "CREATURE_DIED");
  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);

  const chief = game.horde.battlefield.find((card) => card.definitionId === "beetleback_chief");
  assert.ok(chief, "Rundvelt must have put Beetleback Chief onto the battlefield");
  // The tokens must NOT already be there: the Chief owes its own beat first, exactly as it
  // would arriving through the normal Horde reveal.
  assert.equal(game.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 0);
  const entered = game.eventQueue.find((event) => event.type === "ENTERS_BATTLEFIELD" && event.sourceId === chief.instanceId);
  assert.ok(entered, "the Chief's enter trigger must be queued for its own beat");
  assert.deepEqual(
    pendingTriggerSources(game, entered).map((source) => source.instanceId),
    [chief.instanceId],
    "only the card that entered reacts to its own arrival",
  );

  drainEventQueue(game);
  assert.equal(game.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 2);
});

test("an effect that queues a follow-up keeps it ahead of the other reactors", () => {
  const game = createTestGame("spawned-event-priority");
  const pashalik = addCard(game, cardFromDeck("pashalik_mons", "horde"));
  addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  addCard(game, customCard("burn_target", "player", { power: 1, toughness: 4 }), "player");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "CREATURE_DIED");
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
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");
  addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");
  const victim = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  destroyPermanent(game, victim);
  const death = game.eventQueue.find((event) => event.type === "CREATURE_DIED");
  resolveTriggeredEvent(game, death, undefined, rundvelt.instanceId);
  drainEventQueue(game);

  assert.equal(game.horde.library.length, 1);
});

test("static auras only announce the creatures that newly fell under them", () => {
  const game = createTestGame("static-aura-coverage");
  addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
  const first = addCard(game, cardFromDeck("goblin_token_1_1_red", "horde"));

  const before = collectStaticAuras(game, "horde");
  const buff = before.find((aura) => aura.power === 1 && aura.toughness === 1);
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
    addCard(miniSurge, customCard(`mini_surge_token_${index}`, "horde", { zone: "library", isToken: true }), "horde", "library");
  }

  const miniSurgeResult = runHordeMain(miniSurge);

  assert.equal(miniSurgeResult.hordeTurnNumber, 6);
  assert.equal(miniSurgeResult.horde.battlefield.length, 4);
  assert.equal(miniSurgeResult.horde.library.length, 0);
  assert.equal(miniSurgeResult.log.some((entry) => entry.includes("Mini Surge")), true);

  const followingTurn = createTestGame("after-mini-surge-reveal");
  followingTurn.hordeTurnNumber = 6;
  for (let index = 0; index < 4; index += 1) {
    addCard(followingTurn, customCard(`after_mini_surge_token_${index}`, "horde", { zone: "library", isToken: true }), "horde", "library");
  }

  const followingResult = runHordeMain(followingTurn);
  assert.equal(followingResult.hordeTurnNumber, 7);
  assert.equal(followingResult.horde.battlefield.length, 3);
  assert.equal(followingResult.horde.library.length, 1);
});

test("Surge depends only on reaching the tenth Horde turn", () => {
  const game = createTestGame("surge-clock");
  game.hordeTurnNumber = 9;
  for (let index = 0; index < 20; index += 1) {
    addCard(game, customCard(`surge_clock_grave_${index}`, "horde", { zone: "graveyard" }), "horde", "graveyard");
  }

  assert.equal(hordeInSurge(game), false);

  game.hordeTurnNumber = 10;
  assert.equal(hordeInSurge(game), true);
});

test("Horde Zombies gain +1/+0 continuously from Surge onward", () => {
  const game = createTestGame("surge-zombie-power");
  const hordeZombie = addCard(game, customCard("surge_zombie", "horde", { subtypes: ["Zombie"], power: 2, toughness: 2 }));
  const hordeNonZombie = addCard(game, customCard("surge_bat", "horde", { subtypes: ["Bat"], power: 2, toughness: 2 }));
  const playerZombie = addCard(game, customCard("player_zombie", "player", { subtypes: ["Zombie"], power: 2, toughness: 2 }));

  game.hordeTurnNumber = 6;
  assert.deepEqual(getPowerToughness(game, hordeZombie), { power: 2, toughness: 2 });

  game.hordeTurnNumber = 10;
  assert.deepEqual(getPowerToughness(game, hordeZombie), { power: 3, toughness: 2 });
  assert.deepEqual(getPowerToughness(game, hordeNonZombie), { power: 2, toughness: 2 });
  assert.deepEqual(getPowerToughness(game, playerZombie), { power: 2, toughness: 2 });

  game.hordeTurnNumber = 12;
  assert.deepEqual(getPowerToughness(game, hordeZombie), { power: 3, toughness: 2 });
});

test("Chaos Surge begins on the eighth Horde turn", () => {
  const game = createTestGame("chaos-surge-clock");
  game.gameMode = "chaos";
  game.hordeTurnNumber = 7;
  assert.equal(hordeInSurge(game), false);

  game.hordeTurnNumber = 8;
  assert.equal(hordeInSurge(game), true);
});
