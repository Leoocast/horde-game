import { contentCatalog } from "../content/bootstrap";
import { useGameStore } from "../store/useGameStore";
import { GuidedProductLifecycle } from "./lifecycle";
import { createGameStoreGuidedLessonHost, GuidedLessonOrchestrator } from "./lessonOrchestrator";
import { guidedProgressStore } from "./progress";
import { guidedLessonRegistry } from "./registry";
import { guidedSessionStore } from "./runtime";

export const guidedProductOrchestrator = new GuidedLessonOrchestrator(
  contentCatalog,
  guidedLessonRegistry,
  guidedSessionStore,
  createGameStoreGuidedLessonHost(useGameStore),
);

export const guidedProductLifecycle = new GuidedProductLifecycle(
  guidedLessonRegistry,
  guidedProductOrchestrator,
  guidedSessionStore,
  guidedProgressStore,
);
