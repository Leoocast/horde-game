import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { getTraits } from "../engine/Traits";
import { getPowerEndurance, hostInSurge } from "../engine/StaticEffects";

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
  heldBonus?: { power: number; endurance: number },
): { text: string; power?: number; endurance?: number; damaged: boolean; buffed: boolean } {
  if (!card.kinds.includes("ECHO")) return { text: "", damaged: false, buffed: false };
  const total = getPowerEndurance(game, card);
  const power = total.power - (heldBonus?.power ?? 0);
  const endurance = total.endurance - (heldBonus?.endurance ?? 0);
  const damageMarked = Math.max(card.damageMarked, visualDamageMarked);
  const visibleEndurance = Math.max(0, endurance - damageMarked);
  const buffed = power > card.basePower || endurance > card.baseEndurance;
  return {
    text: damageMarked > 0 ? `${power}/${visibleEndurance}` : `${power}/${endurance}`,
    power,
    endurance: damageMarked > 0 ? visibleEndurance : endurance,
    damaged: damageMarked > 0,
    buffed,
  };
}

export function cardTraits(game: GameState, card: CardInstance): string {
  return sortTraitsForDisplay(getTraits(game, card))
    .filter((keyword) => (game.gameMode === "chaos" || keyword !== "OVERFLOW") && (keyword !== "IMPETUS" || card.controller !== "host"))
    .map(formatTrait)
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

export function sortTraitsForDisplay(traits: string[]): string[] {
  return [...traits].sort((left, right) => {
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

function formatTrait(keyword: string): string {
  const text = String(keyword).trim();
  const poison = text.match(/^POISON_(\d+)$/u);
  if (poison) return `POISON {${poison[1]}}`;
  return text.toUpperCase();
}

export function zoneCount(game: GameState, side: Side, zone: "archive" | "hand" | "field" | "memory" | "oblivion"): number {
  if (side === "player") return game.player[zone].length;
  if (zone === "hand") return 0;
  return game.host[zone].length;
}

export function gameStatus(game: GameState): string {
  if (game.winner) return `${game.winner === "player" ? "Player" : "Host"} wins`;
  if (game.gameMode === "chaos") return hostInSurge(game) ? "Chaos Surge active" : "Chaos mutation active";
  if (game.setupTurnsRemaining > 0) return `Setup: ${game.setupTurnsRemaining} player turn(s) remain`;
  return hostInSurge(game) ? "Host Surge active" : "Normal alternation";
}
