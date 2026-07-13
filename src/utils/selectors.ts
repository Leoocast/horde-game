import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { getKeywords } from "../engine/Keywords";
import { getPowerToughness, hordeInSurge } from "../engine/StaticEffects";

export function cardStats(game: GameState, card: CardInstance): string {
  return cardStatState(game, card).text;
}

export function cardStatState(game: GameState, card: CardInstance, visualDamageMarked = 0): { text: string; damaged: boolean; buffed: boolean } {
  if (!card.cardTypes.includes("Creature")) return { text: "", damaged: false, buffed: false };
  const { power, toughness } = getPowerToughness(game, card);
  const damageMarked = Math.max(card.damageMarked, visualDamageMarked);
  const visibleToughness = Math.max(0, toughness - damageMarked);
  const buffed = power > card.basePower || toughness > card.baseToughness;
  return {
    text: damageMarked > 0 ? `${power}/${visibleToughness}` : `${power}/${toughness}`,
    damaged: damageMarked > 0,
    buffed,
  };
}

export function cardKeywords(game: GameState, card: CardInstance): string {
  return getKeywords(game, card)
    .filter((keyword) => keyword !== "HASTE" || card.controller === "horde")
    .map(formatKeyword)
    .join(", ");
}

function formatKeyword(keyword: string): string {
  const text = String(keyword).trim();
  const toxic = text.match(/^TOXIC[_\s-]?(\d+)$/i) ?? text.match(/^Toxic\s+(\d+)$/i);
  if (toxic) return `TOXIC {${toxic[1]}}`;
  return text.toUpperCase();
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
