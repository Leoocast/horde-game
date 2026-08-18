import type { GuidedLessonDefinition } from "./contracts";

export const GUIDED_PROGRESS_FORMAT_VERSION = 2 as const;

export type GuidedLessonCompletion = Readonly<{
  lessonId: string;
  completedRevision: number;
  completedAt: string;
}>;

export type GuidedJourneyCompletion = Readonly<{
  journeyId: string;
  completedRevision: number;
  completedAt: string;
}>;

export type ContextualConceptProgress = Readonly<{
  conceptId: string;
  shownRevision: number;
  shownAt: string;
}>;

export type GuidedProgressPreferences = Readonly<{
  /** Mirrors the checked UI option “Do not show explanations already seen again”. */
  hideSeenContextualHelp: boolean;
}>;

export type GuidedProgressEnvelope = Readonly<{
  kind: "hostfall-guided-progress";
  formatVersion: typeof GUIDED_PROGRESS_FORMAT_VERSION;
  completions: readonly GuidedLessonCompletion[];
  journeys: readonly GuidedJourneyCompletion[];
  concepts: readonly ContextualConceptProgress[];
  preferences: GuidedProgressPreferences;
}>;

const LESSON_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

export function emptyGuidedProgress(): GuidedProgressEnvelope {
  return Object.freeze({
    kind: "hostfall-guided-progress",
    formatVersion: GUIDED_PROGRESS_FORMAT_VERSION,
    completions: Object.freeze([]),
    journeys: Object.freeze([]),
    concepts: Object.freeze([]),
    preferences: Object.freeze({ hideSeenContextualHelp: true }),
  });
}

export function parseGuidedProgress(value: unknown): GuidedProgressEnvelope | undefined {
  if (!isRecord(value) || value.kind !== "hostfall-guided-progress" || (value.formatVersion !== 1 && value.formatVersion !== GUIDED_PROGRESS_FORMAT_VERSION)) {
    return undefined;
  }
  const completions = parseRevisionMilestones(value.completions, "lessonId", "completedRevision", "completedAt");
  if (!completions) return undefined;

  if (value.formatVersion === 1) {
    return Object.freeze({
      kind: "hostfall-guided-progress",
      formatVersion: GUIDED_PROGRESS_FORMAT_VERSION,
      completions: Object.freeze(completions as GuidedLessonCompletion[]),
      journeys: Object.freeze([]),
      concepts: Object.freeze([]),
      preferences: Object.freeze({ hideSeenContextualHelp: true }),
    });
  }

  const journeys = parseRevisionMilestones(value.journeys, "journeyId", "completedRevision", "completedAt");
  const concepts = parseRevisionMilestones(value.concepts, "conceptId", "shownRevision", "shownAt");
  if (!journeys || !concepts || !isRecord(value.preferences) || typeof value.preferences.hideSeenContextualHelp !== "boolean") {
    return undefined;
  }

  return Object.freeze({
    kind: "hostfall-guided-progress",
    formatVersion: GUIDED_PROGRESS_FORMAT_VERSION,
    completions: Object.freeze(completions as GuidedLessonCompletion[]),
    journeys: Object.freeze(journeys as GuidedJourneyCompletion[]),
    concepts: Object.freeze(concepts as ContextualConceptProgress[]),
    preferences: Object.freeze({ hideSeenContextualHelp: value.preferences.hideSeenContextualHelp }),
  });
}

function parseRevisionMilestones(
  value: unknown,
  idKey: "lessonId" | "journeyId" | "conceptId",
  revisionKey: "completedRevision" | "shownRevision",
  dateKey: "completedAt" | "shownAt",
): readonly Record<string, string | number>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const byId = new Map<string, Record<string, string | number>>();
  for (const candidate of value) {
    if (!isRecord(candidate)) return undefined;
    const id = candidate[idKey];
    const revision = candidate[revisionKey];
    const date = candidate[dateKey];
    if (typeof id !== "string" || !LESSON_ID_PATTERN.test(id)) return undefined;
    if (!Number.isInteger(revision) || Number(revision) < 1) return undefined;
    if (typeof date !== "string" || Number.isNaN(Date.parse(date))) return undefined;
    const milestone = Object.freeze({ [idKey]: id, [revisionKey]: Number(revision), [dateKey]: date });
    const previous = byId.get(id);
    if (!previous || Number(milestone[revisionKey]) > Number(previous[revisionKey])) byId.set(id, milestone);
  }
  return Object.freeze([...byId.values()].sort((left, right) => String(left[idKey]).localeCompare(String(right[idKey]))));
}

export function guidedLessonCompleted(
  progress: GuidedProgressEnvelope,
  lesson: Pick<GuidedLessonDefinition, "id" | "revision">,
): boolean {
  return progress.completions.some(
    (completion) => completion.lessonId === lesson.id && completion.completedRevision >= lesson.revision,
  );
}

export function guidedJourneyCompleted(
  progress: GuidedProgressEnvelope,
  journey: Readonly<{ id: string; revision: number }>,
): boolean {
  return progress.journeys.some(
    (completion) => completion.journeyId === journey.id && completion.completedRevision >= journey.revision,
  );
}

export function nextRequiredGuidedLesson(
  lessons: readonly GuidedLessonDefinition[],
  progress: GuidedProgressEnvelope,
): GuidedLessonDefinition | undefined {
  return lessons.find((lesson) => lesson.mode === "required" && !guidedLessonCompleted(progress, lesson));
}

export function contextualConceptSeen(
  progress: GuidedProgressEnvelope,
  concept: Readonly<{ id: string; revision: number }>,
): boolean {
  return progress.concepts.some(
    (entry) => entry.conceptId === concept.id && entry.shownRevision >= concept.revision,
  );
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
      journeys: this.#snapshot.journeys,
      concepts: this.#snapshot.concepts,
      preferences: this.#snapshot.preferences,
    });
    this.#emit();
    return true;
  }

  markJourneyCompleted(journeyId: string, completedRevision: number, completedAt = new Date().toISOString()): boolean {
    if (!LESSON_ID_PATTERN.test(journeyId)) throw new Error(`Invalid guided journey id "${journeyId}".`);
    if (!Number.isInteger(completedRevision) || completedRevision < 1) {
      throw new Error(`Guided journey "${journeyId}" requires a positive completion revision.`);
    }
    const previous = this.#snapshot.journeys.find((completion) => completion.journeyId === journeyId);
    if (previous && previous.completedRevision >= completedRevision) return false;
    const journeys = this.#snapshot.journeys.filter((completion) => completion.journeyId !== journeyId);
    journeys.push(Object.freeze({ journeyId, completedRevision, completedAt }));
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      journeys: Object.freeze(journeys.sort((left, right) => left.journeyId.localeCompare(right.journeyId))),
    });
    this.#emit();
    return true;
  }

  markConceptSeen(conceptId: string, shownRevision: number, shownAt = new Date().toISOString()): boolean {
    return this.markConceptsSeen([{ conceptId, shownRevision, shownAt }]);
  }

  /** Commits a provisional ledger as one persistence notification. */
  markConceptsSeen(entries: readonly ContextualConceptProgress[]): boolean {
    const byConcept = new Map(this.#snapshot.concepts.map((entry) => [entry.conceptId, entry]));
    let changed = false;
    for (const entry of entries) {
      if (!LESSON_ID_PATTERN.test(entry.conceptId)) throw new Error(`Invalid contextual concept id "${entry.conceptId}".`);
      if (!Number.isInteger(entry.shownRevision) || entry.shownRevision < 1) {
        throw new Error(`Contextual concept "${entry.conceptId}" requires a positive shown revision.`);
      }
      if (Number.isNaN(Date.parse(entry.shownAt))) throw new Error(`Contextual concept "${entry.conceptId}" requires a valid shownAt date.`);
      const previous = byConcept.get(entry.conceptId);
      if (previous && previous.shownRevision >= entry.shownRevision) continue;
      byConcept.set(entry.conceptId, Object.freeze({ ...entry }));
      changed = true;
    }
    if (!changed) return false;
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      concepts: Object.freeze([...byConcept.values()].sort((left, right) => left.conceptId.localeCompare(right.conceptId))),
    });
    this.#emit();
    return true;
  }

  setHideSeenContextualHelp(hide: boolean): boolean {
    if (this.#snapshot.preferences.hideSeenContextualHelp === hide) return false;
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      preferences: Object.freeze({ hideSeenContextualHelp: hide }),
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
