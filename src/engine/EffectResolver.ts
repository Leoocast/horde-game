import type { CardInstance, EffectDefinition, EventItem, GameState, Side } from "./GameTypes";
import { createToken } from "./GameState";
import { drawCards } from "./GameState";
import { findCardDefinition } from "../data/decks";
import { enqueue } from "./EventQueue";
import { hasKeyword } from "./Keywords";
import { addMana } from "./ManaSystem";
import { randomInt } from "./RNG";
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
  if (
    effect.type === "TRIGGERED_ABILITY" ||
    effect.type === "STATIC_BUFF" ||
    effect.type === "STATIC_GRANT_KEYWORD" ||
    effect.type === "STATIC_CONDITIONAL_BUFF" ||
    effect.type === "STATIC_CONDITIONAL_GRANT_KEYWORD"
  )
    return;
  if (effect.type === "SEQUENCE") {
    resolveEffects(game, (effect.effects as EffectDefinition[]) ?? [], context);
    return;
  }
  if (effect.type === "HORDE_EXILE_TOP_GOBLIN_TO_BATTLEFIELD") {
    exileTopGoblinToBattlefield(game);
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
  if (effect.type === "REMOVE_COUNTER") {
    const targets = resolveTargetCards(game, { ...effect, target: effect.from ?? effect.target }, context);
    const counterType = String(effect.counterType ?? "+1/+1");
    const amount = Number(effect.amount ?? 1);
    for (const target of targets) {
      const current = target.counters[counterType] ?? 0;
      target.counters[counterType] = Math.max(0, current - amount);
      game.log.unshift(`${target.name} loses ${amount} ${counterType} counter(s).`);
    }
    return;
  }
  if (effect.type === "GAIN_LIFE") {
    const side = effect.player === "OPPONENT" ? (context.side === "player" ? "horde" : "player") : context.side;
    const amount = Number(effect.amount ?? 1);
    if (side === "player") {
      game.player.life += amount;
      game.log.unshift(`Player gains ${amount} life.`);
    }
    return;
  }
  if (effect.type === "PUMP_UNTIL_END_OF_TURN") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      target.temporaryPower += Number(effect.power ?? 0);
      target.temporaryToughness += Number(effect.toughness ?? 0);
      game.log.unshift(`${target.name} gets +${Number(effect.power ?? 0)}/+${Number(effect.toughness ?? 0)} until end of turn.`);
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
      dealDamageToCreature(game, target, amount, hasKeyword(game, source, "DEATHTOUCH"));
      game.log.unshift(`${source.name} deals ${amount} damage to ${target.name}.`);
      destroyMarkedCreatures(game);
    }
    return;
  }
  if (effect.type === "DEAL_DAMAGE") {
    const source = findPermanent(game, String(context.targets?.[String(effect.source)] ?? ""));
    const target = findPermanent(game, String(context.targets?.[String(effect.target)] ?? ""));
    if (source && target) {
      const amount = resolveDamageAmount(game, effect.amount, context);
      dealDamageToCreature(game, target, amount, hasKeyword(game, source, "DEATHTOUCH"));
      game.log.unshift(`${source.name} deals ${amount} damage to ${target.name}.`);
    }
    return;
  }
  if (effect.type === "FIGHT_SIMULTANEOUS") {
    const source = findPermanent(game, String(context.targets?.[String(effect.sourceRef)] ?? ""));
    const target = findPermanent(game, String(context.targets?.[String(effect.targetRef)] ?? ""));
    if (source && target) {
      const sourcePower = getPowerToughness(game, source).power;
      const targetPower = getPowerToughness(game, target).power;
      dealDamageToCreature(game, target, sourcePower, hasKeyword(game, source, "DEATHTOUCH"));
      dealDamageToCreature(game, source, targetPower, hasKeyword(game, target, "DEATHTOUCH"));
      game.log.unshift(`${source.name} and ${target.name} fight.`);
    }
    return;
  }
  if (effect.type === "DESTROY" || effect.type === "DESTROY_TARGET") {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) destroyPermanent(game, target);
    return;
  }
  if (effect.type === "DISTRIBUTE_COUNTERS") {
    if (context.side === "player") return;
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      const amount = context.distribution?.[target.instanceId] ?? 1;
      target.counters[String(effect.counterType ?? "+1/+1")] = (target.counters[String(effect.counterType ?? "+1/+1")] ?? 0) + amount;
    }
    return;
  }
  if (effect.type === "DOUBLE_COUNTERS_ON_TARGETS") {
    if (context.side === "player") return;
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

function resolveDamageAmount(game: GameState, amount: unknown, context: ResolveContext): number {
  if (typeof amount === "number") return amount;
  if (!amount || typeof amount !== "object") return 0;
  const data = amount as Record<string, unknown>;
  if (data.type === "STAT") {
    const objectRef = String(data.object ?? "");
    const source = findPermanent(game, String(context.targets?.[objectRef] ?? ""));
    if (!source) return 0;
    const stat = String(data.stat ?? "").toUpperCase();
    const stats = getPowerToughness(game, source);
    return stat === "TOUGHNESS" ? stats.toughness : stats.power;
  }
  return Number(amount) || 0;
}

// Returns true if any matching source was skipped because of `deferController`, so the
// caller can keep the event queued to resolve that side's triggers later.
export function resolveTriggeredEvent(game: GameState, event: EventItem, deferController?: "player" | "horde"): boolean {
  let deferredAny = false;
  for (const source of triggeredSourcesForEvent(game, event)) {
    if (deferController && source.controller === deferController) {
      deferredAny = true;
      continue;
    }
    for (const wrapper of source.effects) {
      if (wrapper.type !== "TRIGGERED_ABILITY" || wrapper.trigger !== event.type) continue;
      if (effectNeedsManualTarget(wrapper.effect)) continue;
      if (!triggerConditionMet(game, wrapper.condition as Record<string, unknown> | undefined, source, event)) continue;
      resolveEffect(game, wrapper.effect as EffectDefinition, { source, side: source.controller });
    }
  }
  return deferredAny;
}

export function triggeredSourcesForEvent(game: GameState, event: EventItem): CardInstance[] {
  if (event.type === "THIS_DIES") {
    const source = [...game.player.graveyard, ...game.horde.graveyard].find((card) => card.instanceId === event.sourceId);
    if (!source || (event.triggerController && source.controller !== event.triggerController)) return [];
    return source.effects.some(
      (wrapper) => wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === event.type && !effectNeedsManualTarget(wrapper.effect),
    )
      ? [source]
      : [];
  }
  return [...game.player.battlefield, ...game.horde.battlefield].filter(
    (source) =>
      (!event.triggerController || source.controller === event.triggerController) &&
      source.effects.some(
        (wrapper) =>
          wrapper.type === "TRIGGERED_ABILITY" &&
          wrapper.trigger === event.type &&
          !effectNeedsManualTarget(wrapper.effect) &&
          triggerConditionMet(game, wrapper.condition as Record<string, unknown> | undefined, source, event),
      ),
  );
}

export function runEnterBattlefieldTriggers(game: GameState, card: CardInstance, targets?: Record<string, string | string[]>): void {
  for (const wrapper of card.effects) {
    if (wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === "ENTERS_BATTLEFIELD") {
      resolveEffect(game, wrapper.effect as EffectDefinition, { source: card, side: card.controller, targets });
    }
  }
  enqueue(game, {
    type: "CREATURE_ENTERS_BATTLEFIELD",
    sourceId: card.instanceId,
    payload: {
      controller: card.controller,
      definitionId: card.definitionId,
      cardTypes: card.cardTypes,
      subtypes: card.subtypes,
    },
  });
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
  enqueue(game, {
    type: "THIS_DIES",
    sourceId: card.instanceId,
    payload: { controller: side, definitionId: card.definitionId, cardTypes: card.cardTypes, subtypes: card.subtypes },
  });
  enqueue(game, {
    type: "CREATURE_DIED",
    sourceId: card.instanceId,
    payload: { controller: side, definitionId: card.definitionId, cardTypes: card.cardTypes, subtypes: card.subtypes },
  });
}

function exileTopGoblinToBattlefield(game: GameState): void {
  const card = game.horde.library.shift();
  if (!card) {
    game.log.unshift("Rundvelt Hordemaster finds no card to exile.");
    return;
  }
  card.zone = "exile";
  game.horde.exile.push(card);
  game.log.unshift(`Horde exiles ${card.name} with Rundvelt Hordemaster.`);
  if (!card.cardTypes.includes("Creature") || !card.subtypes.includes("Goblin")) return;

  game.horde.exile = game.horde.exile.filter((item) => item.instanceId !== card.instanceId);
  card.zone = "battlefield";
  card.tapped = false;
  card.summoningSickness = false;
  game.horde.battlefield.push(card);
  game.log.unshift(`${card.name} enters the battlefield from exile.`);
  runEnterBattlefieldTriggers(game, card);
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
  if (typeof effect.target === "string") {
    const raw = context.targets?.[effect.target];
    const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return ids.map((id) => findPermanent(game, id)).filter(Boolean) as CardInstance[];
  }
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

export function effectNeedsManualTarget(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") return false;
  const data = effect as Record<string, unknown>;
  if (typeof data.target === "string" && data.target !== "SELF") return true;
  if (typeof data.targetRef === "string") return true;
  if (data.type === "SEQUENCE" && Array.isArray(data.effects)) return data.effects.some(effectNeedsManualTarget);
  return false;
}

export function findManualEnterTargetTrigger(card?: CardInstance): EffectDefinition | undefined {
  return card?.effects.find(
    (effect) =>
      effect.type === "TRIGGERED_ABILITY" &&
      effect.trigger === "CREATURE_ENTERS_BATTLEFIELD" &&
      effectNeedsManualTarget(effect.effect),
  );
}

function discardPlayer(game: GameState, amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    if (game.player.hand.length === 0) break;
    const randomIndex = randomInt(game, game.player.hand.length);
    const [card] = game.player.hand.splice(randomIndex, 1);
    card.zone = "graveyard";
    game.player.graveyard.push(card);
    game.log.unshift(`Player discards ${card.name}.`);
  }
}

export function discardChosenCard(game: GameState, instanceId: string): void {
  const index = game.player.hand.findIndex((card) => card.instanceId === instanceId);
  if (index < 0) return;
  const [card] = game.player.hand.splice(index, 1);
  card.zone = "graveyard";
  game.player.graveyard.push(card);
  game.log.unshift(`Player discards ${card.name}.`);
}

export function triggerConditionMet(game: GameState, condition: Record<string, unknown> | undefined, source: CardInstance, event: EventItem): boolean {
  if (!condition) return true;
  if (condition.type === "CAST_CARD_IS_NON_TOKEN") {
    return event.sourceId !== source.instanceId && event.payload?.nonToken === true;
  }
  if (condition.type === "ANOTHER_CREATURE_YOU_CONTROL_DIED") {
    return (
      event.sourceId !== source.instanceId &&
      event.payload?.controller === source.controller &&
      eventObjectMatchesFilters(event, condition.filter as Record<string, unknown> | undefined)
    );
  }
  if (condition.type === "ANOTHER_CREATURE_YOU_CONTROL_ENTERED") {
    return event.sourceId !== source.instanceId && event.payload?.controller === source.controller;
  }
  if (condition.type === "ANOTHER_PERMANENT_YOU_CONTROL_ENTERED") {
    return event.sourceId !== source.instanceId && event.payload?.controller === source.controller && eventObjectMatchesFilters(event, condition.filters as Record<string, unknown> | undefined);
  }
  if (condition.type === "EVENT_OBJECT_MATCHES") {
    const controllerMatches = condition.controller !== "SELF" || event.payload?.controller === source.controller;
    const sourceMatches = !condition.excludeSource || event.sourceId !== source.instanceId;
    return controllerMatches && sourceMatches && eventObjectMatchesFilters(event, condition.filters as Record<string, unknown> | undefined);
  }
  if (condition.type === "CONTROL_ANOTHER_PERMANENT_MATCHING") {
    return game[source.controller].battlefield.some((card) => card.instanceId !== source.instanceId && card.subtypes.includes("Elf"));
  }
  return true;
}

function eventObjectMatchesFilters(event: EventItem, filters?: Record<string, unknown>): boolean {
  if (!filters) return true;
  const cardTypes = Array.isArray(filters.cardTypes) ? filters.cardTypes.map(String) : [];
  const subtypes = Array.isArray(filters.subtypes) ? filters.subtypes.map(String) : [];
  const eventCardTypes = Array.isArray(event.payload?.cardTypes) ? event.payload.cardTypes.map(String) : [];
  const eventSubtypes = Array.isArray(event.payload?.subtypes) ? event.payload.subtypes.map(String) : [];
  return cardTypes.every((type) => eventCardTypes.includes(type)) && subtypes.every((subtype) => eventSubtypes.includes(subtype));
}
