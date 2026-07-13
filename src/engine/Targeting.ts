import type { CardInstance, GameState, Side, TargetRequirement } from "./GameTypes";
import { getPowerToughness, matchesFilter } from "./StaticEffects";
import { pickRandom } from "./RNG";

export function allBattlefield(game: GameState): CardInstance[] {
  return [...game.player.battlefield, ...game.horde.battlefield];
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
    if (req.type.includes("CREATURE") && !card.cardTypes.includes("Creature")) return false;
    if (req.type.includes("LAND") && !card.cardTypes.includes("Land")) return false;
    const filters = req.filters as { cardTypes?: string[]; subtypes?: string[]; anyOf?: Array<{ cardTypes?: string[]; subtypes?: string[] }>; excludeTargetIds?: string[] } | undefined;
    if (filters?.cardTypes?.length && !filters.cardTypes.every((type) => card.cardTypes.includes(type))) return false;
    if (filters?.subtypes?.length && !filters.subtypes.every((type) => card.subtypes.includes(type))) return false;
    if (filters?.anyOf?.length && !filters.anyOf.some((filter) => matchesFilter(card, filter))) return false;
    if (targetExcludedByPreviousSelection(card, filters?.excludeTargetIds, selectedTargets)) return false;
    if (req.filterAny?.length && !req.filterAny.some((filter) => matchesFilter(card, filter))) return false;
    return true;
  });
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

export function chooseHordeTarget(game: GameState, kind: "destroy" | "damage", damage = 0): string | undefined {
  const creatures = game.player.battlefield.filter((card) => card.cardTypes.includes("Creature"));
  if (creatures.length === 0) return undefined;
  if (kind === "damage") {
    const lethal = creatures.filter((card) => getPowerToughness(game, card).toughness - card.damageMarked <= damage);
    if (lethal.length > 0) return bestCreature(game, lethal)?.instanceId;
  }
  return bestCreature(game, creatures)?.instanceId;
}

function bestCreature(game: GameState, cards: CardInstance[]): CardInstance | undefined {
  const scored = cards.map((card) => ({ card, score: Number((card as unknown as { targetPriority?: number }).targetPriority ?? card.manaValue) }));
  const max = Math.max(...scored.map((item) => item.score));
  const tied = scored.filter((item) => item.score === max).map((item) => item.card);
  return pickRandom(game, tied);
}

export function opponent(side: Side): Side {
  return side === "player" ? "horde" : "player";
}
