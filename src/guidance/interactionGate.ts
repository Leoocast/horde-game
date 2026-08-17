import type {
  GuidedBlockAssignment,
  GuidedCardAlias,
  GuidedIntentContext,
  GuidedIntentSpec,
  GuidedReceiptKind,
  GuidedReceiptSpec,
} from "./contracts";
import { gameplaySignalStream } from "./gameplaySignals";
import { contextualIntentGate } from "./contextualIntentGate";
import { journeyIntentGate } from "./journeyIntentGate";

/** Public GameStore methods that represent a deliberate, rule-affecting player choice. */
export const GUIDED_GAMEPLAY_ENTRY_POINTS = [
  "acceptOpeningHand",
  "mulliganOpeningHand",
  "lockCounterTarget",
  "deselectCounterTarget",
  "cancelCounterTargeting",
  "confirmCounterTargeting",
  "lockTributeOfTheFourSorrowsSelectionTarget",
  "deselectTributeOfTheFourSorrowsSelectionTarget",
  "confirmTributeOfTheFourSorrowsSelection",
  "selectHandLimitDiscard",
  "confirmHandLimitDiscard",
  "startSpellTargeting",
  "lockSpellTarget",
  "deselectSpellTarget",
  "cancelSpellTargeting",
  "confirmSpellTargeting",
  "advancePhase",
  "endPlayerTurn",
  "playLand",
  "startEnergyRecycle",
  "castCard",
  "activateAbility",
  "toggleAttacker",
  "attackAll",
  "cancelPlayerAttackers",
  "finishPlayerCombat",
  "runHostMain",
  "declareBlocker",
  "cancelBlocks",
  "resolveHostCombat",
  "finishHostTurn",
] as const;

export type GameplayIntent =
  | Readonly<{ kind: "opening.accept" | "opening.mulligan" }>
  | Readonly<{ kind: "card.inspect" | "card.play" | "source.recycle"; cardId: string; targetIds?: readonly string[] }>
  | Readonly<{ kind: "ability.activate"; cardId: string; abilityId: string; targetIds?: readonly string[] }>
  | Readonly<{ kind: "target.choose"; context: GuidedIntentContext; targetId: string }>
  | Readonly<{ kind: "target.deselect" | "target.cancel"; context: GuidedIntentContext }>
  | Readonly<{ kind: "target.confirm"; context: GuidedIntentContext; targetIds: readonly string[] }>
  | Readonly<{ kind: "discard.choose"; context: "hand-limit"; cardId: string }>
  | Readonly<{ kind: "discard.deselect"; context: "hand-limit" }>
  | Readonly<{ kind: "discard.confirm"; context: "hand-limit"; cardId: string }>
  | Readonly<{
      kind:
        | "phase.continueSetup"
        | "phase.awakenHost"
        | "phase.resolveHost"
        | "phase.startPlayerTurn"
        | "phase.chooseAttackers"
        | "phase.passCombat"
        | "phase.endTurn";
    }>
  | Readonly<{ kind: "phase.advance"; phase?: string }>
  | Readonly<{ kind: "combat.toggleAttacker"; cardId: string; selected: boolean }>
  | Readonly<{ kind: "combat.selectAllAttackers"; targetIds: readonly string[] }>
  | Readonly<{ kind: "combat.cancelAttackers"; targetIds: readonly string[] }>
  | Readonly<{ kind: "combat.confirmArchiveAttack"; targetIds: readonly string[] }>
  | Readonly<{ kind: "combat.assignBlocker"; cardId: string; targetId: string; selected: boolean }>
  | Readonly<{ kind: "combat.cancelBlocks"; assignments: readonly GameplayBlockAssignment[] }>
  | Readonly<{ kind: "combat.confirmDefense"; assignments: readonly GameplayBlockAssignment[] }>;

export type GameplayBlockAssignment = Readonly<{
  blockerId: string;
  attackerId: string;
}>;

export type GameplayReceiptData = Readonly<{
  kind: GuidedReceiptKind;
  cardId?: string;
  targetId?: string;
  targetIds?: readonly string[];
  assignments?: readonly GameplayBlockAssignment[];
  abilityId?: string;
  amount?: number;
  reason?: string;
}>;

export type GuidedGameplayReceipt = GameplayReceiptData & Readonly<{
  cursor: number;
  sessionId: string;
  stepId: string;
  cardAlias?: GuidedCardAlias;
  targetAlias?: GuidedCardAlias;
  targetAliases?: readonly GuidedCardAlias[];
  aliasAssignments?: readonly GuidedBlockAssignment[];
}>;

export type GuidedIntentRejectionReason =
  | "step-not-actionable"
  | "step-action-consumed"
  | "intent-kind-mismatch"
  | "context-mismatch"
  | "binding-missing"
  | "card-mismatch"
  | "target-mismatch"
  | "selection-mismatch"
  | "ability-mismatch";

export type GuidedIntentRejection = Readonly<{
  attemptCursor: number;
  sessionId: string;
  stepId: string;
  reason: GuidedIntentRejectionReason;
  intent: GameplayIntent;
}>;

export type GuidedInteractionPolicy = Readonly<{
  sessionId: string;
  stepId: string;
  mode: "explain" | "act" | "observe";
  bindings: Readonly<Record<GuidedCardAlias, string>>;
  allowedIntent?: GuidedIntentSpec;
}>;

export type GuidedInteractionSnapshot = Readonly<{
  policy?: GuidedInteractionPolicy;
  receiptCursor: number;
  attemptCursor: number;
  receipts: readonly GuidedGameplayReceipt[];
  lastRejection?: GuidedIntentRejection;
}>;

export type GameplayAuthorization =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; rejection: GuidedIntentRejection }>;

const MAX_EPHEMERAL_RECEIPTS = 64;

/**
 * Semantic authority shared by every UI route into gameplay. It is deliberately separate from
 * GameState: rules never know that a guide exists, and a normal match pays only one inactive check.
 */
export class GuidedInteractionGate {
  #policy: GuidedInteractionPolicy | undefined;
  #receiptCursor = 0;
  #attemptCursor = 0;
  #receipts: GuidedGameplayReceipt[] = [];
  #lastRejection: GuidedIntentRejection | undefined;
  #snapshot = createInteractionSnapshot();
  #listeners = new Set<(snapshot: GuidedInteractionSnapshot) => void>();
  #systemActionDepth = 0;
  #completedStepKey: string | undefined;

  activate(policy: GuidedInteractionPolicy): void {
    if (!policy.sessionId.trim()) throw new Error("Guided interaction policy requires a sessionId.");
    if (!policy.stepId.trim()) throw new Error("Guided interaction policy requires a stepId.");
    if (policy.mode === "act" && !policy.allowedIntent) {
      throw new Error(`Guided act step "${policy.stepId}" requires an allowed intent.`);
    }
    if (policy.mode !== "act" && policy.allowedIntent) {
      throw new Error(`Guided ${policy.mode} step "${policy.stepId}" cannot allow a gameplay intent.`);
    }
    const changedSession = this.#policy?.sessionId !== policy.sessionId;
    if (changedSession) this.#receipts = [];
    const nextStepKey = stepKey(policy);
    if (this.#policy && stepKey(this.#policy) !== nextStepKey) this.#completedStepKey = undefined;
    if (!this.#policy) this.#completedStepKey = undefined;
    this.#lastRejection = undefined;
    this.#completedStepKey = undefined;
    this.#policy = freezePolicy(policy);
    this.#notify();
  }

  deactivate(): void {
    this.#policy = undefined;
    this.#receipts = [];
    this.#lastRejection = undefined;
    this.#notify();
  }

  authorize(intent: GameplayIntent): GameplayAuthorization {
    if (this.#systemActionDepth > 0) return { allowed: true };
    const policy = this.#policy;
    if (!policy) return { allowed: true };
    const reason = this.#completedStepKey === stepKey(policy)
      ? "step-action-consumed"
      : policy.mode !== "act" || !policy.allowedIntent
      ? "step-not-actionable"
      : mismatchReason(policy.allowedIntent, intent, policy.bindings);
    if (!reason) return { allowed: true };
    this.#attemptCursor += 1;
    const rejection: GuidedIntentRejection = Object.freeze({
      attemptCursor: this.#attemptCursor,
      sessionId: policy.sessionId,
      stepId: policy.stepId,
      reason,
      intent,
    });
    this.#lastRejection = rejection;
    this.#notify();
    return { allowed: false, rejection };
  }

  publish(data: GameplayReceiptData): GuidedGameplayReceipt | undefined {
    const policy = this.#policy;
    if (!policy) return undefined;
    if (policy.mode === "act") this.#completedStepKey = stepKey(policy);
    this.#receiptCursor += 1;
    const aliases = reverseBindings(policy.bindings);
    const receipt: GuidedGameplayReceipt = Object.freeze({
      ...data,
      targetIds: data.targetIds ? Object.freeze([...data.targetIds]) : undefined,
      assignments: data.assignments ? freezeAssignments(data.assignments) : undefined,
      cursor: this.#receiptCursor,
      sessionId: policy.sessionId,
      stepId: policy.stepId,
      cardAlias: data.cardId ? aliases.get(data.cardId) : undefined,
      targetAlias: data.targetId ? aliases.get(data.targetId) : undefined,
      targetAliases: data.targetIds
        ? Object.freeze(data.targetIds.map((id) => aliases.get(id)).filter((alias): alias is string => Boolean(alias)))
        : undefined,
      aliasAssignments: data.assignments
        ? Object.freeze(data.assignments.flatMap((assignment) => {
            const blockerAlias = aliases.get(assignment.blockerId);
            const attackerAlias = aliases.get(assignment.attackerId);
            return blockerAlias && attackerAlias ? [{ blockerAlias, attackerAlias }] : [];
          }))
        : undefined,
    });
    this.#receipts = [...this.#receipts, receipt].slice(-MAX_EPHEMERAL_RECEIPTS);
    this.#notify();
    return receipt;
  }

  receiptsSince(cursor: number, sessionId = this.#policy?.sessionId): readonly GuidedGameplayReceipt[] {
    return this.#receipts.filter((receipt) => receipt.cursor > cursor && (!sessionId || receipt.sessionId === sessionId));
  }

  snapshot(): GuidedInteractionSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: GuidedInteractionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  runSystemAction<T>(action: () => T): T {
    this.#systemActionDepth += 1;
    try {
      return action();
    } finally {
      this.#systemActionDepth -= 1;
    }
  }

  systemActionActive(): boolean {
    return this.#systemActionDepth > 0;
  }

  /** Test/process reset. Production session exits should use deactivate so cursors stay monotonic. */
  reset(): void {
    this.#policy = undefined;
    this.#receiptCursor = 0;
    this.#attemptCursor = 0;
    this.#receipts = [];
    this.#lastRejection = undefined;
    this.#systemActionDepth = 0;
    this.#completedStepKey = undefined;
    this.#notify();
  }

  #notify(): void {
    this.#snapshot = createInteractionSnapshot(
      this.#policy,
      this.#receiptCursor,
      this.#attemptCursor,
      this.#receipts,
      this.#lastRejection,
    );
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export const guidedInteractionGate = new GuidedInteractionGate();

export function gameplayIntentAllowed(intent: GameplayIntent): boolean {
  const origin = guidedInteractionGate.systemActionActive() ? "system" : "player";
  const guidedAuthorization = guidedInteractionGate.authorize(intent);
  const journeyAuthorization = guidedAuthorization.allowed && origin === "player"
    ? journeyIntentGate.authorize(intent)
    : { allowed: true as const };
  const contextualAuthorization = guidedAuthorization.allowed && journeyAuthorization.allowed && origin === "player"
    ? contextualIntentGate.authorize(intent)
    : { allowed: true as const };
  gameplaySignalStream.publish({
    kind: "intent.attempted",
    intent,
    origin,
    authorization: !guidedAuthorization.allowed
      ? "guided-blocked"
      : !journeyAuthorization.allowed
      ? "journey-blocked"
      : !contextualAuthorization.allowed
      ? "contextual-blocked"
      : "allowed",
    ...(!journeyAuthorization.allowed
      ? {
          guidanceId: journeyAuthorization.guidanceId,
          relatedCardIds: journeyAuthorization.relatedCardIds,
        }
      : {}),
  });
  return guidedAuthorization.allowed && journeyAuthorization.allowed && contextualAuthorization.allowed;
}

export function publishGameplayReceipt(
  data: GameplayReceiptData,
  options: Readonly<{ observe?: boolean }> = {},
): GuidedGameplayReceipt | undefined {
  if (options.observe !== false) gameplaySignalStream.publish({ kind: "action.committed", receipt: data });
  return guidedInteractionGate.publish(data);
}

export function publishGameplayDenial(
  intent: GameplayIntent,
  failure: Readonly<{ reason?: string; code?: import("../engine/GameTypes").ActionFailureCode }>,
): void {
  if (!failure.reason) return;
  gameplaySignalStream.publish({
    kind: "action.denied",
    intent,
    reason: failure.reason,
    code: failure.code,
  });
}

export function runGuidedSystemAction<T>(action: () => T): T {
  return guidedInteractionGate.runSystemAction(action);
}

export function toGuidedInteractionBindings(
  bindings: Readonly<Record<GuidedCardAlias, Readonly<{ instanceId: string }>>>,
): Readonly<Record<GuidedCardAlias, string>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(bindings).map(([alias, binding]) => [alias, binding.instanceId]),
  ));
}

export function receiptMatchesSpec(receipt: GuidedGameplayReceipt, spec: GuidedReceiptSpec): boolean {
  if (receipt.kind !== spec.kind) return false;
  if (spec.cardAlias !== undefined && receipt.cardAlias !== spec.cardAlias) return false;
  if (spec.targetAlias !== undefined && receipt.targetAlias !== spec.targetAlias) return false;
  if (spec.targetAliases !== undefined && !sameOrdered(receipt.targetAliases ?? [], spec.targetAliases)) return false;
  if (spec.assignments !== undefined && !sameAssignments(receipt.aliasAssignments ?? [], spec.assignments)) return false;
  if (spec.amount !== undefined && receipt.amount !== spec.amount) return false;
  if (spec.reason !== undefined && receipt.reason !== spec.reason) return false;
  return true;
}

function mismatchReason(
  expected: GuidedIntentSpec,
  actual: GameplayIntent,
  bindings: Readonly<Record<GuidedCardAlias, string>>,
): GuidedIntentRejectionReason | undefined {
  if (expected.kind !== actual.kind) return "intent-kind-mismatch";
  if (expected.context !== undefined && (!hasContext(actual) || actual.context !== expected.context)) {
    return "context-mismatch";
  }
  if (expected.abilityId !== undefined && (!hasAbility(actual) || actual.abilityId !== expected.abilityId)) {
    return "ability-mismatch";
  }
  if (expected.selected !== undefined && (!("selected" in actual) || actual.selected !== expected.selected)) {
    return "selection-mismatch";
  }

  const expectedCardId = resolveBinding(expected.cardAlias, bindings);
  if (expected.cardAlias && !expectedCardId) return "binding-missing";
  if (expected.cardAlias !== undefined && (!hasCard(actual) || actual.cardId !== expectedCardId)) {
    return "card-mismatch";
  }

  const expectedTargetId = resolveBinding(expected.targetAlias, bindings);
  if (expected.targetAlias && !expectedTargetId) return "binding-missing";
  if (expected.targetAlias !== undefined && (!hasTarget(actual) || actual.targetId !== expectedTargetId)) {
    return "target-mismatch";
  }

  if (expected.targetAliases !== undefined) {
    const expectedIds = resolveBindings(expected.targetAliases, bindings);
    if (!expectedIds) return "binding-missing";
    if (!hasTargets(actual) || !sameOrdered(actual.targetIds, expectedIds)) return "selection-mismatch";
  } else if (expected.targetAliasOptions !== undefined) {
    const allowedIds = resolveBindings(expected.targetAliasOptions, bindings);
    if (!allowedIds) return "binding-missing";
    const selectedIds = hasTarget(actual)
      ? [actual.targetId]
      : hasTargets(actual)
        ? actual.targetIds
        : [];
    const expectedCount = expected.targetCount ?? 1;
    if (
      selectedIds.length !== expectedCount
      || new Set(selectedIds).size !== selectedIds.length
      || selectedIds.some((targetId) => !allowedIds.includes(targetId))
    ) {
      return "selection-mismatch";
    }
  } else if (hasTargets(actual) && actual.targetIds.length > 0) {
    // Fully-authored lessons cannot smuggle unlisted targets through a broad card/action match.
    return "selection-mismatch";
  }

  if (expected.assignments !== undefined) {
    const expectedAssignments = resolveAssignments(expected.assignments, bindings);
    if (!expectedAssignments) return "binding-missing";
    if (!hasAssignments(actual) || !sameRuntimeAssignments(actual.assignments, expectedAssignments)) {
      return "selection-mismatch";
    }
  }
  return undefined;
}

function freezePolicy(policy: GuidedInteractionPolicy): GuidedInteractionPolicy {
  return Object.freeze({
    ...policy,
    bindings: Object.freeze({ ...policy.bindings }),
    allowedIntent: policy.allowedIntent
      ? Object.freeze({
          ...policy.allowedIntent,
          targetAliases: policy.allowedIntent.targetAliases
            ? Object.freeze([...policy.allowedIntent.targetAliases])
            : undefined,
          targetAliasOptions: policy.allowedIntent.targetAliasOptions
            ? Object.freeze([...policy.allowedIntent.targetAliasOptions])
            : undefined,
          assignments: policy.allowedIntent.assignments
            ? Object.freeze(policy.allowedIntent.assignments.map((assignment) => Object.freeze({ ...assignment })))
            : undefined,
        })
      : undefined,
  });
}

function createInteractionSnapshot(
  policy?: GuidedInteractionPolicy,
  receiptCursor = 0,
  attemptCursor = 0,
  receipts: readonly GuidedGameplayReceipt[] = [],
  lastRejection?: GuidedIntentRejection,
): GuidedInteractionSnapshot {
  return Object.freeze({
    policy,
    receiptCursor,
    attemptCursor,
    receipts: Object.freeze([...receipts]),
    lastRejection,
  });
}

function stepKey(policy: Pick<GuidedInteractionPolicy, "sessionId" | "stepId">): string {
  return `${policy.sessionId}\u0000${policy.stepId}`;
}

function reverseBindings(bindings: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(Object.entries(bindings).map(([alias, instanceId]) => [instanceId, alias]));
}

function resolveBinding(alias: string | undefined, bindings: Readonly<Record<string, string>>): string | undefined {
  return alias === undefined ? undefined : bindings[alias];
}

function resolveBindings(aliases: readonly string[], bindings: Readonly<Record<string, string>>): string[] | undefined {
  const ids = aliases.map((alias) => bindings[alias]);
  return ids.some((id) => !id) ? undefined : ids;
}

function resolveAssignments(
  assignments: readonly GuidedBlockAssignment[],
  bindings: Readonly<Record<string, string>>,
): GameplayBlockAssignment[] | undefined {
  const resolved = assignments.map(({ blockerAlias, attackerAlias }) => ({
    blockerId: bindings[blockerAlias],
    attackerId: bindings[attackerAlias],
  }));
  return resolved.some(({ blockerId, attackerId }) => !blockerId || !attackerId)
    ? undefined
    : resolved as GameplayBlockAssignment[];
}

function hasContext(intent: GameplayIntent): intent is Extract<GameplayIntent, { context: GuidedIntentContext }> {
  return "context" in intent;
}

function hasAbility(intent: GameplayIntent): intent is Extract<GameplayIntent, { abilityId: string }> {
  return "abilityId" in intent;
}

function hasCard(intent: GameplayIntent): intent is Extract<GameplayIntent, { cardId: string }> {
  return "cardId" in intent;
}

function hasTarget(intent: GameplayIntent): intent is Extract<GameplayIntent, { targetId: string }> {
  return "targetId" in intent;
}

function hasTargets(intent: GameplayIntent): intent is Extract<GameplayIntent, { targetIds: readonly string[] }> {
  return "targetIds" in intent && Array.isArray(intent.targetIds);
}

function hasAssignments(intent: GameplayIntent): intent is Extract<GameplayIntent, { assignments: readonly GameplayBlockAssignment[] }> {
  return "assignments" in intent && Array.isArray(intent.assignments);
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRuntimeAssignments(left: readonly GameplayBlockAssignment[], right: readonly GameplayBlockAssignment[]): boolean {
  return sameOrdered(canonicalAssignments(left), canonicalAssignments(right));
}

function sameAssignments(left: readonly GuidedBlockAssignment[], right: readonly GuidedBlockAssignment[]): boolean {
  const canonical = (items: readonly GuidedBlockAssignment[]) => items
    .map(({ blockerAlias, attackerAlias }) => `${blockerAlias}>${attackerAlias}`)
    .sort();
  return sameOrdered(canonical(left), canonical(right));
}

function canonicalAssignments(assignments: readonly GameplayBlockAssignment[]): string[] {
  return assignments.map(({ blockerId, attackerId }) => `${blockerId}>${attackerId}`).sort();
}

function freezeAssignments(assignments: readonly GameplayBlockAssignment[]): readonly GameplayBlockAssignment[] {
  return Object.freeze(assignments.map((assignment) => Object.freeze({ ...assignment })));
}
