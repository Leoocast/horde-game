import {
  beginHistoryAttempt,
  closeHistoryAttempt,
  createEmptyHistoryEnvelopeV1,
  updateHistoryAttemptForExplicitExit,
  type BeginAttemptInput,
  type CloseAttemptInput,
  type UpdateAttemptForExplicitExitInput,
} from "./historyDomain";
import {
  parseHistoryEnvelopeV1,
  salvageHistoryEnvelopeV1,
} from "./historyParser";
import {
  HistoryPersistenceError,
  type HistoryPersistenceAdapter,
  type HistoryStorageCandidates,
} from "./historyPersistence";
import type { AttemptRecordV1, HistoryEnvelopeV1 } from "./historyTypes";

export type HistoryHealth = "healthy" | "recovered" | "degraded" | "full" | "corrupt";

export type HistoryServiceSnapshot = Readonly<{
  phase: "idle" | "loading" | "ready";
  health: HistoryHealth;
  history: HistoryEnvelopeV1;
  writable: boolean;
  dirty: boolean;
  logicalRevision: number;
  durableRevision: number;
  lastError?: string;
}>;

export type HistorySelection = Readonly<{
  source: "empty" | "primary" | "backup" | "salvage";
  history: HistoryEnvelopeV1;
  corrupt: boolean;
}>;

export type HistoryOperationResult = Readonly<{
  applied: boolean;
  durable: boolean;
  reason: "applied" | "unchanged" | "duplicate" | "readonly" | "full" | "corrupt";
  attempt?: AttemptRecordV1;
  snapshot: HistoryServiceSnapshot;
}>;

export type HistoryResetResult = Readonly<{
  reset: boolean;
  preservedDiagnostic: boolean;
  requiresUnrecoverableConfirmation: boolean;
  snapshot: HistoryServiceSnapshot;
}>;

type MutationPlan = Readonly<{
  changed: boolean;
  history: HistoryEnvelopeV1;
  attempt?: AttemptRecordV1;
  unchangedReason?: "unchanged" | "duplicate";
}>;

export type HistoryServiceOptions = Readonly<{
  retryDelayMs?: number;
  scheduleRetry?: (callback: () => void, delayMs: number) => () => void;
}>;

export class HistoryService {
  readonly #adapter: HistoryPersistenceAdapter;
  readonly #listeners = new Set<(snapshot: HistoryServiceSnapshot) => void>();
  readonly #unsubscribeExternal: () => void;
  #snapshot: HistoryServiceSnapshot = freezeSnapshot({
    phase: "idle",
    health: "healthy",
    history: createEmptyHistoryEnvelopeV1(),
    writable: false,
    dirty: false,
    logicalRevision: 0,
    durableRevision: 0,
  });
  #initialization?: Promise<HistoryServiceSnapshot>;
  #operationQueue: Promise<void> = Promise.resolve();
  #adapterWritable = false;
  #needsBackupPromotion = false;
  #disposed = false;
  readonly #retryDelayMs: number;
  readonly #scheduleRetry: (callback: () => void, delayMs: number) => () => void;
  #cancelScheduledRetry?: () => void;

  constructor(adapter: HistoryPersistenceAdapter, options: HistoryServiceOptions = {}) {
    this.#adapter = adapter;
    this.#retryDelayMs = options.retryDelayMs ?? 1_500;
    this.#scheduleRetry = options.scheduleRetry ?? defaultRetryScheduler;
    this.#unsubscribeExternal = adapter.subscribe(() => this.#scheduleExternalRefresh());
  }

  snapshot(): HistoryServiceSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: HistoryServiceSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  initialize(): Promise<HistoryServiceSnapshot> {
    if (this.#initialization) return this.#initialization;
    this.#setSnapshot({ ...this.#snapshot, phase: "loading" });
    this.#initialization = this.#initializeOnce();
    return this.#initialization;
  }

  begin(input: BeginAttemptInput): Promise<HistoryOperationResult> {
    return this.#enqueueMutation((history) => {
      const existing = history.attempts.find((attempt) => attempt.attemptId === input.attemptId);
      if (existing) {
        return Object.freeze({ changed: false, history, attempt: existing, unchangedReason: "duplicate" });
      }
      const begun = beginHistoryAttempt(history, input);
      return Object.freeze({ changed: true, history: begun.history, attempt: begun.attempt });
    });
  }

  close(input: CloseAttemptInput): Promise<HistoryOperationResult> {
    return this.#enqueueMutation((history) => {
      const closed = closeHistoryAttempt(history, input);
      return Object.freeze({
        changed: closed.changed,
        history: closed.history,
        attempt: closed.attempt,
        unchangedReason: "unchanged",
      });
    });
  }

  updateForExplicitExit(input: UpdateAttemptForExplicitExitInput): Promise<HistoryOperationResult> {
    return this.#enqueueMutation((history) => {
      const updated = updateHistoryAttemptForExplicitExit(history, input);
      return Object.freeze({
        changed: updated.changed,
        history: updated.history,
        attempt: updated.attempt,
        unchangedReason: "unchanged",
      });
    });
  }

  recoverActiveAttempts(recoveredAt = new Date().toISOString()): Promise<HistoryOperationResult> {
    return this.#enqueueMutation((history) => {
      let next = history;
      let changed = false;
      for (const attempt of history.attempts) {
        if (attempt.status !== "active") continue;
        const endedAt = Date.parse(recoveredAt) < Date.parse(attempt.updatedAt) ? attempt.updatedAt : recoveredAt;
        const recovered = closeHistoryAttempt(next, {
          attemptId: attempt.attemptId,
          status: "interrupted",
          endReason: "startup-recovery",
          endedAt,
        });
        next = recovered.history;
        changed ||= recovered.changed;
      }
      return Object.freeze({ changed, history: next, unchangedReason: "unchanged" });
    });
  }

  retryDurability(): Promise<HistoryServiceSnapshot> {
    return this.#enqueue(async () => {
      await this.initialize();
      if (!this.#adapterWritable || this.#snapshot.health === "corrupt" || this.#snapshot.health === "full") {
        return this.#snapshot;
      }
      if (this.#needsBackupPromotion) {
        try {
          await this.#adapter.promoteBackup();
          this.#needsBackupPromotion = false;
          this.#setSnapshot({ ...this.#snapshot, health: "recovered", writable: true, lastError: undefined });
        } catch (error) {
          this.#setSnapshot({ ...this.#snapshot, health: "degraded", writable: false, lastError: errorMessage(error) });
          this.#ensureBackgroundRetry();
          return this.#snapshot;
        }
      }
      if (!this.#snapshot.dirty) return this.#snapshot;
      try {
        await this.#adapter.write(this.#snapshot.history);
        this.#clearScheduledRetry();
        this.#setSnapshot({
          ...this.#snapshot,
          health: "healthy",
          writable: true,
          dirty: false,
          durableRevision: this.#snapshot.logicalRevision,
          lastError: undefined,
        });
      } catch (error) {
        this.#recordWriteFailure(error);
      }
      return this.#snapshot;
    });
  }

  reset(options: Readonly<{
    confirmed: true;
    allowWithoutDiagnostic?: boolean;
  }>): Promise<HistoryResetResult> {
    if (options.confirmed !== true) throw new Error("History reset requires explicit confirmation.");
    return this.#enqueue(async () => {
      await this.initialize();
      if (!this.#adapterWritable) {
        return Object.freeze({
          reset: false,
          preservedDiagnostic: false,
          requiresUnrecoverableConfirmation: false,
          snapshot: this.#snapshot,
        });
      }
      const result = await this.#adapter.reset({
        allowWithoutDiagnostic: options.allowWithoutDiagnostic === true,
      });
      if (!result.reset) {
        return Object.freeze({
          reset: false,
          preservedDiagnostic: false,
          requiresUnrecoverableConfirmation: true,
          snapshot: this.#snapshot,
        });
      }
      const nextRevision = this.#snapshot.logicalRevision + 1;
      this.#clearScheduledRetry();
      this.#needsBackupPromotion = false;
      this.#setSnapshot({
        phase: "ready",
        health: "healthy",
        history: createEmptyHistoryEnvelopeV1(),
        writable: true,
        dirty: false,
        logicalRevision: nextRevision,
        durableRevision: nextRevision,
      });
      return Object.freeze({
        reset: true,
        preservedDiagnostic: result.preservedDiagnostic,
        requiresUnrecoverableConfirmation: false,
        snapshot: this.#snapshot,
      });
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeExternal();
    this.#clearScheduledRetry();
    this.#adapter.dispose();
    this.#listeners.clear();
  }

  async #initializeOnce(): Promise<HistoryServiceSnapshot> {
    try {
      const initialized = await this.#adapter.initialize();
      this.#adapterWritable = initialized.writable;
      const selection = selectHistoryCandidates(initialized.candidates);
      if (selection.corrupt) {
        this.#setSnapshot({
          ...this.#snapshot,
          phase: "ready",
          health: "corrupt",
          history: selection.history,
          writable: false,
          dirty: false,
        });
        return this.#snapshot;
      }

      let health: HistoryHealth = selection.source === "backup" ? "recovered" : "healthy";
      let effectivelyWritable = initialized.writable;
      if (selection.source === "backup" && initialized.writable) {
        try {
          await this.#adapter.promoteBackup();
        } catch (error) {
          health = "degraded";
          effectivelyWritable = false;
          this.#needsBackupPromotion = true;
          this.#setSnapshot({
            ...this.#snapshot,
            phase: "ready",
            health,
            history: selection.history,
            writable: effectivelyWritable,
            dirty: false,
            lastError: errorMessage(error),
          });
          this.#ensureBackgroundRetry();
          return this.#snapshot;
        }
      }
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "ready",
        health,
        history: selection.history,
        writable: effectivelyWritable,
        dirty: false,
        lastError: undefined,
      });
      return this.#snapshot;
    } catch (error) {
      this.#adapterWritable = false;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "ready",
        health: "degraded",
        writable: false,
        dirty: false,
        lastError: errorMessage(error),
      });
      return this.#snapshot;
    }
  }

  #enqueueMutation(transform: (history: HistoryEnvelopeV1) => MutationPlan): Promise<HistoryOperationResult> {
    return this.#enqueue(async () => {
      await this.initialize();
      const blockedReason = this.#blockedMutationReason();
      if (blockedReason) return operationResult(false, blockedReason, this.#snapshot);

      const plan = transform(this.#snapshot.history);
      if (!plan.changed) {
        return operationResult(false, plan.unchangedReason ?? "unchanged", this.#snapshot, plan.attempt);
      }

      const before = this.#snapshot;
      const logicalRevision = before.logicalRevision + 1;
      this.#setSnapshot({
        ...before,
        history: plan.history,
        logicalRevision,
        dirty: true,
      });
      try {
        await this.#adapter.write(plan.history);
        this.#clearScheduledRetry();
        this.#setSnapshot({
          ...this.#snapshot,
          health: "healthy",
          writable: true,
          dirty: false,
          durableRevision: logicalRevision,
          lastError: undefined,
        });
        return operationResult(true, "applied", this.#snapshot, plan.attempt);
      } catch (error) {
        if (error instanceof HistoryPersistenceError && error.reason === "full") {
          this.#clearScheduledRetry();
          this.#setSnapshot({
            ...before,
            health: "full",
            writable: false,
            lastError: error.message,
          });
          return operationResult(false, "full", this.#snapshot);
        }
        this.#recordWriteFailure(error);
        return operationResult(true, "applied", this.#snapshot, plan.attempt);
      }
    });
  }

  #blockedMutationReason(): "readonly" | "full" | "corrupt" | undefined {
    if (this.#snapshot.health === "corrupt") return "corrupt";
    if (this.#snapshot.health === "full") return "full";
    if (!this.#snapshot.writable) return "readonly";
    return undefined;
  }

  #recordWriteFailure(error: unknown): void {
    if (error instanceof HistoryPersistenceError && error.reason === "full") {
      this.#clearScheduledRetry();
      this.#setSnapshot({
        ...this.#snapshot,
        health: "full",
        writable: false,
        dirty: true,
        lastError: error.message,
      });
      return;
    }
    const readonly = error instanceof HistoryPersistenceError && error.reason === "readonly";
    if (readonly) this.#adapterWritable = false;
    this.#setSnapshot({
      ...this.#snapshot,
      health: "degraded",
      writable: !readonly && this.#adapterWritable,
      dirty: true,
      lastError: errorMessage(error),
    });
    if (!readonly && this.#adapterWritable) this.#ensureBackgroundRetry();
  }

  #ensureBackgroundRetry(): void {
    if (this.#cancelScheduledRetry || this.#disposed) return;
    this.#cancelScheduledRetry = this.#scheduleRetry(() => {
      this.#cancelScheduledRetry = undefined;
      void this.retryDurability();
    }, this.#retryDelayMs);
  }

  #clearScheduledRetry(): void {
    this.#cancelScheduledRetry?.();
    this.#cancelScheduledRetry = undefined;
  }

  #scheduleExternalRefresh(): void {
    if (this.#disposed || this.#snapshot.phase !== "ready" || this.#adapterWritable) return;
    void this.#enqueue(async () => {
      const selection = selectHistoryCandidates(await this.#adapter.readCandidates());
      const revision = this.#snapshot.logicalRevision + 1;
      this.#setSnapshot({
        ...this.#snapshot,
        health: selection.corrupt ? "corrupt" : selection.source === "backup" ? "recovered" : "healthy",
        history: selection.history,
        writable: false,
        dirty: false,
        logicalRevision: revision,
        durableRevision: revision,
      });
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#operationQueue.then(operation);
    this.#operationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  #setSnapshot(next: Omit<HistoryServiceSnapshot, never>): void {
    this.#snapshot = freezeSnapshot(next);
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export function selectHistoryCandidates(candidates: HistoryStorageCandidates): HistorySelection {
  const primary = parseHistoryEnvelopeV1(candidates.primary);
  if (primary.ok) return Object.freeze({ source: "primary", history: primary.history, corrupt: false });
  const backup = parseHistoryEnvelopeV1(candidates.backup);
  if (backup.ok) return Object.freeze({ source: "backup", history: backup.history, corrupt: false });

  const hasCandidate = candidates.primary !== undefined || candidates.backup !== undefined ||
    candidates.primaryCorrupted || candidates.backupCorrupted;
  if (!hasCandidate) {
    return Object.freeze({ source: "empty", history: createEmptyHistoryEnvelopeV1(), corrupt: false });
  }

  const salvages = [
    salvageHistoryEnvelopeV1(candidates.primary),
    salvageHistoryEnvelopeV1(candidates.backup),
  ].filter((candidate): candidate is HistoryEnvelopeV1 => candidate !== undefined);
  const salvage = salvages.sort((left, right) => right.attempts.length - left.attempts.length)[0]
    ?? createEmptyHistoryEnvelopeV1();
  return Object.freeze({ source: "salvage", history: salvage, corrupt: true });
}

function operationResult(
  applied: boolean,
  reason: HistoryOperationResult["reason"],
  snapshot: HistoryServiceSnapshot,
  attempt?: AttemptRecordV1,
): HistoryOperationResult {
  return Object.freeze({
    applied,
    durable: !snapshot.dirty && snapshot.logicalRevision === snapshot.durableRevision,
    reason,
    ...(attempt === undefined ? {} : { attempt }),
    snapshot,
  });
}

function freezeSnapshot(snapshot: HistoryServiceSnapshot): HistoryServiceSnapshot {
  return Object.freeze({ ...snapshot });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "History persistence failed.";
}

function defaultRetryScheduler(callback: () => void, delayMs: number): () => void {
  const timeout = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timeout);
}
