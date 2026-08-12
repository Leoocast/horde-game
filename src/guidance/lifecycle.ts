import type { GuidedLessonDefinition } from "./contracts";
import type { GuidedLessonRegistry } from "./GuidedLessonRegistry";
import type { GuidedProgressStore } from "./progress";
import { nextRequiredGuidedLesson } from "./progress";
import type { GuidedSessionSnapshot } from "./sessionStore";

export type GuidedLessonRunner = Readonly<{
  start(lessonId: string): string;
  restart(): string;
  stop(): void;
}>;

export type GuidedSessionSource = Readonly<{
  snapshot(): GuidedSessionSnapshot;
  subscribe(listener: (snapshot: GuidedSessionSnapshot) => void): () => void;
}>;

export type GuidedProductLifecycleStatus = "idle" | "running" | "completed" | "aborted" | "failed";

export type GuidedProductLifecycleSnapshot = Readonly<{
  cursor: number;
  status: GuidedProductLifecycleStatus;
  lessonId?: string;
  lessonRevision?: number;
  sessionId?: string;
  errorMessage?: string;
}>;

/** Product boundary for required entry, voluntary replay, restart and completion-only progress. */
export class GuidedProductLifecycle {
  readonly #registry: GuidedLessonRegistry;
  readonly #runner: GuidedLessonRunner;
  readonly #session: GuidedSessionSource;
  readonly #progress: GuidedProgressStore;
  #activeLesson: GuidedLessonDefinition | undefined;
  #listeners = new Set<() => void>();
  #cursor = 0;
  #snapshot: GuidedProductLifecycleSnapshot = Object.freeze({ cursor: 0, status: "idle" });

  constructor(
    registry: GuidedLessonRegistry,
    runner: GuidedLessonRunner,
    session: GuidedSessionSource,
    progress: GuidedProgressStore,
  ) {
    this.#registry = registry;
    this.#runner = runner;
    this.#session = session;
    this.#progress = progress;
    session.subscribe((snapshot) => this.#onSession(snapshot));
    progress.subscribe(() => this.#emit(this.#snapshot.status, this.#snapshot));
  }

  snapshot(): GuidedProductLifecycleSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  nextRequiredLesson(): GuidedLessonDefinition | undefined {
    return nextRequiredGuidedLesson(this.#registry.lessons, this.#progress.snapshot());
  }

  start(lessonId: string): boolean {
    const lesson = this.#registry.require(lessonId);
    this.#activeLesson = lesson;
    this.#emit("running", { lessonId: lesson.id, lessonRevision: lesson.revision });
    try {
      const sessionId = this.#runner.start(lesson.id);
      this.#emit("running", { lessonId: lesson.id, lessonRevision: lesson.revision, sessionId });
      return true;
    } catch (error) {
      this.#emit("failed", {
        lessonId: lesson.id,
        lessonRevision: lesson.revision,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  restart(): boolean {
    const lesson = this.#activeLesson;
    if (!lesson) return false;
    this.#emit("running", { lessonId: lesson.id, lessonRevision: lesson.revision });
    try {
      const sessionId = this.#runner.restart();
      this.#emit("running", { lessonId: lesson.id, lessonRevision: lesson.revision, sessionId });
      return true;
    } catch (error) {
      this.#emit("failed", {
        lessonId: lesson.id,
        lessonRevision: lesson.revision,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  stop(): void {
    if (!this.#activeLesson) return;
    this.#runner.stop();
    this.#emit("aborted", {
      lessonId: this.#activeLesson.id,
      lessonRevision: this.#activeLesson.revision,
    });
  }

  #onSession(session: GuidedSessionSnapshot): void {
    const lesson = this.#activeLesson;
    if (!lesson || session.lessonId !== lesson.id || session.lessonRevision !== lesson.revision) return;
    if (session.status === "running") {
      this.#emit("running", { lessonId: lesson.id, lessonRevision: lesson.revision, sessionId: session.sessionId });
      return;
    }
    if (session.status === "completed") {
      this.#progress.markCompleted(lesson.id, lesson.revision);
      this.#emit("completed", { lessonId: lesson.id, lessonRevision: lesson.revision, sessionId: session.sessionId });
      return;
    }
    if (session.status === "aborted") {
      const failed = session.endReason === "error";
      this.#emit(failed ? "failed" : "aborted", {
        lessonId: lesson.id,
        lessonRevision: lesson.revision,
        sessionId: session.sessionId,
        errorMessage: failed ? session.errorMessage : undefined,
      });
    }
  }

  #emit(
    status: GuidedProductLifecycleStatus,
    details: Omit<GuidedProductLifecycleSnapshot, "cursor" | "status">,
  ): void {
    this.#snapshot = Object.freeze({ ...details, cursor: ++this.#cursor, status });
    for (const listener of this.#listeners) listener();
  }
}
