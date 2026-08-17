import { contentCatalog } from "../content/bootstrap";
import { createInitialGame } from "../engine/GameState";
import { useGameStore } from "../store/useGameStore";
import { contextualTutorialRuntime } from "./contextualProductRuntime";
import { gameplaySignalStream } from "./gameplaySignals";
import { LEARN_TO_PLAY_JOURNEY_ID } from "./howToPlayCatalog";
import { GuidedInterventionOrchestrator } from "./interventionOrchestrator";
import { GuidedJourneyLifecycle, type GuidedJourneyDefinition } from "./journeyLifecycle";
import { guidedSessionStore } from "./runtime";

const ELARION = "hostfall.core/pact_of_elarion";
const GRAVELESS = "hostfall.core/uprising_of_the_graveless";
const SHELL_SEED = "learn-to-play-shell-v1";

/** Phase 3 shell only. Phase 4 replaces its initial board with the authored advanced snapshot. */
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

export const learnToPlayJourneyLifecycle = new GuidedJourneyLifecycle(
  LEARN_TO_PLAY_JOURNEY,
  Object.freeze({
    loadInitialBoard() {
      const playerDeck = contentCatalog.requireDeck(ELARION, "player").deck;
      const hostDeck = contentCatalog.requireDeck(GRAVELESS, "host").deck;
      const game = createInitialGame(playerDeck, hostDeck, SHELL_SEED, 0, "normal", "standard");
      useGameStore.getState().loadScenario(game, {
        playerDeckId: playerDeck.id,
        hostDeckId: hostDeck.id,
      });
      return gameplaySignalStream.snapshot().sessionId;
    },
    stopPresentation() {
      useGameStore.getState().stopGamePresentation();
    },
  }),
  contextualTutorialRuntime,
  learnToPlayInterventions,
);
