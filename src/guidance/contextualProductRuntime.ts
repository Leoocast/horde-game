import { useGameStore } from "../store/useGameStore";
import { ContextualConceptRegistry } from "./ContextualConceptRegistry";
import { contextualIntentGate } from "./contextualIntentGate";
import { ContextualTutorialRuntime } from "./contextualRuntime";
import { gameplaySignalStream } from "./gameplaySignals";
import { guidedPresentationBlockers } from "./presentationSettled";
import { guidedProgressStore } from "./progress";
import { guidedPresentationActivity, guidedSessionStore } from "./runtime";

/** Product content remains empty until the prologue concepts are authored in later phases. */
export const contextualConceptRegistry = new ContextualConceptRegistry();

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

contextualIntentGate.install((intent) => contextualTutorialRuntime.authorizeIntent(intent));
useGameStore.subscribe(() => contextualTutorialRuntime.refresh());
guidedPresentationActivity.subscribe(() => contextualTutorialRuntime.refresh());
guidedSessionStore.subscribe(() => contextualTutorialRuntime.refresh());
