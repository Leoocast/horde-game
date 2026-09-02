import { useGameStore } from "../store/useGameStore";
import { ContextualConceptRegistry } from "./ContextualConceptRegistry";
import { contextualIntentGate } from "./contextualIntentGate";
import { ContextualTutorialRuntime } from "./contextualRuntime";
import { gameplaySignalStream } from "./gameplaySignals";
import { guidedPresentationBlockers } from "./presentationSettled";
import { guidedProgressStore } from "./progress";
import { guidedPresentationActivity, guidedSessionStore } from "./runtime";
import { PRODUCT_CONTEXTUAL_CONCEPTS } from "./contextualProductConcepts";
import { firstCanonVisionDirector } from "./firstCanonVision";
import { runGuidedSystemAction } from "./interactionGate";

export const contextualConceptRegistry = new ContextualConceptRegistry(PRODUCT_CONTEXTUAL_CONCEPTS);

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

let hostAdvanceScheduled = false;
function refreshProductGuidance(): void {
  const store = useGameStore.getState();
  const guided = guidedSessionStore.snapshot();
  const blockers = [...guidedPresentationBlockers(store, guidedPresentationActivity.snapshot())];
  firstCanonVisionDirector.refresh(store.game, blockers);
  contextualTutorialRuntime.refresh();
  if (hostAdvanceScheduled || !firstCanonVisionDirector.consumePendingHostAdvance(store.game, blockers.length === 0)) return;
  hostAdvanceScheduled = true;
  queueMicrotask(() => {
    hostAdvanceScheduled = false;
    const latest = useGameStore.getState();
    if (latest.game.activeSide !== "host" || latest.game.phase !== "host") return;
    runGuidedSystemAction(() => latest.runHostMain());
  });
}

useGameStore.subscribe(refreshProductGuidance);
guidedPresentationActivity.subscribe(refreshProductGuidance);
guidedSessionStore.subscribe(refreshProductGuidance);
