import assert from "node:assert/strict";
import { test } from "node:test";

import { hordeDeck, playerDeck } from "../src/data/decks";
import { activateAbility, castCard, playLand, recycleEnergy } from "../src/engine/GameActions";
import { chaosKeywordPool, prepareChaosDeck } from "../src/engine/ChaosMode";
import { resolveHordeCombat, resolvePlayerCombat } from "../src/engine/CombatResolver";
import { destroyMarkedCreatures, destroyPermanent, findManualEnterTargetTrigger, resolveEffect } from "../src/engine/EffectResolver";
import { createInitialGame, expandDeck } from "../src/engine/GameState";
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

test("Chaos Surge begins on the eighth Horde turn", () => {
  const game = createTestGame("chaos-surge-clock");
  game.gameMode = "chaos";
  game.hordeTurnNumber = 7;
  assert.equal(hordeInSurge(game), false);

  game.hordeTurnNumber = 8;
  assert.equal(hordeInSurge(game), true);
});
