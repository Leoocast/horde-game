import type { GuidedLessonDefinition } from "./contracts";

export const GUIDED_PROGRESS_FORMAT_VERSION = 1 as const;

export type GuidedLessonCompletion = Readonly<{
  lessonId: string;
  completedRevision: number;
  completedAt: string;
}>;

export type GuidedProgressEnvelope = Readonly<{
  kind: "hostfall-guided-progress";
  formatVersion: typeof GUIDED_PROGRESS_FORMAT_VERSION;
  completions: readonly GuidedLessonCompletion[];
}>;

const LESSON_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

export function emptyGuidedProgress(): GuidedProgressEnvelope {
  return Object.freeze({
    kind: "hostfall-guided-progress",
    formatVersion: GUIDED_PROGRESS_FORMAT_VERSION,
    completions: Object.freeze([]),
  });
}

export function parseGuidedProgress(value: unknown): GuidedProgressEnvelope | undefined {
  if (!isRecord(value) || value.kind !== "hostfall-guided-progress" || value.formatVersion !== GUIDED_PROGRESS_FORMAT_VERSION) {
    return undefined;
  }
  if (!Array.isArray(value.completions)) return undefined;

  const byLesson = new Map<string, GuidedLessonCompletion>();
  for (const candidate of value.completions) {
    if (!isRecord(candidate)) return undefined;
    const { lessonId, completedRevision, completedAt } = candidate;
    if (typeof lessonId !== "string" || !LESSON_ID_PATTERN.test(lessonId)) return undefined;
    if (!Number.isInteger(completedRevision) || Number(completedRevision) < 1) return undefined;
    if (typeof completedAt !== "string" || Number.isNaN(Date.parse(completedAt))) return undefined;
    const completion = Object.freeze({ lessonId, completedRevision: Number(completedRevision), completedAt });
    const previous = byLesson.get(lessonId);
    if (!previous || completion.completedRevision > previous.completedRevision) byLesson.set(lessonId, completion);
  }

  return Object.freeze({
    kind: "hostfall-guided-progress",
    formatVersion: GUIDED_PROGRESS_FORMAT_VERSION,
    completions: Object.freeze([...byLesson.values()].sort((left, right) => left.lessonId.localeCompare(right.lessonId))),
  });
}

export function guidedLessonCompleted(
  progress: GuidedProgressEnvelope,
  lesson: Pick<GuidedLessonDefinition, "id" | "revision">,
): boolean {
  return progress.completions.some(
    (completion) => completion.lessonId === lesson.id && completion.completedRevision >= lesson.revision,
  );
}

export function nextRequiredGuidedLesson(
  lessons: readonly GuidedLessonDefinition[],
  progress: GuidedProgressEnvelope,
): GuidedLessonDefinition | undefined {
  return lessons.find((lesson) => lesson.mode === "required" && !guidedLessonCompleted(progress, lesson));
}

export class GuidedProgressStore {
  #snapshot = emptyGuidedProgress();
  #listeners = new Set<(snapshot: GuidedProgressEnvelope) => void>();

  snapshot(): GuidedProgressEnvelope {
    return this.#snapshot;
  }

  hydrate(progress: GuidedProgressEnvelope): void {
    this.#snapshot = progress;
    this.#emit();
  }

  markCompleted(lessonId: string, completedRevision: number, completedAt = new Date().toISOString()): boolean {
    if (!LESSON_ID_PATTERN.test(lessonId)) throw new Error(`Invalid guided lesson id "${lessonId}".`);
    if (!Number.isInteger(completedRevision) || completedRevision < 1) {
      throw new Error(`Guided lesson "${lessonId}" requires a positive completion revision.`);
    }
    const previous = this.#snapshot.completions.find((completion) => completion.lessonId === lessonId);
    if (previous && previous.completedRevision >= completedRevision) return false;
    const completions = this.#snapshot.completions.filter((completion) => completion.lessonId !== lessonId);
    completions.push(Object.freeze({ lessonId, completedRevision, completedAt }));
    this.#snapshot = Object.freeze({
      kind: "hostfall-guided-progress",
      formatVersion: GUIDED_PROGRESS_FORMAT_VERSION,
      completions: Object.freeze(completions.sort((left, right) => left.lessonId.localeCompare(right.lessonId))),
    });
    this.#emit();
    return true;
  }

  subscribe(listener: (snapshot: GuidedProgressEnvelope) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  resetForTests(): void {
    this.#snapshot = emptyGuidedProgress();
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export const guidedProgressStore = new GuidedProgressStore();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
