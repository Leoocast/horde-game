import type { CardInstance, GameState, Keyword } from "./GameTypes";

export function isCreature(card: CardInstance): boolean {
  return card.cardTypes.includes("Creature");
}

export function hasKeyword(game: GameState, card: CardInstance, keyword: Keyword): boolean {
  return getKeywords(game, card).includes(keyword);
}

export function getKeywords(game: GameState, card: CardInstance): Keyword[] {
  const keywords = new Set<Keyword>([...card.keywords, ...card.temporaryKeywords]);

  if (card.controller === "horde" && isCreature(card)) {
    keywords.add("HASTE");
  }

  if (card.definitionId === "hound_of_the_farbogs" && game.horde.graveyard.length >= 7) {
    keywords.add("MENACE");
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
