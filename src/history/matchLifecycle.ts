import type { MatchOrigin } from "../content/MatchOrigin";
import type { Side } from "../engine/GameTypes";
import type { BeginAttemptInput, CloseAttemptInput } from "./historyDomain";
import { historyEligibility, type HistorySessionKind } from "./historyEligibility";
import { futureIdentityFromMatchOrigin } from "./historyFuture";
import type { HistoryOperationResult, HistoryServiceSnapshot } from "./historyService";
import type { InterruptedAttemptEndReason } from "./historyTypes";

export type MatchLaunchSource = "play" | "history-replay" | "rewrite" | "learn-to-play-handoff";

/**
 * One explicit product launch. `commit` must synchronously replace the Zustand game session; the
 * lifecycle creates an attempt only after it can observe that committed session.
 */
export type MatchLaunchSpec = Readonly<{
  source: MatchLaunchSource;
  sessionKind: HistorySessionKind;
  origin: MatchOrigin;
  commit: () => void;
}>;

export type MatchSessionFacts = Readonly<{
  sessionId: string;
  turnNumber: number;
  hostTurnNumber: number;
  playerLife: number;
  hostArchiveRemaining: number;
}>;

export type MatchOutcomeEvent = Readonly<{
  sessionId: string;
  winner: Side;
}>;

export type MatchHistoryWarningKind = "initialize" | "begin" | "close";
export type MatchHistorySettleState = "durable" | "degraded" | "excluded" | "unchanged";

export type MatchHistorySettle = Readonly<{
  state: MatchHistorySettleState;
  reason: string;
}>;

export type MatchLaunchHandle = Readonly<{
  committed: boolean;
  sessionId?: string;
  attemptId?: string;
  reason: "committed" | "busy" | "session-not-replaced" | "commit-failed";
  settled: Promise<MatchHistorySettle>;
}>;

export type MatchLifecycleSnapshot = Readonly<{
  phase: "idle" | "initializing" | "ready";
  active?: Readonly<{
    attemptId: string;
    sessionId: string;
    source: MatchLaunchSource;
  }>;
  outcomeGate?: Readonly<{
    sessionId: string;
    state: "pending" | "durable" | "degraded";
  }>;
  warningRevision: number;
  lastWarning?: Readonly<{
    kind: MatchHistoryWarningKind;
    reason: string;
  }>;
}>;

export type MatchHistoryPort = Readonly<{
  initialize(): Promise<HistoryServiceSnapshot>;
  begin(input: BeginAttemptInput): Promise<HistoryOperationResult>;
  close(input: CloseAttemptInput): Promise<HistoryOperationResult>;
  recoverActiveAttempts(recoveredAt?: string): Promise<HistoryOperationResult>;
}>;

export type MatchLifecycleOptions = Readonly<{
  enabled: boolean;
  recoverActiveOnInitialize: boolean;
  history?: MatchHistoryPort;
  appVersion: string;
  readSession: () => MatchSessionFacts;
  subscribeOutcomes: (listener: (event: MatchOutcomeEvent) => void) => () => void;
  now?: () => string;
  createAttemptId?: () => string;
  settleTimeoutMs?: number;
  initializeTimeoutMs?: number;
  scheduleTimeout?: (callback: () => void, delayMs: number) => () => void;
}>;

type ActiveScope = Readonly<{
  attemptId: string;
  sessionId: string;
  source: MatchLaunchSource;
  startedAt: string;
}>;

const SETTLED_EXCLUDED = Promise.resolve(Object.freeze({
  state: "excluded",
  reason: "history-disabled",
}) satisfies MatchHistorySettle);

/**
 * Pure authority for attempt lifecycle. It does not know React, Zustand or the signal stream;
 * runtime adapters inject those seams. Persistence operations are queued when requested (rather
 * than when callers await them), preserving begin -> close -> next begin even after UI timeouts.
 */
export class MatchLifecycleCoordinator {
  readonly #enabled: boolean;
  readonly #recoverActiveOnInitialize: boolean;
  readonly #history?: MatchHistoryPort;
  readonly #appVersion: string;
  readonly #readSession: () => MatchSessionFacts;
  readonly #now: () => string;
  readonly #createAttemptId: () => string;
  readonly #settleTimeoutMs: number;
  readonly #initializeTimeoutMs: number;
  readonly #scheduleTimeout: (callback: () => void, delayMs: number) => () => void;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribeOutcomes: () => void;
  #snapshot: MatchLifecycleSnapshot = freezeSnapshot({
    phase: "idle",
    warningRevision: 0,
  });
  #active?: ActiveScope;
  #initializeActual?: Promise<void>;
  #initializeSettled?: Promise<MatchHistorySettle>;
  #historyQueue: Promise<void> = Promise.resolve();
  #launchPending = false;
  #outcomeTask?: Readonly<{ sessionId: string; settled: Promise<MatchHistorySettle> }>;

  constructor(options: MatchLifecycleOptions) {
    if (options.enabled && !options.history) {
      throw new Error("An enabled match lifecycle requires history persistence.");
    }
    this.#enabled = options.enabled;
    this.#recoverActiveOnInitialize = options.recoverActiveOnInitialize;
    this.#history = options.history;
    this.#appVersion = options.appVersion;
    this.#readSession = options.readSession;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createAttemptId = options.createAttemptId ?? createAttemptId;
    this.#settleTimeoutMs = options.settleTimeoutMs ?? 700;
    this.#initializeTimeoutMs = options.initializeTimeoutMs ?? 1_200;
    this.#scheduleTimeout = options.scheduleTimeout ?? defaultTimeoutScheduler;
    this.#unsubscribeOutcomes = this.#enabled
      ? options.subscribeOutcomes((event) => this.#observeOutcome(event))
      : () => undefined;
  }

  snapshot(): MatchLifecycleSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  initialize(): Promise<MatchHistorySettle> {
    if (!this.#enabled) {
      if (this.#snapshot.phase !== "ready") this.#setSnapshot({ ...this.#snapshot, phase: "ready" });
      return SETTLED_EXCLUDED;
    }
    if (this.#initializeSettled) return this.#initializeSettled;
    this.#setSnapshot({ ...this.#snapshot, phase: "initializing" });
    const actual = this.#ensureInitialized();
    this.#initializeSettled = this.#settlePromise(
      actual.then(() => Object.freeze({ state: "durable", reason: "initialized" }) satisfies MatchHistorySettle),
      "initialize",
      this.#initializeTimeoutMs,
    ).then((settled) => {
      this.#setSnapshot({ ...this.#snapshot, phase: "ready" });
      return settled;
    });
    return this.#initializeSettled;
  }

  /** Commits the reset synchronously and immediately scopes the recorder to the new session. */
  beginLaunch(spec: MatchLaunchSpec): MatchLaunchHandle {
    if (this.#launchPending || this.#active) return blockedLaunch("busy");

    const beforeSessionId = this.#readSession().sessionId;
    try {
      spec.commit();
    } catch (error) {
      this.#warn("begin", errorMessage(error));
      return blockedLaunch("commit-failed");
    }
    const committed = this.#readSession();
    if (!committed.sessionId || committed.sessionId === beforeSessionId) {
      this.#warn("begin", "The match reset did not create a new game session.");
      return blockedLaunch("session-not-replaced");
    }

    const eligibility = historyEligibility(spec.sessionKind, spec.origin.gameMode);
    if (!this.#enabled || !eligibility.eligible) {
      this.#active = undefined;
      this.#outcomeTask = undefined;
      this.#setSnapshot({ ...this.#snapshot, active: undefined, outcomeGate: undefined });
      return Object.freeze({
        committed: true,
        sessionId: committed.sessionId,
        reason: "committed",
        settled: Promise.resolve(Object.freeze({
          state: "excluded",
          reason: this.#enabled ? eligibility.reason : "history-disabled",
        }) satisfies MatchHistorySettle),
      });
    }

    const attemptId = this.#createAttemptId();
    const startedAt = this.#now();
    const scope = Object.freeze({
      attemptId,
      sessionId: committed.sessionId,
      source: spec.source,
      startedAt,
    });
    this.#active = scope;
    this.#outcomeTask = undefined;
    this.#launchPending = true;
    this.#setSnapshot({
      ...this.#snapshot,
      active: publicScope(scope),
      outcomeGate: undefined,
    });

    const operation = this.#enqueueHistory(() => this.#history!.begin({
      attemptId,
      future: futureIdentityFromMatchOrigin(spec.origin),
      appVersion: this.#appVersion,
      observedContentRevision: spec.origin.observedContentRevision,
      startedAt,
    }));
    const settled = this.#settleOperation(operation, "begin").finally(() => {
      this.#launchPending = false;
    });
    return Object.freeze({
      committed: true,
      sessionId: committed.sessionId,
      attemptId,
      reason: "committed",
      settled,
    });
  }

  /**
   * Captures one immutable explicit-exit snapshot. If an outcome is already being persisted for
   * this session, callers join that same gate instead of navigating ahead of it.
   */
  closeActive(endReason: InterruptedAttemptEndReason): Promise<MatchHistorySettle> {
    const currentSessionId = this.#readSession().sessionId;
    if (!this.#active) {
      if (this.#outcomeTask?.sessionId === currentSessionId) return this.#outcomeTask.settled;
      return Promise.resolve(Object.freeze({ state: "unchanged", reason: "no-active-attempt" }));
    }
    const scope = this.#active;
    if (scope.sessionId !== currentSessionId) {
      return Promise.resolve(Object.freeze({ state: "unchanged", reason: "stale-session" }));
    }
    const facts = freezeFacts(this.#readSession());
    this.#active = undefined;
    this.#setSnapshot({ ...this.#snapshot, active: undefined });
    const operation = this.#enqueueHistory(() => this.#history!.close({
      attemptId: scope.attemptId,
      status: "interrupted",
      endReason,
      endedAt: nowAtLeast(this.#now(), scope.startedAt),
      turnNumber: facts.turnNumber,
      hostTurnNumber: facts.hostTurnNumber,
      finalFacts: {
        playerLife: facts.playerLife,
        hostArchiveRemaining: facts.hostArchiveRemaining,
      },
    }));
    return this.#settleOperation(operation, "close");
  }

  outcomeReady(sessionId: string): boolean {
    return this.#snapshot.outcomeGate?.sessionId !== sessionId
      || this.#snapshot.outcomeGate.state !== "pending";
  }

  dispose(): void {
    this.#unsubscribeOutcomes();
    this.#listeners.clear();
  }

  #ensureInitialized(): Promise<void> {
    if (this.#initializeActual) return this.#initializeActual;
    if (!this.#enabled) return Promise.resolve();
    this.#initializeActual = (async () => {
      await this.#history!.initialize();
      if (this.#recoverActiveOnInitialize) {
        const recovered = await this.#history!.recoverActiveAttempts(this.#now());
        if (recovered.reason === "readonly" || recovered.reason === "full" || recovered.reason === "corrupt") {
          throw new Error(recovered.snapshot.lastError ?? `History recovery is ${recovered.reason}.`);
        }
        if (!recovered.durable && recovered.applied) {
          throw new Error(recovered.snapshot.lastError ?? "Recovered attempts are not durable.");
        }
      }
    })();
    return this.#initializeActual;
  }

  #enqueueHistory(operation: () => Promise<HistoryOperationResult>): Promise<HistoryOperationResult> {
    const run = this.#historyQueue.then(async () => {
      await this.#ensureInitialized();
      return operation();
    });
    this.#historyQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  #observeOutcome(event: MatchOutcomeEvent): void {
    const scope = this.#active;
    if (!scope || scope.sessionId !== event.sessionId) return;
    const current = this.#readSession();
    if (current.sessionId !== scope.sessionId) return;
    const facts = freezeFacts(current);
    this.#active = undefined;
    this.#setSnapshot({
      ...this.#snapshot,
      active: undefined,
      outcomeGate: Object.freeze({ sessionId: scope.sessionId, state: "pending" }),
    });

    const operation = this.#enqueueHistory(() => this.#history!.close({
      attemptId: scope.attemptId,
      status: event.winner === "player" ? "victory" : "defeat",
      endReason: "outcome",
      endedAt: nowAtLeast(this.#now(), scope.startedAt),
      turnNumber: facts.turnNumber,
      hostTurnNumber: facts.hostTurnNumber,
      finalFacts: {
        playerLife: facts.playerLife,
        hostArchiveRemaining: facts.hostArchiveRemaining,
      },
    }));
    const settled = this.#settleOperation(operation, "close").then((result) => {
      if (this.#snapshot.outcomeGate?.sessionId !== scope.sessionId) return result;
      this.#setSnapshot({
        ...this.#snapshot,
        outcomeGate: Object.freeze({
          sessionId: scope.sessionId,
          state: result.state === "durable" || result.state === "unchanged" ? "durable" : "degraded",
        }),
      });
      return result;
    });
    this.#outcomeTask = Object.freeze({ sessionId: scope.sessionId, settled });
  }

  #settleOperation(
    operation: Promise<HistoryOperationResult>,
    warningKind: MatchHistoryWarningKind,
  ): Promise<MatchHistorySettle> {
    const interpreted = operation.then((result) => {
      if (result.reason === "readonly" || result.reason === "full" || result.reason === "corrupt") {
        throw new Error(result.snapshot.lastError ?? `History operation is ${result.reason}.`);
      }
      if (result.durable) {
        return Object.freeze({
          state: result.applied ? "durable" : "unchanged",
          reason: result.reason,
        }) satisfies MatchHistorySettle;
      }
      throw new Error(result.snapshot.lastError ?? `History operation was not durable (${result.reason}).`);
    });
    return this.#settlePromise(interpreted, warningKind, this.#settleTimeoutMs);
  }

  #settlePromise(
    operation: Promise<MatchHistorySettle>,
    warningKind: MatchHistoryWarningKind,
    timeoutMs: number,
  ): Promise<MatchHistorySettle> {
    return new Promise((resolve) => {
      let done = false;
      let cancelTimeout: () => void = () => undefined;
      const finish = (result: MatchHistorySettle) => {
        if (done) return;
        done = true;
        cancelTimeout();
        resolve(result);
      };
      cancelTimeout = this.#scheduleTimeout(() => {
        const reason = `History ${warningKind} exceeded ${timeoutMs} ms.`;
        this.#warn(warningKind, reason);
        finish(Object.freeze({ state: "degraded", reason }));
      }, timeoutMs);
      operation.then(finish).catch((error) => {
        const reason = errorMessage(error);
        this.#warn(warningKind, reason);
        finish(Object.freeze({ state: "degraded", reason }));
      });
    });
  }

  #warn(kind: MatchHistoryWarningKind, reason: string): void {
    this.#setSnapshot({
      ...this.#snapshot,
      warningRevision: this.#snapshot.warningRevision + 1,
      lastWarning: Object.freeze({ kind, reason }),
    });
  }

  #setSnapshot(next: MatchLifecycleSnapshot): void {
    this.#snapshot = freezeSnapshot(next);
    for (const listener of this.#listeners) listener();
  }
}

function blockedLaunch(reason: MatchLaunchHandle["reason"]): MatchLaunchHandle {
  return Object.freeze({
    committed: false,
    reason,
    settled: Promise.resolve(Object.freeze({ state: "unchanged", reason })),
  });
}

function publicScope(scope: ActiveScope): NonNullable<MatchLifecycleSnapshot["active"]> {
  return Object.freeze({
    attemptId: scope.attemptId,
    sessionId: scope.sessionId,
    source: scope.source,
  });
}

function freezeFacts(facts: MatchSessionFacts): MatchSessionFacts {
  return Object.freeze({ ...facts });
}

function freezeSnapshot(snapshot: MatchLifecycleSnapshot): MatchLifecycleSnapshot {
  return Object.freeze({ ...snapshot });
}

function nowAtLeast(candidate: string, minimum: string): string {
  return Date.parse(candidate) < Date.parse(minimum) ? minimum : candidate;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "History lifecycle failed.";
}

function createAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `attempt:${crypto.randomUUID()}`;
  }
  return `attempt:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function defaultTimeoutScheduler(callback: () => void, delayMs: number): () => void {
  const timeout = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timeout);
}
