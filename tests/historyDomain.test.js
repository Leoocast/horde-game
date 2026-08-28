import assert from "node:assert/strict";
import test from "node:test";
import { contentCatalog } from "../src/content/bootstrap";
import {
  createOpaqueMatchOrigin,
  importCanonMatchOrigin,
  OPAQUE_MATCH_DETERMINISTIC_REVISION,
  OPAQUE_MATCH_RULESET_VERSION,
} from "../src/content/MatchOrigin";
import {
  aggregateFutureStatus,
  beginHistoryAttempt,
  closeHistoryAttempt,
  createEmptyHistoryEnvelopeV1,
  futureIdentityKey,
  groupHistoryByFuture,
  updateHistoryAttemptForExplicitExit,
} from "../src/history/historyDomain";
import { historyEligibility, HISTORY_ELIGIBILITY_MATRIX } from "../src/history/historyEligibility";
import {
  evaluateFutureCompatibility,
  futureIdentityFromMatchOrigin,
  resolveFutureIdentity,
} from "../src/history/historyFuture";
import {
  parseAttemptRecordV1,
  parseFutureIdentityV1,
  parseHistoryEnvelopeV1,
} from "../src/history/historyParser";
import { futureCodeFromSeed } from "../src/utils/futureIdentity";

const PLAYER_DECK = "hostfall.core/pact_of_elarion";
const HOST_DECK = "hostfall.core/uprising_of_the_graveless";
const STARTED_AT = "2026-08-21T12:00:00.000Z";
const ENDED_AT = "2026-08-21T12:10:00.000Z";

function canonFuture() {
  return futureIdentityFromMatchOrigin(importCanonMatchOrigin("HF1-ELA-GRV-082-QC5"));
}

function opaqueFuture(overrides = {}) {
  return {
    seedKind: "opaque",
    rngSeed: "free-seed",
    playerDeckKey: PLAYER_DECK,
    hostDeckKey: HOST_DECK,
    difficulty: "normal",
    gameMode: "standard",
    setupTurns: 3,
    contentRevision: contentCatalog.revision,
    rulesetVersion: OPAQUE_MATCH_RULESET_VERSION,
    ...overrides,
  };
}

function begin(history, attemptId, future = canonFuture(), overrides = {}) {
  return beginHistoryAttempt(history, {
    attemptId,
    future,
    appVersion: "0.0.2-beta.0",
    observedContentRevision: contentCatalog.revision,
    startedAt: STARTED_AT,
    ...overrides,
  });
}

function closeVictory(history, attemptId, overrides = {}) {
  return closeHistoryAttempt(history, {
    attemptId,
    status: "victory",
    endReason: "outcome",
    endedAt: ENDED_AT,
    turnNumber: 9,
    hostTurnNumber: 8,
    finalFacts: { playerLife: 7, hostArchiveRemaining: 0 },
    ...overrides,
  });
}

test("history Future identity preserves MatchOrigin data and opaque rngSeed bytes", () => {
  const canon = canonFuture();
  assert.deepEqual(canon, {
    seedKind: "canon",
    format: "HF1",
    canonCode: "HF1-ELA-GRV-082-QC5",
    rngSeed: "08QC5",
    playerDeckKey: PLAYER_DECK,
    hostDeckKey: HOST_DECK,
    difficulty: "normal",
    gameMode: "standard",
    setupTurns: 3,
  });

  const byteExactSeed = " HF1-ELA-GRV-082-QC5 \r\nß\u0000";
  const origin = createOpaqueMatchOrigin({
    rngSeed: byteExactSeed,
    playerDeckKey: PLAYER_DECK,
    hostDeckKey: HOST_DECK,
    difficulty: "hard",
    preparationTurns: 2,
    gameMode: "standard",
  });
  assert.equal(origin.deterministicRevision, OPAQUE_MATCH_DETERMINISTIC_REVISION);
  const future = futureIdentityFromMatchOrigin(origin);
  assert.equal(future.rngSeed, byteExactSeed);
  assert.equal(future.rulesetVersion, OPAQUE_MATCH_RULESET_VERSION);
  assert.equal(parseFutureIdentityV1(future).identity.rngSeed, byteExactSeed);
});

test("the cosmetic Future code can collide without merging opaque histories", () => {
  assert.equal(futureCodeFromSeed("collision-568"), futureCodeFromSeed("collision-1429"));
  const first = opaqueFuture({ rngSeed: "collision-568" });
  const second = opaqueFuture({ rngSeed: "collision-1429" });
  assert.notEqual(futureIdentityKey(first), futureIdentityKey(second));

  let history = begin(createEmptyHistoryEnvelopeV1(), "collision-a", first).history;
  history = begin(history, "collision-b", second).history;
  assert.equal(groupHistoryByFuture(history).length, 2);
});

test("opaque keys include complete configuration and versioned content/rules", () => {
  const identities = [
    opaqueFuture(),
    opaqueFuture({ difficulty: "hard" }),
    opaqueFuture({ setupTurns: 4 }),
    opaqueFuture({ playerDeckKey: "hostfall.core/court_of_the_crimson_eclipse" }),
    opaqueFuture({ contentRevision: `${contentCatalog.revision}:older` }),
    opaqueFuture({ rulesetVersion: OPAQUE_MATCH_RULESET_VERSION + 1 }),
  ];
  assert.equal(new Set(identities.map(futureIdentityKey)).size, identities.length);
});

test("Canon grouping ignores build provenance and orders equal timestamps by sequence", () => {
  const future = canonFuture();
  let history = begin(createEmptyHistoryEnvelopeV1(), "build-a", future, {
    appVersion: "0.0.1",
    observedContentRevision: "hostfall.core@presentation-a",
  }).history;
  history = begin(history, "build-b", { ...future, canonCode: future.canonCode.toLowerCase() }, {
    appVersion: "0.0.2",
    observedContentRevision: "hostfall.core@presentation-b",
  }).history;

  const groups = groupHistoryByFuture(history);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].attempts.map(({ attemptId }) => attemptId), ["build-b", "build-a"]);
  assert.deepEqual(groups[0].attempts.map(({ sequence }) => sequence), [2, 1]);
  assert.equal(groups[0].lastSequence, 2);
});

test("an HF1-shaped opaque seed remains distinct from an explicitly imported Canon", () => {
  const code = "HF1-ELA-GRV-082-QC5";
  const opaque = opaqueFuture({ rngSeed: code });
  const canon = canonFuture();
  assert.notEqual(futureIdentityKey(opaque), futureIdentityKey(canon));
  assert.equal(parseFutureIdentityV1(opaque).identity.seedKind, "opaque");

  let history = begin(createEmptyHistoryEnvelopeV1(), "opaque-hf1", opaque).history;
  history = begin(history, "canon-hf1", canon).history;
  assert.equal(groupHistoryByFuture(history).length, 2);
});

test("begin allocates sequence atomically and group activity never depends on wall-clock order", () => {
  let history = begin(createEmptyHistoryEnvelopeV1(), "older", opaqueFuture({ rngSeed: "older" })).history;
  history = begin(history, "newer", opaqueFuture({ rngSeed: "newer" })).history;
  assert.deepEqual(history.attempts.map(({ sequence }) => sequence), [1, 2]);
  assert.equal(history.nextSequence, 3);
  assert.deepEqual(groupHistoryByFuture(history).map((group) => group.attempts[0].attemptId), ["newer", "older"]);
  assert.throws(() => begin(history, "newer"), /already exists/u);
});

test("a later interruption never erases an earlier victory", () => {
  let history = begin(createEmptyHistoryEnvelopeV1(), "victory").history;
  history = closeVictory(history, "victory").history;
  history = begin(history, "interruption").history;
  history = closeHistoryAttempt(history, {
    attemptId: "interruption",
    status: "interrupted",
    endReason: "menu",
    endedAt: "2026-08-21T12:20:00.000Z",
  }).history;
  const group = groupHistoryByFuture(history)[0];
  assert.equal(group.status, "preserved");
  assert.equal(aggregateFutureStatus(group.attempts), "preserved");
  assert.deepEqual(group.attempts.map(({ status }) => status), ["interrupted", "victory"]);
});

test("closing is idempotent and a stale callback cannot touch the next attempt", () => {
  let history = begin(createEmptyHistoryEnvelopeV1(), "old-session").history;
  const firstClose = closeVictory(history, "old-session");
  history = firstClose.history;
  const duplicate = closeHistoryAttempt(history, {
    attemptId: "old-session",
    status: "interrupted",
    endReason: "menu",
    endedAt: "2026-08-21T12:30:00.000Z",
  });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.history, history);
  assert.equal(duplicate.attempt.status, "victory");

  history = begin(history, "new-session").history;
  const stale = closeVictory(history, "old-session", { endedAt: "2026-08-21T12:40:00.000Z" });
  assert.equal(stale.changed, false);
  assert.equal(stale.history.attempts.find(({ attemptId }) => attemptId === "new-session").status, "active");

  const unknown = closeHistoryAttempt(history, {
    attemptId: "missing-session",
    status: "interrupted",
    endReason: "startup-recovery",
    endedAt: "2026-08-21T12:50:00.000Z",
  });
  assert.equal(unknown.changed, false);
  assert.equal(unknown.history, history);
});

test("explicit-exit metadata can enrich only the captured active attempt", () => {
  let history = begin(createEmptyHistoryEnvelopeV1(), "exit-metadata").history;
  const updated = updateHistoryAttemptForExplicitExit(history, {
    attemptId: "exit-metadata",
    updatedAt: "2026-08-21T12:05:00.000Z",
    turnNumber: 6,
    hostTurnNumber: 5,
    finalFacts: { playerLife: 3, hostArchiveRemaining: 21 },
    milestones: [{
      kind: "unblocked-attack",
      turnNumber: 5,
      attackerCount: 1,
      totalDamage: 5,
      attackerName: { es: "Titán Sinsepulcro", en: "Graveless Titan" },
    }],
  });
  assert.equal(updated.changed, true);
  assert.equal(updated.attempt.turnNumber, 6);
  assert.ok(Object.isFrozen(updated.attempt.milestones[0].attackerName));

  history = closeHistoryAttempt(updated.history, {
    attemptId: "exit-metadata",
    status: "interrupted",
    endReason: "menu",
    endedAt: ENDED_AT,
  }).history;
  const afterClose = updateHistoryAttemptForExplicitExit(history, {
    attemptId: "exit-metadata",
    updatedAt: "2026-08-21T12:15:00.000Z",
    turnNumber: 7,
  });
  assert.equal(afterClose.changed, false);
  assert.equal(afterClose.attempt.turnNumber, 6);
  assert.throws(() => closeHistoryAttempt(updated.history, {
    attemptId: "exit-metadata",
    status: "interrupted",
    endReason: "menu",
    endedAt: "2026-08-21T12:04:00.000Z",
  }), /backwards/u);
});

test("the structural parser enforces cross-invariants without consulting current content", () => {
  let history = begin(createEmptyHistoryEnvelopeV1(), "valid").history;
  history = closeVictory(history, "valid").history;
  const validPayload = structuredClone(history);
  const parsed = parseHistoryEnvelopeV1(validPayload);
  assert.equal(parsed.ok, true);
  assert.ok(Object.isFrozen(parsed.history));
  assert.ok(Object.isFrozen(parsed.history.attempts));

  const invalidMutations = [
    (payload) => { payload.attempts[0].status = "active"; },
    (payload) => { delete payload.attempts[0].finalFacts; },
    (payload) => { payload.attempts[0].endReason = "menu"; },
    (payload) => { payload.attempts[0].updatedAt = "2026-08-21T12:11:00.000Z"; },
    (payload) => { payload.attempts[0].turnNumber = -1; },
    (payload) => { payload.attempts[0].unknown = true; },
    (payload) => { payload.nextSequence = 1; },
    (payload) => { payload.attempts.push(structuredClone(payload.attempts[0])); payload.nextSequence = 3; },
    (payload) => { payload.attempts.push({ ...structuredClone(payload.attempts[0]), attemptId: "other" }); payload.nextSequence = 3; },
  ];
  for (const mutate of invalidMutations) {
    const payload = structuredClone(validPayload);
    mutate(payload);
    assert.deepEqual(parseHistoryEnvelopeV1(payload), { ok: false, reason: "schema" });
  }

  const interruptedOutcome = structuredClone(validPayload.attempts[0]);
  interruptedOutcome.status = "interrupted";
  assert.deepEqual(parseAttemptRecordV1(interruptedOutcome), { ok: false, reason: "schema" });
});

test("structural parsing, deterministic compatibility, and deck/Canon resolution are separate", () => {
  const valid = canonFuture();
  assert.equal(evaluateFutureCompatibility(valid).compatible, true);
  const resolved = resolveFutureIdentity(valid);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.origin.rngSeed, valid.rngSeed);

  const contradictory = { ...valid, rngSeed: "WRONG" };
  assert.equal(parseFutureIdentityV1(contradictory).ok, true);
  assert.deepEqual(resolveFutureIdentity(contradictory), { ok: false, reason: "identity-mismatch" });

  const incompatibleRegistry = {
    HF1: { format: "HF1", rulesetVersion: 1, deterministicRevision: "hostfall-hf1-r1", supported: false },
  };
  assert.deepEqual(evaluateFutureCompatibility(valid, contentCatalog, incompatibleRegistry), {
    compatible: false,
    reason: "format",
  });
  assert.deepEqual(resolveFutureIdentity(valid, contentCatalog, incompatibleRegistry), {
    ok: false,
    reason: "deterministic-incompatible",
  });

  const oldOpaque = opaqueFuture({ contentRevision: "hostfall.core@old" });
  assert.equal(parseFutureIdentityV1(oldOpaque).ok, true);
  assert.deepEqual(evaluateFutureCompatibility(oldOpaque), { compatible: false, reason: "content" });

  const missingDeck = opaqueFuture({ playerDeckKey: "missing.pack/missing_deck" });
  assert.equal(evaluateFutureCompatibility(missingDeck).compatible, true);
  assert.deepEqual(resolveFutureIdentity(missingDeck), { ok: false, reason: "deck-unavailable" });
});

test("the eligibility matrix admits only normal standard product sessions", () => {
  assert.deepEqual(historyEligibility("normal", "standard"), { eligible: true, reason: "eligible" });
  assert.deepEqual(historyEligibility("normal", "chaos"), { eligible: false, reason: "mode-excluded" });
  for (const sessionKind of Object.keys(HISTORY_ELIGIBILITY_MATRIX).filter((kind) => kind !== "normal")) {
    assert.deepEqual(historyEligibility(sessionKind, "standard"), {
      eligible: false,
      reason: "session-excluded",
    });
  }
});

test("origin kind is structural: opaque cannot smuggle Canon fields and Canon codes normalize", () => {
  const opaqueWithCanonField = { ...opaqueFuture(), canonCode: "HF1-ELA-GRV-082-QC5" };
  assert.deepEqual(parseFutureIdentityV1(opaqueWithCanonField), { ok: false, reason: "schema" });

  const lowerCanon = { ...canonFuture(), canonCode: "hf1-ela-grv-082-qc5" };
  const parsed = parseFutureIdentityV1(lowerCanon);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.identity.canonCode, "HF1-ELA-GRV-082-QC5");
});
