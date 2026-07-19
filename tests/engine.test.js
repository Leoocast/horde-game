import assert from "node:assert/strict";
import { test } from "node:test";

import { hordeDeck, playerDeck } from "../src/data/decks";
import { castCard } from "../src/engine/GameActions";
import { resolvePlayerCombat } from "../src/engine/CombatResolver";
import { destroyMarkedCreatures, destroyPermanent, findManualEnterTargetTrigger, resolveEffect } from "../src/engine/EffectResolver";
import { createInitialGame, expandDeck } from "../src/engine/GameState";
import { runHordeMain } from "../src/engine/HordeController";
import { hasKeyword } from "../src/engine/Keywords";
import { advancePhase, endPlayerTurn } from "../src/engine/PhaseManager";
import { getPowerToughness } from "../src/engine/StaticEffects";
import { targetCandidates } from "../src/engine/Targeting";
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

test("automatic payment taps lands but never mana creatures", () => {
  const game = createTestGame();
  const lands = addForests(game, 3);
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
  assert.equal(lands.every((land) => result.player.battlefield.find((card) => card.instanceId === land.instanceId)?.tapped), true);
  assert.equal(result.player.battlefield.find((card) => card.instanceId === manaCreature.instanceId)?.tapped, false);
  assert.deepEqual(result.player.manaPool, {
    green: 0,
    red: 0,
    blue: 0,
    white: 0,
    black: 0,
    colorless: 0,
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
  for (let index = 0; index < 5; index += 1) {
    addCard(surge, customCard(`surge_token_${index}`, "horde", { zone: "library", isToken: true }), "horde", "library");
  }
  for (let index = 0; index < 6; index += 1) {
    addCard(surge, customCard(`surge_grave_${index}`, "horde", { zone: "graveyard" }), "horde", "graveyard");
  }

  const surgeResult = runHordeMain(surge);
  assert.equal(surgeResult.horde.battlefield.length, 5);
  assert.equal(surgeResult.horde.library.length, 0);
});
