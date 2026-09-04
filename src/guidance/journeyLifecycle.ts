export type GuidedJourneyStatus = "idle" | "running" | "aborted" | "failed";

export type GuidedJourneyDefinition = Readonly<{
  id: string;
  revision: number;
  setupTurns: number;
}>;

export type GuidedJourneySnapshot = Readonly<{
  cursor: number;
  status: GuidedJourneyStatus;
  journeyId?: string;
  journeyRevision?: number;
  attempt: number;
  gameSessionId?: string;
  errorMessage?: string;
}>;

export type GuidedJourneyHost = Readonly<{
  loadInitialBoard(): string;
  afterContextualSessionStarted?(gameSessionId: string): void;
  stopPresentation(): void;
}>;

export type GuidedJourneyContextualProgress = Readonly<{
  beginSession(gameSessionId: string, mode: "isolated"): void;
  rollbackProvisional(): void;
  setProgressMode(mode: "immediate"): void;
}>;

export type GuidedJourneyInterventions = Readonly<{ stop(): void }>;

/** Ephemeral shell. It never completes or persists the journey before the future CTA says so. */
export class GuidedJourneyLifecycle {
  readonly #definition: GuidedJourneyDefinition;
  readonly #host: GuidedJourneyHost;
  readonly #contextual: GuidedJourneyContextualProgress;
  readonly #interventions: GuidedJourneyInterventions;
  #attempt = 0;
  #cursor = 0;
  #listeners = new Set<() => void>();
  #snapshot: GuidedJourneySnapshot = Object.freeze({ cursor: 0, status: "idle", attempt: 0 });

  constructor(
    definition: GuidedJourneyDefinition,
    host: GuidedJourneyHost,
    contextual: GuidedJourneyContextualProgress,
    interventions: GuidedJourneyInterventions,
  ) {
    this.#definition = definition;
    this.#host = host;
    this.#contextual = contextual;
    this.#interventions = interventions;
  }

  snapshot(): GuidedJourneySnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(): boolean {
    return this.#launch();
  }

  restart(): boolean {
    if (this.#snapshot.status !== "running" && this.#snapshot.status !== "failed") return false;
    return this.#launch();
  }

  stop(): void {
    if (this.#snapshot.status !== "running" && this.#snapshot.status !== "failed") return;
    this.#interventions.stop();
    this.#contextual.rollbackProvisional();
    this.#contextual.setProgressMode("immediate");
    this.#host.stopPresentation();
    this.#emit("aborted");
  }

  #launch(): boolean {
    this.#interventions.stop();
    this.#contextual.rollbackProvisional();
    this.#host.stopPresentation();
    try {
      const gameSessionId = this.#host.loadInitialBoard();
      this.#contextual.beginSession(gameSessionId, "isolated");
      this.#host.afterContextualSessionStarted?.(gameSessionId);
      this.#attempt += 1;
      this.#emit("running", { gameSessionId });
      return true;
    } catch (error) {
      this.#contextual.rollbackProvisional();
      this.#contextual.setProgressMode("immediate");
      this.#emit("failed", { errorMessage: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  #emit(status: GuidedJourneyStatus, details: Partial<GuidedJourneySnapshot> = {}): void {
    this.#snapshot = Object.freeze({
      cursor: ++this.#cursor,
      status,
      journeyId: this.#definition.id,
      journeyRevision: this.#definition.revision,
      attempt: this.#attempt,
      ...details,
    });
    for (const listener of this.#listeners) listener();
  }
}
