import type { CardInstance, GameState, Keyword, Side } from "./GameTypes";
import { matchesFilter } from "./StaticEffects";

export function isCreature(card: CardInstance): boolean {
  return card.cardTypes.includes("Creature");
}

export function hasKeyword(game: GameState, card: CardInstance, keyword: Keyword): boolean {
  return getKeywords(game, card).includes(keyword);
}

export function getKeywords(game: GameState, card: CardInstance): Keyword[] {
  const keywords = new Set<Keyword>([...card.keywords, ...card.temporaryKeywords]);
  const battlefield = [...game.player.battlefield, ...game.horde.battlefield];

  if (card.controller === "horde" && isCreature(card)) {
    keywords.add("HASTE");
  }

  if (card.definitionId === "hound_of_the_farbogs" && game.horde.graveyard.length >= 7) {
    keywords.add("MENACE");
  }

  for (const source of battlefield) {
    for (const effect of source.effects) {
      if (effect.type !== "STATIC_GRANT_KEYWORD" && effect.type !== "STATIC_CONDITIONAL_GRANT_KEYWORD") continue;
      const controller = resolveController(source.controller, effect.controller as string | undefined);
      if (controller !== card.controller) continue;
      if (effect.type === "STATIC_CONDITIONAL_GRANT_KEYWORD" && !conditionMet(game, effect.condition as Record<string, unknown> | undefined, source)) continue;
      if (effect.target === "SELF" && source.instanceId !== card.instanceId) continue;
      if (effect.target !== "SELF" && !matchesFilter(card, effect.filter as never, source)) continue;
      keywords.add(effect.keyword as Keyword);
    }
  }

  return [...keywords];
}

export function canAttack(game: GameState, card: CardInstance): boolean {
  if (!isCreature(card) || card.tapped) return false;
  if (card.controller === "horde") return true;
  return !card.summoningSickness || hasKeyword(game, card, "HASTE");
}

export function canBlock(_game: GameState, card: CardInstance): boolean {
  return isCreature(card) && !card.tapped;
}

export function canBlockAttacker(game: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  if (!canBlock(game, blocker)) return false;
  const attackerKeywords = getKeywords(game, attacker);
  const blockerKeywords = getKeywords(game, blocker);
  if (attackerKeywords.includes("FLYING") && !blockerKeywords.includes("FLYING") && !blockerKeywords.includes("REACH")) return false;
  if (attackerKeywords.includes("SKULK") && blocker.basePower + (blocker.counters["+1/+1"] ?? 0) > attacker.basePower + (attacker.counters["+1/+1"] ?? 0)) return false;
  return true;
}

function resolveController(sourceController: Side, controller?: string): Side {
  if (!controller || controller === "SELF") return sourceController;
  if (controller === "HORDE") return "horde";
  if (controller === "PLAYER") return "player";
  return sourceController;
}

function conditionMet(game: GameState, condition: Record<string, unknown> | undefined, _source: CardInstance): boolean {
  if (!condition) return true;
  if (condition.type === "GRAVEYARD_COUNT_AT_LEAST") {
    const side = condition.controller === "HORDE" ? "horde" : "player";
    return game[side].graveyard.length >= Number(condition.amount ?? 0);
  }
  return true;
}
