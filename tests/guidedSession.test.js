import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GUIDED_LESSON_SCHEMA_VERSION,
  createGameStoreGuidedLessonHost,
  GuidedBeatBarrier,
  GuidedInteractionGate,
  GuidedLessonOrchestrator,
  GuidedLessonRegistry,
  GuidedPresentationActivityRegistry,
  GuidedSessionStore,
  guidedSessionStore,
} from "../src/guidance";
import { useAudioStore } from "../src/store/useAudioStore";
import { useGameStore } from "../src/store/useGameStore";
import { contentCatalog } from "../src/content/bootstrap";
import { GUIDANCE_LAB_LESSON, GUIDANCE_LAB_REGISTRY } from "../src/playground/guidanceLabDefinition";

test("presentation activity tokens settle once and stale epochs cannot affect a new board", () => {
  const registry = new GuidedPresentationActivityRegistry();
  const first = registry.begin("hand.entry", "first-card");
  const second = registry.begin("reserve.transfer", "1");
  assert.equal(registry.snapshot().settled, false);
  assert.equal(registry.snapshot().activeCount, 2);

  assert.equal(first.end(), true);
  assert.equal(first.end(), false);
  registry.reset();
  assert.equal(registry.snapshot().settled, true);
  assert.equal(second.end(), false);
  assert.equal(registry.snapshot().activeCount, 0);
});

test("the beat barrier holds starts, releases current-epoch work and discards abandoned work", () => {
  const scheduled = [];
  const barrier = new GuidedBeatBarrier((callback) => scheduled.push(callback));
  const events = [];

  barrier.block();
  assert.equal(barrier.request("host.trigger", () => events.push("released")), false);
  assert.deepEqual(barrier.snapshot().pending, ["host.trigger"]);
  barrier.release();
  assert.deepEqual(events, []);
  scheduled.shift()();
  assert.deepEqual(events, ["released"]);

  barrier.block();
  assert.equal(barrier.request("player.trigger", () => events.push("stale")), false);
  barrier.invalidate();
  assert.deepEqual(barrier.snapshot().pending, []);
  assert.deepEqual(events, ["released"]);
});

test("a guided session follows Explain -> Act -> Observe -> settled checkpoint", () => {
  const scheduled = [];
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => scheduled.push(callback));
  const session = new GuidedSessionStore(gate, barrier);
  let settled = false;
  session.configureCheckpointProbe(() => settled, (callback) => scheduled.push(callback));
  session.start({ definition: fixtureLesson(), bindings: { source: "source-instance" }, sessionId: "cycle" });

  assert.equal(session.snapshot().mode, "explain");
  assert.equal(session.snapshot().canContinue, false);
  assert.equal(barrier.snapshot().blocked, true);
  assert.equal(gate.authorize({ kind: "card.play", cardId: "source-instance" }).allowed, false);

  // Reading has no clock: nothing changes until a real checkpoint signal arrives.
  assert.equal(session.snapshot().currentStep.id, "intro");
  settled = true;
  session.notifyCheckpointState(true);
  assert.equal(session.snapshot().canContinue, true);
  assert.equal(session.continueExplanation(), true);
  assert.equal(session.snapshot().mode, "act");

  assert.equal(gate.authorize({ kind: "card.play", cardId: "other" }).allowed, false);
  assert.equal(gate.authorize({ kind: "card.play", cardId: "source-instance" }).allowed, true);
  gate.publish({ kind: "source.played", cardId: "source-instance" });
  assert.equal(session.snapshot().mode, "observe");
  assert.equal(session.snapshot().observeReceiptSatisfied, true);
  assert.equal(session.snapshot().presentationSettled, false);
  assert.equal(barrier.snapshot().blocked, false);

  session.notifyCheckpointState(false);
  assert.equal(session.snapshot().currentStep.id, "watch");
  session.notifyCheckpointState(true);
  assert.equal(session.snapshot().currentStep.id, "settled");
  assert.equal(session.snapshot().mode, "explain");
  assert.equal(barrier.snapshot().blocked, true);

  session.notifyCheckpointState(true);
  assert.equal(session.continueExplanation(), true);
  assert.equal(session.snapshot().status, "completed");
  assert.equal(barrier.snapshot().blocked, false);
  assert.equal(gate.authorize({ kind: "opening.mulligan" }).allowed, true);
});

test("a receipt does not finish Observe until presentation settles, regardless of duration", () => {
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => callback());
  const activity = new GuidedPresentationActivityRegistry();
  const session = new GuidedSessionStore(gate, barrier);
  session.configureCheckpointProbe(() => activity.snapshot().settled, (callback) => callback());
  activity.subscribe((snapshot) => session.notifyCheckpointState(snapshot.settled));
  session.start({ definition: fixtureLesson(), bindings: { source: "source-instance" }, sessionId: "motion" });
  session.notifyCheckpointState(true);
  session.continueExplanation();

  const token = activity.begin("host.trigger-beat", "fixture");
  gate.publish({ kind: "source.played", cardId: "source-instance" });
  assert.equal(session.snapshot().mode, "observe");
  assert.equal(session.snapshot().currentStep.id, "watch");

  token.end();
  assert.equal(session.snapshot().mode, "explain");
  assert.equal(session.snapshot().currentStep.id, "settled");
});

test("one strict interaction can continue directly into its next authored commitment", () => {
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => callback());
  const session = new GuidedSessionStore(gate, barrier);
  session.start({
    definition: {
      id: "multi-commit-fixture",
      revision: 1,
      startStepId: "play",
      steps: [
        {
          id: "play",
          kind: "act",
          copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
          highlights: [],
          allowedIntent: { kind: "card.play", cardAlias: "source" },
          nextStepId: "choose-target",
        },
        {
          id: "choose-target",
          kind: "act",
          copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
          highlights: [],
          allowedIntent: { kind: "target.choose", context: "trigger" },
        },
      ],
    },
    bindings: { source: "source-instance" },
    sessionId: "multi-commit",
  });

  assert.equal(gate.authorize({ kind: "card.play", cardId: "source-instance" }).allowed, true);
  gate.publish({ kind: "card.played", cardId: "source-instance" });
  assert.equal(session.snapshot().currentStep.id, "choose-target");
  assert.equal(session.snapshot().mode, "act");
  assert.equal(gate.authorize({ kind: "target.choose", context: "trigger", targetId: "any-legal-target" }).allowed, true);
  assert.equal(gate.authorize({ kind: "phase.endTurn" }).allowed, false);
});

test("reset aborts the session and invalidates a retained continuation", () => {
  const scheduled = [];
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => scheduled.push(callback));
  const session = new GuidedSessionStore(gate, barrier);
  session.start({ definition: fixtureLesson(), bindings: { source: "source-instance" }, sessionId: "abort" });
  let ran = false;
  barrier.request("host.combat", () => { ran = true; });

  session.invalidate("presentation-reset");
  assert.equal(session.snapshot().status, "aborted");
  assert.equal(session.snapshot().endReason, "presentation-reset");
  assert.deepEqual(barrier.snapshot().pending, []);
  for (const callback of scheduled) callback();
  assert.equal(ran, false);
});

test("a game outcome leaves the guide in an explicit terminal state", () => {
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => callback());
  const session = new GuidedSessionStore(gate, barrier);
  session.start({ definition: fixtureLesson(), bindings: { source: "source-instance" }, sessionId: "outcome" });

  session.notifyGameEnded();
  assert.equal(session.snapshot().status, "aborted");
  assert.equal(session.snapshot().endReason, "game-ended");
  assert.equal(barrier.snapshot().blocked, false);
  assert.equal(gate.authorize({ kind: "opening.mulligan" }).allowed, true);
});

test("a broken authored precondition fails closed without escaping through a gameplay receipt", () => {
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => callback());
  const session = new GuidedSessionStore(gate, barrier);
  const lesson = fixtureLesson();
  lesson.steps[2].preconditions = [
    { kind: "card.inZone", cardAlias: "source", side: "player", zone: "field" },
  ];
  const game = preconditionGame("source-instance", "hand");
  session.start({
    definition: lesson,
    bindings: { source: "source-instance" },
    sessionId: "broken-precondition",
    gameState: () => game,
  });
  session.notifyCheckpointState(true);
  session.continueExplanation();

  assert.doesNotThrow(() => gate.publish({ kind: "source.played", cardId: "source-instance" }));
  assert.equal(session.snapshot().status, "aborted");
  assert.equal(session.snapshot().endReason, "error");
  assert.match(session.snapshot().errorMessage, /card\.inZone\(source,player\.field\)/u);
  assert.equal(barrier.snapshot().blocked, false);
  assert.equal(gate.authorize({ kind: "opening.mulligan" }).allowed, true);
});

test("one orchestrator starts and reconstructs the same step model across Chronicle fixtures", () => {
  const crimsonLesson = structuredClone(GUIDANCE_LAB_LESSON);
  crimsonLesson.id = "guidance-lab-crimson-source";
  crimsonLesson.scenario.seed = "guidance-lab-crimson-source-v1";
  crimsonLesson.scenario.playerDeckKey = "hostfall.core/court_of_the_crimson_eclipse";
  crimsonLesson.cards.source_to_play.cardKey = "hostfall.core/court_of_the_crimson_eclipse/sanctuary_of_the_red_moon";
  crimsonLesson.cards.next_player_card.cardKey = "hostfall.core/court_of_the_crimson_eclipse/blood_page";
  const registry = new GuidedLessonRegistry(contentCatalog, [GUIDANCE_LAB_LESSON, crimsonLesson]);
  const gate = new GuidedInteractionGate();
  const barrier = new GuidedBeatBarrier((callback) => callback());
  const session = new GuidedSessionStore(gate, barrier);
  let activeGame;
  const loadedDecks = [];
  const events = [];
  let stopCount = 0;
  const orchestrator = new GuidedLessonOrchestrator(contentCatalog, registry, session, {
    loadBoard(board) {
      activeGame = board.game;
      loadedDecks.push(board.playerDeckId);
    },
    stopPresentation() {
      stopCount += 1;
    },
    readGame() {
      return activeGame;
    },
  });
  orchestrator.subscribe((event) => events.push(event));

  orchestrator.start(GUIDANCE_LAB_LESSON.id, { sessionId: "elarion-orchestrated" });
  assert.equal(activeGame.player.hand[0].definitionId, "river_of_elarion");
  assert.equal(session.snapshot().currentStep.id, "explain-source");

  orchestrator.start(crimsonLesson.id, { sessionId: "crimson-orchestrated" });
  assert.equal(activeGame.player.hand[0].definitionId, "sanctuary_of_the_red_moon");
  assert.equal(session.snapshot().currentStep.id, "explain-source");
  activeGame.player.hand.length = 0;
  orchestrator.restart({ sessionId: "crimson-restarted" });
  assert.equal(activeGame.player.hand[0].definitionId, "sanctuary_of_the_red_moon");
  assert.deepEqual(loadedDecks, ["pact_of_elarion", "court_of_the_crimson_eclipse", "court_of_the_crimson_eclipse"]);
  orchestrator.stop();
  assert.equal(stopCount, 1);
  const brokenLesson = structuredClone(crimsonLesson);
  brokenLesson.id = "guidance-lab-broken-precondition";
  brokenLesson.steps[0].preconditions = [{ kind: "phase.is", phase: "host" }];
  assert.throws(
    () => orchestrator.startDefinition(brokenLesson, { sessionId: "broken-orchestrated" }),
    /failed precondition phase\.is\(host\)/u,
  );
  assert.deepEqual(events.map((event) => event.kind), [
    "lesson.started",
    "lesson.started",
    "lesson.restarted",
    "lesson.stopped",
    "lesson.failed",
  ]);
  assert.deepEqual(events.map((event) => event.cursor), [1, 2, 3, 4, 5]);
});

test("the Developer Guidance Lab runs the vertical slice on the real GameStore", async () => {
  await withStoreHarness(async () => {
    const orchestrator = new GuidedLessonOrchestrator(
      contentCatalog,
      GUIDANCE_LAB_REGISTRY,
      guidedSessionStore,
      createGameStoreGuidedLessonHost(useGameStore),
    );
    orchestrator.start(GUIDANCE_LAB_LESSON.id, { sessionId: "real-store-lab" });
    guidedSessionStore.notifyCheckpointState(true);
    assert.equal(guidedSessionStore.continueExplanation(), true);

    const sourceId = guidedSessionStore.snapshot().bindings.source_to_play;
    useGameStore.getState().playLand(sourceId);
    assert.equal(guidedSessionStore.snapshot().mode, "observe");
    assert.equal(useGameStore.getState().game.player.field.some((card) => card.instanceId === sourceId), true);
    assert.equal(useGameStore.getState().landPlayAnimationQueue.length, 1);

    const animationId = useGameStore.getState().landPlayAnimationQueue[0].id;
    useGameStore.getState().completeLandPlayAnimation(animationId);
    assert.equal(guidedSessionStore.snapshot().mode, "explain");
    assert.equal(guidedSessionStore.snapshot().currentStep.id, "source-settled");
  });
});

function preconditionGame(sourceId, zone) {
  const source = { instanceId: sourceId };
  return {
    phase: "main",
    activeSide: "player",
    setupTurnsRemaining: 0,
    player: {
      energyPool: { available: 0, stored: 0 },
      archive: [],
      hand: zone === "hand" ? [source] : [],
      field: zone === "field" ? [source] : [],
      memory: [],
      oblivion: [],
    },
    host: { archive: [], field: [], memory: [], oblivion: [] },
  };
}

function fixtureLesson() {
  return {
    schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
    id: "session-fixture",
    revision: 1,
    mode: "optional",
    startStepId: "intro",
    scenario: {},
    cards: { source: { cardKey: "fixture/source" } },
    steps: [
      {
        id: "intro",
        kind: "explain",
        copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
        highlights: [],
        nextStepId: "act",
      },
      {
        id: "act",
        kind: "act",
        copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
        highlights: [],
        allowedIntent: { kind: "card.play", cardAlias: "source" },
        nextStepId: "watch",
      },
      {
        id: "watch",
        kind: "observe",
        copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
        highlights: [],
        expectedReceipt: { kind: "source.played", cardAlias: "source" },
        nextStepId: "settled",
      },
      {
        id: "settled",
        kind: "explain",
        copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
        highlights: [],
      },
    ],
  };
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
    requestAnimationFrame: (callback) => {
      queueMicrotask(() => callback(0));
      return 1;
    },
    localStorage: memoryStorage(),
    navigator: { language: "en" },
  };
  globalThis.document = { querySelector: () => undefined };
  useAudioStore.setState({ playSfx: () => undefined, stopAllSfx: () => undefined });
  try {
    await run();
  } finally {
    useGameStore.getState().stopGamePresentation();
    guidedSessionStore.resetForTests();
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
