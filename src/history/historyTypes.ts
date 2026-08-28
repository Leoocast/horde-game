export const HISTORY_FORMAT_VERSION = 1 as const;

export type HistoryDifficulty = "easy" | "normal" | "hard";

type SharedFutureFieldsV1 = Readonly<{
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: HistoryDifficulty;
  gameMode: "standard";
  setupTurns: number;
}>;

export type CanonFutureIdentityV1 = SharedFutureFieldsV1 & Readonly<{
  seedKind: "canon";
  format: "HF1";
  canonCode: string;
  rngSeed: string;
}>;

export type OpaqueFutureIdentityV1 = SharedFutureFieldsV1 & Readonly<{
  seedKind: "opaque";
  rngSeed: string;
  contentRevision: string;
  rulesetVersion: number;
}>;

export type FutureIdentityV1 = CanonFutureIdentityV1 | OpaqueFutureIdentityV1;

export type AttemptStatus = "active" | "victory" | "defeat" | "interrupted";
export type ClosedAttemptStatus = Exclude<AttemptStatus, "active">;
export type AttemptEndReason = "outcome" | "menu" | "rewrite" | "contemplate" | "startup-recovery";
export type InterruptedAttemptEndReason = Exclude<AttemptEndReason, "outcome">;

export type AttemptFinalFactsV1 = Readonly<{
  playerLife: number;
  hostArchiveRemaining: number;
}>;

export type LocalizedFactTextV1 = Readonly<{
  es: string;
  en: string;
}>;

type AttemptMilestoneBaseV1 = Readonly<{
  turnNumber?: number;
}>;

/** Versioned copy of the approved Phase 1 factual vocabulary; rendered prose is never persisted. */
export type AttemptMilestoneV1 =
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "first-surge-field";
      echoCount: number;
      sourceCount: number;
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "unblocked-attack";
      attackerCount: number;
      totalDamage: number;
      attackerName?: LocalizedFactTextV1;
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "direct-life-loss";
      amount: number;
      sourceName?: LocalizedFactTextV1;
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "multi-target-effect";
      sourceName: LocalizedFactTextV1;
      targetCount: number;
      effect: "damage" | "minus-one-counters" | "destroy" | "return";
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "host-archive-threshold";
      remainingEchoes: number;
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "unused-reserve";
      amount: number;
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "victory-source";
      sourceKind: "archive-attack" | "echo-effect" | "combat";
      sourceName?: LocalizedFactTextV1;
      amount?: number;
    }>)
  | (AttemptMilestoneBaseV1 & Readonly<{
      kind: "combat-streak";
      echoName: LocalizedFactTextV1;
      count: number;
      action: "won" | "defended";
    }>);

export type AttemptRecordV1 = Readonly<{
  attemptId: string;
  sequence: number;
  future: FutureIdentityV1;
  appVersion: string;
  observedContentRevision: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  status: AttemptStatus;
  endReason?: AttemptEndReason;
  turnNumber?: number;
  hostTurnNumber?: number;
  finalFacts?: AttemptFinalFactsV1;
  milestones?: readonly AttemptMilestoneV1[];
}>;

export type HistoryEnvelopeV1 = Readonly<{
  kind: "hostfall-history";
  formatVersion: typeof HISTORY_FORMAT_VERSION;
  nextSequence: number;
  attempts: readonly AttemptRecordV1[];
}>;

export type FutureAggregateStatus = "preserved" | "lost" | "interrupted";

export type FutureHistoryGroupV1 = Readonly<{
  key: string;
  future: FutureIdentityV1;
  status: FutureAggregateStatus;
  lastSequence: number;
  attempts: readonly AttemptRecordV1[];
}>;
