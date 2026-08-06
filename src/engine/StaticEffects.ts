import type { CardFilter, CardInstance, GameState, Side } from "./GameTypes";

export function hostSurgeTurn(game: GameState): number {
  return game.gameMode === "chaos" ? game.hostRules.surgeTurnChaos : game.hostRules.surgeTurn;
}

export function matchesFilter(card: CardInstance, filter?: CardFilter, source?: CardInstance): boolean {
  if (!filter) return true;
  if (filter.excludeSelf && source && source.instanceId === card.instanceId) return false;
  if (typeof filter.isToken === "boolean" && card.isToken !== filter.isToken) return false;
  if (filter.kinds?.length && !filter.kinds.every((type) => card.kinds.includes(type))) return false;
  if (filter.subtypes?.length && !filter.subtypes.every((type) => card.subtypes.includes(type))) return false;
  if (filter.traits?.length && !filter.traits.every((keyword) => card.traits.includes(keyword))) return false;
  return true;
}

export function resolveAffectedController(sourceController: Side, controller: unknown): Side | undefined {
  const text = String(controller ?? "SELF").toUpperCase();
  if (text === "HOST") return "host";
  if (text === "PLAYER") return "player";
  if (text === "SELF") return sourceController;
  if (text === "OPPONENT") return sourceController === "player" ? "host" : "player";
  return undefined;
}

export function staticConditionMet(game: GameState, condition: unknown, source: CardInstance): boolean {
  if (!condition || typeof condition !== "object") return true;
  const data = condition as Record<string, unknown>;
  if (data.type === "ACTIVE_PLAYER_IS") {
    const side = resolveAffectedController(source.controller, data.player);
    return side !== undefined && game.activeSide === side;
  }
  if (data.type === "MEMORY_COUNT_AT_LEAST") {
    const side = resolveAffectedController(source.controller, data.controller) ?? source.controller;
    return game[side].memory.length >= Number(data.amount ?? 0);
  }
  return true;
}

export function getPowerEndurance(
  game: GameState,
  card: CardInstance,
  excludedBuffSourceIds?: Set<string>,
): { power: number; endurance: number } {
  let power =
    card.basePower +
    (card.counters["+1/+1"] ?? 0) -
    (card.counters["-1/-1"] ?? 0) +
    card.temporaryPower +
    (card.untilNextPlayerTurnPower ?? 0);
  let endurance =
    card.baseEndurance +
    (card.counters["+1/+1"] ?? 0) -
    (card.counters["-1/-1"] ?? 0) +
    card.temporaryEndurance +
    (card.untilNextPlayerTurnEndurance ?? 0);

  const surgeBonus = game.hostRules.surgeBonus;
  if (
    surgeBonus &&
    hostInSurge(game) &&
    card.controller === "host" &&
    card.kinds.includes("ECHO") &&
    card.subtypes.some((subtype) => surgeBonus.subtypes.some((bonusSubtype) => bonusSubtype.toLowerCase() === subtype.toLowerCase()))
  ) {
    power += surgeBonus.power;
    endurance += surgeBonus.endurance;
  }

  for (const source of [...game.player.field, ...game.host.field]) {
    if (excludedBuffSourceIds?.has(source.instanceId)) continue;
    for (const effect of source.effects) {
      if (effect.type === "STATIC_BUFF") {
        const affectedController = resolveAffectedController(source.controller, effect.controller);
        if (affectedController && card.controller !== affectedController) continue;
        if (!matchesFilter(card, effect.filter as CardFilter | undefined, source)) continue;
        power += Number(effect.power ?? 0);
        endurance += Number(effect.endurance ?? 0);
        continue;
      }
      if (effect.type === "STATIC_CONDITIONAL_BUFF") {
        if (effect.target === "SELF" && card.instanceId !== source.instanceId) continue;
        if (!staticConditionMet(game, effect.condition, source)) continue;
        power += Number(effect.power ?? 0);
        endurance += Number(effect.endurance ?? 0);
      }
    }
  }

  return { power, endurance };
}

export function hostInSurge(game: GameState): boolean {
  return game.hostTurnNumber >= hostSurgeTurn(game);
}
