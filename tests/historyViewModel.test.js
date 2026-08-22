import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { contentCatalog } from "../src/content/bootstrap";
import { createOpaqueMatchOrigin, importCanonMatchOrigin, OPAQUE_MATCH_RULESET_VERSION } from "../src/content/MatchOrigin";
import {
  beginHistoryAttempt,
  closeHistoryAttempt,
  createEmptyHistoryEnvelopeV1,
} from "../src/history/historyDomain";
import { futureIdentityFromMatchOrigin } from "../src/history/historyFuture";
import { buildHistoryLibraryViewModel } from "../src/history/historyViewModel";

const PLAYER_DECK = "hostfall.core/pact_of_elarion";
const HOST_DECK = "hostfall.core/uprising_of_the_graveless";

function snapshot(history = createEmptyHistoryEnvelopeV1(), overrides = {}) {
  return {
    phase: "ready",
    health: "healthy",
    history,
    writable: true,
    dirty: false,
    logicalRevision: history.attempts.length,
    durableRevision: history.attempts.length,
    ...overrides,
  };
}

function opaqueFuture(seed, overrides = {}) {
  return {
    ...futureIdentityFromMatchOrigin(createOpaqueMatchOrigin({
    rngSeed: seed,
    playerDeckKey: PLAYER_DECK,
    hostDeckKey: HOST_DECK,
    difficulty: "normal",
    preparationTurns: 3,
    gameMode: "standard",
    })),
    ...overrides,
  };
}

function begin(history, attemptId, future) {
  return beginHistoryAttempt(history, {
    attemptId,
    future,
    appVersion: "test",
    observedContentRevision: contentCatalog.revision,
    startedAt: "2026-08-21T12:00:00.000Z",
  }).history;
}

function close(history, attemptId, status, milestones) {
  if (status === "interrupted") {
    return closeHistoryAttempt(history, {
      attemptId,
      status,
      endReason: "menu",
      endedAt: "2026-08-21T12:05:00.000Z",
      turnNumber: 4,
      finalFacts: { playerLife: 9, hostArchiveRemaining: 18 },
      ...(milestones ? { milestones } : {}),
    }).history;
  }
  return closeHistoryAttempt(history, {
    attemptId,
    status,
    endReason: "outcome",
    endedAt: "2026-08-21T12:05:00.000Z",
    turnNumber: status === "victory" ? 9 : 6,
    hostTurnNumber: status === "victory" ? 8 : 6,
    finalFacts: {
      playerLife: status === "victory" ? 7 : 0,
      hostArchiveRemaining: status === "victory" ? 0 : 14,
    },
    ...(milestones ? { milestones } : {}),
  }).history;
}

test("history library projects loading, empty, health, and all three Future states", () => {
  assert.equal(buildHistoryLibraryViewModel(snapshot(undefined, { phase: "loading" })).phase, "loading");
  assert.equal(buildHistoryLibraryViewModel(snapshot()).phase, "empty");
  for (const health of ["recovered", "degraded", "full", "corrupt"]) {
    assert.equal(buildHistoryLibraryViewModel(snapshot(undefined, { health })).health, health);
  }

  let history = createEmptyHistoryEnvelopeV1();
  const cases = [
    ["won", opaqueFuture("won-future"), "victory", "preserved"],
    ["lost", opaqueFuture("lost-future"), "defeat", "lost"],
    ["cut", opaqueFuture("cut-future"), "interrupted", "interrupted"],
  ];
  for (const [attemptId, future, attemptStatus] of cases) {
    history = begin(history, attemptId, future);
    history = close(history, attemptId, attemptStatus);
  }
  const model = buildHistoryLibraryViewModel(snapshot(history, { health: "recovered" }));
  assert.equal(model.phase, "ready");
  assert.equal(model.health, "recovered");
  assert.deepEqual(new Set(model.futures.map(({ status }) => status)), new Set(["preserved", "lost", "interrupted"]));
  assert.equal(model.futures.find(({ status }) => status === "interrupted").attempts[0].status, "interrupted");
});

test("rewrites keep chronological ordinals beyond five and preserve stable final facts", () => {
  const future = opaqueFuture("six-rewrites");
  let history = createEmptyHistoryEnvelopeV1();
  for (let index = 1; index <= 6; index += 1) {
    history = begin(history, `attempt-${index}`, future);
    history = close(history, `attempt-${index}`, index === 6 ? "victory" : "defeat");
  }
  const projected = buildHistoryLibraryViewModel(snapshot(history)).futures[0];
  assert.deepEqual(projected.attempts.map(({ ordinal }) => ordinal), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(projected.attempts.map(({ attemptId }) => attemptId), [
    "attempt-1", "attempt-2", "attempt-3", "attempt-4", "attempt-5", "attempt-6",
  ]);
  assert.deepEqual(projected.attempts[5].finalFacts, { playerLife: 7, hostArchiveRemaining: 0 });
});

test("persisted milestones reach the library unchanged so prose can follow the active language", () => {
  const future = opaqueFuture("narrated-future");
  let history = begin(createEmptyHistoryEnvelopeV1(), "narrated", future);
  const milestones = [{
    kind: "victory-source",
    turnNumber: 9,
    sourceKind: "archive-attack",
    sourceName: { es: "Vaelor, Guardián Esmeralda", en: "Vaelor, Emerald Guardian" },
  }];
  history = close(history, "narrated", "victory", milestones);
  const attempt = buildHistoryLibraryViewModel(snapshot(history)).futures[0].attempts[0];
  assert.deepEqual(attempt.milestones, milestones);
  assert.equal(Object.isFrozen(attempt.milestones), true);
});

test("cosmetic collisions remain separate and expose enough identity to distinguish them", () => {
  let history = begin(createEmptyHistoryEnvelopeV1(), "collision-a", opaqueFuture("collision-568"));
  history = begin(history, "collision-b", opaqueFuture("collision-1429", { difficulty: "hard" }));
  const futures = buildHistoryLibraryViewModel(snapshot(history)).futures;
  assert.equal(futures.length, 2);
  assert.equal(futures[0].code, futures[1].code);
  assert.equal(futures.every(({ collision }) => collision), true);
  assert.notEqual(futures[0].key, futures[1].key);
  assert.ok(futures.every(({ identityRevision }) => identityRevision.includes(contentCatalog.revision)));
});

test("Canon copy and replay use the exact resolved MatchOrigin while opaque identity stays local", () => {
  const canonOrigin = importCanonMatchOrigin("HF1-ELA-GRV-082-QC5");
  let history = begin(createEmptyHistoryEnvelopeV1(), "canon", futureIdentityFromMatchOrigin(canonOrigin));
  history = close(history, "canon", "victory");
  history = begin(history, "opaque", opaqueFuture("local-only"));
  const futures = buildHistoryLibraryViewModel(snapshot(history)).futures;
  const canon = futures.find(({ seedKind }) => seedKind === "canon");
  const opaque = futures.find(({ seedKind }) => seedKind === "opaque");

  assert.equal(canon.copyIdentity, canonOrigin.canonCode);
  assert.deepEqual(canon.replayOrigin, canonOrigin);
  assert.equal(opaque.copyIdentity, undefined);
  assert.equal(opaque.localOnly, true);
  assert.equal(opaque.replayOrigin.rngSeed, "local-only");
  assert.equal(opaque.replayOrigin.playerDeckKey, PLAYER_DECK);
  assert.equal(opaque.replayOrigin.hostDeckKey, HOST_DECK);
});

test("incompatible identities remain visible and never receive a fallback replay payload", () => {
  const oldFuture = {
    seedKind: "opaque",
    rngSeed: "old-future",
    playerDeckKey: PLAYER_DECK,
    hostDeckKey: HOST_DECK,
    difficulty: "normal",
    gameMode: "standard",
    setupTurns: 3,
    contentRevision: `${contentCatalog.revision}:old`,
    rulesetVersion: OPAQUE_MATCH_RULESET_VERSION,
  };
  const history = begin(createEmptyHistoryEnvelopeV1(), "old", oldFuture);
  const future = buildHistoryLibraryViewModel(snapshot(history)).futures[0];
  assert.equal(future.replayOrigin, undefined);
  assert.equal(future.replayUnavailableReason, "deterministic-incompatible");
  assert.equal(future.playerDeckId, "pact_of_elarion");
  assert.equal(future.hostDeckId, "uprising_of_the_graveless");
});

test("the product screen consumes real history and routes replay through the shared vortex launcher", async () => {
  const [screen, app, menu, styles] = await Promise.all([
    readFile(new URL("../src/components/SeedsOfDestinyScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(screen, /productHistoryRuntime/u);
  assert.match(screen, /buildHistoryLibraryViewModel/u);
  assert.match(screen, /summarizeAttempt/u);
  assert.match(screen, /narrative\.fallback/u);
  assert.match(screen, /aria-expanded=\{open\}/u);
  assert.match(screen, /seeds-attempt-chevron/u);
  assert.match(screen, /setOpenAttempt\(latestAttemptId\(future\)\)/u);
  assert.match(screen, /setOpenAttempt\(latestAttemptId\(nextFuture\)\)/u);
  assert.match(screen, /future\.attempts\[future\.attempts\.length - 1\]\?\.attemptId/u);
  assert.match(styles, /\.seeds-thread-line\[aria-expanded="true"\]::before\s*\{[^}]*background:\s*var\(--seeds-gold\)/u);
  assert.doesNotMatch(styles, /\.seeds-thread-item\.is-victory \.seeds-thread-line::before/u);
  assert.match(screen, /disabled=\{!future\.replayOrigin\}/u);
  assert.match(screen, /"confirm" \| "unrecoverable"/u);
  assert.match(screen, /productHistoryRuntime\.reset\(allowWithoutDiagnostic\)/u);
  assert.doesNotMatch(screen, /SEEDS_OF_DESTINY_FIXTURE|seedsOfDestinyMockData/u);
  assert.match(menu, /onReplay=\{onReplayFuture\}/u);
  assert.match(app, /"history-replay"/u);
  assert.match(app, /source: transition\.destination === "history-replay" \? "history-replay" : "rewrite"/u);
  assert.match(app, /setScreen\("game"\)/u);
});
