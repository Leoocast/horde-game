import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { getKeywords } from "../engine/Keywords";
import { getPowerToughness, hordeInSurge } from "../engine/StaticEffects";

export function cardStats(game: GameState, card: CardInstance): string {
  return cardStatState(game, card).text;
}

/**
 * `heldBonus` hides a static buff whose announcement beat has not played yet. The engine already
 * applies static abilities continuously, so without this the creature is drawn already buffed and
 * the beat that is supposed to explain the buff has nothing left to show.
 */
export function cardStatState(
  game: GameState,
  card: CardInstance,
  visualDamageMarked = 0,
  heldBonus?: { power: number; toughness: number },
): { text: string; power?: number; toughness?: number; damaged: boolean; buffed: boolean } {
  if (!card.cardTypes.includes("ECHO")) return { text: "", damaged: false, buffed: false };
  const total = getPowerToughness(game, card);
  const power = total.power - (heldBonus?.power ?? 0);
  const toughness = total.toughness - (heldBonus?.toughness ?? 0);
  const damageMarked = Math.max(card.damageMarked, visualDamageMarked);
  const visibleToughness = Math.max(0, toughness - damageMarked);
  const buffed = power > card.basePower || toughness > card.baseToughness;
  return {
    text: damageMarked > 0 ? `${power}/${visibleToughness}` : `${power}/${toughness}`,
    power,
    toughness: damageMarked > 0 ? visibleToughness : toughness,
    damaged: damageMarked > 0,
    buffed,
  };
}

export function cardKeywords(game: GameState, card: CardInstance): string {
  return sortKeywordsForDisplay(getKeywords(game, card))
    .filter((keyword) => (game.gameMode === "chaos" || keyword !== "OVERFLOW") && (keyword !== "IMPETUS" || card.controller !== "horde"))
    .map(formatKeyword)
    .join(", ");
}

const KEYWORD_DISPLAY_ORDER = [
  "DAUNTING",
  "FLYING",
  "SKYGUARD",
  "REFLEX",
  "LETHAL",
  "DRAIN",
  "ALERT",
  "OVERFLOW",
  "FURTIVE",
  "HEXPROOF",
  "INDESTRUCTIBLE",
  "IMPETUS",
  "POISON",
] as const;

function keywordDisplayKey(keyword: string): string {
  const normalized = String(keyword).trim().toUpperCase().replace(/[\s-]+/g, "_");
  return normalized.startsWith("POISON_") ? "POISON" : normalized;
}

export function sortKeywordsForDisplay(keywords: string[]): string[] {
  return [...keywords].sort((left, right) => {
    const leftKey = keywordDisplayKey(left);
    const rightKey = keywordDisplayKey(right);
    const leftPriority = KEYWORD_DISPLAY_ORDER.indexOf(leftKey as (typeof KEYWORD_DISPLAY_ORDER)[number]);
    const rightPriority = KEYWORD_DISPLAY_ORDER.indexOf(rightKey as (typeof KEYWORD_DISPLAY_ORDER)[number]);
    const leftRank = leftPriority === -1 ? KEYWORD_DISPLAY_ORDER.length : leftPriority;
    const rightRank = rightPriority === -1 ? KEYWORD_DISPLAY_ORDER.length : rightPriority;

    if (leftRank !== rightRank) return leftRank - rightRank;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function formatKeyword(keyword: string): string {
  const text = String(keyword).trim();
  const poison = text.match(/^POISON_(\d+)$/u);
  if (poison) return `POISON {${poison[1]}}`;
  return text.toUpperCase();
}

export function zoneCount(game: GameState, side: Side, zone: "archive" | "hand" | "field" | "memory" | "oblivion"): number {
  if (side === "player") return game.player[zone].length;
  if (zone === "hand") return 0;
  return game.horde[zone].length;
}

export function gameStatus(game: GameState): string {
  if (game.winner) return `${game.winner === "player" ? "Player" : "Horde"} wins`;
  if (game.gameMode === "chaos") return hordeInSurge(game) ? "Chaos Surge active" : "Chaos mutation active";
  if (game.setupTurnsRemaining > 0) return `Setup: ${game.setupTurnsRemaining} player turn(s) remain`;
  return hordeInSurge(game) ? "Horde Surge active" : "Normal alternation";
}
