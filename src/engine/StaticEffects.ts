import type { CardFilter, CardInstance, GameState, Side } from "./GameTypes";

export const HORDE_SURGE_TURN = 10;
export const CHAOS_HORDE_SURGE_TURN = 8;
export const HORDE_MINI_SURGE_TURN = 6;
export const HORDE_SURGE_ZOMBIE_POWER_BONUS = 1;

export function hordeSurgeTurn(game: GameState): number {
  return game.gameMode === "chaos" ? CHAOS_HORDE_SURGE_TURN : HORDE_SURGE_TURN;
}

export function matchesFilter(card: CardInstance, filter?: CardFilter, source?: CardInstance): boolean {
  if (!filter) return true;
  if (filter.excludeSelf && source && source.instanceId === card.instanceId) return false;
  if (typeof filter.isToken === "boolean" && card.isToken !== filter.isToken) return false;
  if (filter.cardTypes?.length && !filter.cardTypes.every((type) => card.cardTypes.includes(type))) return false;
  if (filter.subtypes?.length && !filter.subtypes.every((type) => card.subtypes.includes(type))) return false;
  if (filter.keywords?.length && !filter.keywords.every((keyword) => card.keywords.includes(keyword))) return false;
  return true;
}

export function resolveAffectedController(sourceController: Side, controller: unknown): Side | undefined {
  const text = String(controller ?? "SELF").toUpperCase();
  if (text === "HORDE") return "horde";
  if (text === "PLAYER") return "player";
  if (text === "SELF") return sourceController;
  if (text === "OPPONENT") return sourceController === "player" ? "horde" : "player";
  return undefined;
}

export function staticConditionMet(game: GameState, condition: unknown, source: CardInstance): boolean {
  if (!condition || typeof condition !== "object") return true;
  const data = condition as Record<string, unknown>;
  if (data.type === "GRAVEYARD_COUNT_AT_LEAST") {
    const side = resolveAffectedController(source.controller, data.controller) ?? source.controller;
    return game[side].graveyard.length >= Number(data.amount ?? 0);
  }
  return true;
}

export function getPowerToughness(
  game: GameState,
  card: CardInstance,
  excludedBuffSourceIds?: Set<string>,
): { power: number; toughness: number } {
  let power = card.basePower + (card.counters["+1/+1"] ?? 0) + card.temporaryPower;
  let toughness = card.baseToughness + (card.counters["+1/+1"] ?? 0) + card.temporaryToughness;

  if (
    hordeInSurge(game) &&
    card.controller === "horde" &&
    card.cardTypes.includes("Creature") &&
    card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie")
  ) {
    power += HORDE_SURGE_ZOMBIE_POWER_BONUS;
  }

  for (const source of [...game.player.battlefield, ...game.horde.battlefield]) {
    if (excludedBuffSourceIds?.has(source.instanceId)) continue;
    for (const effect of source.effects) {
      if (effect.type === "STATIC_BUFF") {
        const affectedController = resolveAffectedController(source.controller, effect.controller);
        if (affectedController && card.controller !== affectedController) continue;
        if (!matchesFilter(card, effect.filter as CardFilter | undefined, source)) continue;
        power += Number(effect.power ?? 0);
        toughness += Number(effect.toughness ?? 0);
        continue;
      }
      if (effect.type === "STATIC_CONDITIONAL_BUFF") {
        if (effect.target === "SELF" && card.instanceId !== source.instanceId) continue;
        if (!staticConditionMet(game, effect.condition, source)) continue;
        power += Number(effect.power ?? 0);
        toughness += Number(effect.toughness ?? 0);
      }
    }
  }

  return { power, toughness };
}

export function hordeInSurge(game: GameState): boolean {
  return game.hordeTurnNumber >= hordeSurgeTurn(game);
}
