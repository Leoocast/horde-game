import type { GameState } from "./GameTypes";
import { emptyEnergyPool } from "./EnergySystem";
import { drawCards } from "./GameState";
import { resetOncePerTurnUsage } from "./OncePerTurn";

export type PlayerDrawReason = "normal" | "setup" | "easy" | "empty-hand" | "chaos";

export type PlayerDrawForecast = Readonly<{
  amount: number;
  requested: number;
  reason: PlayerDrawReason;
  emptyHandBonus: boolean;
}>;

type PlayerDrawForecastOptions = Readonly<{
  timing?: "immediate" | "next";
}>;

export function readySide(game: GameState, side: "player" | "host"): void {
  for (const card of game[side].field) {
    card.exhausted = false;
    card.activatedThisTurn = false;
    resetOncePerTurnUsage(card);
    if (card.kinds.includes("ECHO")) card.stabilizing = false;
  }
}

export function cleanupEndStep(
  game: GameState,
  options: { preserveMarkedDamage?: boolean; preserveTemporaryModifiers?: boolean } = {},
): void {
  for (const card of [...game.player.field, ...game.host.field]) {
    if (!options.preserveMarkedDamage) {
      card.damageMarked = 0;
      card.lethalDamage = false;
    }
    if (!options.preserveTemporaryModifiers) {
      card.temporaryPower = 0;
      card.temporaryEndurance = 0;
      card.temporaryTraits = [];
    }
    delete card.flags.burnSmoke;
  }
  game.player.energyPool = { ...emptyEnergyPool(), stored: game.player.energyPool.stored };
  game.combat = { playerAttackers: [], hostAttackers: [], blockers: {}, pendingDamageVolleys: [] };
}

export function completePlayerStabilization(game: GameState): void {
  for (const card of game.player.field) {
    if (card.kinds.includes("ECHO")) card.stabilizing = false;
  }
}

export function startPlayerTurn(game: GameState): void {
  for (const card of [...game.player.field, ...game.host.field]) {
    card.untilNextPlayerTurnPower = 0;
    card.untilNextPlayerTurnEndurance = 0;
  }
  game.activeSide = "player";
  game.phase = "untap";
  game.fieldEntriesThisTurn = [];
  // Setup can grant consecutive player turns without a Host turn between them.
  // A reserve only belongs to the player turn that immediately precedes the Host,
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
  const forecast = playerDrawForecast(game);
  drawCards(game, "player", forecast.amount);
  game.log.unshift(`Player draws ${forecast.amount} card${forecast.amount === 1 ? "" : "s"}.`);
}

/**
 * The single source of truth for both the draw resolver and the permanent UI forecast.
 * `amount` is capped by the Archive so the player sees what can actually be drawn, while
 * `requested` preserves the rule's intended amount for diagnostics and future effects.
 */
export function playerDrawForecast(game: GameState, options: PlayerDrawForecastOptions = {}): PlayerDrawForecast {
  const setupApplies = options.timing === "next"
    ? game.setupTurnsRemaining > 1
    : game.setupTurnsRemaining > 0;
  const reason: PlayerDrawReason = game.gameMode === "chaos"
    ? "chaos"
    : setupApplies
      ? "setup"
      : game.difficulty === "easy"
        ? "easy"
        : game.player.hand.length === 0
          ? "empty-hand"
          : "normal";
  const requested = reason === "setup" || reason === "normal" ? 1 : 2;
  const amount = Math.min(requested, game.player.archive.length);
  return {
    amount,
    requested,
    reason,
    emptyHandBonus: reason === "empty-hand" && amount > 1,
  };
}
