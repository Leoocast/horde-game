import assert from "node:assert/strict";
import { test } from "node:test";

import { contentCatalog } from "../src/content/bootstrap";
import { activateAbility, castCard } from "../src/engine/GameActions";
import {
  declareBlocker,
  prepareHostAttackers,
  resolveHostCombat,
  resolvePlayerCombat,
  togglePlayerAttacker,
} from "../src/engine/CombatResolver";
import { finishHostTurn, runHostMain } from "../src/engine/HostController";
import { findManualInvokedTargetTrigger, resolveEffect } from "../src/engine/EffectResolver";
import { advancePhase, endPlayerTurn } from "../src/engine/PhaseManager";
import { getPowerEndurance, hostInSurge } from "../src/engine/StaticEffects";
import { buildGuidedScenario } from "../src/guidance/buildGuidedScenario";
import { GuidedInteractionGate } from "../src/guidance/interactionGate";
import {
  LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION,
  LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION,
  LEARN_TO_PLAY_OPENING_INTERVENTION,
  LEARN_TO_PLAY_PROLOGUE_SCENARIO,
} from "../src/guidance/learnToPlayPrologue";
import { validateGuidedScenario } from "../src/guidance/validation";

const definitionIds = (cards) => cards.map((card) => card.definitionId);

function buildPrologue() {
  const built = buildGuidedScenario(LEARN_TO_PLAY_PROLOGUE_SCENARIO, contentCatalog);
  return {
    ...built,
    id: (alias) => built.bindings[alias].instanceId,
  };
}

function playOpeningTurn(aelyraTarget = "maela", attackArchive = true) {
  const built = buildPrologue();
  const { id } = built;
  let game = castCard(built.game, id("fourth_source"));
  game = castCard(game, id("aelyra"));
  const aelyra = game.player.field.find((card) => card.instanceId === id("aelyra"));
  const trigger = findManualInvokedTargetTrigger(aelyra);
  assert.ok(trigger);
  resolveEffect(game, trigger.effect, {
    source: aelyra,
    side: "player",
    targets: { target: id(aelyraTarget), targetCreature: id(aelyraTarget) },
  });
  game = advancePhase(game, "combat");
  if (attackArchive) {
    game = togglePlayerAttacker(game, id("maela"));
    game = resolvePlayerCombat(game);
  } else {
    game = advancePhase(game, "end");
  }
  game = endPlayerTurn(game);
  return { ...built, game };
}

function reachSecondPlayerTurn(aelyraTarget = "maela") {
  const built = playOpeningTurn(aelyraTarget);
  let game = runHostMain(built.game);
  game = prepareHostAttackers(game);
  game = resolveHostCombat(game);
  game = finishHostTurn(game);
  return { ...built, game };
}

function invokeVaelor({ playFlower, aelyraTarget = "maela" }) {
  const built = reachSecondPlayerTurn(aelyraTarget);
  let { game } = built;
  if (playFlower) {
    game = castCard(game, built.id("dawn_flower"));
    game = activateAbility(game, built.id("dawn_flower"), "veiled_dawn_flower_gain_energy");
  }
  game = castCard(game, built.id("vaelor"));
  return { ...built, game };
}

test("Learn to Play accepts confirmation for either authored Aelyra target", () => {
  const built = buildPrologue();
  const bindings = Object.fromEntries(
    Object.entries(built.bindings).map(([alias, binding]) => [alias, binding.instanceId]),
  );
  const steps = new Map(LEARN_TO_PLAY_OPENING_INTERVENTION.steps.map((step) => [step.id, step]));
  const choose = steps.get("choose-aelyra-target");
  const confirm = steps.get("confirm-aelyra-target");
  assert.equal(choose?.kind, "act");
  assert.equal(confirm?.kind, "act");

  for (const alias of ["aelyra", "maela"]) {
    const gate = new GuidedInteractionGate();
    gate.activate({
      sessionId: "learn-to-play",
      stepId: choose.id,
      mode: "act",
      bindings,
      allowedIntent: choose.allowedIntent,
    });
    assert.equal(gate.authorize({
      kind: "target.choose",
      context: "trigger",
      targetId: built.id(alias),
    }).allowed, true);

    gate.activate({
      sessionId: "learn-to-play",
      stepId: confirm.id,
      mode: "act",
      bindings,
      allowedIntent: confirm.allowedIntent,
    });
    assert.equal(gate.authorize({
      kind: "target.confirm",
      context: "trigger",
      targetIds: [built.id(alias)],
    }).allowed, true);
  }
});

test("Learn to Play keeps Aelyra natural, cues Maela silently, and confirms combat fundamentals", () => {
  const opening = new Map(LEARN_TO_PLAY_OPENING_INTERVENTION.steps.map((step) => [step.id, step]));
  assert.deepEqual(opening.get("play-fourth-source").presentation, {
    kind: "directionalCue",
    direction: "up",
    tone: "source",
  });
  assert.equal(opening.get("choose-aelyra-target").callout, "hidden");
  assert.equal(opening.get("confirm-aelyra-target").callout, "hidden");
  assert.deepEqual(opening.get("enter-first-combat").presentation, { kind: "spotlight", tone: "gold" });
  assert.equal(opening.has("select-maela-attacker"), false, "the attack suggestion must not install an input shield");
  assert.equal(opening.has("pass-first-combat"), false);
  assert.deepEqual(LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION.steps[0].presentation, {
    kind: "spotlight",
    tone: "gold",
  });
  assert.deepEqual(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[1].presentation, {
    kind: "cardComparison",
    cardAliases: ["return_to_memory", "maela"],
    emphasis: "combatStats",
  });
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[0].nextStepId, "explain-combat-stats");
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[1].id, "explain-combat-stats");
});

test("Learn to Play authors the exact advanced board two Host turns before Surge", () => {
  assert.deepEqual(validateGuidedScenario(LEARN_TO_PLAY_PROLOGUE_SCENARIO, contentCatalog), []);
  const { game, id } = buildPrologue();

  assert.equal(game.activeSide, "player");
  assert.equal(game.phase, "main");
  assert.equal(game.turnNumber, 9);
  assert.equal(game.hostTurnNumber, 8);
  assert.equal(game.player.life, 31);
  assert.deepEqual(game.player.hand.map((card) => card.instanceId), [
    id("fourth_source"),
    id("aelyra"),
    id("vaelor"),
  ]);
  assert.deepEqual(definitionIds(game.player.field), [
    "maela_watcher_of_the_heights",
    "river_of_elarion",
    "river_of_elarion",
    "river_of_elarion",
  ]);
  assert.deepEqual(definitionIds(game.player.archive), ["veiled_dawn_flower"]);
  assert.deepEqual(definitionIds(game.host.field), [
    "return_to_memory",
    "winged_stalker_of_the_crypt",
    "stitched_wing_spawn",
    "harvester_of_the_fallen",
  ]);
  assert.equal(game.host.field.at(-1).counters["+1/+1"], 2);
  assert.deepEqual(definitionIds(game.host.archive), [
    "winged_stalker_of_the_crypt",
    "graveless_soldier",
    "graveless_soldier",
    "memory_thief",
    "memory_thief",
    "graveless_titan",
    "graveless_soldier",
    "graveless_soldier",
  ]);
});

test("the opening permits either legal Aelyra target, spends Maela's attack, and reserves three Sources", () => {
  for (const target of ["maela", "aelyra"]) {
    const { game, id } = playOpeningTurn(target);
    assert.equal(game.player.life, 34);
    assert.equal(game.player.pendingStoredEnergy, 3);
    assert.equal(game.player.field.filter((card) => card.kinds.includes("SOURCE") && !card.exhausted).length, 3);
    assert.equal(game.player.field.find((card) => card.instanceId === id(target)).counters["+1/+1"], 1);
    assert.equal(game.player.field.find((card) => card.instanceId === id("maela")).exhausted, true);
    assert.equal(game.host.memory.at(-1).instanceId, id("opening_attack_discard"));
    assert.equal(game.host.archive[0].instanceId, id("second_winged_stalker"));
    assert.equal(game.activeSide, "host");
  }
});

test("the ordinary Host turn preserves left-to-right attack order and restores seven Energy", () => {
  const { game, id } = reachSecondPlayerTurn();

  assert.equal(game.hostTurnNumber, 9);
  assert.equal(game.turnNumber, 10);
  assert.equal(game.activeSide, "player");
  assert.equal(game.phase, "main");
  assert.equal(game.player.life, 21);
  assert.equal(game.player.energyPool.stored, 3);
  assert.equal(game.player.field.filter((card) => card.kinds.includes("SOURCE") && !card.exhausted).length, 4);
  assert.deepEqual(definitionIds(game.player.hand), ["vaelor_emerald_guardian", "veiled_dawn_flower"]);
  assert.deepEqual(definitionIds(game.host.field), [
    "return_to_memory",
    "winged_stalker_of_the_crypt",
    "stitched_wing_spawn",
    "harvester_of_the_fallen",
    "winged_stalker_of_the_crypt",
  ]);
  assert.equal(game.host.field.at(-1).instanceId, id("second_winged_stalker"));
});

test("attacking or passing preserves the same authored Winged Stalker response", () => {
  for (const attackArchive of [false, true]) {
    const opening = playOpeningTurn("maela", attackArchive);
    let game = runHostMain(opening.game);
    assert.equal(game.host.field.at(-1).instanceId, opening.id("second_winged_stalker"));
    assert.deepEqual(definitionIds(game.host.archive).slice(0, 2), [
      "graveless_soldier",
      "graveless_soldier",
    ]);
    assert.equal(
      game.host.archive.some((card) => card.instanceId === opening.id("opening_attack_discard")),
      !attackArchive,
    );
  }
});

test("Vaelor leaves only a 7/9 Harvester whether the Flower is used before him or not", () => {
  for (const playFlower of [false, true]) {
    const { game, id } = invokeVaelor({ playFlower });
    assert.deepEqual(game.host.field.map((card) => card.instanceId), [id("harvester")]);
    assert.deepEqual(getPowerEndurance(game, game.host.field[0]), { power: 7, endurance: 9 });
    assert.deepEqual(definitionIds(game.host.archive), [
      "memory_thief",
      "memory_thief",
      "graveless_titan",
      "graveless_soldier",
    ]);
    assert.equal(game.player.field.some((card) => card.instanceId === id("vaelor")), true);
    assert.equal(game.player.energyPool.stored, 0);
    assert.equal(
      game.player.field.filter((card) => card.kinds.includes("SOURCE") && !card.exhausted).length,
      playFlower ? 0 : 1,
    );
    if (playFlower) {
      assert.equal(game.player.field.find((card) => card.instanceId === id("dawn_flower")).stabilizing, true);
    }
  }
});

test("every legal defense and both Flower orders converge on the same pre-Surge survivor", () => {
  let legalDefenseBranches = 0;
  let convergenceBranches = 0;
  for (const aelyraTarget of ["maela", "aelyra"]) {
    const opening = playOpeningTurn(aelyraTarget);
    let declared = prepareHostAttackers(runHostMain(opening.game));
    const attackerChoices = [undefined, ...declared.combat.hostAttackers];
    for (const maelaTarget of attackerChoices) {
      for (const aelyraDefenseTarget of attackerChoices) {
        let defended = structuredClone(declared);
        if (maelaTarget) {
          defended = declareBlocker(defended, opening.id("maela"), maelaTarget);
          if (!defended.lastActionResult?.ok) continue;
        }
        if (aelyraDefenseTarget) {
          defended = declareBlocker(defended, opening.id("aelyra"), aelyraDefenseTarget);
          if (!defended.lastActionResult?.ok) continue;
        }
        legalDefenseBranches += 1;
        const secondTurn = finishHostTurn(resolveHostCombat(defended));
        assert.notEqual(secondTurn.winner, "host");
        assert.equal(secondTurn.player.energyPool.stored, 3);
        assert.deepEqual(definitionIds(secondTurn.player.hand), ["vaelor_emerald_guardian", "veiled_dawn_flower"]);

        for (const order of ["omit-flower", "flower-first", "vaelor-first"]) {
          let game = structuredClone(secondTurn);
          if (order === "flower-first") game = castCard(game, opening.id("dawn_flower"));
          game = castCard(game, opening.id("vaelor"));
          if (order === "vaelor-first") game = castCard(game, opening.id("dawn_flower"));
          assert.equal(game.lastActionResult?.ok, true, `${aelyraTarget}/${maelaTarget}/${aelyraDefenseTarget}/${order}`);
          assert.deepEqual(game.host.field.map((card) => card.instanceId), [opening.id("harvester")]);
          assert.deepEqual(getPowerEndurance(game, game.host.field[0]), { power: 7, endurance: 9 });
          assert.deepEqual(definitionIds(game.host.archive), [
            "memory_thief",
            "memory_thief",
            "graveless_titan",
            "graveless_soldier",
          ]);
          convergenceBranches += 1;
        }
      }
    }
  }
  // Maela has already attacked, so Aelyra is the only available defender. She may defend either
  // ground attacker or let both through, for three legal choices per authored Invocation target.
  assert.equal(legalDefenseBranches, 6);
  assert.equal(convergenceBranches, legalDefenseBranches * 3);
});

test("the first Surge remains authored after either zero or one pre-Surge Archive discard", () => {
  for (const attackArchive of [false, true]) {
    const built = invokeVaelor({ playFlower: true });
    let { game } = built;
    if (attackArchive) {
      game = advancePhase(game, "combat");
      game = togglePlayerAttacker(game, built.id("maela"));
      game = resolvePlayerCombat(game);
      assert.equal(game.host.archive[0].instanceId, built.id("memory_thief_b"));
    }
    game = endPlayerTurn(game);
    game = runHostMain(game);

    assert.equal(game.hostTurnNumber, 10);
    assert.equal(hostInSurge(game), true);
    const invokedThisSurge = game.host.field
      .filter((card) => card.instanceId !== built.id("harvester"))
      .map((card) => card.definitionId);
    assert.deepEqual(
      invokedThisSurge,
      attackArchive
        ? ["memory_thief", "graveless_titan", "graveless_soldier"]
        : ["memory_thief", "memory_thief", "graveless_titan"],
    );
  }
});
