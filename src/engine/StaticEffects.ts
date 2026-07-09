import type { CardFilter, CardInstance, GameState, Side } from "./GameTypes";

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
  const battlefield = [...game.player.battlefield, ...game.horde.battlefield];

  for (const source of battlefield) {
    for (const effect of source.effects) {
      if (effect.type !== "STATIC_BUFF" && effect.type !== "STATIC_CONDITIONAL_BUFF") continue;
      const controller = resolveController(source.controller, effect.controller as string | undefined);
      if (controller !== card.controller) continue;
      if (effect.type === "STATIC_CONDITIONAL_BUFF" && !conditionMet(game, effect.condition as Record<string, unknown> | undefined)) continue;
      if (effect.target === "SELF" && source.instanceId !== card.instanceId) continue;
      if (effect.target !== "SELF" && !matchesFilter(card, effect.filter as CardFilter | undefined, source)) continue;
      power += Number(effect.power ?? 0);
      toughness += Number(effect.toughness ?? 0);
    }
  }

  return { power, toughness };
}

export function hordeInSurge(game: GameState): boolean {
  return game.horde.graveyard.length + game.horde.exile.length > game.horde.library.length;
}

function resolveController(sourceController: Side, controller?: string): Side {
  if (!controller || controller === "SELF") return sourceController;
  if (controller === "HORDE") return "horde";
  if (controller === "PLAYER") return "player";
  return sourceController;
}

function conditionMet(game: GameState, condition?: Record<string, unknown>): boolean {
  if (!condition) return true;
  if (condition.type === "GRAVEYARD_COUNT_AT_LEAST") {
    const side = condition.controller === "HORDE" ? "horde" : "player";
    return game[side].graveyard.length >= Number(condition.amount ?? 0);
  }
  return true;
}
