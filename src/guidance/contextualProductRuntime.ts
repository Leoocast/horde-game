import { useGameStore } from "../store/useGameStore";
import { ContextualConceptRegistry } from "./ContextualConceptRegistry";
import { contextualIntentGate } from "./contextualIntentGate";
import { ContextualTutorialRuntime } from "./contextualRuntime";
import { gameplaySignalStream } from "./gameplaySignals";
import { guidedPresentationBlockers } from "./presentationSettled";
import { guidedProgressStore, tutorialContextualJourney } from "./progress";
import { guidedPresentationActivity, guidedSessionStore } from "./runtime";
import { PRODUCT_CONTEXTUAL_CONCEPTS } from "./contextualProductConcepts";
import { firstCanonVisionDirector } from "./firstCanonVision";

export const contextualConceptRegistry = new ContextualConceptRegistry(PRODUCT_CONTEXTUAL_CONCEPTS);

/** Records concepts authored by a strict tutorial step so normal matches do not teach them again. */
export function recordLearnToPlayConceptsSeen(
  conceptIds: readonly string[],
  shownAt = new Date().toISOString(),
): boolean {
  const requested = new Set(conceptIds);
  const concepts = contextualConceptRegistry.concepts.filter((concept) => requested.has(concept.id));
  const conceptChanged = guidedProgressStore.markConceptsSeen(
    concepts.map((concept) => ({ conceptId: concept.id, shownRevision: concept.revision, shownAt })),
  );
  const journeyChanged = concepts.map((concept) => {
    const journey = tutorialContextualJourney(concept.id, concept.revision);
    return guidedProgressStore.markJourneyCompleted(journey.id, journey.revision, shownAt);
  }).some(Boolean);
  return conceptChanged || journeyChanged;
}

export const contextualTutorialRuntime = new ContextualTutorialRuntime(
  contextualConceptRegistry,
  gameplaySignalStream,
  guidedProgressStore,
  () => {
    const store = useGameStore.getState();
    const guided = guidedSessionStore.snapshot();
    const blockers = [...guidedPresentationBlockers(store, guidedPresentationActivity.snapshot())];
    const targetingActive = Boolean(
      store.counterTargeting
      || store.tributeOfTheFourSorrowsSelection
      || store.spellTargeting
      || store.handLimitDiscardActive,
    );
    if (targetingActive) blockers.push("targeting");
    if (store.game.winner) blockers.push("outcome");
    return Object.freeze({
      game: store.game,
      gameSessionId: gameplaySignalStream.snapshot().sessionId,
      presentationReady: blockers.length === 0,
      guidedActive: guided.status === "running",
      targetingActive,
      blockers: Object.freeze(blockers),
    });
  },
);

contextualIntentGate.install((intent) => {
  const firstCanon = firstCanonVisionDirector.authorizeIntent(intent);
  return firstCanon.allowed ? contextualTutorialRuntime.authorizeIntent(intent) : firstCanon;
});

function refreshProductGuidance(): void {
  const store = useGameStore.getState();
  const guided = guidedSessionStore.snapshot();
  const blockers = [...guidedPresentationBlockers(store, guidedPresentationActivity.snapshot())];
  firstCanonVisionDirector.refresh(store.game, blockers);
  contextualTutorialRuntime.refresh();
}

useGameStore.subscribe(refreshProductGuidance);
guidedPresentationActivity.subscribe(refreshProductGuidance);
guidedSessionStore.subscribe(refreshProductGuidance);
