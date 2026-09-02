import { matchOriginCanonCode, type MatchOrigin } from "../content/MatchOrigin";
import type { MatchLaunchSource } from "../history/matchLifecycle";
import { contextualTutorialRuntime } from "./contextualProductRuntime";
import {
  FIRST_CANON_RECAPS,
  FIRST_CANON_STARTED_JOURNEY,
  FIRST_CANON_VISION_CODE,
  firstCanonVisionDirector,
} from "./firstCanonVision";
import { guidedJourneyCompleted, guidedProgressStore } from "./progress";

/** Installs launch-scoped guidance only after the real game reset has committed. */
export function configureFirstCanonVisionLaunch(input: Readonly<{
  source: MatchLaunchSource;
  origin: MatchOrigin;
  sessionId: string;
}>): void {
  firstCanonVisionDirector.beginLaunch(input);
  if (
    matchOriginCanonCode(input.origin) !== FIRST_CANON_VISION_CODE
    || input.source === "play"
  ) return;

  const progress = guidedProgressStore.snapshot();
  const belongsToHandoffLineage = input.source === "learn-to-play-handoff"
    || guidedJourneyCompleted(progress, FIRST_CANON_STARTED_JOURNEY);
  if (!belongsToHandoffLineage) return;
  const pending = FIRST_CANON_RECAPS.filter((recap) => !guidedJourneyCompleted(progress, {
    id: recap.journeyId,
    revision: recap.revision,
  }));
  contextualTutorialRuntime.forceConceptsForSession(pending.map((recap) => ({
    conceptId: recap.conceptId,
    onAcknowledge: () => guidedProgressStore.markJourneyCompleted(recap.journeyId, recap.revision),
  })));
}
