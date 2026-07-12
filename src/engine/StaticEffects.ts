import type { CardFilter, CardInstance, GameState } from "./GameTypes";

export function matchesFilter(card: CardInstance, filter?: CardFilter, source?: CardInstance): boolean {
  if (!filter) return true;
  if (filter.excludeSelf && source && source.instanceId === card.instanceId) return false;
  if (typeof filter.isToken === "boolean" && card.isToken !== filter.isToken) return false;
  if (filter.cardTypes?.length && !filter.cardTypes.every((type) => card.cardTypes.includes(type))) return false;
  if (filter.subtypes?.length && !filter.subtypes.every((type) => card.subtypes.includes(type))) return false;
  if (filter.keywords?.length && !filter.keywords.every((keyword) => card.keywords.includes(keyword))) return false;
  return true;
}

export function getPowerToughness(game: GameState, card: CardInstance): { power: number; toughness: number } {
  let power = card.basePower + (card.counters["+1/+1"] ?? 0) + card.temporaryPower;
  let toughness = card.baseToughness + (card.counters["+1/+1"] ?? 0) + card.temporaryToughness;
  void game;
  return { power, toughness };
}

export function hordeInSurge(game: GameState): boolean {
  return game.horde.graveyard.length + game.horde.exile.length > game.horde.library.length;
}
