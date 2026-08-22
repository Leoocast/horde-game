import type { GameplaySignal } from "../guidance/gameplaySignals";
import type { AttemptMilestoneV1 } from "./historyTypes";

const EMPTY_MILESTONES = Object.freeze([]) as readonly AttemptMilestoneV1[];
const HOST_ARCHIVE_THRESHOLD = 10;

/**
 * Bounded, session-scoped recorder for the approved narrative facts. Every value comes from the
 * semantic signal that witnessed the transition; this collector never reads GameState or logs.
 */
export class AttemptMilestoneCollector {
  #sessionId?: string;
  #milestones: AttemptMilestoneV1[] = [];

  beginSession(sessionId: string): void {
    if (!sessionId.trim()) throw new Error("Attempt milestones require a non-empty session id.");
    this.#sessionId = sessionId;
    this.#milestones = [];
  }

  observe(signal: GameplaySignal): void {
    if (signal.sessionId !== this.#sessionId) return;

    switch (signal.kind) {
      case "host.surgeStarted":
        this.#keepFirst({
          kind: "first-surge-field",
          turnNumber: signal.turnNumber,
          echoCount: signal.playerEchoCount,
          sourceCount: signal.playerSourceCount,
        });
        return;
      case "player.lifeLost":
        if (signal.unblockedAttack && signal.sourceId) {
          this.#keepLargest({
            kind: "unblocked-attack",
            turnNumber: signal.turnNumber,
            attackerCount: 1,
            totalDamage: signal.amount,
            ...(signal.sourceName === undefined ? {} : { attackerName: signal.sourceName }),
          }, (milestone) => milestone.kind === "unblocked-attack" ? milestone.totalDamage : -1);
          return;
        }
        if (signal.sourceName) {
          this.#keepLargest({
            kind: "direct-life-loss",
            turnNumber: signal.turnNumber,
            amount: signal.amount,
            sourceName: signal.sourceName,
          }, (milestone) => milestone.kind === "direct-life-loss" ? milestone.amount : -1);
        }
        return;
      case "effect.multiTargetResolved":
        this.#keepLargest({
          kind: "multi-target-effect",
          turnNumber: signal.turnNumber,
          sourceName: signal.sourceName,
          targetCount: signal.targetIds.length,
          effect: signal.effect,
        }, (milestone) => milestone.kind === "multi-target-effect" ? milestone.targetCount : -1);
        return;
      case "host.archiveDiscarded":
        if (signal.hostArchiveRemaining <= HOST_ARCHIVE_THRESHOLD) {
          this.#keepSmallest({
            kind: "host-archive-threshold",
            turnNumber: signal.turnNumber,
            remainingEchoes: signal.hostArchiveRemaining,
          }, (milestone) => milestone.kind === "host-archive-threshold"
            ? milestone.remainingEchoes
            : Number.MAX_SAFE_INTEGER);
        }
        if (signal.endedGame && signal.sourceKind === "archive-attack") {
          this.#keepFirst({
            kind: "victory-source",
            turnNumber: signal.turnNumber,
            sourceKind: "archive-attack",
            ...(signal.sourceName === undefined ? {} : { sourceName: signal.sourceName }),
          });
        }
        return;
      default:
        return;
    }
  }

  snapshot(sessionId: string): readonly AttemptMilestoneV1[] {
    if (sessionId !== this.#sessionId || this.#milestones.length === 0) return EMPTY_MILESTONES;
    return deepFreezeClone(this.#milestones);
  }

  #keepFirst(candidate: AttemptMilestoneV1): void {
    if (this.#milestones.some((milestone) => milestone.kind === candidate.kind)) return;
    this.#milestones = [...this.#milestones, deepFreezeClone(candidate)];
  }

  #keepLargest(
    candidate: AttemptMilestoneV1,
    magnitude: (milestone: AttemptMilestoneV1) => number,
  ): void {
    this.#replaceWhen(candidate, (current) => magnitude(candidate) > magnitude(current));
  }

  #keepSmallest(
    candidate: AttemptMilestoneV1,
    magnitude: (milestone: AttemptMilestoneV1) => number,
  ): void {
    this.#replaceWhen(candidate, (current) => magnitude(candidate) < magnitude(current));
  }

  #replaceWhen(
    candidate: AttemptMilestoneV1,
    shouldReplace: (current: AttemptMilestoneV1) => boolean,
  ): void {
    const index = this.#milestones.findIndex((milestone) => milestone.kind === candidate.kind);
    const frozen = deepFreezeClone(candidate);
    if (index < 0) {
      this.#milestones = [...this.#milestones, frozen];
      return;
    }
    if (!shouldReplace(this.#milestones[index])) return;
    this.#milestones = this.#milestones.map((milestone, milestoneIndex) =>
      milestoneIndex === index ? frozen : milestone,
    );
  }
}

function deepFreezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}
