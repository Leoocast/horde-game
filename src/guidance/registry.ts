import { contentCatalog } from "../content/bootstrap";
import type { GuidedLessonDefinition } from "./contracts";
import { FIRST_SEED_LESSON } from "./firstSeedLesson";
import { GuidedLessonRegistry } from "./GuidedLessonRegistry";
import { PREPARATION_LESSON_ID } from "./howToPlayCatalog";

export const BASIC_TUTORIAL_LESSON_ID = PREPARATION_LESSON_ID;

/**
 * Release registry. First Seed is authored here as real content; Guidance Lab keeps its isolated
 * fixture and never enters this product catalog.
 */
export const GUIDED_LESSON_DEFINITIONS: readonly GuidedLessonDefinition[] = Object.freeze([
  FIRST_SEED_LESSON,
]);

export const guidedLessonRegistry = new GuidedLessonRegistry(contentCatalog, GUIDED_LESSON_DEFINITIONS);
