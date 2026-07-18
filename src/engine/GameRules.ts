import type { GameState } from "./GameTypes";

export const MAX_PLAYER_LANDS = 10;
export const MAX_PLAYER_HAND_SIZE = 7;

export function playerHandOverflow(game: GameState): number {
  return Math.max(0, game.player.hand.length - MAX_PLAYER_HAND_SIZE);
}

export function playerLandCount(game: GameState): number {
  return game.player.battlefield.filter((card) => card.cardTypes.includes("Land")).length;
}

export function canPlayerPutAnotherLand(game: GameState): boolean {
  return playerLandCount(game) < MAX_PLAYER_LANDS;
}
