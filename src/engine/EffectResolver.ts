import type { CardInstance, EffectDefinition, EventItem, GameState, Side } from "./GameTypes";
import { createToken } from "./GameState";
import { drawCards } from "./GameState";
import { findCardDefinition } from "../data/decks";
import { enqueue } from "./EventQueue";
import { addMana } from "./ManaSystem";
import { getPowerToughness } from "./StaticEffects";
import { findPermanent } from "./Targeting";

export type ResolveContext = {
  source?: CardInstance;
  side: Side;
  targets?: Record<string, string | string[]>;
  distribution?: Record<string, number>;
  tokenDefinitions?: CardInstance[] | never;
};

export function resolveEffects(game: GameState, effects: EffectDefinition[], context: ResolveContext): void {
  for (const effect of effects) resolveEffect(game, effect, context);
}

export function resolveEffect(game: GameState, effect: EffectDefinition, context: ResolveContext): void {
  if (effect.type === "TRIGGERED_ABILITY" || effect.type === "STATIC_BUFF" || effect.type === "STATIC_GRANT_KEYWORD") return;
  if (effect.type === "SEQUENCE") {
    resolveEffects(game, (effect.effects as EffectDefinition[]) ?? [], context);
    return;
  }
  if (effect.type === "ADD_MANA") {
    const mana = effect.mana as Record<string, number> | undefined;
    for (const [color, amount] of Object.entries(mana ?? { G: effect.amount ?? 1 })) {
      game.player.manaPool = addMana(game.player.manaPool, color, Number(amount));
    }
    return;
  }
  if (effect.type === "DRAW_CARD") {
    drawCards(game, "player", Number(effect.amount ?? 1));
    game.log.unshift(`Player draws ${Number(effect.amount ?? 1)} card(s).`);
    return;
  }
  if (effect.type === "CREATE_TOKEN") {
    createTokens(game, effect, context);
    return;
  }
  if (effect.type === "PUT_COUNTER") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      target.counters[String(effect.counterType ?? "+1/+1")] = (target.counters[String(effect.counterType ?? "+1/+1")] ?? 0) + Number(effect.amount ?? 1);
      game.log.unshift(`${target.name} gets ${Number(effect.amount ?? 1)} ${String(effect.counterType ?? "+1/+1")} counter(s).`);
      enqueue(game, { type: "COUNTERS_PUT_ON_PERMANENT", sourceId: target.instanceId, payload: { targetId: target.instanceId } });
    }
    return;
  }
  if (effect.type === "PUMP_UNTIL_END_OF_TURN") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      target.temporaryPower += Number(effect.power ?? 0);
      target.temporaryToughness += Number(effect.toughness ?? 0);
    }
    return;
  }
  if (effect.type === "GRANT_KEYWORD_UNTIL_END_OF_TURN") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) target.temporaryKeywords.push(String(effect.keyword));
    return;
  }
  if (effect.type === "DEAL_DAMAGE_FROM_SOURCE_POWER") {
    const source = findPermanent(game, String(context.targets?.[String(effect.sourceRef)] ?? ""));
    const target = findPermanent(game, String(context.targets?.[String(effect.targetRef)] ?? ""));
    if (source && target) {
      const amount = getPowerToughness(game, source).power;
      dealDamageToCreature(game, target, amount, source.keywords.includes("DEATHTOUCH"));
      game.log.unshift(`${source.name} deals ${amount} damage to ${target.name}.`);
      destroyMarkedCreatures(game);
    }
    return;
  }
  if (effect.type === "DESTROY_TARGET") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) destroyPermanent(game, target);
    return;
  }
  if (effect.type === "DISTRIBUTE_COUNTERS") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      const amount = context.distribution?.[target.instanceId] ?? 1;
      target.counters[String(effect.counterType ?? "+1/+1")] = (target.counters[String(effect.counterType ?? "+1/+1")] ?? 0) + amount;
    }
    return;
  }
  if (effect.type === "DOUBLE_COUNTERS_ON_TARGETS") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      const key = String(effect.counterType ?? "+1/+1");
      target.counters[key] = (target.counters[key] ?? 0) * 2;
    }
    return;
  }
  if (effect.type === "MILL_SELF" || effect.type === "MILL_HORDE") {
    millHorde(game, Number(effect.amount ?? 1));
    return;
  }
  if (effect.type === "EACH_OPPONENT_DISCARDS") {
    discardPlayer(game, Number(effect.amount ?? 1));
    return;
  }
  if (effect.type === "EACH_OPPONENT_LOSES_LIFE") {
    game.player.life -= Number(effect.amount ?? 1);
    game.log.unshift(`Player loses ${Number(effect.amount ?? 1)} life.`);
    return;
  }
}

export function resolveTriggeredEvent(game: GameState, event: EventItem): void {
  const battlefield = [...game.player.battlefield, ...game.horde.battlefield];
  for (const source of battlefield) {
    for (const wrapper of source.effects) {
      if (wrapper.type !== "TRIGGERED_ABILITY" || wrapper.trigger !== event.type) continue;
      if (!triggerConditionMet(game, wrapper.condition as Record<string, unknown> | undefined, source, event)) continue;
      resolveEffect(game, wrapper.effect as EffectDefinition, { source, side: source.controller });
    }
  }
}

export function runEnterBattlefieldTriggers(game: GameState, card: CardInstance, targets?: Record<string, string | string[]>): void {
  for (const wrapper of card.effects) {
    if (wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === "ENTERS_BATTLEFIELD") {
      resolveEffect(game, wrapper.effect as EffectDefinition, { source: card, side: card.controller, targets });
    }
  }
  enqueue(game, { type: "CREATURE_ENTERS_BATTLEFIELD", sourceId: card.instanceId, payload: { controller: card.controller } });
}

export function dealDamageToCreature(_game: GameState, target: CardInstance, amount: number, deathtouch = false): void {
  target.damageMarked += amount;
  if (deathtouch && amount > 0) target.deathtouchDamage = true;
}

export function destroyMarkedCreatures(game: GameState): void {
  for (const side of ["player", "horde"] as const) {
    for (const card of [...game[side].battlefield]) {
      const { toughness } = getPowerToughness(game, card);
      if (card.cardTypes.includes("Creature") && (card.damageMarked >= toughness || card.deathtouchDamage)) {
        destroyPermanent(game, card);
      }
    }
  }
}

export function destroyPermanent(game: GameState, card: CardInstance): void {
  const side = card.controller;
  game[side].battlefield = game[side].battlefield.filter((item) => item.instanceId !== card.instanceId);
  card.zone = "graveyard";
  card.tapped = false;
  card.damageMarked = 0;
  game[side].graveyard.push(card);
  game.log.unshift(`${card.name} dies.`);
  for (const effect of card.effects) {
    if (effect.type === "TRIGGERED_ABILITY" && effect.trigger === "THIS_DIES") {
      resolveEffect(game, effect.effect as EffectDefinition, { source: card, side });
    }
  }
  enqueue(game, { type: "CREATURE_DIED", sourceId: card.instanceId, payload: { controller: side, definitionId: card.definitionId } });
}

export function millHorde(game: GameState, amount: number): void {
  let milled = 0;
  for (let i = 0; i < amount; i += 1) {
    const card = game.horde.library.shift();
    if (!card) break;
    card.zone = "graveyard";
    game.horde.graveyard.push(card);
    milled += 1;
  }
  if (milled > 0) game.log.unshift(`Horde mills ${milled} card(s).`);
}

function createTokens(game: GameState, effect: EffectDefinition, context: ResolveContext): void {
  const controller = effect.controller === "HORDE" ? "horde" : effect.controller === "SELF" ? context.side : context.side;
  const tokenId = String(effect.tokenId);
  const found = findCardDefinition(tokenId);
  if (!found) return;
  for (let i = 0; i < Number(effect.amount ?? 1); i += 1) {
    const token = createToken(found, controller, `${game.turnNumber}-${game[controller].battlefield.length}-${i}`);
    token.zone = "battlefield";
    token.summoningSickness = controller === "player";
    game[controller].battlefield.push(token);
    game.log.unshift(`${controller === "player" ? "Player" : "Horde"} creates ${token.name}.`);
  }
}

function resolveTargetCards(game: GameState, effect: EffectDefinition, context: ResolveContext): CardInstance[] {
  if (effect.target === "SELF" && context.source) return [context.source];
  if (typeof effect.targetRef === "string") {
    const raw = context.targets?.[effect.targetRef];
    const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return ids.map((id) => findPermanent(game, id)).filter(Boolean) as CardInstance[];
  }
  const target = effect.target as Record<string, unknown> | undefined;
  if (target?.type === "TARGET_CREATURE") {
    const explicit = context.targets?.targetCreature ?? context.targets?.target;
    const ids = Array.isArray(explicit) ? explicit : explicit ? [explicit] : [];
    return ids.map((id) => findPermanent(game, id)).filter(Boolean) as CardInstance[];
  }
  if (target?.type === "ALL_CREATURES") {
    const controller = target.controller === "SELF" ? context.side : context.side === "player" ? "horde" : "player";
    return game[controller].battlefield.filter((card) => card.cardTypes.includes("Creature"));
  }
  return [];
}

function discardPlayer(game: GameState, amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    const card = game.player.hand.shift();
    if (!card) break;
    card.zone = "graveyard";
    game.player.graveyard.push(card);
    game.log.unshift(`Player discards ${card.name}.`);
  }
}

function triggerConditionMet(game: GameState, condition: Record<string, unknown> | undefined, source: CardInstance, event: EventItem): boolean {
  if (!condition) return true;
  if (condition.type === "ANOTHER_CREATURE_YOU_CONTROL_DIED") {
    return event.sourceId !== source.instanceId && event.payload?.controller === source.controller;
  }
  if (condition.type === "ANOTHER_CREATURE_YOU_CONTROL_ENTERED") {
    return event.sourceId !== source.instanceId && event.payload?.controller === source.controller;
  }
  if (condition.type === "CONTROL_ANOTHER_PERMANENT_MATCHING") {
    return game[source.controller].battlefield.some((card) => card.instanceId !== source.instanceId && card.subtypes.includes("Elf"));
  }
  return true;
}
