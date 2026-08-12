export type GuidedBeatKind =
  | "host.arrival"
  | "host.combat"
  | "host.invoked-trigger"
  | "host.trigger"
  | "player.trigger";

export type GuidedBeatBarrierSnapshot = Readonly<{
  blocked: boolean;
  epoch: number;
  pending: readonly GuidedBeatKind[];
}>;

type DeferredBeat = Readonly<{
  epoch: number;
  kind: GuidedBeatKind;
  start: () => void;
}>;

type BeatScheduler = (start: () => void) => void;

/**
 * Holds only the start of the next semantic beat. It never suspends a callback that already owns
 * an animation or a deferred engine commit.
 */
export class GuidedBeatBarrier {
  #blocked = false;
  #epoch = 0;
  #pending: DeferredBeat[] = [];
  #listeners = new Set<(snapshot: GuidedBeatBarrierSnapshot) => void>();
  #snapshot: GuidedBeatBarrierSnapshot = Object.freeze({ blocked: false, epoch: 0, pending: Object.freeze([]) });
  readonly #schedule: BeatScheduler;

  constructor(schedule: BeatScheduler = (start) => queueMicrotask(start)) {
    this.#schedule = schedule;
  }

  /** Returns true when the caller may start now; otherwise retains one epoch-safe continuation. */
  request(kind: GuidedBeatKind, start: () => void): boolean {
    if (!this.#blocked) return true;
    this.#pending.push(Object.freeze({ epoch: this.#epoch, kind, start }));
    this.#emit();
    return false;
  }

  block(): void {
    if (this.#blocked) return;
    this.#blocked = true;
    this.#emit();
  }

  release(): void {
    if (!this.#blocked && this.#pending.length === 0) return;
    this.#blocked = false;
    const pending = this.#pending;
    this.#pending = [];
    const epoch = this.#epoch;
    this.#emit();
    for (const beat of pending) {
      this.#schedule(() => {
        if (epoch !== this.#epoch || beat.epoch !== this.#epoch) return;
        if (this.#blocked) {
          this.#pending.push(beat);
          this.#emit();
          return;
        }
        beat.start();
      });
    }
  }

  /** Discards held work from an abandoned board instead of releasing it into the next session. */
  invalidate(): void {
    this.#epoch += 1;
    this.#blocked = false;
    this.#pending = [];
    this.#emit();
  }

  snapshot(): GuidedBeatBarrierSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: GuidedBeatBarrierSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    this.#snapshot = Object.freeze({
      blocked: this.#blocked,
      epoch: this.#epoch,
      pending: Object.freeze(this.#pending.map((beat) => beat.kind)),
    });
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}
