import type { GameState } from "./GameTypes";
import { emptyEnergyPool } from "./EnergySystem";
import { drawCards } from "./GameState";

export function readySide(game: GameState, side: "player" | "horde"): void {
  for (const card of game[side].field) {
    card.exhausted = false;
    card.activatedThisTurn = false;
    if (card.kinds.includes("ECHO")) card.stabilizing = false;
  }
}

export function cleanupEndStep(game: GameState): void {
  for (const card of [...game.player.field, ...game.horde.field]) {
    card.damageMarked = 0;
    card.lethalDamage = false;
    card.temporaryPower = 0;
    card.temporaryEndurance = 0;
    card.temporaryTraits = [];
    delete card.flags.burnSmoke;
  }
  game.player.energyPool = { ...emptyEnergyPool(), stored: game.player.energyPool.stored };
  game.combat = { playerAttackers: [], hordeAttackers: [], blockers: {}, pendingDamageVolleys: [] };
}

export function completePlayerStabilization(game: GameState): void {
  for (const card of game.player.field) {
    if (card.kinds.includes("ECHO")) card.stabilizing = false;
  }
}

export function startPlayerTurn(game: GameState): void {
  for (const card of [...game.player.field, ...game.horde.field]) {
    card.untilNextPlayerTurnPower = 0;
    card.untilNextPlayerTurnEndurance = 0;
  }
  game.activeSide = "player";
  game.phase = "untap";
  game.fieldEntriesThisTurn = [];
  // Setup can grant consecutive player turns without a Horde turn between them.
  // A reserve only belongs to the player turn that immediately precedes the Horde,
  // so an older setup turn must never refill Stored Energy later.
  game.player.pendingStoredEnergy = 0;
  game.player.energyActionUsedThisTurn = false;
  game.player.lifePaidThisTurn = 0;
  game.player.lifeLostThisTurn = 0;
  game.turnNumber += 1;
}

export function startPlayerTurnReady(game: GameState): void {
  startPlayerTurn(game);
  readySide(game, "player");
  performPlayerDraw(game);
  game.phase = "main";
  game.log.unshift("Player starts the turn, readies their Field, and draws.");
}

export function performPlayerDraw(game: GameState): void {
  const drawAmount = game.gameMode === "chaos"
    ? 2
    : game.setupTurnsRemaining > 0
    ? 1
    : game.difficulty === "easy" || game.player.hand.length === 0
      ? 2
      : 1;
  drawCards(game, "player", drawAmount);
  game.log.unshift(`Player draws ${drawAmount} card${drawAmount === 1 ? "" : "s"}.`);
}
