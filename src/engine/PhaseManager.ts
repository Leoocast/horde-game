import type { GameState, Phase } from "./GameTypes";
import { checkWinLoss } from "./CombatResolver";
import { millHorde } from "./EffectResolver";
import { queueUnusedNormalEnergy } from "./EnergySystem";
import { cleanupEndStep, clearPlayerSummoningSickness, performPlayerDraw, startPlayerTurnReady, untapSide } from "./TurnManager";

const phaseOrder: Phase[] = ["untap", "draw", "main", "combat", "end"];

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
  const queuedEnergy = queueUnusedNormalEnergy(next);
  if (queuedEnergy > 0) next.log.unshift(`Player reserves ${queuedEnergy} unused Energy.`);
  cleanupEndStep(next);
  resolveHordePoison(next);
  if (next.winner) return next;
  clearPlayerSummoningSickness(next);
  next.player.lifePaidThisTurn = 0;
  next.player.lifeLostThisTurn = 0;
  if (next.setupTurnsRemaining > 1) {
    next.setupTurnsRemaining -= 1;
    startPlayerTurnReady(next);
    next.log.unshift(`Setup turn complete. ${next.setupTurnsRemaining} setup turn(s) remain.`);
    return next;
  }
  if (next.setupTurnsRemaining === 1) {
    next.setupTurnsRemaining = 0;
    next.setupCompletePendingHorde = false;
    next.activeSide = "horde";
    next.phase = "horde";
    next.log.unshift("Setup complete. Horde turn is ready.");
    return next;
  }
  next.setupCompletePendingHorde = false;
  next.phase = "horde";
  next.activeSide = "horde";
  next.log.unshift("Player ends turn. Horde turn is ready.");
  return next;
}

function resolveHordePoison(game: GameState): void {
  const poisonPerMill = game.hordeRules.poisonPerMill;
  const poisonMills = Math.floor(game.horde.poisonCounters / poisonPerMill);
  if (poisonMills <= 0) return;
  game.horde.poisonCounters -= poisonMills * poisonPerMill;
  game.log.unshift(`Horde poison triggers. Horde mills ${poisonMills} card(s).`);
  millHorde(game, poisonMills);
  checkWinLoss(game);
}
