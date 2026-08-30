import type { GameplayIntent } from "./interactionGate";
import type { GameplaySignalSnapshot, GameplaySignalStream } from "./gameplaySignals";
import type { GuidedProgressStore, ContextualConceptProgress } from "./progress";
import { contextualConceptSeen } from "./progress";
import type { ContextualConceptRegistry } from "./ContextualConceptRegistry";
import type {
  ContextualConceptDefinition,
  ContextualConceptMatch,
  ContextualConceptPresentation,
  ContextualQueuedConcept,
  ContextualRuntimeContext,
} from "./contextualContracts";
import type { ContextualIntentAuthorization } from "./contextualIntentGate";

export type ContextualProgressMode = "immediate" | "provisional" | "isolated";
export type ContextualRuntimeStatus = "idle" | "waiting" | "presenting";

export type ContextualRuntimeSnapshot = Readonly<{
  status: ContextualRuntimeStatus;
  gameSessionId: string;
  progressMode: ContextualProgressMode;
  signalCursor: number;
  queue: readonly string[];
  shownThisMatch: readonly string[];
  provisionalConcepts: readonly string[];
  active?: ContextualConceptPresentation;
  lastInterceptedConceptId?: string;
}>;

type RuntimeScheduler = (task: () => void) => void;

/**
 * One-concept-at-a-time contextual guide. The queue and provisional ledger are intentionally
 * ephemeral; only acknowledged concepts cross into GuidedProgressStore.
 */
export class ContextualTutorialRuntime {
  readonly #registry: ContextualConceptRegistry;
  readonly #signals: GameplaySignalStream;
  readonly #progress: GuidedProgressStore;
  readonly #readContext: () => ContextualRuntimeContext;
  readonly #scheduleTask: RuntimeScheduler;
  #gameSessionId: string;
  #progressMode: ContextualProgressMode = "immediate";
  #signalCursor = 0;
  #queue: ContextualQueuedConcept[] = [];
  #active: ContextualQueuedConcept | undefined;
  #shownThisMatch = new Set<string>();
  #provisional = new Map<string, ContextualConceptProgress>();
  #enqueueOrder = 0;
  #promotionScheduled = false;
  #lastInterceptedConceptId: string | undefined;
  #listeners = new Set<() => void>();
  #snapshot: ContextualRuntimeSnapshot;
  #disposeSignals: () => void;
  #disposeProgress: () => void;

  constructor(
    registry: ContextualConceptRegistry,
    signals: GameplaySignalStream,
    progress: GuidedProgressStore,
    readContext: () => ContextualRuntimeContext,
    scheduleTask: RuntimeScheduler = (task) => queueMicrotask(task),
  ) {
    this.#registry = registry;
    this.#signals = signals;
    this.#progress = progress;
    this.#readContext = readContext;
    this.#scheduleTask = scheduleTask;
    this.#gameSessionId = signals.snapshot().sessionId;
    this.#snapshot = freezeSnapshot(this.#gameSessionId);
    this.#disposeSignals = signals.subscribe((snapshot) => this.#onSignalSnapshot(snapshot));
    this.#disposeProgress = progress.subscribe(() => this.refresh());
    this.#onSignalSnapshot(signals.snapshot());
  }

  snapshot(): ContextualRuntimeSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Explicit journeys call this after planting their game session; normal matches auto-start. */
  beginSession(gameSessionId: string, progressMode: ContextualProgressMode = "immediate"): void {
    if (!gameSessionId.trim()) throw new Error("Contextual sessions require a non-empty gameSessionId.");
    this.#resetSession(gameSessionId, progressMode, false);
    const signalSnapshot = this.#signals.snapshot();
    if (signalSnapshot.sessionId === gameSessionId) this.#signalCursor = signalSnapshot.cursor;
    this.#emit();
  }

  setProgressMode(progressMode: ContextualProgressMode): void {
    if (this.#progressMode === progressMode) return;
    if (this.#provisional.size > 0) throw new Error("Cannot change contextual progress mode with an accepted provisional ledger.");
    this.#progressMode = progressMode;
    this.#emit();
  }

  /** Re-evaluates presentation readiness after animations, targeting or strict guidance change. */
  refresh(): void {
    this.#schedulePromotion();
  }

  authorizeIntent(intent: GameplayIntent): ContextualIntentAuthorization {
    const context = this.#readContext();
    if (context.guidedActive) return Object.freeze({ allowed: true });
    const active = this.#active;
    if (active?.definition.policy === "preventive" && active.definition.prevent?.(intent, context)) {
      this.#lastInterceptedConceptId = active.definition.id;
      this.#emit();
      return Object.freeze({ allowed: false, conceptId: active.definition.id });
    }
    for (const definition of this.#registry.concepts) {
      if (definition.policy !== "preventive" || !definition.prevent || !this.#eligible(definition)) continue;
      const match = definition.prevent(intent, context);
      if (!match) continue;
      this.#enqueue(definition, match, this.#signalCursor + 1);
      this.#lastInterceptedConceptId = definition.id;
      this.#promoteNow();
      this.#emit();
      return Object.freeze({ allowed: false, conceptId: definition.id });
    }
    return Object.freeze({ allowed: true });
  }

  acknowledgeActive(shownAt = new Date().toISOString()): boolean {
    const item = this.#active;
    if (!item) return false;
    const entry = Object.freeze({
      conceptId: item.definition.id,
      shownRevision: item.definition.revision,
      shownAt,
    });
    if (this.#progressMode === "provisional") this.#provisional.set(entry.conceptId, entry);
    else if (
      this.#progressMode === "immediate"
      || (this.#progressMode === "isolated" && item.definition.persistWhenAcknowledgedInIsolated)
    ) {
      this.#progress.markConceptSeen(entry.conceptId, entry.shownRevision, entry.shownAt);
    }
    this.#active = undefined;
    this.#lastInterceptedConceptId = undefined;
    this.#emit();
    this.#schedulePromotion();
    return true;
  }

  /**
   * A strict journey can teach a contextual concept in its own authored sequence. Suppression is
   * scoped to the current match and never leaks into the player's persisted help preferences.
   */
  suppressConceptsForSession(conceptIds: readonly string[]): void {
    const suppressed = new Set(conceptIds);
    if (suppressed.size === 0) return;
    for (const conceptId of suppressed) this.#shownThisMatch.add(conceptId);
    this.#queue = this.#queue.filter((item) => !suppressed.has(item.definition.id));
    if (this.#active && suppressed.has(this.#active.definition.id)) {
      this.#active = undefined;
      this.#lastInterceptedConceptId = undefined;
    }
    this.#emit();
    this.#schedulePromotion();
  }

  /** Atomic concept commit used by the future journey CTA. */
  commitProvisional(): boolean {
    const entries = [...this.#provisional.values()];
    this.#provisional.clear();
    const changed = this.#progress.markConceptsSeen(entries);
    this.#emit();
    return changed;
  }

  /** Abandoning the prologue forgets both accepted concepts and every pending presentation. */
  rollbackProvisional(): void {
    this.#provisional.clear();
    this.#queue = [];
    this.#active = undefined;
    this.#shownThisMatch.clear();
    this.#lastInterceptedConceptId = undefined;
    this.#emit();
  }

  dispose(): void {
    this.#disposeSignals();
    this.#disposeProgress();
    this.#listeners.clear();
  }

  #onSignalSnapshot(snapshot: GameplaySignalSnapshot): void {
    if (snapshot.sessionId !== this.#gameSessionId) this.#resetSession(snapshot.sessionId, "immediate", false);
    const signals = snapshot.signals.filter((signal) => signal.cursor > this.#signalCursor);
    if (signals.length === 0) {
      this.#signalCursor = Math.max(this.#signalCursor, snapshot.cursor);
      return;
    }
    const context = this.#readContext();
    for (const signal of signals) {
      this.#signalCursor = signal.cursor;
      for (const definition of this.#registry.concepts) {
        if (!definition.signalKinds.includes(signal.kind) || !this.#eligible(definition)) continue;
        const match = definition.evaluate(signal, context);
        if (match) this.#enqueue(definition, match, signal.cursor);
      }
    }
    this.#emit();
    this.#schedulePromotion();
  }

  #eligible(definition: ContextualConceptDefinition): boolean {
    if (this.#shownThisMatch.has(definition.id)) return false;
    if (this.#active?.definition.id === definition.id) return false;
    if (this.#queue.some((item) => item.definition.id === definition.id)) return false;
    if (this.#progressMode === "isolated") return true;
    const progress = this.#progress.snapshot();
    return !contextualConceptSeen(progress, definition) || !progress.preferences.hideSeenContextualHelp;
  }

  #enqueue(definition: ContextualConceptDefinition, match: ContextualConceptMatch, triggerCursor: number): void {
    if (!this.#eligible(definition)) return;
    this.#queue.push(Object.freeze({
      definition,
      match: freezeMatch(match),
      triggerCursor,
      enqueuedOrder: ++this.#enqueueOrder,
    }));
    this.#queue.sort((left, right) =>
      right.definition.priority - left.definition.priority
      || left.triggerCursor - right.triggerCursor
      || left.enqueuedOrder - right.enqueuedOrder,
    );
  }

  #schedulePromotion(): void {
    if (this.#promotionScheduled) return;
    this.#promotionScheduled = true;
    this.#scheduleTask(() => {
      this.#promotionScheduled = false;
      this.#promoteNow();
    });
  }

  #promoteNow(): void {
    const context = this.#readContext();
    let activeDismissed = false;
    if (this.#active) {
      const remainsRelevant = this.#active.definition.revalidate?.(this.#active.match, context) ?? true;
      if (remainsRelevant) return;
      this.#active = undefined;
      this.#lastInterceptedConceptId = undefined;
      activeDismissed = true;
    }
    const before = this.#queue.length;
    this.#queue = this.#queue.filter((item) => item.definition.revalidate?.(item.match, context) ?? true);
    if (!context.presentationReady || context.guidedActive || context.targetingActive) {
      if (activeDismissed || this.#queue.length !== before) this.#emit();
      return;
    }
    const next = this.#queue.shift();
    if (!next) {
      if (activeDismissed || this.#queue.length !== before) this.#emit();
      return;
    }
    this.#active = next;
    this.#shownThisMatch.add(next.definition.id);
    this.#emit();
  }

  #resetSession(gameSessionId: string, progressMode: ContextualProgressMode, emit = true): void {
    this.#gameSessionId = gameSessionId;
    this.#progressMode = progressMode;
    this.#signalCursor = 0;
    this.#queue = [];
    this.#active = undefined;
    this.#shownThisMatch.clear();
    this.#provisional.clear();
    this.#enqueueOrder = 0;
    this.#promotionScheduled = false;
    this.#lastInterceptedConceptId = undefined;
    if (emit) this.#emit();
  }

  #emit(): void {
    const active = this.#active ? presentationFrom(this.#active) : undefined;
    this.#snapshot = freezeSnapshot(
      this.#gameSessionId,
      active ? "presenting" : this.#queue.length > 0 ? "waiting" : "idle",
      this.#progressMode,
      this.#signalCursor,
      this.#queue.map(({ definition }) => definition.id),
      [...this.#shownThisMatch],
      [...this.#provisional.keys()],
      active,
      this.#lastInterceptedConceptId,
    );
    for (const listener of this.#listeners) listener();
  }
}

function presentationFrom(item: ContextualQueuedConcept): ContextualConceptPresentation {
  return Object.freeze({
    conceptId: item.definition.id,
    revision: item.definition.revision,
    policy: item.definition.policy,
    copy: item.definition.copy,
    highlights: Object.freeze([...(item.match.highlights ?? [])]),
    placement: item.match.placement,
    triggerCursor: item.triggerCursor,
  });
}

function freezeMatch(match: ContextualConceptMatch): ContextualConceptMatch {
  return Object.freeze({
    ...match,
    highlights: match.highlights ? Object.freeze(match.highlights.map((highlight) => Object.freeze({ ...highlight }))) : undefined,
  });
}

function freezeSnapshot(
  gameSessionId: string,
  status: ContextualRuntimeStatus = "idle",
  progressMode: ContextualProgressMode = "immediate",
  signalCursor = 0,
  queue: readonly string[] = [],
  shownThisMatch: readonly string[] = [],
  provisionalConcepts: readonly string[] = [],
  active?: ContextualConceptPresentation,
  lastInterceptedConceptId?: string,
): ContextualRuntimeSnapshot {
  return Object.freeze({
    status,
    gameSessionId,
    progressMode,
    signalCursor,
    queue: Object.freeze([...queue]),
    shownThisMatch: Object.freeze([...shownThisMatch]),
    provisionalConcepts: Object.freeze([...provisionalConcepts]),
    active,
    lastInterceptedConceptId,
  });
}
