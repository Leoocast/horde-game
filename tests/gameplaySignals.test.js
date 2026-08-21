import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GameplaySignalStream,
  gameplaySignalStream,
  gameplaySignalsForTransition,
  guidedInteractionGate,
} from "../src/guidance";
import { beginHostCombat, declareHostAttackers } from "../src/engine/CombatResolver";
import { runHostMain } from "../src/engine/HostController";
import { useAudioStore } from "../src/store/useAudioStore";
import { useGameStore } from "../src/store/useGameStore";
import { addCard, addSources, cardFromDeck, createTestGame, customCard } from "./engineTestUtils";

test("gameplay signal snapshots are stable and cursors restart per game session", () => {
  const stream = new GameplaySignalStream("session-a");
  const initial = stream.snapshot();
  assert.equal(stream.snapshot(), initial);

  const intent = { kind: "opening.accept" };
  const first = stream.publish({
    kind: "intent.attempted",
    intent,
    origin: "player",
    authorization: "allowed",
  });
  assert.equal(first.cursor, 1);
  assert.equal(first.sessionId, "session-a");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(intent), false, "publishing must not freeze caller-owned input");
  assert.deepEqual(stream.signalsSince(0), [first]);

  stream.beginSession("session-b");
  assert.equal(stream.snapshot().cursor, 0);
  assert.deepEqual(stream.signalsSince(0, "session-a"), []);
  assert.equal(stream.publish({ kind: "game.ended", winner: "host" }).cursor, 1);
});

test("a normal match emits player intents and committed action receipts without a guide", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("signals-normal-action");
    preparePlayerMain(game);
    const source = addCard(game, cardFromDeck("river_of_elarion", "player", "hand"));
    load(game);

    useGameStore.getState().playLand(source.instanceId);

    const signals = gameplaySignalStream.snapshot().signals;
    assert.equal(
      signals.filter((signal) => signal.kind === "intent.attempted" && signal.intent.kind === "card.play").length,
      1,
    );
    assert.equal(
      signals.filter((signal) => signal.kind === "action.committed" && signal.receipt.kind === "source.played").length,
      1,
    );
    assert.equal(guidedInteractionGate.snapshot().receipts.length, 0);
  });
});

test("turn draw, Reserve release and readied Sources are observed without a guided policy", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("signals-normal-turn");
    game.openingHandAccepted = true;
    game.activeSide = "host";
    game.phase = "host";
    game.setupTurnsRemaining = 0;
    game.player.pendingStoredEnergy = 2;
    const firstSource = addCard(game, cardFromDeck("river_of_elarion", "player", "field"));
    const secondSource = addCard(game, cardFromDeck("river_of_elarion", "player", "field"));
    firstSource.exhausted = true;
    secondSource.exhausted = true;
    addCard(game, cardFromDeck("river_of_elarion", "player", "field"));
    addCard(game, cardFromDeck("river_of_elarion", "player", "field"));
    addCard(game, cardFromDeck("veiled_dawn_flower", "player", "archive"));
    addCard(game, cardFromDeck("aelyra_heir_of_elarion", "player", "archive"));
    load(game);

    useGameStore.getState().finishHostTurn();

    const signals = gameplaySignalStream.snapshot().signals;
    const draw = signals.find((signal) => signal.kind === "player.cardsDrawn");
    const reserve = signals.find((signal) => signal.kind === "player.reserveReleased");
    const readied = signals.find((signal) => signal.kind === "player.sourcesReadied");
    assert.equal(draw.amount, 2);
    assert.equal(draw.reason, "empty-hand");
    assert.equal(reserve.amount, 2);
    assert.deepEqual(readied.cardIds, [firstSource.instanceId, secondSource.instanceId]);
    assert.equal(signals.some((signal) => signal.kind === "turn.started" && signal.side === "player"), true);
  });
});

test("Source limit, Stabilizing and aerial defense failures have semantic codes", async () => {
  await withStoreHarness(async () => {
    const sourceGame = createTestGame("signals-source-limit");
    preparePlayerMain(sourceGame);
    addSources(sourceGame, 4);
    const fifth = addCard(sourceGame, cardFromDeck("river_of_elarion", "player", "hand"));
    load(sourceGame);
    useGameStore.getState().playLand(fifth.instanceId);
    assert.equal(useGameStore.getState().game.lastActionResult.code, "SOURCE_LIMIT_REACHED");
    assert.equal(lastDenial().code, "SOURCE_LIMIT_REACHED");

    const attackGame = createTestGame("signals-stabilizing");
    preparePlayerCombat(attackGame);
    addCard(attackGame, customCard("archive-guard", "host", { zone: "archive" }));
    const stabilizing = addCard(attackGame, customCard("new-echo", "player"));
    stabilizing.stabilizing = true;
    load(attackGame);
    useGameStore.getState().toggleAttacker(stabilizing.instanceId);
    assert.equal(useGameStore.getState().game.lastActionResult.code, "STABILIZING");
    assert.equal(lastDenial().code, "STABILIZING");

    const defenseGame = createTestGame("signals-flying-block");
    defenseGame.openingHandAccepted = true;
    defenseGame.activeSide = "host";
    defenseGame.phase = "combat";
    const blocker = addCard(defenseGame, customCard("ground-blocker", "player"));
    const flyer = addCard(defenseGame, customCard("flying-attacker", "host", { traits: ["FLYING"] }));
    defenseGame.combat.hostAttackers = [flyer.instanceId];
    load(defenseGame);
    useGameStore.getState().declareBlocker(blocker.instanceId, flyer.instanceId);
    assert.equal(useGameStore.getState().game.lastActionResult.code, "BLOCK_REQUIRES_FLYING_OR_SKYGUARD");
    assert.equal(lastDenial().code, "BLOCK_REQUIRES_FLYING_OR_SKYGUARD");
  });
});

test("Host reveal, Surge, attacker order, life impact and outcome are projected semantically", () => {
  const beforeReveal = createTestGame("signals-host-flow");
  beforeReveal.openingHandAccepted = true;
  beforeReveal.activeSide = "host";
  beforeReveal.phase = "host";
  beforeReveal.hostTurnNumber = 9;
  const first = addCard(beforeReveal, customCard("surge-one", "host", { zone: "archive", isToken: true, subtypes: ["ZOMBIE"] }));
  const second = addCard(beforeReveal, customCard("surge-two", "host", { zone: "archive", isToken: true, subtypes: ["ZOMBIE"] }));
  const third = addCard(beforeReveal, customCard("surge-three", "host", { zone: "archive", isToken: true, subtypes: ["ZOMBIE"] }));

  const afterReveal = runHostMain(beforeReveal, { deferInvokedTriggers: true });
  const revealSignals = gameplaySignalsForTransition(beforeReveal, afterReveal);
  const reveal = revealSignals.find((signal) => signal.kind === "host.cardsRevealed");
  assert.deepEqual(reveal.cardIds, [first.instanceId, second.instanceId, third.instanceId]);
  assert.equal(reveal.reason, "surge");
  assert.equal(revealSignals.some((signal) => signal.kind === "host.surgeStarted"), true);
  assert.equal(revealSignals.some((signal) => signal.kind === "turn.started" && signal.side === "host"), true);

  const begun = beginHostCombat(afterReveal, { deferTriggeredEvents: true });
  const declared = declareHostAttackers(begun, { deferTriggeredEvents: true });
  const attackSignals = gameplaySignalsForTransition(begun, declared);
  assert.deepEqual(
    attackSignals.find((signal) => signal.kind === "host.attackersDeclared").attackerIds,
    [first.instanceId, second.instanceId, third.instanceId],
  );

  const defeated = structuredClone(declared);
  defeated.player.life -= 4;
  defeated.winner = "host";
  const impactSignals = gameplaySignalsForTransition(declared, defeated, { lifeLossSourceId: first.instanceId });
  const impact = impactSignals.find((signal) => signal.kind === "player.lifeLost");
  assert.equal(impact.amount, 4);
  assert.equal(impact.sourceId, first.instanceId);
  assert.equal(impactSignals.some((signal) => signal.kind === "game.ended" && signal.winner === "host"), true);
});

test("the first Surge pauses after its animation and before the Host reveals", async () => {
  await withStoreHarness(async () => {
    const game = createTestGame("signals-surge-explanation-seam");
    game.openingHandAccepted = true;
    game.activeSide = "host";
    game.phase = "host";
    game.setupTurnsRemaining = 0;
    game.hostTurnNumber = 9;
    const first = addCard(game, customCard("surge-pause-one", "host", { zone: "archive", isToken: true, subtypes: ["ZOMBIE"] }));
    const second = addCard(game, customCard("surge-pause-two", "host", { zone: "archive", isToken: true, subtypes: ["ZOMBIE"] }));
    const third = addCard(game, customCard("surge-pause-three", "host", { zone: "archive", isToken: true, subtypes: ["ZOMBIE"] }));
    load(game);

    useGameStore.getState().runHostMain();
    const transitioning = useGameStore.getState();
    assert.equal(transitioning.surgeTransitionActive, true);
    assert.equal(transitioning.surgeRevealPending, false);
    assert.equal(transitioning.game.hostTurnNumber, 9);
    assert.deepEqual(transitioning.game.host.archive.map((card) => card.instanceId), [
      first.instanceId,
      second.instanceId,
      third.instanceId,
    ]);

    useGameStore.getState().completeSurgeTransition();
    const paused = useGameStore.getState();
    assert.equal(paused.surgeTransitionActive, false);
    assert.equal(paused.surgeRevealPending, true);
    assert.equal(paused.game.hostTurnNumber, 10);
    assert.deepEqual(paused.game.host.archive.map((card) => card.instanceId), [
      first.instanceId,
      second.instanceId,
      third.instanceId,
    ]);
    assert.equal(gameplaySignalStream.snapshot().signals.some((signal) => signal.kind === "host.surgeStarted"), true);
    assert.equal(gameplaySignalStream.snapshot().signals.some((signal) => signal.kind === "host.cardsRevealed"), false);

    useGameStore.getState().continueSurgeAfterExplanation();
    const revealed = useGameStore.getState();
    assert.equal(revealed.surgeRevealPending, false);
    assert.deepEqual(revealed.game.host.archive, []);
    assert.deepEqual(revealed.game.host.field.map((card) => card.instanceId), [
      first.instanceId,
      second.instanceId,
      third.instanceId,
    ]);

    const signals = gameplaySignalStream.snapshot().signals;
    const surgeIndex = signals.findIndex((signal) => signal.kind === "host.surgeStarted");
    const revealIndex = signals.findIndex((signal) => signal.kind === "host.cardsRevealed");
    assert.ok(surgeIndex >= 0);
    assert.ok(revealIndex > surgeIndex);
  });
});

function lastDenial() {
  return gameplaySignalStream.snapshot().signals.filter((signal) => signal.kind === "action.denied").at(-1);
}

function load(game) {
  useGameStore.getState().loadScenario(game, {
    playerDeckId: "pact_of_elarion",
    hostDeckId: "uprising_of_the_graveless",
  });
}

function preparePlayerMain(game) {
  game.openingHandAccepted = true;
  game.activeSide = "player";
  game.phase = "main";
  game.setupTurnsRemaining = 0;
}

function preparePlayerCombat(game) {
  preparePlayerMain(game);
  game.phase = "combat";
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
  gameplaySignalStream.reset();
  try {
    await run();
  } finally {
    guidedInteractionGate.reset();
    gameplaySignalStream.reset();
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
