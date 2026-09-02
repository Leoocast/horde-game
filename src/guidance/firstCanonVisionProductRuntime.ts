import { matchOriginCanonCode, type MatchOrigin } from "../content/MatchOrigin";
import type { MatchLaunchSource } from "../history/matchLifecycle";
import { contextualConceptRegistry, contextualTutorialRuntime } from "./contextualProductRuntime";
import {
  FIRST_CANON_VISION_CODE,
  firstCanonVisionDirector,
} from "./firstCanonVision";
import { guidedJourneyCompleted, guidedProgressStore, tutorialContextualJourney } from "./progress";

/** Installs launch-scoped guidance only after the real game reset has committed. */
export function configureFirstCanonVisionLaunch(input: Readonly<{
  source: MatchLaunchSource;
  origin: MatchOrigin;
  sessionId: string;
}>): void {
  firstCanonVisionDirector.beginLaunch(input);
  if (matchOriginCanonCode(input.origin) !== FIRST_CANON_VISION_CODE) return;
  const mode = firstCanonVisionDirector.snapshot().contextualHelpMode;
  contextualTutorialRuntime.setProgressMode(mode === "repeat" ? "repeat" : "unseen");
  if (mode === "repeat") {
    const progress = guidedProgressStore.snapshot();
    contextualTutorialRuntime.suppressConceptsForSession(
      contextualConceptRegistry.concepts
        .filter((concept) => guidedJourneyCompleted(
          progress,
          tutorialContextualJourney(concept.id, concept.revision),
        ))
        .map((concept) => concept.id),
    );
  }
}

/** Applies the player's replay choice without consulting the normal-match preference checkbox. */
export function chooseFirstCanonVisionGuidance(choice: "guided" | "independent"): boolean {
  if (!firstCanonVisionDirector.chooseReplayGuidance(choice)) return false;
  contextualTutorialRuntime.setProgressMode(choice === "guided" ? "repeat" : "unseen");
  return true;
}
