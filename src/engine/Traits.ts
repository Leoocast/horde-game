import type { ActionFailure, CardFilter, CardInstance, GameState, Trait } from "./GameTypes";
import { isTrait } from "./hostfallVocabulary";
import { matchesFilter, resolveAffectedController, staticConditionMet } from "./StaticEffects";

export function isCreature(card: CardInstance): boolean {
  return card.kinds.includes("ECHO");
}

export function hasTrait(game: GameState, card: CardInstance, keyword: Trait): boolean {
  return getTraits(game, card).includes(keyword);
}

export function getPoisonAmount(game: GameState, card: CardInstance): number {
  return getTraits(game, card).reduce((total, trait) => total + parsePoisonTrait(trait), 0);
}

export function getTraits(game: GameState, card: CardInstance): Trait[] {
  const traits = new Set<Trait>([...card.traits, ...card.temporaryTraits]);

  if (card.controller === "host" && isCreature(card) && game.hostRules.hostEchosHaveImpetus) {
    traits.add("IMPETUS");
  }

  for (const source of [...game.player.field, ...game.host.field]) {
    for (const effect of source.effects) {
      if (effect.type === "STATIC_GRANT_KEYWORD") {
        const affectedController = resolveAffectedController(source.controller, effect.controller);
        if (affectedController && card.controller !== affectedController) continue;
        if (!matchesFilter(card, effect.filter as CardFilter | undefined, source)) continue;
        const keyword = isTrait(effect.keyword) ? effect.keyword : undefined;
        if (keyword) traits.add(keyword);
        continue;
      }
      if (effect.type === "STATIC_CONDITIONAL_GRANT_KEYWORD") {
        if (effect.target === "SELF" && card.instanceId !== source.instanceId) continue;
        if (!staticConditionMet(game, effect.condition, source)) continue;
        const keyword = isTrait(effect.keyword) ? effect.keyword : undefined;
        if (keyword) traits.add(keyword);
      }
    }
  }

  return [...traits];
}

function parsePoisonTrait(trait: Trait): number {
  const match = trait.match(/^POISON_(\d+)$/u);
  return match ? Number(match[1]) : 0;
}

export function canAttack(game: GameState, card: CardInstance): boolean {
  return !attackRestriction(game, card);
}

export function attackRestriction(game: GameState, card: CardInstance): ActionFailure | undefined {
  if (!isCreature(card)) return { reason: "That creature cannot attack." };
  if (card.exhausted) return { reason: `${card.name} is already Exhausted.`, code: "EXHAUSTED" };
  if (card.controller === "player" && game.host.archive.length === 0) {
    return { reason: "The Host Archive is empty." };
  }
  if (card.stabilizing && !hasTrait(game, card, "IMPETUS")) {
    return { reason: `${card.name} cannot attack while Stabilizing.`, code: "STABILIZING" };
  }
  return undefined;
}

export function canBlock(_game: GameState, card: CardInstance): boolean {
  return isCreature(card) && !card.exhausted;
}

export function canBlockAttacker(game: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  return !blockRestriction(game, blocker, attacker);
}

export function blockRestrictionReason(game: GameState, blocker: CardInstance, attacker: CardInstance): string | undefined {
  return blockRestriction(game, blocker, attacker)?.reason;
}

export function blockRestriction(game: GameState, blocker: CardInstance, attacker: CardInstance): ActionFailure | undefined {
  if (!isCreature(blocker)) return { reason: "That Echo cannot defend." };
  if (blocker.exhausted) return { reason: "That Echo cannot defend.", code: "EXHAUSTED" };
  const attackerTraits = getTraits(game, attacker);
  const blockerTraits = getTraits(game, blocker);
  if (attackerTraits.includes("FLYING") && !blockerTraits.includes("FLYING") && !blockerTraits.includes("SKYGUARD")) {
    return {
      reason: "Echoes with Flying require Flying or Skyguard to defend against them.",
      code: "BLOCK_REQUIRES_FLYING_OR_SKYGUARD",
    };
  }
  const blockerCounterPower = blocker.basePower + (blocker.counters["+1/+1"] ?? 0) - (blocker.counters["-1/-1"] ?? 0);
  const attackerCounterPower = attacker.basePower + (attacker.counters["+1/+1"] ?? 0) - (attacker.counters["-1/-1"] ?? 0);
  if (attackerTraits.includes("FURTIVE") && blockerCounterPower > attackerCounterPower) {
    return {
      reason: "Furtive cannot be defended by Echoes with greater Power.",
      code: "FURTIVE_BLOCK_RESTRICTION",
    };
  }
  return undefined;
}
