import type { ContentCatalog } from "../content/ContentCatalog";
import type { MatchOrigin } from "../content/MatchOrigin";
import { contentCatalog } from "../content/bootstrap";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { groupHistoryByFuture } from "./historyDomain";
import { resolveFutureIdentity, type FutureResolutionResult } from "./historyFuture";
import type { HistoryHealth, HistoryServiceSnapshot } from "./historyService";
import type {
  AttemptFinalFactsV1,
  AttemptMilestoneV1,
  AttemptStatus,
  FutureAggregateStatus,
  FutureIdentityV1,
} from "./historyTypes";

export type HistoryLibraryAttemptViewModel = Readonly<{
  attemptId: string;
  ordinal: number;
  status: Exclude<AttemptStatus, "active">;
  turnNumber?: number;
  finalFacts?: AttemptFinalFactsV1;
  milestones: readonly AttemptMilestoneV1[];
  startedAt: string;
  endedAt?: string;
}>;

export type HistoryLibraryFutureViewModel = Readonly<{
  key: string;
  code: string;
  visualSeed: string;
  status: FutureAggregateStatus;
  seedKind: FutureIdentityV1["seedKind"];
  copyIdentity?: string;
  localOnly: boolean;
  playerDeckKey: string;
  hostDeckKey: string;
  playerDeckId?: string;
  hostDeckId?: string;
  difficulty: FutureIdentityV1["difficulty"];
  setupTurns: number;
  identityRevision: string;
  collision: boolean;
  attempts: readonly HistoryLibraryAttemptViewModel[];
  replayOrigin?: MatchOrigin;
  replayUnavailableReason?: Exclude<FutureResolutionResult, { ok: true }>["reason"];
}>;

export type HistoryLibraryViewModel = Readonly<{
  phase: "loading" | "empty" | "ready";
  health: HistoryHealth;
  writable: boolean;
  dirty: boolean;
  futures: readonly HistoryLibraryFutureViewModel[];
}>;

type HistoryViewModelOptions = Readonly<{
  catalog?: ContentCatalog;
  resolveFuture?: (future: FutureIdentityV1) => FutureResolutionResult;
}>;

/**
 * Player-facing projection of persisted history. It never mutates records and it resolves an exact
 * replay payload up front, so the React layer cannot invent deck fallbacks or reinterpret a seed.
 */
export function buildHistoryLibraryViewModel(
  snapshot: HistoryServiceSnapshot,
  options: HistoryViewModelOptions = {},
): HistoryLibraryViewModel {
  const catalog = options.catalog ?? contentCatalog;
  const resolveFuture = options.resolveFuture ?? ((future: FutureIdentityV1) => resolveFutureIdentity(future, catalog));
  if (snapshot.phase !== "ready") {
    return Object.freeze({
      phase: "loading",
      health: snapshot.health,
      writable: snapshot.writable,
      dirty: snapshot.dirty,
      futures: Object.freeze([]),
    });
  }

  const drafts = groupHistoryByFuture(snapshot.history).map((group) => {
    const future = group.future;
    const visualSeed = future.seedKind === "canon" ? future.canonCode : future.rngSeed;
    const resolution = resolveFuture(future);
    const playerDeck = catalog.findDeck(future.playerDeckKey);
    const hostDeck = catalog.findDeck(future.hostDeckKey);
    return {
      key: group.key,
      code: futureCodeFromSeed(visualSeed),
      visualSeed,
      status: group.status,
      seedKind: future.seedKind,
      ...(future.seedKind === "canon" ? { copyIdentity: future.canonCode } : {}),
      localOnly: future.seedKind === "opaque",
      playerDeckKey: future.playerDeckKey,
      hostDeckKey: future.hostDeckKey,
      ...(playerDeck ? { playerDeckId: playerDeck.deck.id } : {}),
      ...(hostDeck ? { hostDeckId: hostDeck.deck.id } : {}),
      difficulty: future.difficulty,
      setupTurns: future.setupTurns,
      identityRevision: future.seedKind === "canon"
        ? future.format
        : `r${future.rulesetVersion} · ${future.contentRevision}`,
      attempts: Object.freeze([...group.attempts]
        .sort((left, right) => left.sequence - right.sequence)
        .map((attempt, index) => Object.freeze({
          attemptId: attempt.attemptId,
          ordinal: index + 1,
          // Active is an internal marker. If persistence is read-only and recovery could not close
          // it, the library still presents the player-safe meaning: an interrupted attempt.
          status: attempt.status === "active" ? "interrupted" as const : attempt.status,
          ...(attempt.turnNumber === undefined ? {} : { turnNumber: attempt.turnNumber }),
          ...(attempt.finalFacts === undefined ? {} : { finalFacts: attempt.finalFacts }),
          milestones: attempt.milestones ?? Object.freeze([]),
          startedAt: attempt.startedAt,
          ...(attempt.endedAt === undefined ? {} : { endedAt: attempt.endedAt }),
        }))),
      ...(resolution.ok
        ? { replayOrigin: resolution.origin }
        : { replayUnavailableReason: resolution.reason }),
    };
  });

  const codeCounts = new Map<string, number>();
  for (const draft of drafts) codeCounts.set(draft.code, (codeCounts.get(draft.code) ?? 0) + 1);
  const futures = Object.freeze(drafts.map((draft) => Object.freeze({
    ...draft,
    collision: (codeCounts.get(draft.code) ?? 0) > 1,
  })));

  return Object.freeze({
    phase: futures.length === 0 ? "empty" : "ready",
    health: snapshot.health,
    writable: snapshot.writable,
    dirty: snapshot.dirty,
    futures,
  });
}
