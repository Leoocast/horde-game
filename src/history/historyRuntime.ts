import { APP_VERSION } from "../version";
import { gameplaySignalStream } from "../guidance/gameplaySignals";
import { PRODUCT_CAPABILITIES } from "../product/productCapabilities";
import { useGameStore } from "../store/useGameStore";
import { createHistoryServiceForCurrentPlatform } from "./createHistoryService";
import {
  MatchLifecycleCoordinator,
  type MatchOutcomeEvent,
  type MatchSessionFacts,
} from "./matchLifecycle";

const historyService = PRODUCT_CAPABILITIES.seedHistory
  ? createHistoryServiceForCurrentPlatform()
  : undefined;

export const productMatchLifecycle = new MatchLifecycleCoordinator({
  enabled: PRODUCT_CAPABILITIES.seedHistory,
  recoverActiveOnInitialize: !PRODUCT_CAPABILITIES.resumeGame,
  history: historyService,
  appVersion: APP_VERSION,
  readSession: readMatchSession,
  subscribeOutcomes: subscribeToGameplayOutcomes,
});

function readMatchSession(): MatchSessionFacts {
  const state = useGameStore.getState();
  return Object.freeze({
    sessionId: `game:${state.gameSessionId}`,
    turnNumber: state.game.turnNumber,
    hostTurnNumber: state.game.hostTurnNumber,
    playerLife: state.game.player.life,
    hostArchiveRemaining: state.game.host.archive.length,
  });
}

/** Converts cursor resets into a simple injected outcome source for the pure coordinator. */
function subscribeToGameplayOutcomes(listener: (event: MatchOutcomeEvent) => void): () => void {
  let { sessionId, cursor } = gameplaySignalStream.snapshot();
  return gameplaySignalStream.subscribe((snapshot) => {
    if (snapshot.sessionId !== sessionId) {
      sessionId = snapshot.sessionId;
      cursor = 0;
    }
    for (const signal of gameplaySignalStream.signalsSince(cursor, sessionId)) {
      cursor = Math.max(cursor, signal.cursor);
      if (signal.kind === "game.ended") {
        listener(Object.freeze({ sessionId: signal.sessionId, winner: signal.winner }));
      }
    }
  });
}
