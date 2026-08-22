import type { CardFilter, CardInstance, GameState, Side, TargetRequirement } from "./GameTypes";
import { getPowerEndurance, matchesFilter } from "./StaticEffects";
import { pickRandom } from "./RNG";
import { hasTrait } from "./Traits";

export function allBattlefield(game: GameState): CardInstance[] {
  return [...game.player.field, ...game.host.field];
}

export function findPermanent(game: GameState, id: string): CardInstance | undefined {
  return allBattlefield(game).find((card) => card.instanceId === id);
}

export function targetCandidates(game: GameState, sourceSide: Side, req: TargetRequirement): CardInstance[] {
  return targetCandidatesWithSelectedTargets(game, sourceSide, req, {});
}

export function targetCandidatesWithSelectedTargets(game: GameState, sourceSide: Side, req: TargetRequirement, selectedTargets: Record<string, string | string[]>): CardInstance[] {
  const wanted = req.controller === "SELF" ? sourceSide : req.controller === "OPPONENT" ? opponent(sourceSide) : undefined;
  return allBattlefield(game).filter((card) => {
    if (wanted && card.controller !== wanted) return false;
    if (req.type.includes("ECHO") && !card.kinds.includes("ECHO")) return false;
    if (req.type.includes("LAND") && !card.kinds.includes("SOURCE")) return false;
    const filters = req.filters as (CardFilter & { anyOf?: CardFilter[]; excludeTargetIds?: string[] }) | undefined;
    if (filters?.kinds?.length && !filters.kinds.every((type) => card.kinds.includes(type))) return false;
    if (filters?.subtypes?.length && !filters.subtypes.every((type) => card.subtypes.includes(type))) return false;
    if (filters?.traits?.length && !filters.traits.every((trait) => hasTrait(game, card, trait))) return false;
    if (filters?.anyOf?.length && !filters.anyOf.some((filter) => matchesEffectiveTargetFilter(game, card, filter))) return false;
    if (targetExcludedByPreviousSelection(card, filters?.excludeTargetIds, selectedTargets)) return false;
    if (req.filterAny?.length && !req.filterAny.some((filter) => matchesEffectiveTargetFilter(game, card, filter))) return false;
    return true;
  });
}

function matchesEffectiveTargetFilter(game: GameState, card: CardInstance, filter: CardFilter): boolean {
  const { traits, ...structuralFilter } = filter;
  if (!matchesFilter(card, structuralFilter)) return false;
  return !traits?.length || traits.every((trait) => hasTrait(game, card, trait));
}

export function targetRequirementIsBuff(card: CardInstance, requirement: TargetRequirement): boolean {
  return card.effects.some((effect) => effectBuffsTarget(effect, requirement.id));
}

function effectBuffsTarget(effect: Record<string, unknown>, targetId: string): boolean {
  const buffTypes = new Set(["MODIFY_STATS", "PUMP", "PUMP_UNTIL_END_OF_TURN", "PUMP_UNTIL_NEXT_PLAYER_TURN", "ADD_COUNTERS", "PUT_COUNTER", "GRANT_KEYWORD"]);
  const referencedTarget = effect.targetRef ?? effect.target;
  if (buffTypes.has(String(effect.type)) && String(referencedTarget ?? "") === targetId) return true;
  for (const nestedKey of ["steps", "effects"] as const) {
    const nested = effect[nestedKey];
    if (Array.isArray(nested) && nested.some((item) => item && typeof item === "object" && effectBuffsTarget(item as Record<string, unknown>, targetId))) return true;
  }
  return false;
}

export function hasValidTargetSequence(game: GameState, sourceSide: Side, requirements: TargetRequirement[]): boolean {
  function visit(index: number, selected: Record<string, string | string[]>): boolean {
    if (index >= requirements.length) return true;
    const req = requirements[index];
    for (const candidate of targetCandidatesWithSelectedTargets(game, sourceSide, req, selected)) {
      if (visit(index + 1, { ...selected, [req.id]: candidate.instanceId })) return true;
    }
    return false;
  }

  return visit(0, {});
}

function targetExcludedByPreviousSelection(card: CardInstance, excludeTargetIds: unknown, selectedTargets: Record<string, string | string[]>): boolean {
  if (!Array.isArray(excludeTargetIds)) return false;
  for (const ref of excludeTargetIds.map(String)) {
    const selected = selectedTargets[ref];
    const ids = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (ids.includes(card.instanceId)) return true;
  }
  return false;
}

export function chooseHostTarget(game: GameState, kind: "destroy" | "damage", damage = 0): string | undefined {
  const creatures = game.player.field.filter((card) => card.kinds.includes("ECHO"));
  if (creatures.length === 0) return undefined;
  if (kind === "damage") {
    const lethal = creatures.filter((card) => getPowerEndurance(game, card).endurance - card.damageMarked <= damage);
    if (lethal.length > 0) return bestCreature(game, lethal)?.instanceId;
  }
  return bestCreature(game, creatures)?.instanceId;
}

function bestCreature(game: GameState, cards: CardInstance[]): CardInstance | undefined {
  const scored = cards.map((card) => ({ card, score: Number((card as unknown as { targetPriority?: number }).targetPriority ?? card.energyCost) }));
  const max = Math.max(...scored.map((item) => item.score));
  const tied = scored.filter((item) => item.score === max).map((item) => item.card);
  return pickRandom(game, tied);
}

export function weakestCreature(game: GameState, side: Side): CardInstance | undefined {
  const creatures = game[side].field.filter((card) => card.kinds.includes("ECHO"));
  if (creatures.length === 0) return undefined;
  const scored = creatures.map((card) => {
    const stats = getPowerEndurance(game, card);
    return { card, score: stats.power + stats.endurance };
  });
  const min = Math.min(...scored.map((item) => item.score));
  const tied = scored.filter((item) => item.score === min).map((item) => item.card);
  return pickRandom(game, tied);
}

export function opponent(side: Side): Side {
  return side === "player" ? "host" : "player";
}
