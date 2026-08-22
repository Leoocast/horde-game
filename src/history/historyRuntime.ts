import { APP_VERSION } from "../version";
import { gameplaySignalStream } from "../guidance/gameplaySignals";
import { PRODUCT_CAPABILITIES } from "../product/productCapabilities";
import { useGameStore } from "../store/useGameStore";
import { createHistoryServiceForCurrentPlatform } from "./createHistoryService";
import { AttemptMilestoneCollector } from "./attemptMilestones";
import { createEmptyHistoryEnvelopeV1 } from "./historyDomain";
import type { HistoryResetResult, HistoryServiceSnapshot } from "./historyService";
import {
  MatchLifecycleCoordinator,
  type MatchOutcomeEvent,
  type MatchSessionFacts,
} from "./matchLifecycle";

const historyService = PRODUCT_CAPABILITIES.seedHistory
  ? createHistoryServiceForCurrentPlatform()
  : undefined;
const attemptMilestoneCollector = new AttemptMilestoneCollector();

const DISABLED_HISTORY_SNAPSHOT: HistoryServiceSnapshot = Object.freeze({
  phase: "ready",
  health: "healthy",
  history: createEmptyHistoryEnvelopeV1(),
  writable: false,
  dirty: false,
  logicalRevision: 0,
  durableRevision: 0,
});

/** Read/reset facade over the same hydrated authority used by MatchLifecycleCoordinator. */
export const productHistoryRuntime = Object.freeze({
  enabled: PRODUCT_CAPABILITIES.seedHistory,
  snapshot: (): HistoryServiceSnapshot => historyService?.snapshot() ?? DISABLED_HISTORY_SNAPSHOT,
  subscribe: (listener: () => void): (() => void) => historyService?.subscribe(listener) ?? (() => undefined),
  retryDurability: (): Promise<HistoryServiceSnapshot> =>
    historyService?.retryDurability() ?? Promise.resolve(DISABLED_HISTORY_SNAPSHOT),
  reset: (allowWithoutDiagnostic = false): Promise<HistoryResetResult> => {
    if (!historyService) {
      return Promise.resolve(Object.freeze({
        reset: false,
        preservedDiagnostic: false,
        requiresUnrecoverableConfirmation: false,
        snapshot: DISABLED_HISTORY_SNAPSHOT,
      }));
    }
    return historyService.reset({ confirmed: true, allowWithoutDiagnostic });
  },
});

export const productMatchLifecycle = new MatchLifecycleCoordinator({
  enabled: PRODUCT_CAPABILITIES.seedHistory,
  recoverActiveOnInitialize: !PRODUCT_CAPABILITIES.resumeGame,
  history: historyService,
  appVersion: APP_VERSION,
  readSession: readMatchSession,
  readMilestones: (sessionId) => attemptMilestoneCollector.snapshot(sessionId),
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

/** Feeds the bounded milestone recorder, then converts the same stream into outcome callbacks. */
function subscribeToGameplayOutcomes(listener: (event: MatchOutcomeEvent) => void): () => void {
  let { sessionId, cursor } = gameplaySignalStream.snapshot();
  attemptMilestoneCollector.beginSession(sessionId);
  return gameplaySignalStream.subscribe((snapshot) => {
    if (snapshot.sessionId !== sessionId) {
      sessionId = snapshot.sessionId;
      cursor = 0;
      attemptMilestoneCollector.beginSession(sessionId);
    }
    for (const signal of gameplaySignalStream.signalsSince(cursor, sessionId)) {
      cursor = Math.max(cursor, signal.cursor);
      attemptMilestoneCollector.observe(signal);
      if (signal.kind === "game.ended") {
        listener(Object.freeze({ sessionId: signal.sessionId, winner: signal.winner }));
      }
    }
  });
}
