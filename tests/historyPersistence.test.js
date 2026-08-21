import assert from "node:assert/strict";
import test from "node:test";
import { contentCatalog } from "../src/content/bootstrap";
import { OPAQUE_MATCH_RULESET_VERSION } from "../src/content/MatchOrigin";
import {
  beginHistoryAttempt,
  createEmptyHistoryEnvelopeV1,
} from "../src/history/historyDomain";
import {
  HISTORY_BACKUP_STORAGE_KEY,
  HISTORY_MAX_SERIALIZED_BYTES,
  HISTORY_QUARANTINE_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  HistoryPersistenceError,
  emptyHistoryCandidates,
} from "../src/history/historyPersistence";
import {
  HistoryService,
  selectHistoryCandidates,
} from "../src/history/historyService";
import { WebHistoryPersistenceAdapter } from "../src/history/webHistoryAdapter";

const PLAYER_DECK = "hostfall.core/pact_of_elarion";
const HOST_DECK = "hostfall.core/uprising_of_the_graveless";
const STARTED_AT = "2026-08-21T12:00:00.000Z";

function opaqueFuture(seed = "history-persistence") {
  return {
    seedKind: "opaque",
    rngSeed: seed,
    playerDeckKey: PLAYER_DECK,
    hostDeckKey: HOST_DECK,
    difficulty: "normal",
    gameMode: "standard",
    setupTurns: 3,
    contentRevision: contentCatalog.revision,
    rulesetVersion: OPAQUE_MATCH_RULESET_VERSION,
  };
}

function beginInput(attemptId, seed = attemptId) {
  return {
    attemptId,
    future: opaqueFuture(seed),
    appVersion: "test",
    observedContentRevision: contentCatalog.revision,
    startedAt: STARTED_AT,
  };
}

function historyWithAttempt(attemptId = "stored") {
  return beginHistoryAttempt(createEmptyHistoryEnvelopeV1(), beginInput(attemptId)).history;
}

class MemoryStorage {
  values = new Map();
  failSet = undefined;

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failSet?.(key, value)) {
      const error = new Error("Storage quota exceeded.");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class SharedLockManager {
  held = false;

  request(_name, _options, callback) {
    if (this.held) return Promise.resolve(callback(null));
    this.held = true;
    return Promise.resolve(callback({ name: "writer" })).finally(() => { this.held = false; });
  }
}

class BroadcastHub {
  ports = new Set();

  createPort() {
    const port = {
      listeners: new Set(),
      postMessage: () => {
        for (const peer of this.ports) {
          if (peer === port) continue;
          queueMicrotask(() => {
            for (const listener of peer.listeners) listener();
          });
        }
      },
      addEventListener: (_type, listener) => port.listeners.add(listener),
      removeEventListener: (_type, listener) => port.listeners.delete(listener),
      close: () => this.ports.delete(port),
    };
    this.ports.add(port);
    return port;
  }
}

class TestHistoryAdapter {
  kind = "memory";
  candidates = emptyHistoryCandidates();
  writable = true;
  writes = [];
  writeFailures = [];
  initialization;
  listeners = new Set();

  constructor(options = {}) {
    this.candidates = options.candidates ?? this.candidates;
    this.writable = options.writable ?? true;
    this.initialization = options.initialization;
  }

  async initialize() {
    if (this.initialization) await this.initialization;
    return { writable: this.writable, candidates: this.candidates };
  }

  async readCandidates() {
    return this.candidates;
  }

  async write(history) {
    const failure = this.writeFailures.shift();
    if (failure) throw failure;
    this.writes.push(structuredClone(history));
    this.candidates = {
      primary: structuredClone(history),
      primaryCorrupted: false,
      backupCorrupted: false,
    };
  }

  async promoteBackup() {
    this.candidates = {
      primary: this.candidates.backup,
      backup: this.candidates.backup,
      primaryCorrupted: false,
      backupCorrupted: false,
    };
  }

  async reset() {
    this.candidates = emptyHistoryCandidates();
    return { reset: true, preservedDiagnostic: true };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {}
}

test("web history round-trips through a fresh service", async () => {
  const storage = new MemoryStorage();
  const lockManager = new SharedLockManager();
  const firstAdapter = new WebHistoryPersistenceAdapter({ storage, lockManager });
  const first = new HistoryService(firstAdapter);
  await first.initialize();
  const written = await first.begin(beginInput("web-round-trip"));
  assert.equal(written.applied, true);
  assert.equal(written.durable, true);
  assert.equal(JSON.parse(storage.getItem(HISTORY_STORAGE_KEY)).attempts[0].attemptId, "web-round-trip");
  first.dispose();
  await waitFor(() => !lockManager.held);

  const secondAdapter = new WebHistoryPersistenceAdapter({ storage, lockManager });
  const second = new HistoryService(secondAdapter);
  const hydrated = await second.initialize();
  assert.equal(hydrated.history.attempts[0].attemptId, "web-round-trip");
  assert.equal(hydrated.writable, true);
  second.dispose();
});

test("backup promotion bypasses corrupt-primary rotation in web storage", async () => {
  const storage = new MemoryStorage();
  const backup = historyWithAttempt("safe-backup");
  storage.setItem(HISTORY_STORAGE_KEY, "not-json");
  storage.setItem(HISTORY_BACKUP_STORAGE_KEY, JSON.stringify(backup));
  const adapter = new WebHistoryPersistenceAdapter({ storage, lockManager: new SharedLockManager() });
  const service = new HistoryService(adapter);
  const snapshot = await service.initialize();
  assert.equal(snapshot.health, "recovered");
  assert.equal(snapshot.history.attempts[0].attemptId, "safe-backup");
  assert.deepEqual(JSON.parse(storage.getItem(HISTORY_STORAGE_KEY)), backup);
  assert.deepEqual(JSON.parse(storage.getItem(HISTORY_BACKUP_STORAGE_KEY)), backup);
  service.dispose();
});

test("two web adapters elect one writer and notify the read-only tab without false recovery", async () => {
  const storage = new MemoryStorage();
  const lockManager = new SharedLockManager();
  const hub = new BroadcastHub();
  const writer = new HistoryService(new WebHistoryPersistenceAdapter({
    storage,
    lockManager,
    channel: hub.createPort(),
  }));
  const reader = new HistoryService(new WebHistoryPersistenceAdapter({
    storage,
    lockManager,
    channel: hub.createPort(),
  }));
  assert.equal((await writer.initialize()).writable, true);
  assert.equal((await reader.initialize()).writable, false);

  await writer.begin(beginInput("owned-by-writer"));
  await waitFor(() => reader.snapshot().history.attempts.length === 1);
  assert.equal(reader.snapshot().history.attempts[0].status, "active");
  const recovery = await reader.recoverActiveAttempts("2026-08-21T12:05:00.000Z");
  assert.equal(recovery.reason, "readonly");
  assert.equal(reader.snapshot().history.attempts[0].status, "active");

  await writer.begin(beginInput("second-write"));
  await waitFor(() => reader.snapshot().history.attempts.length === 2);
  assert.deepEqual(reader.snapshot().history.attempts.map(({ attemptId }) => attemptId), [
    "owned-by-writer",
    "second-write",
  ]);
  writer.dispose();
  reader.dispose();
});

test("web fallback without a lock manager is safely read-only", async () => {
  const service = new HistoryService(new WebHistoryPersistenceAdapter({ storage: new MemoryStorage() }));
  assert.equal((await service.initialize()).writable, false);
  assert.equal((await service.begin(beginInput("blocked"))).reason, "readonly");
  service.dispose();
});

test("slow hydration is single-flight and queued mutations serialize over the latest snapshot", async () => {
  const gate = deferred();
  const adapter = new TestHistoryAdapter({ initialization: gate.promise });
  const service = new HistoryService(adapter);
  const firstInitialization = service.initialize();
  assert.equal(service.initialize(), firstInitialization);
  const first = service.begin(beginInput("first-concurrent"));
  const second = service.begin(beginInput("second-concurrent"));
  assert.equal(adapter.writes.length, 0);
  gate.resolve();
  await Promise.all([firstInitialization, first, second]);
  assert.deepEqual(adapter.writes.map((history) => history.attempts.length), [1, 2]);
  assert.deepEqual(service.snapshot().history.attempts.map(({ attemptId }) => attemptId), [
    "first-concurrent",
    "second-concurrent",
  ]);
  assert.equal(service.snapshot().logicalRevision, 2);
  assert.equal(service.snapshot().durableRevision, 2);
  service.dispose();
});

test("transient failures retain the logical snapshot and the next mutation writes all changes", async () => {
  const adapter = new TestHistoryAdapter();
  adapter.writeFailures.push(new HistoryPersistenceError("io", "injected write failure"));
  const service = new HistoryService(adapter);
  const first = await service.begin(beginInput("dirty-first"));
  assert.equal(first.applied, true);
  assert.equal(first.durable, false);
  assert.equal(first.snapshot.logicalRevision, 1);
  assert.equal(first.snapshot.durableRevision, 0);
  assert.equal(first.snapshot.health, "degraded");

  const second = await service.begin(beginInput("durable-second"));
  assert.equal(second.durable, true);
  assert.deepEqual(adapter.writes.at(-1).attempts.map(({ attemptId }) => attemptId), ["dirty-first", "durable-second"]);
  assert.equal(second.snapshot.logicalRevision, 2);
  assert.equal(second.snapshot.durableRevision, 2);
  service.dispose();
});

test("a transient failure schedules a background retry of the latest logical snapshot", async () => {
  const adapter = new TestHistoryAdapter();
  adapter.writeFailures.push(new HistoryPersistenceError("io", "temporary outage"));
  let scheduledRetry;
  let cancelled = false;
  const service = new HistoryService(adapter, {
    retryDelayMs: 25,
    scheduleRetry: (callback) => {
      scheduledRetry = callback;
      return () => { cancelled = true; };
    },
  });
  await service.begin(beginInput("background-retry"));
  assert.equal(service.snapshot().dirty, true);
  assert.equal(typeof scheduledRetry, "function");
  scheduledRetry();
  await waitFor(() => !service.snapshot().dirty);
  assert.equal(service.snapshot().durableRevision, 1);
  assert.equal(adapter.writes.at(-1).attempts[0].attemptId, "background-retry");
  assert.equal(cancelled, false);
  service.dispose();
});

test("duplicate IDs are idempotent and never enqueue another write", async () => {
  const adapter = new TestHistoryAdapter();
  const service = new HistoryService(adapter);
  await service.begin(beginInput("same-id"));
  const duplicate = await service.begin(beginInput("same-id", "different-seed"));
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, "duplicate");
  assert.equal(adapter.writes.length, 1);
  assert.equal(service.snapshot().history.attempts.length, 1);
  service.dispose();
});

test("startup recovery closes every active attempt once and persists one combined snapshot", async () => {
  const adapter = new TestHistoryAdapter();
  const service = new HistoryService(adapter);
  await service.begin(beginInput("active-one"));
  await service.begin(beginInput("active-two"));
  const writesBeforeRecovery = adapter.writes.length;
  const recovered = await service.recoverActiveAttempts("2026-08-21T12:30:00.000Z");
  assert.equal(recovered.applied, true);
  assert.deepEqual(recovered.snapshot.history.attempts.map(({ status }) => status), ["interrupted", "interrupted"]);
  assert.deepEqual(recovered.snapshot.history.attempts.map(({ endReason }) => endReason), [
    "startup-recovery",
    "startup-recovery",
  ]);
  assert.equal(adapter.writes.length, writesBeforeRecovery + 1);
  const repeated = await service.recoverActiveAttempts("2026-08-21T12:40:00.000Z");
  assert.equal(repeated.applied, false);
  assert.equal(repeated.reason, "unchanged");
  assert.equal(adapter.writes.length, writesBeforeRecovery + 1);
  service.dispose();
});

test("a full write rolls back the new logical mutation and freezes further writes", async () => {
  const adapter = new TestHistoryAdapter();
  adapter.writeFailures.push(new HistoryPersistenceError("full", "history full"));
  const service = new HistoryService(adapter);
  const full = await service.begin(beginInput("does-not-fit"));
  assert.equal(full.applied, false);
  assert.equal(full.reason, "full");
  assert.equal(full.snapshot.health, "full");
  assert.equal(full.snapshot.history.attempts.length, 0);
  assert.equal(full.snapshot.logicalRevision, 0);
  assert.equal((await service.begin(beginInput("also-blocked"))).reason, "full");
  service.dispose();
});

test("the web adapter rejects payloads beyond the physical history limit before touching storage", async () => {
  const storage = new MemoryStorage();
  const adapter = new WebHistoryPersistenceAdapter({ storage, lockManager: new SharedLockManager() });
  await adapter.initialize();
  const oversized = {
    ...createEmptyHistoryEnvelopeV1(),
    diagnosticPadding: "x".repeat(HISTORY_MAX_SERIALIZED_BYTES + 1),
  };
  await assert.rejects(() => adapter.write(oversized), (error) =>
    error instanceof HistoryPersistenceError && error.reason === "full");
  assert.equal(storage.getItem(HISTORY_STORAGE_KEY), null);
  adapter.dispose();
});

test("double corruption freezes writes while preserving structurally salvageable attempts", async () => {
  const salvageable = structuredClone(historyWithAttempt("survivor"));
  salvageable.attempts.push({ ...structuredClone(salvageable.attempts[0]), attemptId: "broken", sequence: 2, status: "unknown" });
  salvageable.nextSequence = 3;
  const selection = selectHistoryCandidates({
    primary: salvageable,
    backup: { kind: "hostfall-history", formatVersion: 99 },
    primaryCorrupted: false,
    backupCorrupted: false,
  });
  assert.equal(selection.corrupt, true);
  assert.deepEqual(selection.history.attempts.map(({ attemptId }) => attemptId), ["survivor"]);

  const service = new HistoryService(new TestHistoryAdapter({
    candidates: {
      primary: salvageable,
      backup: { kind: "hostfall-history", formatVersion: 99 },
      primaryCorrupted: false,
      backupCorrupted: false,
    },
  }));
  assert.equal((await service.initialize()).health, "corrupt");
  assert.equal((await service.begin(beginInput("must-not-overwrite"))).reason, "corrupt");
  assert.deepEqual(service.snapshot().history.attempts.map(({ attemptId }) => attemptId), ["survivor"]);
  service.dispose();
});

test("web reset quarantines corruption and requires a second confirmation if quota blocks the copy", async () => {
  const storage = new MemoryStorage();
  storage.setItem(HISTORY_STORAGE_KEY, "bad-primary");
  storage.setItem(HISTORY_BACKUP_STORAGE_KEY, "bad-backup");
  const service = new HistoryService(new WebHistoryPersistenceAdapter({
    storage,
    lockManager: new SharedLockManager(),
    now: () => "2026-08-21T13:00:00.000Z",
  }));
  assert.equal((await service.initialize()).health, "corrupt");
  const reset = await service.reset({ confirmed: true });
  assert.equal(reset.reset, true);
  assert.equal(reset.preservedDiagnostic, true);
  assert.deepEqual(JSON.parse(storage.getItem(HISTORY_QUARANTINE_STORAGE_KEY)), {
    capturedAt: "2026-08-21T13:00:00.000Z",
    primary: "bad-primary",
    backup: "bad-backup",
  });
  assert.equal(storage.getItem(HISTORY_STORAGE_KEY), null);
  service.dispose();

  const quotaStorage = new MemoryStorage();
  quotaStorage.setItem(HISTORY_STORAGE_KEY, "bad-primary");
  quotaStorage.failSet = (key) => key === HISTORY_QUARANTINE_STORAGE_KEY;
  const quotaService = new HistoryService(new WebHistoryPersistenceAdapter({
    storage: quotaStorage,
    lockManager: new SharedLockManager(),
  }));
  await quotaService.initialize();
  const firstConfirmation = await quotaService.reset({ confirmed: true });
  assert.equal(firstConfirmation.reset, false);
  assert.equal(firstConfirmation.requiresUnrecoverableConfirmation, true);
  assert.equal(quotaStorage.getItem(HISTORY_STORAGE_KEY), "bad-primary");
  const secondConfirmation = await quotaService.reset({ confirmed: true, allowWithoutDiagnostic: true });
  assert.equal(secondConfirmation.reset, true);
  assert.equal(secondConfirmation.preservedDiagnostic, false);
  assert.equal(quotaStorage.getItem(HISTORY_STORAGE_KEY), null);
  quotaService.dispose();
});

function deferred() {
  let resolve = () => undefined;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

async function waitFor(predicate) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("Timed out waiting for history notification.");
}
