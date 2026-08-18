import type { ContentCatalog } from "../content/ContentCatalog";
import type { GameState } from "../engine/GameTypes";
import { buildGuidedScenario, type BuiltGuidedScenario } from "./buildGuidedScenario";
import type { GuidedLessonDefinition } from "./contracts";
import { toGuidedInteractionBindings } from "./interactionGate";
import type { GuidedLessonRegistry } from "./GuidedLessonRegistry";
import type { GuidedSessionStore } from "./sessionStore";

export type GuidedLessonBoard = BuiltGuidedScenario & Readonly<{
  playerDeckId: string;
  hostDeckId: string;
}>;

export type GuidedLessonHost = Readonly<{
  loadBoard(board: GuidedLessonBoard): void;
  stopPresentation(): void;
  readGame(): GameState;
}>;

export type StartGuidedLessonOptions = Readonly<{
  sessionId?: string;
}>;

export type GuidedLessonOrchestratorEvent = Readonly<{
  cursor: number;
  kind: "lesson.started" | "lesson.restarted" | "lesson.stopped" | "lesson.failed";
  lessonId: string;
  lessonRevision: number;
  sessionId?: string;
  errorMessage?: string;
}>;

/**
 * Product-facing launcher for declarative lessons. It owns board construction and session startup,
 * while GuidedSessionStore remains the deck-agnostic step state machine.
 */
export class GuidedLessonOrchestrator {
  readonly #catalog: ContentCatalog;
  readonly #registry: GuidedLessonRegistry;
  readonly #session: GuidedSessionStore;
  readonly #host: GuidedLessonHost;
  #activeDefinition: GuidedLessonDefinition | undefined;
  #eventCursor = 0;
  #listeners = new Set<(event: GuidedLessonOrchestratorEvent) => void>();

  constructor(
    catalog: ContentCatalog,
    registry: GuidedLessonRegistry,
    session: GuidedSessionStore,
    host: GuidedLessonHost,
  ) {
    this.#catalog = catalog;
    this.#registry = registry;
    this.#session = session;
    this.#host = host;
    session.subscribe((snapshot) => {
      const definition = this.#activeDefinition;
      if (!definition || snapshot.status !== "aborted" || snapshot.endReason !== "error") return;
      if (snapshot.lessonId !== definition.id || snapshot.lessonRevision !== definition.revision) return;
      this.#emit({
        kind: "lesson.failed",
        lessonId: definition.id,
        lessonRevision: definition.revision,
        sessionId: snapshot.sessionId,
        errorMessage: snapshot.errorMessage,
      });
    });
  }

  start(lessonId: string, options: StartGuidedLessonOptions = {}): string {
    const definition = this.#registry.require(lessonId);
    return this.startDefinition(definition, options);
  }

  startDefinition(definition: GuidedLessonDefinition, options: StartGuidedLessonOptions = {}): string {
    return this.#launch(definition, options, "lesson.started");
  }

  restart(options: StartGuidedLessonOptions = {}): string {
    if (!this.#activeDefinition) throw new Error("Cannot restart a guided lesson before one has been started.");
    return this.#launch(this.#activeDefinition, options, "lesson.restarted");
  }

  stop(): void {
    const definition = this.#activeDefinition;
    const session = this.#session.snapshot();
    this.#session.stop();
    this.#host.stopPresentation();
    if (definition && session.status === "running") {
      this.#emit({
        kind: "lesson.stopped",
        lessonId: definition.id,
        lessonRevision: definition.revision,
        sessionId: session.sessionId,
      });
    }
  }

  subscribe(listener: (event: GuidedLessonOrchestratorEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #launch(
    definition: GuidedLessonDefinition,
    options: StartGuidedLessonOptions,
    kind: "lesson.started" | "lesson.restarted",
  ): string {
    this.#activeDefinition = definition;
    const eventCursorBeforeLaunch = this.#eventCursor;
    try {
      const board = buildGuidedLessonBoard(definition, this.#catalog);
      this.#host.loadBoard(board);
      const sessionId = this.#session.start({
        definition,
        bindings: toGuidedInteractionBindings(board.bindings),
        sessionId: options.sessionId,
        gameState: () => this.#host.readGame(),
      });
      this.#emit({ kind, lessonId: definition.id, lessonRevision: definition.revision, sessionId });
      return sessionId;
    } catch (error) {
      this.#session.fail(error);
      if (this.#eventCursor === eventCursorBeforeLaunch) {
        this.#emit({
          kind: "lesson.failed",
          lessonId: definition.id,
          lessonRevision: definition.revision,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  #emit(event: Omit<GuidedLessonOrchestratorEvent, "cursor">): void {
    const authored = Object.freeze({ ...event, cursor: ++this.#eventCursor });
    for (const listener of this.#listeners) listener(authored);
  }
}

export function buildGuidedLessonBoard(
  definition: GuidedLessonDefinition,
  catalog: ContentCatalog,
): GuidedLessonBoard {
  const built = buildGuidedScenario(definition, catalog);
  return Object.freeze({
    ...built,
    playerDeckId: catalog.requireDeck(built.playerDeckKey, "player").deck.id,
    hostDeckId: catalog.requireDeck(built.hostDeckKey, "host").deck.id,
  });
}

export function createGameStoreGuidedLessonHost(store: Readonly<{
  getState(): Readonly<{
    game: GameState;
    loadScenario(game: GameState, deckIds: Readonly<{ playerDeckId: string; hostDeckId: string }>): void;
    stopGamePresentation(): void;
  }>;
}>): GuidedLessonHost {
  return Object.freeze({
    loadBoard(board) {
      store.getState().loadScenario(board.game, {
        playerDeckId: board.playerDeckId,
        hostDeckId: board.hostDeckId,
      });
    },
    stopPresentation() {
      store.getState().stopGamePresentation();
    },
    readGame() {
      return store.getState().game;
    },
  });
}
