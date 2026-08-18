import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  GUIDED_GAMEPLAY_ENTRY_POINTS,
  GuidedInteractionGate,
  guidedInteractionGate,
  receiptMatchesSpec,
  runGuidedSystemAction,
} from "../src/guidance";
import { useAudioStore } from "../src/store/useAudioStore";
import { useGameStore } from "../src/store/useGameStore";
import { addCard, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("interaction snapshots remain referentially stable until the gate changes", () => {
  const gate = new GuidedInteractionGate();
  const initial = gate.snapshot();
  assert.equal(gate.snapshot(), initial);

  let notified;
  gate.subscribe((snapshot) => {
    notified = snapshot;
  });
  gate.activate(policy({ mode: "explain" }));

  assert.notEqual(gate.snapshot(), initial);
  assert.equal(gate.snapshot(), notified);
  assert.equal(gate.snapshot(), gate.snapshot());
});

test("the gate is a no-op outside a guide and blocks every intent during explain/observe", () => {
  const gate = new GuidedInteractionGate();
  assert.deepEqual(gate.authorize({ kind: "opening.mulligan" }), { allowed: true });

  gate.activate(policy({ mode: "explain" }));
  const explainResult = gate.authorize({ kind: "opening.accept" });
  assert.equal(explainResult.allowed, false);
  assert.equal(explainResult.rejection.reason, "step-not-actionable");

  gate.activate(policy({ stepId: "observe", mode: "observe" }));
  const observeResult = gate.authorize({ kind: "card.play", cardId: "source-1" });
  assert.equal(observeResult.allowed, false);
  assert.equal(observeResult.rejection.reason, "step-not-actionable");
});

test("kind, context, card, target, ability and exact selections are matched semantically", () => {
  const gate = new GuidedInteractionGate();
  const bindings = {
    caster: "card-caster",
    friendly: "card-friendly",
    enemy: "card-enemy",
  };
  gate.activate(policy({
    bindings,
    allowedIntent: {
      kind: "ability.activate",
      cardAlias: "caster",
      abilityId: "channel",
      targetAliases: ["friendly", "enemy"],
    },
  }));

  assert.equal(gate.authorize({
    kind: "ability.activate",
    cardId: "card-caster",
    abilityId: "channel",
    targetIds: ["card-friendly", "card-enemy"],
  }).allowed, true);
  assert.equal(gate.authorize({
    kind: "ability.activate",
    cardId: "card-caster",
    abilityId: "channel",
    targetIds: ["card-enemy", "card-friendly"],
  }).rejection.reason, "selection-mismatch");
  assert.equal(gate.authorize({
    kind: "ability.activate",
    cardId: "card-friendly",
    abilityId: "channel",
    targetIds: ["card-friendly", "card-enemy"],
  }).rejection.reason, "card-mismatch");
  assert.equal(gate.authorize({
    kind: "ability.activate",
    cardId: "card-caster",
    abilityId: "other",
    targetIds: ["card-friendly", "card-enemy"],
  }).rejection.reason, "ability-mismatch");

  gate.activate(policy({
    stepId: "target",
    bindings,
    allowedIntent: { kind: "target.choose", context: "spell", targetAlias: "enemy" },
  }));
  assert.equal(gate.authorize({ kind: "target.choose", context: "trigger", targetId: "card-enemy" }).rejection.reason, "context-mismatch");
  assert.equal(gate.authorize({ kind: "target.choose", context: "spell", targetId: "card-friendly" }).rejection.reason, "target-mismatch");
  assert.equal(gate.authorize({ kind: "target.choose", context: "spell", targetId: "card-enemy" }).allowed, true);

  gate.activate(policy({
    stepId: "attacker",
    bindings,
    allowedIntent: { kind: "combat.toggleAttacker", cardAlias: "friendly", selected: true },
  }));
  assert.equal(gate.authorize({ kind: "combat.toggleAttacker", cardId: "card-friendly", selected: false }).rejection.reason, "selection-mismatch");
  assert.equal(gate.authorize({ kind: "combat.toggleAttacker", cardId: "card-friendly", selected: true }).allowed, true);
});

test("authored target options allow one controlled choice without accepting other targets", () => {
  const gate = new GuidedInteractionGate();
  const bindings = {
    aelyra: "card-aelyra",
    maela: "card-maela",
    outsider: "card-outsider",
  };
  const allowedIntent = {
    kind: "target.confirm",
    context: "trigger",
    targetAliasOptions: ["aelyra", "maela"],
    targetCount: 1,
  };

  gate.activate(policy({ bindings, allowedIntent }));
  assert.equal(gate.authorize({ kind: "target.confirm", context: "trigger", targetIds: ["card-aelyra"] }).allowed, true);

  gate.activate(policy({ stepId: "choose-maela", bindings, allowedIntent }));
  assert.equal(gate.authorize({ kind: "target.confirm", context: "trigger", targetIds: ["card-maela"] }).allowed, true);

  gate.activate(policy({ stepId: "reject-outsider", bindings, allowedIntent }));
  assert.equal(
    gate.authorize({ kind: "target.confirm", context: "trigger", targetIds: ["card-outsider"] }).rejection.reason,
    "selection-mismatch",
  );

  gate.activate(policy({ stepId: "reject-too-many", bindings, allowedIntent }));
  assert.equal(
    gate.authorize({ kind: "target.confirm", context: "trigger", targetIds: ["card-aelyra", "card-maela"] }).rejection.reason,
    "selection-mismatch",
  );
});

test("accepted receipts are scoped by session/step, consume one Act action and keep a monotonic cursor", () => {
  const gate = new GuidedInteractionGate();
  gate.activate(policy({
    bindings: { source: "source-1" },
    allowedIntent: { kind: "card.play", cardAlias: "source" },
  }));
  assert.equal(gate.authorize({ kind: "card.play", cardId: "source-1" }).allowed, true);
  const receipt = gate.publish({ kind: "source.played", cardId: "source-1" });
  assert.equal(receipt.cursor, 1);
  assert.equal(receipt.sessionId, "session-a");
  assert.equal(receipt.stepId, "act");
  assert.equal(receipt.cardAlias, "source");
  assert.equal(receiptMatchesSpec(receipt, { kind: "source.played", cardAlias: "source" }), true);
  assert.equal(gate.authorize({ kind: "card.play", cardId: "source-1" }).rejection.reason, "step-action-consumed");

  gate.activate(policy({
    stepId: "act-again",
    bindings: { source: "source-1" },
    allowedIntent: { kind: "card.play", cardAlias: "source" },
  }));
  assert.equal(gate.authorize({ kind: "card.play", cardId: "source-1" }).allowed, true);
  const second = gate.publish({ kind: "card.played", cardId: "source-1" });
  assert.equal(second.cursor, 2);

  gate.activate(policy({
    sessionId: "session-b",
    bindings: { source: "source-1" },
    allowedIntent: { kind: "card.play", cardAlias: "source" },
  }));
  assert.deepEqual(gate.receiptsSince(0), []);
  assert.equal(gate.publish({ kind: "card.played", cardId: "source-1" }).cursor, 3);
});

test("automatic work has an explicit bypass without opening the player gate", () => {
  const gate = new GuidedInteractionGate();
  gate.activate(policy({ mode: "observe" }));
  assert.equal(gate.authorize({ kind: "phase.resolveHost" }).allowed, false);
  const result = gate.runSystemAction(() => gate.authorize({ kind: "phase.resolveHost" }));
  assert.deepEqual(result, { allowed: true });
  assert.equal(gate.authorize({ kind: "phase.resolveHost" }).allowed, false);
});

test("the real store blocks wrong cards, commits the authored card once and emits accepted receipts", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-card");
    preparePlayerMain(game);
    const authored = addCard(game, cardFromDeck("river_of_elarion", "player", "hand"));
    const other = addCard(game, cardFromDeck("river_of_elarion", "player", "hand"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({
      bindings: { authored: authored.instanceId, other: other.instanceId },
      allowedIntent: { kind: "card.play", cardAlias: "authored" },
    }));

    useGameStore.getState().playLand(other.instanceId);
    assert.equal(useGameStore.getState().game.player.field.length, 0);
    assert.equal(guidedInteractionGate.snapshot().lastRejection.reason, "card-mismatch");

    useGameStore.getState().playLand(authored.instanceId);
    assert.deepEqual(useGameStore.getState().game.player.field.map((card) => card.instanceId), [authored.instanceId]);
    assert.deepEqual(
      guidedInteractionGate.snapshot().receipts.map((receipt) => receipt.kind),
      ["card.played", "source.played"],
    );

    useGameStore.getState().playLand(other.instanceId);
    assert.equal(useGameStore.getState().game.player.field.length, 1);
    assert.equal(guidedInteractionGate.snapshot().lastRejection.reason, "step-action-consumed");
  });
});

test("the strict Source-return action reaches the store, draws, and emits its authored receipt", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-source-return");
    preparePlayerMain(game);
    const source = addCard(game, cardFromDeck("river_of_elarion", "player", "hand"));
    const nextDraw = addCard(game, cardFromDeck("clash_of_echoes", "player", "archive"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({
      bindings: { post_surge_source: source.instanceId },
      allowedIntent: { kind: "source.recycle", cardAlias: "post_surge_source" },
    }));

    useGameStore.getState().startEnergyRecycle(source.instanceId, { x: 1168, y: 700 });
    assert.equal(useGameStore.getState().energyRecycleAnimation?.card.instanceId, source.instanceId);

    useGameStore.getState().completeEnergyRecycleAnimation();
    const committed = useGameStore.getState().game;
    assert.equal(committed.player.hand.some((card) => card.instanceId === source.instanceId), false);
    assert.equal(committed.player.hand.some((card) => card.instanceId === nextDraw.instanceId), true);
    assert.equal(committed.player.archive.some((card) => card.instanceId === source.instanceId), true);
    assert.equal(committed.player.energyActionUsedThisTurn, true);
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1)?.kind, "source.recycled");
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1)?.cardAlias, "post_surge_source");
  });
});

test("guided card inspection accepts only the authored right-click target", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-card-inspection");
    preparePlayerMain(game);
    const authored = addCard(game, customCard("guided-inspect-authored", "host"));
    const other = addCard(game, customCard("guided-inspect-other", "host"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({
      bindings: { authored: authored.instanceId, other: other.instanceId },
      allowedIntent: { kind: "card.inspect", cardAlias: "authored" },
    }));

    useGameStore.getState().setFocusedCardId(other.instanceId);
    assert.equal(useGameStore.getState().focusedCardId, undefined);
    assert.equal(guidedInteractionGate.snapshot().lastRejection.reason, "card-mismatch");

    useGameStore.getState().setFocusedCardId(authored.instanceId);
    assert.equal(useGameStore.getState().focusedCardId, authored.instanceId);
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1).kind, "card.inspected");
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1).cardAlias, "authored");
  });
});

test("an engine rejection produces no receipt and leaves the Act step retryable", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-rejected");
    preparePlayerMain(game);
    game.phase = "combat";
    const source = addCard(game, cardFromDeck("river_of_elarion", "player", "hand"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({
      bindings: { source: source.instanceId },
      allowedIntent: { kind: "card.play", cardAlias: "source" },
    }));

    useGameStore.getState().playLand(source.instanceId);
    await flushMicrotasks();
    assert.equal(useGameStore.getState().game.player.hand.some((card) => card.instanceId === source.instanceId), true);
    assert.deepEqual(guidedInteractionGate.snapshot().receipts, []);
    assert.equal(guidedInteractionGate.authorize({ kind: "card.play", cardId: source.instanceId }).allowed, true);
  });
});

test("a synchronous double commitment cannot skip two Preparation turns", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-double-setup");
    game.openingHandAccepted = true;
    game.activeSide = "player";
    game.phase = "main";
    game.setupTurnsRemaining = 3;
    addCard(game, cardFromDeck("veiled_dawn_flower", "player", "archive"));
    addCard(game, cardFromDeck("aelyra_heir_of_elarion", "player", "archive"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({ allowedIntent: { kind: "phase.continueSetup" } }));

    useGameStore.getState().endPlayerTurn();
    useGameStore.getState().endPlayerTurn();

    assert.equal(useGameStore.getState().game.setupTurnsRemaining, 2);
    assert.equal(guidedInteractionGate.snapshot().lastRejection.reason, "step-action-consumed");
    assert.equal(guidedInteractionGate.snapshot().receipts.filter((receipt) => receipt.kind === "setup.stepEnded").length, 1);
  });
});

test("targeted cards advance through authored play and target-selection commitments", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-targeting");
    preparePlayerMain(game);
    const spell = addCard(game, cardFromDeck("elixir_of_the_first_leaf", "player", "hand"));
    const target = addCard(game, customCard("guided-friendly-target", "player"));
    const other = addCard(game, customCard("guided-other-target", "player"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    const bindings = { spell: spell.instanceId, target: target.instanceId, other: other.instanceId };
    guidedInteractionGate.activate(policy({
      stepId: "begin-spell",
      bindings,
      allowedIntent: { kind: "card.play", cardAlias: "spell" },
    }));

    useGameStore.getState().startSpellTargeting(spell.instanceId, 100, 100);
    assert.equal(useGameStore.getState().spellTargeting?.handId, spell.instanceId);
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1).kind, "targeting.started");

    guidedInteractionGate.activate(policy({
      stepId: "choose-target",
      bindings,
      allowedIntent: { kind: "target.choose", context: "spell", targetAlias: "target" },
    }));
    useGameStore.getState().lockSpellTarget(other.instanceId);
    assert.equal(Object.values(useGameStore.getState().spellTargeting.targets).length, 0);
    useGameStore.getState().lockSpellTarget(target.instanceId);
    assert.equal(Object.values(useGameStore.getState().spellTargeting.targets)[0], target.instanceId);
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1).kind, "target.selected");
    assert.equal(guidedInteractionGate.snapshot().receipts.at(-1).targetAlias, "target");
  });
});

test("automatic turn receipts report empty-Hand draw and Reserve release without parsing logs", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-automatic");
    game.openingHandAccepted = true;
    game.activeSide = "host";
    game.phase = "host";
    game.setupTurnsRemaining = 0;
    game.player.pendingStoredEnergy = 2;
    addCard(game, cardFromDeck("river_of_elarion", "player", "field"));
    addCard(game, cardFromDeck("river_of_elarion", "player", "field"));
    addCard(game, cardFromDeck("veiled_dawn_flower", "player", "archive"));
    addCard(game, cardFromDeck("aelyra_heir_of_elarion", "player", "archive"));
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({ stepId: "watch-turn", mode: "observe" }));

    runGuidedSystemAction(() => useGameStore.getState().finishHostTurn());
    await flushMicrotasks();

    const receipts = guidedInteractionGate.snapshot().receipts;
    const draw = receipts.find((receipt) => receipt.kind === "player.drew");
    const reserve = receipts.find((receipt) => receipt.kind === "reserve.released");
    assert.equal(draw.amount, 2);
    assert.equal(draw.reason, "empty-hand");
    assert.equal(reserve.amount, 2);
    assert.equal(receipts.some((receipt) => receipt.kind === "phase.changed" && receipt.reason === "player:main"), true);
  });
});

test("automatic combat reports only cards actually discarded from the Host Archive", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("guided-store-host-archive");
    game.openingHandAccepted = true;
    game.activeSide = "player";
    game.phase = "combat";
    const attacker = addCard(game, customCard("guided-attacker", "player", { power: 6, endurance: 6 }));
    const first = addCard(game, customCard("guided-host-one", "host", { zone: "archive" }));
    const second = addCard(game, customCard("guided-host-two", "host", { zone: "archive" }));
    game.combat.playerAttackers = [attacker.instanceId];
    useGameStore.getState().loadScenario(game, { playerDeckId: "pact_of_elarion", hostDeckId: "uprising_of_the_graveless" });
    guidedInteractionGate.activate(policy({ stepId: "watch-mill", mode: "observe" }));

    useGameStore.getState().resolvePlayerCombat();
    await flushMicrotasks();

    const mill = guidedInteractionGate.snapshot().receipts.find((receipt) => receipt.kind === "hostArchive.discarded");
    assert.equal(mill.amount, 2);
    assert.deepEqual(mill.targetIds, [first.instanceId, second.instanceId]);
  });
});

test("every classified player gameplay entry point calls the semantic gate", () => {
  const source = readFileSync(new URL("../src/store/useGameStore.ts", import.meta.url), "utf8");
  const implementation = source.slice(source.indexOf("export const useGameStore"));
  for (const method of GUIDED_GAMEPLAY_ENTRY_POINTS) {
    const start = implementation.indexOf(`  ${method}:`);
    assert.notEqual(start, -1, `missing GameStore implementation for ${method}`);
    const remainder = implementation.slice(start + 1);
    const nextMethod = remainder.search(/\n  [A-Za-z][A-Za-z0-9]+: /u);
    const body = implementation.slice(start, nextMethod < 0 ? undefined : start + 1 + nextMethod);
    assert.match(body, /gameplayIntentAllowed\(/u, `${method} must cross the semantic gate`);
  }
});

function policy({
  sessionId = "session-a",
  stepId = "act",
  mode = "act",
  bindings = {},
  allowedIntent = { kind: "opening.accept" },
} = {}) {
  return {
    sessionId,
    stepId,
    mode,
    bindings,
    ...(mode === "act" ? { allowedIntent } : {}),
  };
}

function preparePlayerMain(game) {
  game.openingHandAccepted = true;
  game.activeSide = "player";
  game.phase = "main";
  game.setupTurnsRemaining = 0;
}

async function withStoreHarness(run) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalPlaySfx = useAudioStore.getState().playSfx;
  const originalStopAllSfx = useAudioStore.getState().stopAllSfx;
  const timers = new Set();
  globalThis.window = {
    setTimeout: (callback, delay = 0) => {
      const id = setTimeout(() => {
        timers.delete(id);
        callback();
      }, delay);
      timers.add(id);
      return id;
    },
    clearTimeout: (id) => {
      clearTimeout(id);
      timers.delete(id);
    },
    localStorage: memoryStorage(),
    navigator: { language: "en" },
  };
  globalThis.document = { querySelector: () => undefined };
  useAudioStore.setState({ playSfx: () => undefined, stopAllSfx: () => undefined });
  guidedInteractionGate.reset();
  try {
    await run();
  } finally {
    guidedInteractionGate.reset();
    useGameStore.getState().stopGamePresentation();
    for (const timer of timers) clearTimeout(timer);
    useAudioStore.setState({ playSfx: originalPlaySfx, stopAllSfx: originalStopAllSfx });
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
