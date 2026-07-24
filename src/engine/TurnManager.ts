import type { GameState } from "./GameTypes";
import { emptyManaPool } from "./ManaSystem";
import { drawCards } from "./GameState";

export function untapSide(game: GameState, side: "player" | "horde"): void {
  for (const card of game[side].battlefield) {
    card.tapped = false;
    card.activatedThisTurn = false;
    if (side === "player") card.summoningSickness = false;
  }
}

export function cleanupEndStep(game: GameState): void {
  for (const card of [...game.player.battlefield, ...game.horde.battlefield]) {
    card.damageMarked = 0;
    card.deathtouchDamage = false;
    card.temporaryPower = 0;
    card.temporaryToughness = 0;
    card.temporaryKeywords = [];
    delete card.flags.burnSmoke;
  }
  game.player.manaPool = { ...emptyManaPool(), colorless: game.player.manaPool.colorless };
  game.combat = { playerAttackers: [], hordeAttackers: [], blockers: {} };
}

export function clearPlayerSummoningSickness(game: GameState): void {
  for (const card of game.player.battlefield) {
    if (card.cardTypes.includes("Creature")) card.summoningSickness = false;
  }
}

export function startPlayerTurn(game: GameState): void {
  game.activeSide = "player";
  game.phase = "untap";
  // Setup can grant consecutive player turns without a Horde turn between them.
  // A reserve only belongs to the player turn that immediately precedes the Horde,
  // so an older setup turn must never refill stored mana later.
  game.player.pendingStoredMana = 0;
  game.player.energyActionUsedThisTurn = false;
  game.turnNumber += 1;
}

export function startPlayerTurnReady(game: GameState): void {
  startPlayerTurn(game);
  untapSide(game, "player");
  performPlayerDraw(game);
  game.phase = "main";
  game.log.unshift("Player starts the turn, untaps, and draws.");
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
