import { contentCatalog } from "../content/bootstrap";
import { useGameStore } from "../store/useGameStore";
import { buildGuidedScenario } from "./buildGuidedScenario";
import { contextualTutorialRuntime } from "./contextualProductRuntime";
import { gameplaySignalStream } from "./gameplaySignals";
import { LEARN_TO_PLAY_JOURNEY_ID } from "./howToPlayCatalog";
import { GuidedInterventionOrchestrator } from "./interventionOrchestrator";
import { GuidedJourneyLifecycle, type GuidedJourneyDefinition } from "./journeyLifecycle";
import { LearnToPlayPrologueDirector } from "./learnToPlayDirector";
import { LEARN_TO_PLAY_PROLOGUE_SCENARIO } from "./learnToPlayPrologue";
import { guidedSessionStore } from "./runtime";

export const LEARN_TO_PLAY_JOURNEY: GuidedJourneyDefinition = Object.freeze({
  id: LEARN_TO_PLAY_JOURNEY_ID,
  revision: 1,
  setupTurns: 0,
});

export const learnToPlayInterventions = new GuidedInterventionOrchestrator(
  guidedSessionStore,
  Object.freeze({
    readGame: () => useGameStore.getState().game,
    stopPresentation: () => useGameStore.getState().stopGamePresentation(),
  }),
);

export const learnToPlayDirector = new LearnToPlayPrologueDirector(
  Object.freeze({ readStore: () => useGameStore.getState() }),
  learnToPlayInterventions,
);

useGameStore.subscribe(() => learnToPlayDirector.refresh());

export const learnToPlayJourneyLifecycle = new GuidedJourneyLifecycle(
  LEARN_TO_PLAY_JOURNEY,
  Object.freeze({
    loadInitialBoard() {
      const built = buildGuidedScenario(LEARN_TO_PLAY_PROLOGUE_SCENARIO, contentCatalog);
      useGameStore.getState().loadScenario(built.game, {
        playerDeckId: built.playerDeckKey,
        hostDeckId: built.hostDeckKey,
      });
      const gameSessionId = gameplaySignalStream.snapshot().sessionId;
      learnToPlayDirector.start(
        Object.freeze(Object.fromEntries(
          Object.entries(built.bindings).map(([alias, binding]) => [alias, binding.instanceId]),
        )),
        gameSessionId,
      );
      return gameSessionId;
    },
    stopPresentation() {
      useGameStore.getState().stopGamePresentation();
    },
  }),
  contextualTutorialRuntime,
  learnToPlayDirector,
);
