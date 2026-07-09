import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { getKeywords } from "../engine/Keywords";
import { getPowerToughness, hordeInSurge } from "../engine/StaticEffects";

export function cardStats(game: GameState, card: CardInstance): string {
  if (!card.cardTypes.includes("Creature")) return "";
  const { power, toughness } = getPowerToughness(game, card);
  return `${power}/${toughness}`;
}

export function cardKeywords(game: GameState, card: CardInstance): string {
  return getKeywords(game, card).filter((keyword) => keyword !== "HASTE" || card.controller === "horde").join(", ");
}

export function zoneCount(game: GameState, side: Side, zone: "library" | "hand" | "battlefield" | "graveyard" | "exile"): number {
  if (side === "player") return game.player[zone].length;
  if (zone === "hand") return 0;
  return game.horde[zone].length;
}

export function gameStatus(game: GameState): string {
  if (game.winner) return `${game.winner === "player" ? "Player" : "Horde"} wins`;
  if (game.setupTurnsRemaining > 0) return `Setup: ${game.setupTurnsRemaining} player turn(s) remain`;
  return hordeInSurge(game) ? "Horde Surge active" : "Normal alternation";
}
