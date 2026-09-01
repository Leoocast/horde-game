import assert from "node:assert/strict";
import { test } from "node:test";

import { contentCatalog } from "../src/content/bootstrap";
import { activateAbility, castCard, recycleEnergy } from "../src/engine/GameActions";
import {
  declareBlocker,
  prepareHostAttackers,
  resolveHostCombat,
  resolvePlayerCombat,
  togglePlayerAttacker,
} from "../src/engine/CombatResolver";
import { beginHostMain, finishHostTurn, revealHostCardFromTop, runHostMain } from "../src/engine/HostController";
import { findManualInvokedTargetTrigger, resolveEffect } from "../src/engine/EffectResolver";
import { advancePhase, endPlayerTurn } from "../src/engine/PhaseManager";
import { getPowerEndurance, hostInSurge } from "../src/engine/StaticEffects";
import { buildGuidedScenario } from "../src/guidance/buildGuidedScenario";
import { gameplaySignalsForTransition } from "../src/guidance/gameplaySignals";
import { GuidedInteractionGate } from "../src/guidance/interactionGate";
import {
  LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION,
  LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION,
  LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION,
  LEARN_TO_PLAY_OPENING_INTERVENTION,
  LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION,
  LEARN_TO_PLAY_PROLOGUE_SCENARIO,
  LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION,
} from "../src/guidance/learnToPlayPrologue";
import { planLearnToPlayTerminalTurn } from "../src/guidance/learnToPlayTerminal";
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

function reachPostSurgeTurn({
  playFlower,
  attackBeforeSurge = false,
  defense = "none",
}) {
  const built = invokeVaelor({ playFlower });
  let { game } = built;
  if (attackBeforeSurge) {
    game = advancePhase(game, "combat");
    game = togglePlayerAttacker(game, built.id("maela"));
    assert.equal(game.lastActionResult?.ok, true);
    game = resolvePlayerCombat(game);
  }
  game = endPlayerTurn(game);
  game = runHostMain(game);
  assert.equal(hostInSurge(game), true);
  assert.deepEqual(game.player.hand, [], "Memory Thief must empty the Hand through its real reaction");
  game = prepareHostAttackers(game);
  if (defense === "sacrifice-all") {
    const titan = game.host.field.find((card) => card.instanceId === built.id("surge_titan"));
    assert.ok(titan);
    game = declareBlocker(game, built.id("maela"), titan.instanceId);
    assert.equal(game.lastActionResult?.ok, true);
    game = declareBlocker(game, built.id("aelyra"), titan.instanceId);
    assert.equal(game.lastActionResult?.ok, true);
    game = declareBlocker(game, built.id("vaelor"), titan.instanceId);
    assert.equal(game.lastActionResult?.ok, true);
  }
  game = resolveHostCombat(game);
  assert.notEqual(game.winner, "host", "the pedagogical empty-Hand turn must always be reached");
  game = finishHostTurn(game);
  return { ...built, game };
}

function returnPostSurgeSource(built) {
  const source = built.game.player.hand.find((card) => card.instanceId === built.id("post_surge_source"));
  assert.ok(source);
  const game = recycleEnergy(built.game, source.instanceId);
  assert.equal(game.lastActionResult?.ok, true);
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

test("the canonical tutorial exposes its first compatible marked-damage branch to contextual guidance", () => {
  const built = invokeVaelor({ playFlower: false });
  const combat = prepareHostAttackers(runHostMain(endPlayerTurn(built.game)));
  const blockerIds = combat.player.field
    .filter((card) => card.kinds.includes("ECHO"))
    .map((card) => card.instanceId);
  const branch = blockerIds.flatMap((blockerId) => combat.combat.hostAttackers.flatMap((attackerId) => {
    const defended = declareBlocker(combat, blockerId, attackerId);
    if (!defended.lastActionResult?.ok) return [];
    const resolved = resolveHostCombat(defended);
    const damagedIds = [...resolved.player.field, ...resolved.host.field]
      .filter((card) => card.kinds.includes("ECHO") && card.damageMarked > 0)
      .map((card) => card.instanceId);
    return damagedIds.length > 0 ? [{ resolved, damagedIds }] : [];
  }))[0];
  assert.ok(branch, "the canonical tutorial must include a legal branch with surviving marked damage");

  const settled = advancePhase(branch.resolved, "end");
  const signal = gameplaySignalsForTransition(branch.resolved, settled)
    .find((candidate) => candidate.kind === "combat.echoesDamaged");
  assert.deepEqual(signal?.cardIds, branch.damagedIds);
});

test("Learn to Play keeps Aelyra natural, cues Maela silently, and confirms combat fundamentals", () => {
  const opening = new Map(LEARN_TO_PLAY_OPENING_INTERVENTION.steps.map((step) => [step.id, step]));
  assert.equal(LEARN_TO_PLAY_OPENING_INTERVENTION.revision, 3);
  assert.equal(LEARN_TO_PLAY_OPENING_INTERVENTION.startStepId, "evy-fourth-source-briefing");
  assert.equal(opening.get("evy-fourth-source-briefing").kind, "explain");
  assert.equal(opening.get("evy-fourth-source-briefing").copy.titleKey, "guided.learnToPlay.intro.evy");
  assert.equal(opening.get("evy-fourth-source-briefing").nextStepId, "play-fourth-source");
  assert.deepEqual(opening.get("play-fourth-source").presentation, {
    kind: "directionalCue",
    direction: "up",
    tone: "source",
  });
  assert.equal(opening.get("play-fourth-source").dimmer, "hidden");
  assert.equal(opening.get("invoke-aelyra").dimmer, "hidden");
  assert.equal(opening.get("choose-aelyra-target").callout, "hidden");
  assert.equal(opening.get("confirm-aelyra-target").callout, "hidden");
  assert.deepEqual(opening.get("confirm-aelyra-target").highlights, [
    { kind: "surface", anchor: "selection.primaryAction" },
    { kind: "surface", anchor: "selection.cancelAction" },
    { kind: "card", alias: "aelyra" },
    { kind: "card", alias: "maela" },
  ]);
  assert.deepEqual(opening.get("enter-first-combat").presentation, { kind: "spotlight", tone: "gold" });
  assert.equal(opening.has("select-maela-attacker"), false, "the attack suggestion must not install an input shield");
  assert.equal(opening.has("pass-first-combat"), false);
  assert.deepEqual(
    LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION.steps.map((step) => step.id),
    ["attack-host-archive", "attacking-is-optional"],
  );
  assert.deepEqual(LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION.steps[0].highlights, [
    { kind: "surface", anchor: "host.archive" },
  ]);
  assert.equal(
    LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION.steps[0].copy.bodyKey,
    "guided.learnToPlay.attackArchiveBody",
  );
  assert.deepEqual(LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION.steps[0].presentation, {
    kind: "spotlight",
    tone: "gold",
  });
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.startStepId, "wait-for-host-arrivals");
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[0].callout, "hidden");
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[0].nextStepId, "host-turn");
  assert.deepEqual(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[2].presentation, {
    kind: "cardComparison",
    cardAliases: ["return_to_memory", "maela"],
    emphasis: "combatStats",
  });
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[1].nextStepId, "explain-combat-stats");
  assert.equal(LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.steps[2].id, "explain-combat-stats");
  assert.deepEqual(
    LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.steps.map((step) => step.id),
    ["player-turn-returned", "explain-renewed-energy", "wait-for-energy-renewal", "use-energy-for-echoes"],
  );
  assert.deepEqual(LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.steps[1].highlights, [
    { kind: "surface", anchor: "player.sources" },
    { kind: "surface", anchor: "player.reserve" },
  ]);
  assert.equal(LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.steps[2].callout, "hidden");
  assert.deepEqual(LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.steps[2].expectedReceipt, {
    kind: "reserve.released",
  });
  assert.equal(LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION.revision, 2);
  assert.equal(LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION.startStepId, "explain-return-source");
  assert.deepEqual(
    LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION.steps.map(({ id, kind, callout }) => ({ id, kind, callout })),
    [
      { id: "explain-return-source", kind: "explain", callout: undefined },
      { id: "return-source", kind: "act", callout: "hidden" },
    ],
  );
  assert.deepEqual(LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION.steps[1].allowedIntent, {
    kind: "source.recycle",
    cardAlias: "post_surge_source",
  });
  assert.deepEqual(LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION.steps[1].highlights, [
    { kind: "card", alias: "post_surge_source", role: "origin" },
    { kind: "surface", anchor: "player.archive", role: "destination" },
  ]);
  assert.deepEqual(LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION.steps[1].presentation, {
    kind: "spotlight",
    tone: "gold",
  });
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
    id("vaelor"),
    id("aelyra"),
    id("fourth_source"),
  ]);
  assert.deepEqual(definitionIds(game.player.field), [
    "maela_watcher_of_the_heights",
    "river_of_elarion",
    "river_of_elarion",
    "river_of_elarion",
  ]);
  assert.deepEqual(definitionIds(game.player.archive), [
    "veiled_dawn_flower",
    "clash_of_echoes",
    "river_of_elarion",
    "echo_of_the_forgotten_city",
  ]);
  assert.deepEqual(definitionIds(game.host.field), [
    "return_to_memory",
    "winged_stalker_of_the_crypt",
    "stitched_wing_spawn",
    "harvester_of_the_fallen",
  ]);
  assert.equal(game.host.field.at(-1).counters["+1/+1"], 2);
  assert.deepEqual(definitionIds(game.host.archive).slice(0, 8), [
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
    assert.deepEqual(definitionIds(game.host.archive).slice(0, 4), [
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
          assert.deepEqual(definitionIds(game.host.archive).slice(0, 4), [
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

test("the post-Surge turn draws two, returns the fifth Source, and computes an unavoidable collapse", () => {
  const built = reachPostSurgeTurn({ playFlower: true });
  let { game } = built;

  assert.deepEqual(definitionIds(game.player.hand), ["clash_of_echoes", "river_of_elarion"]);
  const returnedSource = game.player.hand.find((card) => card.definitionId === "river_of_elarion");
  assert.ok(returnedSource);
  const rejectedFifthSource = castCard(game, returnedSource.instanceId);
  assert.equal(rejectedFifthSource.lastActionResult?.ok, false);
  assert.equal(rejectedFifthSource.lastActionResult?.code, "SOURCE_LIMIT_REACHED");
  assert.equal(rejectedFifthSource.player.energyActionUsedThisTurn, false);
  game = recycleEnergy(game, returnedSource.instanceId);
  assert.equal(game.lastActionResult?.ok, true);
  assert.deepEqual(definitionIds(game.player.hand), ["clash_of_echoes", "echo_of_the_forgotten_city"]);

  game = endPlayerTurn(game);
  const plan = planLearnToPlayTerminalTurn(game);
  assert.ok(plan.revealCount >= 1);
  assert.ok(plan.maximumSurvivingLife <= 0);
  assert.equal(plan.revealedCardIds.includes(built.id("terminal_titan")), true);

  let terminal = beginHostMain(game);
  for (let index = 0; index < plan.revealCount; index += 1) terminal = revealHostCardFromTop(terminal);
  assert.equal(terminal.host.field.some((card) => card.instanceId === built.id("terminal_titan")), true);
});

test("every first-Surge offset empties the Hand and reaches the real two-card draw", () => {
  for (const playFlower of [false, true]) {
    for (const attackBeforeSurge of [false, true]) {
      const { game } = reachPostSurgeTurn({ playFlower, attackBeforeSurge });
      assert.equal(game.player.life, 1);
      assert.deepEqual(definitionIds(game.player.hand), ["clash_of_echoes", "river_of_elarion"]);
      assert.equal(game.player.field.filter((card) => card.kinds.includes("SOURCE") && !card.exhausted).length, 4);
    }
  }
});

test("the authored terminal guards absorb the maximum optional Archive attack before the Titan", () => {
  let built = returnPostSurgeSource(reachPostSurgeTurn({ playFlower: true }));
  let { game } = built;
  game = castCard(game, built.id("forgotten_city"));
  assert.equal(game.lastActionResult?.ok, true);
  assert.equal(game.player.field.some((card) => card.instanceId === built.id("forgotten_city")), true);
  const memoryBefore = new Set(game.host.memory.map((card) => card.instanceId));
  game = advancePhase(game, "combat");
  for (const alias of ["maela", "aelyra", "vaelor"]) {
    game = togglePlayerAttacker(game, built.id(alias));
    assert.equal(game.lastActionResult?.ok, true);
  }
  game = resolvePlayerCombat(game);

  const discarded = game.host.memory.filter((card) => !memoryBefore.has(card.instanceId));
  assert.deepEqual(discarded.map((card) => card.instanceId), [
    built.id("terminal_guard_one"),
    built.id("terminal_guard_two"),
    built.id("terminal_guard_three"),
  ]);
  assert.equal(game.host.archive.some((card) => card.instanceId === built.id("terminal_titan")), true);
});

test("the terminal planner covers Choque and a high-Life defense without a fixed Soldier count", () => {
  const clashBranch = returnPostSurgeSource(reachPostSurgeTurn({ playFlower: true }));
  let clashGame = clashBranch.game;
  const clash = clashGame.player.hand.find((card) => card.instanceId === clashBranch.id("clash_of_echoes"));
  const vaelor = clashGame.player.field.find((card) => card.instanceId === clashBranch.id("vaelor"));
  const target = clashGame.host.field.find((card) => card.kinds.includes("ECHO"));
  assert.ok(clash);
  assert.ok(vaelor);
  assert.ok(target);
  const [sourceRequirement, targetRequirement] = clash.requiresTargets;
  clashGame = castCard(clashGame, clash.instanceId, {
    targets: {
      [sourceRequirement.id]: vaelor.instanceId,
      [targetRequirement.id]: target.instanceId,
    },
  });
  assert.equal(clashGame.lastActionResult?.ok, true);
  const clashPlan = planLearnToPlayTerminalTurn(endPlayerTurn(clashGame));
  assert.ok(clashPlan.maximumSurvivingLife <= 0);
  assert.equal(clashPlan.revealedCardIds.includes(clashBranch.id("terminal_titan")), true);

  let highLifeBranch = returnPostSurgeSource(reachPostSurgeTurn({
    playFlower: true,
    defense: "sacrifice-all",
  }));
  assert.ok(highLifeBranch.game.player.life > 1);
  assert.deepEqual(
    definitionIds(highLifeBranch.game.player.field.filter((card) => card.kinds.includes("ECHO"))),
    ["veiled_dawn_flower", "vaelor_emerald_guardian"],
  );
  const highLifePlan = planLearnToPlayTerminalTurn(endPlayerTurn(highLifeBranch.game));
  assert.ok(highLifePlan.revealCount >= 1);
  assert.ok(highLifePlan.maximumSurvivingLife <= 0);
  assert.equal(highLifePlan.revealedCardIds.includes(highLifeBranch.id("terminal_titan")), true);
});
