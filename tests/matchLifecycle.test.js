import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { importCanonMatchOrigin, createOpaqueMatchOrigin } from "../src/content/MatchOrigin";
import {
  beginHistoryAttempt,
  closeHistoryAttempt,
  createEmptyHistoryEnvelopeV1,
} from "../src/history/historyDomain";
import { MatchLifecycleCoordinator } from "../src/history/matchLifecycle";
import { nextDestinyTransitionPhase } from "../src/components/destinyTransitionBarrier";

const CANON_ORIGIN = importCanonMatchOrigin("HF1-ELA-GRV-082-QC5");

function opaqueOrigin({ seed = "ordinary", mode = "standard" } = {}) {
  return createOpaqueMatchOrigin({
    rngSeed: seed,
    playerDeckKey: "pact_of_elarion",
    hostDeckKey: "uprising_of_the_graveless",
    difficulty: "normal",
    preparationTurns: 3,
    gameMode: mode,
  });
}

class FakeHistoryPort {
  history = createEmptyHistoryEnvelopeV1();
  calls = [];
  initializeCalls = 0;
  recoverCalls = 0;
  initializeGate;
  beginGate;
  closeGate;
  failBegin = false;
  failClose = false;

  async initialize() {
    this.initializeCalls += 1;
    this.calls.push("initialize");
    if (this.initializeGate) await this.initializeGate.promise;
    return this.snapshot(false);
  }

  async begin(input) {
    this.calls.push(`begin:${input.attemptId}`);
    const begun = beginHistoryAttempt(this.history, input);
    this.history = begun.history;
    if (this.beginGate) await this.beginGate.promise;
    if (this.failBegin) return this.result(true, false, "applied", begun.attempt, "begin failed");
    return this.result(true, true, "applied", begun.attempt);
  }

  async close(input) {
    this.calls.push(`close:${input.attemptId}:${input.endReason}`);
    const closed = closeHistoryAttempt(this.history, input);
    this.history = closed.history;
    if (this.closeGate) await this.closeGate.promise;
    if (this.failClose) return this.result(closed.changed, false, closed.changed ? "applied" : "unchanged", closed.attempt, "close failed");
    return this.result(closed.changed, true, closed.changed ? "applied" : "unchanged", closed.attempt);
  }

  async recoverActiveAttempts(recoveredAt) {
    this.recoverCalls += 1;
    this.calls.push("recover");
    let changed = false;
    for (const attempt of this.history.attempts) {
      if (attempt.status !== "active") continue;
      const closed = closeHistoryAttempt(this.history, {
        attemptId: attempt.attemptId,
        status: "interrupted",
        endReason: "startup-recovery",
        endedAt: recoveredAt,
      });
      this.history = closed.history;
      changed ||= closed.changed;
    }
    return this.result(changed, true, changed ? "applied" : "unchanged");
  }

  result(applied, durable, reason, attempt, lastError) {
    return Object.freeze({
      applied,
      durable,
      reason,
      ...(attempt ? { attempt } : {}),
      snapshot: this.snapshot(!durable, lastError),
    });
  }

  snapshot(dirty, lastError) {
    return Object.freeze({
      phase: "ready",
      health: dirty ? "degraded" : "healthy",
      history: this.history,
      writable: true,
      dirty,
      logicalRevision: this.history.attempts.length,
      durableRevision: dirty ? 0 : this.history.attempts.length,
      ...(lastError ? { lastError } : {}),
    });
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(options = {}) {
  const history = options.history ?? new FakeHistoryPort();
  const listeners = new Set();
  const warnings = [];
  const ids = ["attempt-one", "attempt-two", "attempt-three"];
  let nowIndex = 0;
  let session = {
    sessionId: "game:0",
    turnNumber: 1,
    hostTurnNumber: 0,
    playerLife: 20,
    hostArchiveRemaining: 30,
  };
  const coordinator = new MatchLifecycleCoordinator({
    enabled: options.enabled ?? true,
    recoverActiveOnInitialize: options.recover ?? true,
    history: options.enabled === false ? undefined : history,
    appVersion: "test",
    readSession: () => session,
    subscribeOutcomes: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createAttemptId: () => ids.shift() ?? "attempt-extra",
    now: () => new Date(Date.UTC(2026, 7, 21, 12, nowIndex++)).toISOString(),
    settleTimeoutMs: options.timeoutMs ?? 30,
    initializeTimeoutMs: options.timeoutMs ?? 30,
  });
  coordinator.subscribe(() => {
    if (coordinator.snapshot().lastWarning) warnings.push(coordinator.snapshot().lastWarning);
  });
  const commit = (overrides = {}) => () => {
    const number = Number(session.sessionId.split(":")[1]) + 1;
    session = { ...session, ...overrides, sessionId: `game:${number}` };
  };
  return {
    coordinator,
    history,
    warnings,
    commit,
    emit: (winner, sessionId = session.sessionId) => {
      for (const listener of listeners) listener({ winner, sessionId });
    },
    readSession: () => session,
    setSession: (patch) => { session = { ...session, ...patch }; },
  };
}

function launch(h, overrides = {}) {
  return h.coordinator.beginLaunch({
    source: overrides.source ?? "play",
    sessionKind: overrides.sessionKind ?? "normal",
    origin: overrides.origin ?? CANON_ORIGIN,
    commit: overrides.commit ?? h.commit(),
  });
}

test("the launch matrix records only normal standard matches after the reset commits", async () => {
  const cases = [
    ["normal", CANON_ORIGIN, true],
    ["tutorial", CANON_ORIGIN, false],
    ["journey", CANON_ORIGIN, false],
    ["initial-session", CANON_ORIGIN, false],
    ["playground", CANON_ORIGIN, false],
    ["seed-explorer", CANON_ORIGIN, false],
    ["developer", opaqueOrigin({ seed: "developer" }), false],
    ["normal", opaqueOrigin({ mode: "chaos" }), false],
  ];
  for (const [sessionKind, origin, expected] of cases) {
    const h = harness();
    const order = [];
    const handle = launch(h, {
      sessionKind,
      origin,
      commit: () => {
        order.push("commit");
        h.commit()();
      },
    });
    order.push(handle.attemptId ? "attempt" : "excluded");
    await handle.settled;
    assert.equal(handle.committed, true);
    assert.deepEqual(order, ["commit", expected ? "attempt" : "excluded"]);
    assert.equal(h.history.history.attempts.length, expected ? 1 : 0);
    h.coordinator.dispose();
  }
});

test("a disabled history preset commits gameplay without touching persistence or outcomes", async () => {
  const h = harness({ enabled: false });
  const handle = launch(h);
  assert.equal(handle.committed, true);
  assert.equal((await handle.settled).state, "excluded");
  h.emit("player");
  assert.equal(h.coordinator.snapshot().outcomeGate, undefined);
});

test("double launch is rejected and a later launch gets a fresh id only after close", async () => {
  const h = harness();
  const first = launch(h);
  await first.settled;
  const duplicate = launch(h);
  assert.equal(duplicate.committed, false);
  assert.equal(duplicate.reason, "busy");
  assert.equal(h.readSession().sessionId, "game:1");

  await h.coordinator.closeActive("rewrite");
  const second = launch(h, { source: "rewrite" });
  await second.settled;
  assert.equal(second.committed, true);
  assert.notEqual(first.attemptId, second.attemptId);
  assert.deepEqual(h.history.history.attempts.map(({ status }) => status), ["interrupted", "active"]);
});

test("the shared launch spec accepts every product origin without changing its presentation", async () => {
  for (const source of ["play", "history-replay", "rewrite", "learn-to-play-handoff"]) {
    const h = harness();
    const handle = launch(h, { source });
    await handle.settled;
    assert.equal(handle.committed, true);
    assert.equal(h.coordinator.snapshot().active.source, source);
  }
});

test("begin and close remain ordered even when neither caller awaits begin", async () => {
  const h = harness();
  h.history.beginGate = deferred();
  const started = launch(h);
  const closed = h.coordinator.closeActive("menu");
  await Promise.resolve();
  assert.equal(h.history.calls.some((call) => call.includes("close:")), false);
  h.history.beginGate.resolve();
  await Promise.all([started.settled, closed]);
  assert.deepEqual(h.history.calls.filter((call) => call.startsWith("begin:") || call.startsWith("close:")), [
    "begin:attempt-one",
    "close:attempt-one:menu",
  ]);
  assert.equal(h.history.history.attempts[0].status, "interrupted");
});

test("a degraded begin still closes over the logical dirty attempt", async () => {
  const h = harness();
  h.history.failBegin = true;
  const started = launch(h);
  assert.equal((await started.settled).state, "degraded");
  h.history.failBegin = false;
  const closed = await h.coordinator.closeActive("menu");
  assert.equal(closed.state, "durable");
  assert.equal(h.history.history.attempts[0].status, "interrupted");
});

test("a timed-out begin releases UI while its queued close and next begin keep lifecycle order", async () => {
  const h = harness({ timeoutMs: 5 });
  h.history.beginGate = deferred();
  const first = launch(h);
  assert.equal((await first.settled).state, "degraded");
  const closing = h.coordinator.closeActive("rewrite");
  assert.equal((await closing).state, "degraded");
  const second = launch(h, { source: "rewrite" });
  assert.equal(second.committed, true);
  h.history.beginGate.resolve();
  await waitFor(() => h.history.history.attempts.length === 2);
  await waitFor(() => h.history.history.attempts[0].status === "interrupted");
  assert.deepEqual(h.history.calls.filter((call) => call.startsWith("begin:") || call.startsWith("close:")).slice(0, 3), [
    "begin:attempt-one",
    "close:attempt-one:rewrite",
    "begin:attempt-two",
  ]);
});

test("slow hydration can time out the reveal gate without beginning before startup recovery", async () => {
  const h = harness({ timeoutMs: 5 });
  h.history.initializeGate = deferred();
  const started = launch(h);
  assert.equal((await started.settled).state, "degraded");
  assert.deepEqual(h.history.calls, ["initialize"]);
  h.history.initializeGate.resolve();
  await waitFor(() => h.history.history.attempts.length === 1);
  assert.deepEqual(h.history.calls.slice(0, 3), ["initialize", "recover", "begin:attempt-one"]);
});

test("outcomes synchronously install a gate and persist immutable victory or defeat facts", async () => {
  for (const winner of ["player", "host"]) {
    const h = harness();
    h.history.closeGate = deferred();
    const started = launch(h);
    await started.settled;
    h.setSession({ turnNumber: 9, hostTurnNumber: 8, playerLife: winner === "player" ? 7 : 0, hostArchiveRemaining: winner === "player" ? 0 : 12 });
    const endingSession = h.readSession().sessionId;
    h.emit(winner);
    assert.deepEqual(h.coordinator.snapshot().outcomeGate, { sessionId: endingSession, state: "pending" });
    assert.equal(h.coordinator.outcomeReady(endingSession), false);
    h.setSession({ turnNumber: 99, playerLife: -99, hostArchiveRemaining: 29 });
    h.history.closeGate.resolve();
    await waitFor(() => h.coordinator.outcomeReady(endingSession));
    const attempt = h.history.history.attempts[0];
    assert.equal(attempt.status, winner === "player" ? "victory" : "defeat");
    assert.equal(attempt.turnNumber, 9);
    assert.deepEqual(attempt.finalFacts, {
      playerLife: winner === "player" ? 7 : 0,
      hostArchiveRemaining: winner === "player" ? 0 : 12,
    });
  }
});

test("menu, rewrite and contemplate capture one explicit interruption and no per-turn autosave", async () => {
  for (const reason of ["menu", "rewrite", "contemplate"]) {
    const h = harness();
    await launch(h).settled;
    h.setSession({ turnNumber: 6, hostTurnNumber: 5, playerLife: 11, hostArchiveRemaining: 17 });
    assert.equal(h.history.calls.filter((call) => call.startsWith("begin:")).length, 1);
    await h.coordinator.closeActive(reason);
    const attempt = h.history.history.attempts[0];
    assert.equal(attempt.status, "interrupted");
    assert.equal(attempt.endReason, reason);
    assert.equal(attempt.turnNumber, 6);
    assert.equal(await h.coordinator.closeActive(reason).then((result) => result.state), "unchanged");
  }
});

test("old outcome callbacks cannot close the current attempt", async () => {
  const h = harness();
  const first = launch(h);
  await first.settled;
  const oldSession = first.sessionId;
  await h.coordinator.closeActive("rewrite");
  const second = launch(h, { source: "rewrite" });
  await second.settled;
  h.emit("host", oldSession);
  assert.equal(h.history.history.attempts[1].status, "active");
  assert.equal(h.coordinator.snapshot().outcomeGate, undefined);
});

test("initialization is single-flight and startup recovery is idempotent across reopenings", async () => {
  const history = new FakeHistoryPort();
  history.history = beginHistoryAttempt(history.history, {
    attemptId: "abandoned",
    future: {
      seedKind: "canon",
      format: "HF1",
      canonCode: CANON_ORIGIN.canonCode,
      rngSeed: CANON_ORIGIN.rngSeed,
      playerDeckKey: CANON_ORIGIN.playerDeckKey,
      hostDeckKey: CANON_ORIGIN.hostDeckKey,
      difficulty: CANON_ORIGIN.difficulty,
      gameMode: "standard",
      setupTurns: CANON_ORIGIN.preparationTurns,
    },
    appVersion: "old",
    observedContentRevision: CANON_ORIGIN.observedContentRevision,
    startedAt: "2026-08-21T10:00:00.000Z",
  }).history;
  const first = harness({ history });
  const initA = first.coordinator.initialize();
  const initB = first.coordinator.initialize();
  assert.equal(initA, initB);
  await initA;
  assert.equal(history.initializeCalls, 1);
  assert.equal(history.recoverCalls, 1);
  assert.equal(history.history.attempts[0].status, "interrupted");

  const reopened = harness({ history });
  await reopened.coordinator.initialize();
  assert.equal(history.history.attempts.length, 1);
  assert.equal(history.history.attempts[0].endReason, "startup-recovery");
});

test("a crash between turns leaves active untouched until the next startup recovery", async () => {
  const history = new FakeHistoryPort();
  const first = harness({ history });
  await launch(first).settled;
  first.setSession({ turnNumber: 12, hostTurnNumber: 11 });
  assert.equal(history.history.attempts[0].status, "active");
  assert.equal(history.history.attempts[0].turnNumber, undefined);
  first.coordinator.dispose();

  const reopened = harness({ history });
  await reopened.coordinator.initialize();
  assert.equal(history.history.attempts[0].status, "interrupted");
  assert.equal(history.history.attempts[0].turnNumber, undefined);
});

test("the vortex state machine holds both normal and reduced-motion paths until release", () => {
  for (const presentation of ["animated", "reduced-motion"]) {
    let phase = "absorbing";
    phase = nextDestinyTransitionPhase(phase, "release");
    assert.equal(phase, "absorbing", `${presentation} cannot reveal before cover`);
    phase = nextDestinyTransitionPhase(phase, "cover");
    assert.equal(phase, "covered");
    phase = nextDestinyTransitionPhase(phase, "complete");
    assert.equal(phase, "covered", `${presentation} cannot complete while held`);
    phase = nextDestinyTransitionPhase(phase, "release");
    assert.equal(phase, "revealing");
    phase = nextDestinyTransitionPhase(phase, "complete");
    assert.equal(phase, "complete");
  }
});

test("App, Board and the vortex expose the lifecycle barriers without mounting React", async () => {
  const [app, board, vortex] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DestinyRewriteTransition.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /productMatchLifecycle\.beginLaunch\(/u);
  assert.match(app, /productMatchLifecycle\.closeActive\("menu"\)/u);
  assert.match(app, /productMatchLifecycle\.closeActive\("rewrite"\)/u);
  assert.match(app, /productMatchLifecycle\.closeActive\("contemplate"\)/u);
  assert.match(app, /outcomePersistenceReady=\{productMatchLifecycle\.outcomeReady/u);
  assert.match(board, /outcomePersistenceReady\s*&&\s*destinyDialSettled/u);
  assert.match(vortex, /onCovered: \(transitionId: number, release: \(\) => void\) => void/u);
  assert.match(vortex, /setPhase\(\(current\) => nextDestinyTransitionPhase\(current, "release"\)\)/u);
});

async function waitFor(predicate, timeoutMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail("Timed out waiting for lifecycle state.");
}
