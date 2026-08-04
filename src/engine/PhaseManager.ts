import type { GameState, Phase } from "./GameTypes";
import { checkWinLoss } from "./CombatResolver";
import { discardHostArchiveToMemory } from "./EffectResolver";
import { queueUnusedNormalEnergy } from "./EnergySystem";
import { cleanupEndStep, completePlayerStabilization, performPlayerDraw, readySide, startPlayerTurnReady } from "./TurnManager";

const phaseOrder: Phase[] = ["untap", "draw", "main", "combat", "end"];

export function advancePhase(game: GameState, target?: Phase): GameState {
  const next = structuredClone(game) as GameState;
  if (next.winner) return next;
  const nextPhase = target ?? phaseOrder[Math.min(phaseOrder.indexOf(next.phase) + 1, phaseOrder.length - 1)] ?? "untap";
  next.phase = nextPhase;
  if (nextPhase === "untap") {
    readySide(next, "player");
    next.log.unshift("Player readies their Field.");
  }
  if (nextPhase === "draw") performPlayerDraw(next);
  if (nextPhase === "end") {
    cleanupEndStep(next, {
      preserveMarkedDamage: true,
      preserveTemporaryModifiers: true,
    });
  }
  return next;
}

export function endPlayerTurn(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  const queuedEnergy = queueUnusedNormalEnergy(next);
  if (queuedEnergy > 0) next.log.unshift(`Player reserves ${queuedEnergy} unused Energy.`);
  cleanupEndStep(next);
  resolveHostPoison(next);
  if (next.winner) return next;
  completePlayerStabilization(next);
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
    next.setupCompletePendingHost = false;
    next.activeSide = "host";
    next.phase = "host";
    next.log.unshift("Setup complete. Host turn is ready.");
    return next;
  }
  next.setupCompletePendingHost = false;
  next.phase = "host";
  next.activeSide = "host";
  next.log.unshift("Player ends turn. Host turn is ready.");
  return next;
}

function resolveHostPoison(game: GameState): void {
  const poisonPerArchiveDiscard = game.hostRules.poisonPerArchiveDiscard;
  const archiveDiscards = Math.floor(game.host.poisonCounters / poisonPerArchiveDiscard);
  if (archiveDiscards <= 0) return;
  game.host.poisonCounters -= archiveDiscards * poisonPerArchiveDiscard;
  game.log.unshift(`Host Poison consumes ${archiveDiscards * poisonPerArchiveDiscard} counter(s).`);
  discardHostArchiveToMemory(game, archiveDiscards);
  checkWinLoss(game);
}
