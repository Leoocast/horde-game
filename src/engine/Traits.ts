import type { CardFilter, CardInstance, GameState, Trait } from "./GameTypes";
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

  if (card.controller === "horde" && isCreature(card) && game.hostRules.hostEchosHaveImpetus) {
    traits.add("IMPETUS");
  }

  for (const source of [...game.player.field, ...game.horde.field]) {
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
  if (!isCreature(card) || card.exhausted) return false;
  if (card.controller === "player" && game.horde.archive.length === 0) return false;
  return !card.stabilizing || hasTrait(game, card, "IMPETUS");
}

export function canBlock(_game: GameState, card: CardInstance): boolean {
  return isCreature(card) && !card.exhausted;
}

export function canBlockAttacker(game: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  return !blockRestrictionReason(game, blocker, attacker);
}

export function blockRestrictionReason(game: GameState, blocker: CardInstance, attacker: CardInstance): string | undefined {
  if (!canBlock(game, blocker)) return "That Echo cannot defend.";
  const attackerTraits = getTraits(game, attacker);
  const blockerTraits = getTraits(game, blocker);
  if (attackerTraits.includes("FLYING") && !blockerTraits.includes("FLYING") && !blockerTraits.includes("SKYGUARD")) return "Echoes with Flying require Flying or Skyguard to defend against them.";
  if (attackerTraits.includes("FURTIVE") && blocker.basePower + (blocker.counters["+1/+1"] ?? 0) > attacker.basePower + (attacker.counters["+1/+1"] ?? 0)) return "Furtive cannot be defended by Echoes with greater Power.";
  return undefined;
}
