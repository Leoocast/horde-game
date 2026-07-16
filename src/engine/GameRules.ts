import type { GameState } from "./GameTypes";

export const MAX_PLAYER_LANDS = 10;

export function playerLandCount(game: GameState): number {
  return game.player.battlefield.filter((card) => card.cardTypes.includes("Land")).length;
}

export function canPlayerPutAnotherLand(game: GameState): boolean {
  return playerLandCount(game) < MAX_PLAYER_LANDS;
}
