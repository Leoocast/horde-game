import { parseAttemptRecordV1, parseFutureIdentityV1 } from "./historyParser";
import {
  HISTORY_FORMAT_VERSION,
  type AttemptFinalFactsV1,
  type AttemptMilestoneV1,
  type AttemptRecordV1,
  type FutureAggregateStatus,
  type FutureHistoryGroupV1,
  type FutureIdentityV1,
  type HistoryEnvelopeV1,
  type InterruptedAttemptEndReason,
} from "./historyTypes";

export type BeginAttemptInput = Readonly<{
  attemptId: string;
  future: FutureIdentityV1;
  appVersion: string;
  observedContentRevision: string;
  startedAt?: string;
}>;

type CloseAttemptBase = Readonly<{
  attemptId: string;
  endedAt?: string;
  milestones?: readonly AttemptMilestoneV1[];
}>;

export type CloseOutcomeAttemptInput = CloseAttemptBase & Readonly<{
  status: "victory" | "defeat";
  endReason: "outcome";
  turnNumber: number;
  hostTurnNumber: number;
  finalFacts: AttemptFinalFactsV1;
}>;

export type CloseInterruptedAttemptInput = CloseAttemptBase & Readonly<{
  status: "interrupted";
  endReason: InterruptedAttemptEndReason;
  turnNumber?: number;
  hostTurnNumber?: number;
  finalFacts?: AttemptFinalFactsV1;
}>;

export type CloseAttemptInput = CloseOutcomeAttemptInput | CloseInterruptedAttemptInput;

export type UpdateAttemptForExplicitExitInput = Readonly<{
  attemptId: string;
  updatedAt?: string;
  turnNumber?: number;
  hostTurnNumber?: number;
  finalFacts?: AttemptFinalFactsV1;
  milestones?: readonly AttemptMilestoneV1[];
}>;

export type AttemptMutationResult = Readonly<{
  history: HistoryEnvelopeV1;
  attempt?: AttemptRecordV1;
  changed: boolean;
}>;

export function createEmptyHistoryEnvelopeV1(): HistoryEnvelopeV1 {
  return Object.freeze({
    kind: "hostfall-history",
    formatVersion: HISTORY_FORMAT_VERSION,
    nextSequence: 1,
    attempts: Object.freeze([]),
  });
}

export function beginHistoryAttempt(
  history: HistoryEnvelopeV1,
  input: BeginAttemptInput,
): Readonly<{ history: HistoryEnvelopeV1; attempt: AttemptRecordV1 }> {
  if (history.attempts.some((attempt) => attempt.attemptId === input.attemptId)) {
    throw new Error(`History attempt "${input.attemptId}" already exists.`);
  }
  if (history.nextSequence >= Number.MAX_SAFE_INTEGER) {
    throw new Error("History sequence space is exhausted.");
  }
  const future = parseFutureIdentityV1(input.future);
  if (!future.ok) throw new Error("Cannot begin an attempt with an invalid Future identity.");
  const startedAt = input.startedAt ?? new Date().toISOString();
  const parsed = parseAttemptRecordV1({
    attemptId: input.attemptId,
    sequence: history.nextSequence,
    future: future.identity,
    appVersion: input.appVersion,
    observedContentRevision: input.observedContentRevision,
    startedAt,
    updatedAt: startedAt,
    status: "active",
  });
  if (!parsed.ok) throw new Error("Cannot begin an attempt with invalid history metadata.");
  return Object.freeze({
    attempt: parsed.attempt,
    history: Object.freeze({
      ...history,
      nextSequence: history.nextSequence + 1,
      attempts: Object.freeze([...history.attempts, parsed.attempt]),
    }),
  });
}

export function closeHistoryAttempt(
  history: HistoryEnvelopeV1,
  input: CloseAttemptInput,
): AttemptMutationResult {
  const current = history.attempts.find((attempt) => attempt.attemptId === input.attemptId);
  // Captured callbacks own one attemptId. Unknown or already-closed IDs can never fall through to
  // whichever attempt happens to be current now.
  if (!current || current.status !== "active") {
    return Object.freeze({ history, attempt: current, changed: false });
  }
  const endedAt = input.endedAt ?? new Date().toISOString();
  if (Date.parse(endedAt) < Date.parse(current.updatedAt)) {
    throw new Error("Attempt closure cannot move backwards in time.");
  }
  const parsed = parseAttemptRecordV1({
    ...current,
    status: input.status,
    endReason: input.endReason,
    updatedAt: endedAt,
    endedAt,
    ...(input.turnNumber === undefined ? {} : { turnNumber: input.turnNumber }),
    ...(input.hostTurnNumber === undefined ? {} : { hostTurnNumber: input.hostTurnNumber }),
    ...(input.finalFacts === undefined ? {} : { finalFacts: input.finalFacts }),
    ...(input.milestones === undefined ? {} : { milestones: input.milestones }),
  });
  if (!parsed.ok) throw new Error("Cannot close an attempt with invalid outcome metadata.");
  const nextHistory = replaceAttempt(history, parsed.attempt);
  return Object.freeze({ history: nextHistory, attempt: parsed.attempt, changed: true });
}

/** Explicit-exit enrichment only. This is intentionally not a per-turn gameplay autosave API. */
export function updateHistoryAttemptForExplicitExit(
  history: HistoryEnvelopeV1,
  input: UpdateAttemptForExplicitExitInput,
): AttemptMutationResult {
  const current = history.attempts.find((attempt) => attempt.attemptId === input.attemptId);
  if (!current || current.status !== "active") {
    return Object.freeze({ history, attempt: current, changed: false });
  }
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (Date.parse(updatedAt) < Date.parse(current.updatedAt)) {
    throw new Error("Attempt metadata cannot move backwards in time.");
  }
  const parsed = parseAttemptRecordV1({
    ...current,
    updatedAt,
    ...(input.turnNumber === undefined ? {} : { turnNumber: input.turnNumber }),
    ...(input.hostTurnNumber === undefined ? {} : { hostTurnNumber: input.hostTurnNumber }),
    ...(input.finalFacts === undefined ? {} : { finalFacts: input.finalFacts }),
    ...(input.milestones === undefined ? {} : { milestones: input.milestones }),
  });
  if (!parsed.ok) throw new Error("Cannot update an attempt with invalid history metadata.");
  const nextHistory = replaceAttempt(history, parsed.attempt);
  return Object.freeze({ history: nextHistory, attempt: parsed.attempt, changed: true });
}

export function futureIdentityKey(future: FutureIdentityV1): string {
  if (future.seedKind === "canon") return `canon:${future.format}:${future.canonCode.toUpperCase()}`;
  return `opaque:v1:${JSON.stringify([
    future.rngSeed,
    future.playerDeckKey,
    future.hostDeckKey,
    future.difficulty,
    future.gameMode,
    future.setupTurns,
    future.contentRevision,
    future.rulesetVersion,
  ])}`;
}

export function aggregateFutureStatus(attempts: readonly AttemptRecordV1[]): FutureAggregateStatus {
  if (attempts.some((attempt) => attempt.status === "victory")) return "preserved";
  if (attempts.some((attempt) => attempt.status === "defeat")) return "lost";
  // Active attempts are internal markers and are recovered as interrupted before the library is
  // shown. Treating an active-only group conservatively keeps the projection total and non-winning.
  return "interrupted";
}

export function groupHistoryByFuture(history: HistoryEnvelopeV1): readonly FutureHistoryGroupV1[] {
  const buckets = new Map<string, AttemptRecordV1[]>();
  for (const attempt of history.attempts) {
    const key = futureIdentityKey(attempt.future);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(attempt);
    else buckets.set(key, [attempt]);
  }
  const groups = [...buckets.entries()].map(([key, bucket]) => {
    const attempts = Object.freeze([...bucket].sort((left, right) => right.sequence - left.sequence));
    return Object.freeze({
      key,
      future: attempts[0].future,
      status: aggregateFutureStatus(attempts),
      lastSequence: attempts[0].sequence,
      attempts,
    });
  });
  groups.sort((left, right) => right.lastSequence - left.lastSequence);
  return Object.freeze(groups);
}

function replaceAttempt(history: HistoryEnvelopeV1, replacement: AttemptRecordV1): HistoryEnvelopeV1 {
  return Object.freeze({
    ...history,
    attempts: Object.freeze(history.attempts.map((attempt) =>
      attempt.attemptId === replacement.attemptId ? replacement : attempt)),
  });
}
