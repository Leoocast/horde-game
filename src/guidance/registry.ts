import { contentCatalog } from "../content/bootstrap";
import type { GuidedLessonDefinition } from "./contracts";
import { GuidedLessonRegistry } from "./GuidedLessonRegistry";

export const BASIC_TUTORIAL_LESSON_ID = "first-seed";

/**
 * Release registry. It remains empty until the First Seed's authored content is approved; tests and
 * Guidance Lab creates an isolated registry from its fixture instead of shipping a fake lesson.
 */
export const GUIDED_LESSON_DEFINITIONS: readonly GuidedLessonDefinition[] = Object.freeze([]);

export const guidedLessonRegistry = new GuidedLessonRegistry(contentCatalog, GUIDED_LESSON_DEFINITIONS);
