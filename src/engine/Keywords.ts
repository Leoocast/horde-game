import type { CardFilter, CardInstance, GameState, Keyword } from "./GameTypes";
import { matchesFilter, resolveAffectedController, staticConditionMet } from "./StaticEffects";

export function isCreature(card: CardInstance): boolean {
  return card.cardTypes.includes("Creature");
}

export function hasKeyword(game: GameState, card: CardInstance, keyword: Keyword): boolean {
  return getKeywords(game, card).includes(keyword);
}

export function getToxicAmount(game: GameState, card: CardInstance): number {
  return getKeywords(game, card).reduce((total, keyword) => total + parseToxicKeyword(keyword), 0);
}

export function getKeywords(game: GameState, card: CardInstance): Keyword[] {
  const keywords = new Set<Keyword>([...card.keywords, ...card.temporaryKeywords]);

  if (card.controller === "horde" && isCreature(card)) {
    keywords.add("HASTE");
  }

  for (const source of [...game.player.battlefield, ...game.horde.battlefield]) {
    for (const effect of source.effects) {
      if (effect.type === "STATIC_GRANT_KEYWORD") {
        const affectedController = resolveAffectedController(source.controller, effect.controller);
        if (affectedController && card.controller !== affectedController) continue;
        if (!matchesFilter(card, effect.filter as CardFilter | undefined, source)) continue;
        const keyword = typeof effect.keyword === "string" ? effect.keyword : undefined;
        if (keyword) keywords.add(keyword);
        continue;
      }
      if (effect.type === "STATIC_CONDITIONAL_GRANT_KEYWORD") {
        if (effect.target === "SELF" && card.instanceId !== source.instanceId) continue;
        if (!staticConditionMet(game, effect.condition, source)) continue;
        const keyword = typeof effect.keyword === "string" ? effect.keyword : undefined;
        if (keyword) keywords.add(keyword);
      }
    }
  }

  return [...keywords];
}

function parseToxicKeyword(keyword: Keyword): number {
  const text = String(keyword).trim();
  const match = text.match(/^TOXIC[_\s-]?(\d+)$/i) ?? text.match(/^Toxic\s+(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

export function canAttack(game: GameState, card: CardInstance): boolean {
  if (!isCreature(card) || card.tapped) return false;
  if (card.controller === "horde") return true;
  if (game.horde.library.length === 0) return false;
  return !card.summoningSickness || hasKeyword(game, card, "HASTE");
}

export function canBlock(_game: GameState, card: CardInstance): boolean {
  return isCreature(card) && !card.tapped;
}

export function canBlockAttacker(game: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  return !blockRestrictionReason(game, blocker, attacker);
}

export function blockRestrictionReason(game: GameState, blocker: CardInstance, attacker: CardInstance): string | undefined {
  if (!canBlock(game, blocker)) return "That creature cannot block.";
  const attackerKeywords = getKeywords(game, attacker);
  const blockerKeywords = getKeywords(game, blocker);
  if (attackerKeywords.includes("FLYING") && !blockerKeywords.includes("FLYING") && !blockerKeywords.includes("REACH")) return "Flying attackers need flying or reach to block.";
  if (attackerKeywords.includes("SKULK") && blocker.basePower + (blocker.counters["+1/+1"] ?? 0) > attacker.basePower + (attacker.counters["+1/+1"] ?? 0)) return "Skulk cannot be blocked by creatures with greater power.";
  return undefined;
}
