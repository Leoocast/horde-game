import type { ContentCatalog } from "../content/ContentCatalog";
import type { GuidedLessonDefinition } from "./contracts";
import { assertGuidedLessonValid } from "./validation";

export class GuidedLessonRegistry {
  readonly lessons: readonly GuidedLessonDefinition[];
  readonly #byId: ReadonlyMap<string, GuidedLessonDefinition>;

  constructor(catalog: ContentCatalog, definitions: readonly GuidedLessonDefinition[]) {
    const byId = new Map<string, GuidedLessonDefinition>();
    const lessons = definitions.map((definition) => deepFreeze(structuredClone(definition)));
    for (const lesson of lessons) {
      if (byId.has(lesson.id)) throw new Error(`Duplicate guided lesson id "${lesson.id}".`);
      assertGuidedLessonValid(lesson, catalog);
      byId.set(lesson.id, lesson);
    }
    this.lessons = Object.freeze(lessons);
    this.#byId = byId;
    Object.freeze(this);
  }

  find(id: string): GuidedLessonDefinition | undefined {
    return this.#byId.get(id);
  }

  require(id: string): GuidedLessonDefinition {
    const lesson = this.find(id);
    if (!lesson) throw new Error(`Guided lesson "${id}" is not registered.`);
    return lesson;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

