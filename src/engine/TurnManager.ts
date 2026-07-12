import type { GameState } from "./GameTypes";
import { emptyManaPool } from "./ManaSystem";
import { drawCards } from "./GameState";

export function untapSide(game: GameState, side: "player" | "horde"): void {
  for (const card of game[side].battlefield) {
    card.tapped = false;
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
  }
  game.player.manaPool = emptyManaPool();
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
  game.player.landPlayedThisTurn = false;
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
  drawCards(game, "player", 1);
  game.log.unshift("Player draws 1 card.");
}
