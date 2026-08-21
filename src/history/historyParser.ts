import type {
  AttemptFinalFactsV1,
  AttemptMilestoneV1,
  AttemptRecordV1,
  FutureIdentityV1,
  HistoryEnvelopeV1,
} from "./historyTypes";
import { HISTORY_FORMAT_VERSION } from "./historyTypes";

export const HISTORY_LIMITS = Object.freeze({
  attempts: 10_000,
  milestonesPerAttempt: 64,
  identifierLength: 128,
  provenanceLength: 512,
  rngSeedLength: 4_096,
  localizedFactLength: 256,
  setupTurns: 20,
  turnNumber: 1_000_000,
  count: 1_000_000,
});

export type FutureIdentityParseResult =
  | Readonly<{ ok: true; identity: FutureIdentityV1 }>
  | Readonly<{ ok: false; reason: "schema" }>;

export type AttemptRecordParseResult =
  | Readonly<{ ok: true; attempt: AttemptRecordV1 }>
  | Readonly<{ ok: false; reason: "schema" }>;

export type HistoryEnvelopeParseResult =
  | Readonly<{ ok: true; history: HistoryEnvelopeV1 }>
  | Readonly<{ ok: false; reason: "schema" }>;

const FUTURE_SHARED_KEYS = [
  "seedKind",
  "rngSeed",
  "playerDeckKey",
  "hostDeckKey",
  "difficulty",
  "gameMode",
  "setupTurns",
] as const;

const ATTEMPT_REQUIRED_KEYS = [
  "attemptId",
  "sequence",
  "future",
  "appVersion",
  "observedContentRevision",
  "startedAt",
  "updatedAt",
  "status",
] as const;

const ATTEMPT_OPTIONAL_KEYS = [
  "endedAt",
  "endReason",
  "turnNumber",
  "hostTurnNumber",
  "finalFacts",
  "milestones",
] as const;

const CANON_CODE_SHAPE = /^HF1-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}[123]-[A-Z0-9]{3}$/u;

export function parseFutureIdentityV1(value: unknown): FutureIdentityParseResult {
  if (!isRecord(value)) return { ok: false, reason: "schema" };
  if (!isFutureSharedFields(value)) return { ok: false, reason: "schema" };

  if (value.seedKind === "canon") {
    if (!hasExactKeys(value, [...FUTURE_SHARED_KEYS, "format", "canonCode"])) {
      return { ok: false, reason: "schema" };
    }
    if (value.format !== "HF1" || typeof value.canonCode !== "string") {
      return { ok: false, reason: "schema" };
    }
    const canonCode = value.canonCode.toUpperCase();
    if (!CANON_CODE_SHAPE.test(canonCode)) return { ok: false, reason: "schema" };
    return {
      ok: true,
      identity: Object.freeze({
        seedKind: "canon",
        format: "HF1",
        canonCode,
        rngSeed: value.rngSeed,
        playerDeckKey: value.playerDeckKey,
        hostDeckKey: value.hostDeckKey,
        difficulty: value.difficulty,
        gameMode: "standard",
        setupTurns: value.setupTurns,
      }),
    };
  }

  if (value.seedKind === "opaque") {
    if (!hasExactKeys(value, [...FUTURE_SHARED_KEYS, "contentRevision", "rulesetVersion"])) {
      return { ok: false, reason: "schema" };
    }
    if (
      !isBoundedNonEmptyString(value.contentRevision, HISTORY_LIMITS.provenanceLength) ||
      !isIntegerInRange(value.rulesetVersion, 1, Number.MAX_SAFE_INTEGER)
    ) return { ok: false, reason: "schema" };
    return {
      ok: true,
      identity: Object.freeze({
        seedKind: "opaque",
        rngSeed: value.rngSeed,
        playerDeckKey: value.playerDeckKey,
        hostDeckKey: value.hostDeckKey,
        difficulty: value.difficulty,
        gameMode: "standard",
        setupTurns: value.setupTurns,
        contentRevision: value.contentRevision,
        rulesetVersion: value.rulesetVersion,
      }),
    };
  }

  return { ok: false, reason: "schema" };
}

export function parseAttemptRecordV1(value: unknown): AttemptRecordParseResult {
  if (!isRecord(value) || !hasRequiredAndOptionalKeys(value, ATTEMPT_REQUIRED_KEYS, ATTEMPT_OPTIONAL_KEYS)) {
    return { ok: false, reason: "schema" };
  }
  const future = parseFutureIdentityV1(value.future);
  if (!future.ok) return { ok: false, reason: "schema" };
  if (
    !isBoundedNonEmptyString(value.attemptId, HISTORY_LIMITS.identifierLength) ||
    !isIntegerInRange(value.sequence, 1, Number.MAX_SAFE_INTEGER) ||
    !isBoundedNonEmptyString(value.appVersion, HISTORY_LIMITS.provenanceLength) ||
    !isBoundedNonEmptyString(value.observedContentRevision, HISTORY_LIMITS.provenanceLength) ||
    !isIsoTimestamp(value.startedAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    timestamp(value.startedAt) > timestamp(value.updatedAt) ||
    !isAttemptStatus(value.status) ||
    !isOptionalTurnNumber(value.turnNumber) ||
    !isOptionalTurnNumber(value.hostTurnNumber)
  ) return { ok: false, reason: "schema" };

  const finalFacts = value.finalFacts === undefined ? undefined : parseFinalFacts(value.finalFacts);
  if (value.finalFacts !== undefined && !finalFacts) return { ok: false, reason: "schema" };
  const milestones = value.milestones === undefined ? undefined : parseMilestones(value.milestones);
  if (value.milestones !== undefined && !milestones) return { ok: false, reason: "schema" };

  if (value.status === "active") {
    if (value.endedAt !== undefined || value.endReason !== undefined) return { ok: false, reason: "schema" };
  } else {
    if (!isIsoTimestamp(value.endedAt) || !isAttemptEndReason(value.endReason)) {
      return { ok: false, reason: "schema" };
    }
    if (timestamp(value.updatedAt) > timestamp(value.endedAt)) return { ok: false, reason: "schema" };
    if (value.status === "victory" || value.status === "defeat") {
      if (
        value.endReason !== "outcome" ||
        value.turnNumber === undefined ||
        value.hostTurnNumber === undefined ||
        !finalFacts
      ) return { ok: false, reason: "schema" };
    } else if (value.endReason === "outcome") {
      return { ok: false, reason: "schema" };
    }
  }

  const attempt: AttemptRecordV1 = Object.freeze({
    attemptId: value.attemptId,
    sequence: value.sequence,
    future: future.identity,
    appVersion: value.appVersion,
    observedContentRevision: value.observedContentRevision,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    status: value.status,
    ...(value.endedAt === undefined ? {} : { endedAt: value.endedAt }),
    ...(value.endReason === undefined ? {} : { endReason: value.endReason }),
    ...(value.turnNumber === undefined ? {} : { turnNumber: value.turnNumber }),
    ...(value.hostTurnNumber === undefined ? {} : { hostTurnNumber: value.hostTurnNumber }),
    ...(finalFacts === undefined ? {} : { finalFacts }),
    ...(milestones === undefined ? {} : { milestones }),
  });
  return { ok: true, attempt };
}

export function parseHistoryEnvelopeV1(value: unknown): HistoryEnvelopeParseResult {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "formatVersion", "nextSequence", "attempts"])) {
    return { ok: false, reason: "schema" };
  }
  if (
    value.kind !== "hostfall-history" ||
    value.formatVersion !== HISTORY_FORMAT_VERSION ||
    !isIntegerInRange(value.nextSequence, 1, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > HISTORY_LIMITS.attempts
  ) return { ok: false, reason: "schema" };

  const attempts: AttemptRecordV1[] = [];
  const ids = new Set<string>();
  const sequences = new Set<number>();
  let highestSequence = 0;
  for (const candidate of value.attempts) {
    const parsed = parseAttemptRecordV1(candidate);
    if (!parsed.ok || ids.has(parsed.attempt.attemptId) || sequences.has(parsed.attempt.sequence)) {
      return { ok: false, reason: "schema" };
    }
    ids.add(parsed.attempt.attemptId);
    sequences.add(parsed.attempt.sequence);
    highestSequence = Math.max(highestSequence, parsed.attempt.sequence);
    attempts.push(parsed.attempt);
  }
  if (value.nextSequence <= highestSequence) return { ok: false, reason: "schema" };

  return {
    ok: true,
    history: Object.freeze({
      kind: "hostfall-history",
      formatVersion: HISTORY_FORMAT_VERSION,
      nextSequence: value.nextSequence,
      attempts: Object.freeze(attempts),
    }),
  };
}

function isFutureSharedFields(value: Readonly<Record<string, unknown>>): value is Readonly<Record<string, unknown>> & {
  rngSeed: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: "easy" | "normal" | "hard";
  gameMode: "standard";
  setupTurns: number;
} {
  return (
    typeof value.rngSeed === "string" &&
    value.rngSeed.length <= HISTORY_LIMITS.rngSeedLength &&
    isBoundedNonEmptyString(value.playerDeckKey, HISTORY_LIMITS.identifierLength) &&
    isBoundedNonEmptyString(value.hostDeckKey, HISTORY_LIMITS.identifierLength) &&
    (value.difficulty === "easy" || value.difficulty === "normal" || value.difficulty === "hard") &&
    value.gameMode === "standard" &&
    isIntegerInRange(value.setupTurns, 0, HISTORY_LIMITS.setupTurns)
  );
}

function parseFinalFacts(value: unknown): AttemptFinalFactsV1 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["playerLife", "hostArchiveRemaining"])) return undefined;
  if (
    !isIntegerInRange(value.playerLife, -HISTORY_LIMITS.count, HISTORY_LIMITS.count) ||
    !isIntegerInRange(value.hostArchiveRemaining, 0, HISTORY_LIMITS.count)
  ) return undefined;
  return Object.freeze({
    playerLife: value.playerLife,
    hostArchiveRemaining: value.hostArchiveRemaining,
  });
}

function parseMilestones(value: unknown): readonly AttemptMilestoneV1[] | undefined {
  if (!Array.isArray(value) || value.length > HISTORY_LIMITS.milestonesPerAttempt) return undefined;
  const milestones: AttemptMilestoneV1[] = [];
  for (const candidate of value) {
    if (!isAttemptMilestoneV1(candidate)) return undefined;
    milestones.push(deepFreezeClone(candidate) as AttemptMilestoneV1);
  }
  return Object.freeze(milestones);
}

function isAttemptMilestoneV1(value: unknown): value is AttemptMilestoneV1 {
  if (!isRecord(value) || typeof value.kind !== "string" || !isOptionalPositiveTurnNumber(value.turnNumber)) {
    return false;
  }
  const turnKey = value.turnNumber === undefined ? [] : ["turnNumber"];
  switch (value.kind) {
    case "first-surge-field":
      return hasExactKeys(value, ["kind", "echoCount", "sourceCount", ...turnKey]) &&
        isCount(value.echoCount) && isCount(value.sourceCount);
    case "unblocked-attack":
      return hasRequiredAndOptionalKeys(value, ["kind", "attackerCount", "totalDamage", ...turnKey], ["attackerName"]) &&
        isPositiveCount(value.attackerCount) && isPositiveCount(value.totalDamage) &&
        (value.attackerName === undefined || isLocalizedFactText(value.attackerName));
    case "direct-life-loss":
      return hasRequiredAndOptionalKeys(value, ["kind", "amount", ...turnKey], ["sourceName"]) &&
        isPositiveCount(value.amount) &&
        (value.sourceName === undefined || isLocalizedFactText(value.sourceName));
    case "multi-target-effect":
      return hasExactKeys(value, ["kind", "sourceName", "targetCount", "effect", ...turnKey]) &&
        isLocalizedFactText(value.sourceName) && isPositiveCount(value.targetCount) &&
        (value.effect === "damage" || value.effect === "minus-one-counters" || value.effect === "destroy" || value.effect === "return");
    case "host-archive-threshold":
      return hasExactKeys(value, ["kind", "remainingEchoes", ...turnKey]) && isCount(value.remainingEchoes);
    case "unused-reserve":
      return hasExactKeys(value, ["kind", "amount", ...turnKey]) && isPositiveCount(value.amount);
    case "victory-source":
      return hasRequiredAndOptionalKeys(value, ["kind", "sourceKind", ...turnKey], ["sourceName", "amount"]) &&
        (value.sourceKind === "archive-attack" || value.sourceKind === "echo-effect" || value.sourceKind === "combat") &&
        (value.sourceName === undefined || isLocalizedFactText(value.sourceName)) &&
        (value.amount === undefined || isPositiveCount(value.amount));
    case "combat-streak":
      return hasExactKeys(value, ["kind", "echoName", "count", "action", ...turnKey]) &&
        isLocalizedFactText(value.echoName) && isPositiveCount(value.count) &&
        (value.action === "won" || value.action === "defended");
    default:
      return false;
  }
}

function isLocalizedFactText(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["es", "en"]) &&
    isBoundedNonEmptyString(value.es, HISTORY_LIMITS.localizedFactLength) &&
    isBoundedNonEmptyString(value.en, HISTORY_LIMITS.localizedFactLength);
}

function isAttemptStatus(value: unknown): value is AttemptRecordV1["status"] {
  return value === "active" || value === "victory" || value === "defeat" || value === "interrupted";
}

function isAttemptEndReason(value: unknown): value is NonNullable<AttemptRecordV1["endReason"]> {
  return value === "outcome" || value === "menu" || value === "rewrite" || value === "contemplate" || value === "startup-recovery";
}

function isOptionalTurnNumber(value: unknown): value is number | undefined {
  return value === undefined || isIntegerInRange(value, 0, HISTORY_LIMITS.turnNumber);
}

function isOptionalPositiveTurnNumber(value: unknown): value is number | undefined {
  return value === undefined || isIntegerInRange(value, 1, HISTORY_LIMITS.turnNumber);
}

function isCount(value: unknown): value is number {
  return isIntegerInRange(value, 0, HISTORY_LIMITS.count);
}

function isPositiveCount(value: unknown): value is number {
  return isIntegerInRange(value, 1, HISTORY_LIMITS.count);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isBoundedNonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function timestamp(value: string): number {
  return Date.parse(value);
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function hasRequiredAndOptionalKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreezeClone(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreezeClone));
  if (!isRecord(value)) return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepFreezeClone(item)])));
}
