export type GuidedPresentationActivityKind =
  | "hand.entry"
  | "reserve.transfer"
  | "battlefield.heavy-landing"
  | "phase.banner"
  | "life.damage"
  | "host.invoked-trigger"
  | "host.trigger-beat"
  | "player.trigger-beat";

export type GuidedPresentationActivity = Readonly<{
  id: number;
  epoch: number;
  kind: GuidedPresentationActivityKind;
  detail?: string;
}>;

export type GuidedPresentationActivitySnapshot = Readonly<{
  epoch: number;
  active: readonly GuidedPresentationActivity[];
  activeCount: number;
  settled: boolean;
}>;

export type GuidedPresentationActivityToken = Readonly<{
  activity: GuidedPresentationActivity;
  end: () => boolean;
}>;

/**
 * Tracks presentation that cannot be observed through GameStore because it lives inside React,
 * Framer Motion or a beat runner. Tokens are epoch-bound: completing an animation from a previous
 * board after reset is a harmless no-op.
 */
export class GuidedPresentationActivityRegistry {
  #epoch = 0;
  #nextId = 0;
  #active = new Map<number, GuidedPresentationActivity>();
  #listeners = new Set<(snapshot: GuidedPresentationActivitySnapshot) => void>();
  #snapshot = freezeSnapshot(0, []);

  begin(kind: GuidedPresentationActivityKind, detail?: string): GuidedPresentationActivityToken {
    const activity = Object.freeze({
      id: ++this.#nextId,
      epoch: this.#epoch,
      kind,
      ...(detail ? { detail } : {}),
    });
    this.#active.set(activity.id, activity);
    this.#emit();
    let ended = false;
    return Object.freeze({
      activity,
      end: () => {
        if (ended) return false;
        ended = true;
        if (activity.epoch !== this.#epoch || !this.#active.delete(activity.id)) return false;
        this.#emit();
        return true;
      },
    });
  }

  reset(): void {
    this.#epoch += 1;
    this.#active.clear();
    this.#emit();
  }

  snapshot(): GuidedPresentationActivitySnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: GuidedPresentationActivitySnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    this.#snapshot = freezeSnapshot(this.#epoch, [...this.#active.values()]);
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

function freezeSnapshot(
  epoch: number,
  active: readonly GuidedPresentationActivity[],
): GuidedPresentationActivitySnapshot {
  const frozen = Object.freeze([...active]);
  return Object.freeze({
    epoch,
    active: frozen,
    activeCount: frozen.length,
    settled: frozen.length === 0,
  });
}
