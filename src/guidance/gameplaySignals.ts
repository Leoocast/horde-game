import type { ActionFailureCode, CardInstance, GameState, Phase, Side } from "../engine/GameTypes";
import { hostInSurge } from "../engine/StaticEffects";
import { playerDrawForecast } from "../engine/TurnManager";
import type { GameplayIntent, GameplayReceiptData } from "./interactionGate";

export type GameplaySignalOrigin = "player" | "system";

export type GameplayLocalizedName = Readonly<{
  es: string;
  en: string;
}>;

export type GameplaySignalDraft =
  | Readonly<{
      kind: "intent.attempted";
      intent: GameplayIntent;
      origin: GameplaySignalOrigin;
      authorization: "allowed" | "guided-blocked" | "journey-blocked" | "contextual-blocked";
      guidanceId?: string;
      relatedCardIds?: readonly string[];
    }>
  | Readonly<{
      kind: "action.committed";
      receipt: GameplayReceiptData;
    }>
  | Readonly<{
      kind: "action.denied";
      intent: GameplayIntent;
      code?: ActionFailureCode;
      reason: string;
    }>
  | Readonly<{
      kind: "phase.changed";
      previousSide: Side;
      previousPhase: Phase;
      side: Side;
      phase: Phase;
    }>
  | Readonly<{
      kind: "turn.started";
      side: Side;
      turnNumber: number;
      hostTurnNumber: number;
    }>
  | Readonly<{
      kind: "player.cardsDrawn";
      cardIds: readonly string[];
      amount: number;
      reason: string;
    }>
  | Readonly<{
      kind: "player.cardsDiscarded";
      cardIds: readonly string[];
      amount: number;
      reason: "effect";
    }>
  | Readonly<{
      kind: "player.reserveReleased";
      amount: number;
    }>
  | Readonly<{
      kind: "player.sourcesReadied";
      cardIds: readonly string[];
      amount: number;
    }>
  | Readonly<{
      kind: "host.cardsRevealed";
      cardIds: readonly string[];
      amount: number;
      reason: "normal" | "surge";
      hostTurnNumber: number;
    }>
  | Readonly<{
      kind: "host.surgeStarted";
      hostTurnNumber: number;
      turnNumber: number;
      playerEchoCount: number;
      playerSourceCount: number;
    }>
  | Readonly<{
      kind: "host.attackersDeclared";
      attackerIds: readonly string[];
    }>
  | Readonly<{
      kind: "combat.echoesDamaged";
      cardIds: readonly string[];
      amount: number;
      turnNumber: number;
    }>
  | Readonly<{
      kind: "player.lifeLost";
      amount: number;
      lifeBefore: number;
      lifeAfter: number;
      turnNumber: number;
      sourceId?: string;
      sourceName?: GameplayLocalizedName;
      unblockedAttack: boolean;
    }>
  | Readonly<{
      kind: "effect.multiTargetResolved";
      turnNumber: number;
      sourceId: string;
      sourceName: GameplayLocalizedName;
      targetIds: readonly string[];
      effect: "minus-one-counters";
    }>
  | Readonly<{
      kind: "host.archiveDiscarded";
      cardIds: readonly string[];
      amount: number;
      turnNumber: number;
      hostArchiveRemaining: number;
      sourceKind?: "archive-attack";
      sourceIds?: readonly string[];
      sourceName?: GameplayLocalizedName;
      endedGame: boolean;
    }>
  | Readonly<{
      kind: "game.ended";
      winner: Side;
    }>;

export type GameplaySignal = GameplaySignalDraft & Readonly<{
  cursor: number;
  sessionId: string;
}>;

export type GameplaySignalSnapshot = Readonly<{
  sessionId: string;
  cursor: number;
  signals: readonly GameplaySignal[];
}>;

export type GameplayTransitionContext = Readonly<{
  lifeLossSourceId?: string;
}>;

const MAX_EPHEMERAL_SIGNALS = 256;

/**
 * Passive semantic stream for one live game session. It never authorizes an action and never
 * changes GameState; contextual help can therefore observe normal matches without activating a
 * guided policy.
 */
export class GameplaySignalStream {
  #sessionId: string;
  #cursor = 0;
  #signals: GameplaySignal[] = [];
  #snapshot: GameplaySignalSnapshot;
  #listeners = new Set<(snapshot: GameplaySignalSnapshot) => void>();

  constructor(sessionId = "game:0") {
    this.#sessionId = sessionId;
    this.#snapshot = createSnapshot(sessionId);
  }

  beginSession(sessionId: string): void {
    if (!sessionId.trim()) throw new Error("Gameplay signal sessions require a non-empty id.");
    this.#sessionId = sessionId;
    this.#cursor = 0;
    this.#signals = [];
    this.#notify();
  }

  publish(draft: GameplaySignalDraft): GameplaySignal {
    this.#cursor += 1;
    const signal = deepFreeze(structuredClone({
      ...draft,
      cursor: this.#cursor,
      sessionId: this.#sessionId,
    })) as GameplaySignal;
    this.#signals = [...this.#signals, signal].slice(-MAX_EPHEMERAL_SIGNALS);
    this.#notify();
    return signal;
  }

  signalsSince(cursor: number, sessionId = this.#sessionId): readonly GameplaySignal[] {
    if (sessionId !== this.#sessionId) return [];
    return this.#signals.filter((signal) => signal.cursor > cursor);
  }

  snapshot(): GameplaySignalSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: GameplaySignalSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  reset(sessionId = "game:0"): void {
    this.beginSession(sessionId);
  }

  #notify(): void {
    this.#snapshot = createSnapshot(this.#sessionId, this.#cursor, this.#signals);
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export const gameplaySignalStream = new GameplaySignalStream();

export function gameplaySignalsForTransition(
  previous: GameState,
  next: GameState,
  context: GameplayTransitionContext = {},
): readonly GameplaySignalDraft[] {
  if (previous === next) return [];
  const signals: GameplaySignalDraft[] = [];

  if (previous.activeSide !== next.activeSide || previous.phase !== next.phase) {
    signals.push({
      kind: "phase.changed",
      previousSide: previous.activeSide,
      previousPhase: previous.phase,
      side: next.activeSide,
      phase: next.phase,
    });
  }

  const playerTurnStarted = next.turnNumber > previous.turnNumber;
  const hostTurnStarted = next.hostTurnNumber > previous.hostTurnNumber;
  if (playerTurnStarted || hostTurnStarted) {
    signals.push({
      kind: "turn.started",
      side: hostTurnStarted ? "host" : "player",
      turnNumber: next.turnNumber,
      hostTurnNumber: next.hostTurnNumber,
    });
  }

  const nextHandIds = new Set(next.player.hand.map((card) => card.instanceId));
  const drawnCardIds = previous.player.archive
    .filter((card) => nextHandIds.has(card.instanceId))
    .map((card) => card.instanceId);
  if (drawnCardIds.length > 0) {
    signals.push({
      kind: "player.cardsDrawn",
      cardIds: drawnCardIds,
      amount: drawnCardIds.length,
      reason: playerDrawReasonForTransition(previous, next),
    });
  }

  const nextPlayerMemoryIds = new Set(next.player.memory.map((card) => card.instanceId));
  const discardedPlayerCardIds = previous.player.hand
    .filter((card) => nextPlayerMemoryIds.has(card.instanceId))
    .map((card) => card.instanceId);
  if (discardedPlayerCardIds.length > 0) {
    signals.push({
      kind: "player.cardsDiscarded",
      cardIds: discardedPlayerCardIds,
      amount: discardedPlayerCardIds.length,
      reason: "effect",
    });
  }

  const releasedReserve = Math.max(0, next.player.energyPool.stored - previous.player.energyPool.stored);
  if (releasedReserve > 0 && previous.player.pendingStoredEnergy > next.player.pendingStoredEnergy) {
    signals.push({ kind: "player.reserveReleased", amount: releasedReserve });
  }

  const previouslyExhaustedSources = new Set(
    previous.player.field
      .filter((card) => card.kinds.includes("SOURCE") && card.exhausted)
      .map((card) => card.instanceId),
  );
  const readiedSourceIds = next.player.field
    .filter((card) => card.kinds.includes("SOURCE") && !card.exhausted && previouslyExhaustedSources.has(card.instanceId))
    .map((card) => card.instanceId);
  if (readiedSourceIds.length > 0) {
    signals.push({ kind: "player.sourcesReadied", cardIds: readiedSourceIds, amount: readiedSourceIds.length });
  }

  const previousHostArchiveIds = new Set(previous.host.archive.map((card) => card.instanceId));
  const previousEventIds = new Set(previous.eventQueue.map((event) => event.id));
  const revealedByPlayedEvent = new Set(
    next.eventQueue
      .filter((event) => event.type === "CARD_PLAYED" && !previousEventIds.has(event.id) && event.sourceId)
      .map((event) => event.sourceId as string),
  );
  const pendingRevealedCardId = next.host.pendingCard?.instanceId;
  const revealedHostCardIds = previous.host.archive
    .filter((card) =>
      next.host.field.some((candidate) => candidate.instanceId === card.instanceId)
      || revealedByPlayedEvent.has(card.instanceId)
      || pendingRevealedCardId === card.instanceId,
    )
    .map((card) => card.instanceId);
  const hostTurnResolution = previous.activeSide === "host" && previous.phase === "host";
  if (hostTurnResolution && revealedHostCardIds.length > 0) {
    signals.push({
      kind: "host.cardsRevealed",
      cardIds: revealedHostCardIds,
      amount: revealedHostCardIds.length,
      reason: hostInSurge(next) ? "surge" : "normal",
      hostTurnNumber: next.hostTurnNumber,
    });
  }

  if (!hostInSurge(previous) && hostInSurge(next)) {
    signals.push({
      kind: "host.surgeStarted",
      hostTurnNumber: next.hostTurnNumber,
      turnNumber: next.turnNumber,
      playerEchoCount: next.player.field.filter((card) => card.kinds.includes("ECHO")).length,
      playerSourceCount: next.player.field.filter((card) => card.kinds.includes("SOURCE")).length,
    });
  }

  if (
    next.combat.hostAttackers.length > 0
    && !sameOrdered(previous.combat.hostAttackers, next.combat.hostAttackers)
  ) {
    signals.push({ kind: "host.attackersDeclared", attackerIds: [...next.combat.hostAttackers] });
  }

  const hostCombatSettled = previous.activeSide === "host"
    && previous.phase === "combat"
    && next.activeSide === "host"
    && next.phase === "end";
  if (hostCombatSettled) {
    const cardIds = [...next.player.field, ...next.host.field]
      .filter((card) => card.kinds.includes("ECHO") && card.damageMarked > 0)
      .map((card) => card.instanceId);
    if (cardIds.length > 0) {
      signals.push({
        kind: "combat.echoesDamaged",
        cardIds,
        amount: cardIds.length,
        turnNumber: next.turnNumber,
      });
    }
  }

  if (next.player.life < previous.player.life) {
    const sourceId = context.lifeLossSourceId;
    const sourceWasHostAttacker = sourceId !== undefined
      && (previous.combat.hostAttackers.includes(sourceId) || next.combat.hostAttackers.includes(sourceId));
    const assignedBlockers = sourceId === undefined
      ? []
      : previous.combat.blockers[sourceId] ?? next.combat.blockers[sourceId] ?? [];
    const sourceName = sourceId === undefined
      ? undefined
      : localizedNameForCard(findCardByInstanceId(previous, sourceId) ?? findCardByInstanceId(next, sourceId));
    signals.push({
      kind: "player.lifeLost",
      amount: previous.player.life - next.player.life,
      lifeBefore: previous.player.life,
      lifeAfter: next.player.life,
      turnNumber: next.turnNumber,
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(sourceName === undefined ? {} : { sourceName }),
      unblockedAttack: sourceWasHostAttacker && assignedBlockers.length === 0,
    });
  }

  const nextEventIds = new Set(next.eventQueue.map((event) => event.id));
  for (const event of previous.eventQueue) {
    if (
      event.type !== "COUNTER_VOLLEY"
      || nextEventIds.has(event.id)
      || event.payload?.sourceSide !== "player"
      || String(event.payload?.counterType ?? "") !== "-1/-1"
      || !event.sourceId
    ) continue;
    const targetIds = Array.isArray(event.payload.targetIds)
      ? event.payload.targetIds
        .map(String)
        .filter((targetId) => Boolean(findCardByInstanceId(previous, targetId)))
      : [];
    const sourceName = localizedNameForCard(findCardByInstanceId(previous, event.sourceId));
    if (targetIds.length < 2 || !sourceName) continue;
    signals.push({
      kind: "effect.multiTargetResolved",
      turnNumber: next.turnNumber,
      sourceId: event.sourceId,
      sourceName,
      targetIds,
      effect: "minus-one-counters",
    });
  }

  const nextHostMemoryIds = new Set(next.host.memory.map((card) => card.instanceId));
  const discardedHostCardIds = previous.host.archive
    .filter((card) => nextHostMemoryIds.has(card.instanceId) && !revealedHostCardIds.includes(card.instanceId))
    .map((card) => card.instanceId);
  if (discardedHostCardIds.length > 0) {
    const playerCombatSourceIds = previous.activeSide === "player" && previous.phase === "combat"
      ? previous.combat.playerAttackers.filter((sourceId) => Boolean(findCardByInstanceId(previous, sourceId)))
      : [];
    const sourceName = playerCombatSourceIds.length === 1
      ? localizedNameForCard(findCardByInstanceId(previous, playerCombatSourceIds[0]))
      : undefined;
    signals.push({
      kind: "host.archiveDiscarded",
      cardIds: discardedHostCardIds,
      amount: discardedHostCardIds.length,
      turnNumber: next.turnNumber,
      hostArchiveRemaining: next.host.archive.length,
      ...(playerCombatSourceIds.length === 0
        ? {}
        : {
            sourceKind: "archive-attack" as const,
            sourceIds: playerCombatSourceIds,
            ...(sourceName === undefined ? {} : { sourceName }),
          }),
      endedGame: !previous.winner && next.winner === "player",
    });
  }

  if (!previous.winner && next.winner) {
    signals.push({ kind: "game.ended", winner: next.winner });
  }

  return signals;
}

export function playerDrawReasonForTransition(previous: GameState, next: GameState): string {
  const recycledSource = previous.player.hand.some((card) =>
    card.kinds.includes("SOURCE") && next.player.archive.some((candidate) => candidate.instanceId === card.instanceId),
  );
  if (recycledSource && !previous.player.energyActionUsedThisTurn && next.player.energyActionUsedThisTurn) {
    return "source-recycle";
  }
  if (next.turnNumber > previous.turnNumber || (previous.phase !== "draw" && next.phase === "draw")) {
    const timing = next.turnNumber > previous.turnNumber && previous.activeSide === "player" ? "next" : "immediate";
    return playerDrawForecast(previous, { timing }).reason;
  }
  return "effect";
}

function createSnapshot(
  sessionId: string,
  cursor = 0,
  signals: readonly GameplaySignal[] = [],
): GameplaySignalSnapshot {
  return Object.freeze({ sessionId, cursor, signals: Object.freeze([...signals]) });
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findCardByInstanceId(game: GameState, instanceId: string): CardInstance | undefined {
  const card = [
    ...game.player.archive,
    ...game.player.hand,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.archive,
    ...game.host.field,
    ...game.host.memory,
    ...game.host.oblivion,
  ].find((candidate) => candidate.instanceId === instanceId);
  if (card) return card;
  return game.host.pendingCard?.instanceId === instanceId ? game.host.pendingCard : undefined;
}

function localizedNameForCard(card: CardInstance | undefined): GameplayLocalizedName | undefined {
  if (!card) return undefined;
  const en = card.displayName.trim();
  const es = card.displayNameEs?.trim() || en;
  if (!en || !es) return undefined;
  return Object.freeze({ es, en });
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}
