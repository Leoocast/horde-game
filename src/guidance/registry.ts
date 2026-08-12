import { contentCatalog } from "../content/bootstrap";
import type { GuidedLessonDefinition } from "./contracts";
import { FIRST_SEED_LESSON } from "./firstSeedLesson";
import { GuidedLessonRegistry } from "./GuidedLessonRegistry";

export const BASIC_TUTORIAL_LESSON_ID = "first-seed";

/**
 * Release registry. First Seed is authored here as real content; Guidance Lab keeps its isolated
 * fixture and never enters this product catalog.
 */
export const GUIDED_LESSON_DEFINITIONS: readonly GuidedLessonDefinition[] = Object.freeze([
  FIRST_SEED_LESSON,
]);

export const guidedLessonRegistry = new GuidedLessonRegistry(contentCatalog, GUIDED_LESSON_DEFINITIONS);
