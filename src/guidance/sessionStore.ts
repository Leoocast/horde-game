import type { GuidedCardAlias, GuidedLessonDefinition, GuidedStep } from "./contracts";
import {
  GuidedInteractionGate,
  receiptMatchesSpec,
  type GuidedGameplayReceipt,
  type GuidedInteractionSnapshot,
} from "./interactionGate";
import type { GuidedBeatBarrier } from "./beatBarrier";

export type GuidedSessionStatus = "inactive" | "running" | "completed" | "aborted";
export type GuidedSessionMode = "explain" | "act" | "observe";
export type GuidedSessionEndReason = "game-ended" | "presentation-reset" | "stopped" | "error";

export type GuidedSessionSnapshot = Readonly<{
  status: GuidedSessionStatus;
  sessionId?: string;
  lessonId?: string;
  lessonRevision?: number;
  currentStep?: GuidedStep;
  mode?: GuidedSessionMode;
  bindings: Readonly<Record<GuidedCardAlias, string>>;
  presentationSettled: boolean;
  canContinue: boolean;
  observeReceiptSatisfied: boolean;
  receiptCursor: number;
  endReason?: GuidedSessionEndReason;
  errorMessage?: string;
}>;

type CheckpointProbe = () => boolean;
type CheckpointScheduler = (check: () => void) => void;

export type StartGuidedSessionInput = Readonly<{
  definition: GuidedLessonDefinition;
  bindings: Readonly<Record<GuidedCardAlias, string>>;
  sessionId?: string;
}>;

/**
 * Ephemeral guide state. It observes the real gameplay gate and presentation state, but never
 * mutates GameState or resolves a rule on the engine's behalf.
 */
export class GuidedSessionStore {
  readonly #gate: GuidedInteractionGate;
  readonly #barrier: GuidedBeatBarrier;
  #listeners = new Set<(snapshot: GuidedSessionSnapshot) => void>();
  #definition: GuidedLessonDefinition | undefined;
  #steps = new Map<string, GuidedStep>();
  #currentStep: GuidedStep | undefined;
  #mode: GuidedSessionMode | undefined;
  #status: GuidedSessionStatus = "inactive";
  #sessionId: string | undefined;
  #bindings: Readonly<Record<GuidedCardAlias, string>> = Object.freeze({});
  #presentationSettled = false;
  #observeReceiptSatisfied = false;
  #observeNextStepId: string | undefined;
  #receiptCursor = 0;
  #sessionCounter = 0;
  #checkEpoch = 0;
  #probe: CheckpointProbe | undefined;
  #scheduleCheckpoint: CheckpointScheduler = (check) => queueMicrotask(check);
  #endReason: GuidedSessionEndReason | undefined;
  #errorMessage: string | undefined;
  #snapshot: GuidedSessionSnapshot = freezeSnapshot({
    status: "inactive",
    bindings: Object.freeze({}),
    presentationSettled: false,
    canContinue: false,
    observeReceiptSatisfied: false,
    receiptCursor: 0,
  });

  constructor(gate: GuidedInteractionGate, barrier: GuidedBeatBarrier) {
    this.#gate = gate;
    this.#barrier = barrier;
    gate.subscribe((snapshot) => this.#onInteractionSnapshot(snapshot));
  }

  configureCheckpointProbe(probe: CheckpointProbe, schedule?: CheckpointScheduler): void {
    this.#probe = probe;
    if (schedule) this.#scheduleCheckpoint = schedule;
  }

  start({ definition, bindings, sessionId }: StartGuidedSessionInput): string {
    this.invalidate("presentation-reset");
    this.#definition = definition;
    this.#steps = new Map(definition.steps.map((step) => [step.id, step]));
    this.#currentStep = this.#requireStep(definition.startStepId);
    this.#mode = this.#currentStep.kind;
    this.#status = "running";
    this.#sessionId = sessionId ?? `guided-session-${++this.#sessionCounter}`;
    this.#bindings = Object.freeze({ ...bindings });
    this.#presentationSettled = false;
    this.#observeReceiptSatisfied = this.#currentStep.kind === "observe" && !this.#currentStep.expectedReceipt;
    this.#observeNextStepId = this.#currentStep.kind === "observe" ? this.#currentStep.nextStepId : undefined;
    this.#receiptCursor = this.#gate.snapshot().receiptCursor;
    this.#endReason = undefined;
    this.#errorMessage = undefined;
    this.#activateCurrentPolicy();
    this.#emit();
    this.#requestCheckpointCheck();
    return this.#sessionId;
  }

  continueExplanation(): boolean {
    if (this.#status !== "running" || this.#mode !== "explain" || !this.#presentationSettled) return false;
    const nextStepId = this.#currentStep?.nextStepId;
    if (!nextStepId) {
      this.#complete();
      return true;
    }
    this.#enterAuthoredStep(this.#requireStep(nextStepId));
    return true;
  }

  notifyCheckpointState(settled: boolean): void {
    if (this.#status !== "running") return;
    const changed = this.#presentationSettled !== settled;
    this.#presentationSettled = settled;
    if (this.#mode === "observe" && settled && this.#observeReceiptSatisfied) {
      this.#finishObservation();
      return;
    }
    if (changed) this.#emit();
  }

  notifyGameEnded(): void {
    if (this.#status === "running") this.invalidate("game-ended");
  }

  stop(): void {
    if (this.#status !== "running") return;
    this.#status = "aborted";
    this.#endReason = "stopped";
    this.#checkEpoch += 1;
    this.#gate.deactivate();
    this.#barrier.release();
    this.#emit();
  }

  fail(error: unknown): void {
    if (this.#status !== "running") return;
    this.#status = "aborted";
    this.#endReason = "error";
    this.#errorMessage = error instanceof Error ? error.message : String(error);
    this.#checkEpoch += 1;
    this.#gate.deactivate();
    this.#barrier.invalidate();
    this.#emit();
  }

  /** Abandons the board and discards every beat retained for that board. */
  invalidate(reason: Exclude<GuidedSessionEndReason, "stopped" | "error"> = "presentation-reset"): void {
    const wasActive = this.#status === "running";
    this.#checkEpoch += 1;
    this.#gate.deactivate();
    this.#barrier.invalidate();
    if (!wasActive) return;
    this.#status = "aborted";
    this.#endReason = reason;
    this.#presentationSettled = false;
    this.#emit();
  }

  snapshot(): GuidedSessionSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: GuidedSessionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  resetForTests(): void {
    this.#checkEpoch += 1;
    this.#gate.reset();
    this.#barrier.invalidate();
    this.#definition = undefined;
    this.#steps.clear();
    this.#currentStep = undefined;
    this.#mode = undefined;
    this.#status = "inactive";
    this.#sessionId = undefined;
    this.#bindings = Object.freeze({});
    this.#presentationSettled = false;
    this.#observeReceiptSatisfied = false;
    this.#observeNextStepId = undefined;
    this.#receiptCursor = 0;
    this.#endReason = undefined;
    this.#errorMessage = undefined;
    this.#emit();
  }

  #onInteractionSnapshot(snapshot: GuidedInteractionSnapshot): void {
    if (this.#status !== "running" || !this.#sessionId) return;
    const receipts = snapshot.receipts.filter(
      (receipt) => receipt.sessionId === this.#sessionId && receipt.cursor > this.#receiptCursor,
    );
    if (receipts.length === 0) return;
    for (const receipt of receipts) {
      this.#receiptCursor = receipt.cursor;
      if (this.#mode === "act") {
        this.#enterObservationAfterAction(receipt);
        continue;
      }
      if (this.#mode === "observe") this.#acceptObserveReceipt(receipt);
    }
    this.#emit();
  }

  #enterObservationAfterAction(receipt: GuidedGameplayReceipt): void {
    const nextStepId = this.#currentStep?.nextStepId;
    const next = nextStepId ? this.#requireStep(nextStepId) : undefined;
    if (next?.kind === "observe") {
      this.#currentStep = next;
      this.#observeNextStepId = next.nextStepId;
      this.#observeReceiptSatisfied = next.expectedReceipt ? receiptMatchesSpec(receipt, next.expectedReceipt) : true;
    } else {
      this.#observeNextStepId = nextStepId;
      this.#observeReceiptSatisfied = true;
    }
    this.#mode = "observe";
    this.#presentationSettled = false;
    this.#activateCurrentPolicy();
    this.#requestCheckpointCheck();
  }

  #acceptObserveReceipt(receipt: GuidedGameplayReceipt): void {
    if (this.#currentStep?.kind !== "observe" || !this.#currentStep.expectedReceipt) return;
    if (!receiptMatchesSpec(receipt, this.#currentStep.expectedReceipt)) return;
    this.#observeReceiptSatisfied = true;
    // A semantic result can land before its visual tail registers. Require a fresh checkpoint
    // evaluation instead of trusting a settled value cached earlier in the beat.
    this.#presentationSettled = false;
    this.#requestCheckpointCheck();
  }

  #finishObservation(): void {
    const nextStepId = this.#observeNextStepId;
    if (!nextStepId) {
      this.#complete();
      return;
    }
    this.#enterAuthoredStep(this.#requireStep(nextStepId));
  }

  #enterAuthoredStep(step: GuidedStep): void {
    this.#currentStep = step;
    this.#mode = step.kind;
    this.#presentationSettled = false;
    this.#observeReceiptSatisfied = step.kind === "observe" && !step.expectedReceipt;
    this.#observeNextStepId = step.kind === "observe" ? step.nextStepId : undefined;
    this.#activateCurrentPolicy();
    this.#emit();
    this.#requestCheckpointCheck();
  }

  #activateCurrentPolicy(): void {
    if (!this.#sessionId || !this.#currentStep || !this.#mode) return;
    if (this.#mode === "observe") this.#barrier.release();
    else this.#barrier.block();
    this.#gate.activate({
      sessionId: this.#sessionId,
      stepId: this.#currentStep.id,
      mode: this.#mode,
      bindings: this.#bindings,
      ...(this.#mode === "act" && this.#currentStep.kind === "act"
        ? { allowedIntent: this.#currentStep.allowedIntent }
        : {}),
    });
  }

  #complete(): void {
    this.#status = "completed";
    this.#checkEpoch += 1;
    this.#presentationSettled = true;
    this.#gate.deactivate();
    this.#barrier.release();
    this.#emit();
  }

  #requestCheckpointCheck(): void {
    if (!this.#probe || this.#status !== "running") return;
    const epoch = ++this.#checkEpoch;
    this.#scheduleCheckpoint(() => {
      if (epoch !== this.#checkEpoch || this.#status !== "running") return;
      this.notifyCheckpointState(this.#probe!());
    });
  }

  #requireStep(stepId: string): GuidedStep {
    const step = this.#steps.get(stepId);
    if (!step) throw new Error(`Guided session cannot find step "${stepId}" in lesson "${this.#definition?.id}".`);
    return step;
  }

  #emit(): void {
    this.#snapshot = freezeSnapshot({
      status: this.#status,
      sessionId: this.#sessionId,
      lessonId: this.#definition?.id,
      lessonRevision: this.#definition?.revision,
      currentStep: this.#currentStep,
      mode: this.#mode,
      bindings: this.#bindings,
      presentationSettled: this.#presentationSettled,
      canContinue: this.#status === "running" && this.#mode === "explain" && this.#presentationSettled,
      observeReceiptSatisfied: this.#observeReceiptSatisfied,
      receiptCursor: this.#receiptCursor,
      endReason: this.#endReason,
      errorMessage: this.#errorMessage,
    });
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

function freezeSnapshot(snapshot: GuidedSessionSnapshot): GuidedSessionSnapshot {
  return Object.freeze({ ...snapshot, bindings: Object.freeze({ ...snapshot.bindings }) });
}
