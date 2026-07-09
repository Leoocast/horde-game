import type { GameState, Phase } from "./GameTypes";
import { cleanupEndStep, performPlayerDraw, startPlayerTurnReady, untapSide } from "./TurnManager";

const phaseOrder: Phase[] = ["untap", "draw", "main", "combat", "secondMain", "end"];

export function advancePhase(game: GameState, target?: Phase): GameState {
  const next = structuredClone(game) as GameState;
  if (next.winner) return next;
  const nextPhase = target ?? phaseOrder[Math.min(phaseOrder.indexOf(next.phase) + 1, phaseOrder.length - 1)] ?? "untap";
  next.phase = nextPhase;
  if (nextPhase === "untap") {
    untapSide(next, "player");
    next.log.unshift("Player untaps.");
  }
  if (nextPhase === "draw") performPlayerDraw(next);
  if (nextPhase === "end") cleanupEndStep(next);
  return next;
}

export function endPlayerTurn(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  cleanupEndStep(next);
  if (next.setupTurnsRemaining > 1) {
    next.setupTurnsRemaining -= 1;
    startPlayerTurnReady(next);
    next.log.unshift(`Setup turn complete. ${next.setupTurnsRemaining} setup turn(s) remain.`);
    return next;
  }
  if (next.setupTurnsRemaining === 1) {
    next.setupTurnsRemaining = 0;
    next.setupCompletePendingHorde = true;
    startPlayerTurnReady(next);
    next.log.unshift("Setup complete. Finish your preparation to start the Horde.");
    return next;
  }
  next.setupCompletePendingHorde = false;
  next.phase = "horde";
  next.activeSide = "horde";
  next.log.unshift("Player ends turn. Horde turn is ready.");
  return next;
}
