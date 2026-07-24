import type { CardFilter, CardInstance, EffectDefinition, EventItem, GameState, Side } from "./GameTypes";
import { createToken } from "./GameState";
import { drawCards } from "./GameState";
import { findCardDefinition } from "../data/decks";
import { enqueue } from "./EventQueue";
import { hasKeyword } from "./Keywords";
import { addMana, addStoredMana } from "./ManaSystem";
import { randomInt } from "./RNG";
import { getPowerToughness, matchesFilter } from "./StaticEffects";
import { chooseHordeTarget, findPermanent } from "./Targeting";

export type ResolveContext = {
  source?: CardInstance;
  side: Side;
  targets?: Record<string, string | string[]>;
  distribution?: Record<string, number>;
  tokenDefinitions?: CardInstance[] | never;
  event?: EventItem;
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
  if (effect.type === "CONDITIONAL") {
    if (effectConditionMet(game, effect.condition as Record<string, unknown> | undefined, context)) {
      resolveEffect(game, effect.effect as EffectDefinition, context);
    }
    return;
  }
  if (effect.type === "CHOOSE") {
    const option = chooseEffectOption(game, effect, context);
    if (option) resolveEffects(game, (option.effects as EffectDefinition[]) ?? [], context);
    return;
  }
  if (effect.type === "HORDE_EXILE_TOP_GOBLIN_TO_BATTLEFIELD") {
    exileTopGoblinToBattlefield(game);
    return;
  }
  if (effect.type === "ADD_MANA") {
    const mana = effect.mana as Record<string, number> | undefined;
    if (context.side === "player" && context.source?.cardTypes.includes("Creature")) {
      const manaAmounts = Object.values(mana ?? { G: Number(effect.amount ?? 1) });
      const amount = manaAmounts.reduce<number>((total, value) => total + Number(value), 0);
      const added = addStoredMana(game, amount);
      if (added > 0) game.log.unshift(`${context.source.name} adds ${added} stored mana.`);
      return;
    }
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
  if (effect.type === "DEAL_DAMAGE_TO_OPPONENT") {
    dealDamageToOpponent(game, context.side, Number(effect.amount ?? 1));
    return;
  }
  if (effect.type === "DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT") {
    queueRandomOpponentPermanentDamage(game, effect, context);
    return;
  }
  if (effect.type === "DEAL_DAMAGE_TO_OPPONENT_AND_CREATURES") {
    const opponent = context.side === "player" ? "horde" : "player";
    const amount = Number(effect.amount ?? 1);
    dealDamageToOpponent(game, context.side, amount);
    for (const target of game[opponent].battlefield.filter((card) => card.cardTypes.includes("Creature"))) {
      dealDamageToCreature(game, target, amount, false);
    }
    destroyMarkedCreatures(game);
    return;
  }
  if (effect.type === "DEAL_DAMAGE_TO_OPPONENT_CREATURE") {
    const amount = resolveNumericAmount(game, effect.amount ?? 0, context);
    const targetId = chooseHordeTarget(game, "damage", amount);
    const target = targetId ? findPermanent(game, targetId) : undefined;
    if (target) {
      if (effect.animation === "BURN") {
        enqueueBurnDamage(game, context.source, target, amount, "BURN");
        return;
      }
      dealDamageToCreature(game, target, amount, Boolean(context.source && hasKeyword(game, context.source, "DEATHTOUCH")));
      game.log.unshift(`${context.source?.name ?? "Horde"} deals ${amount} damage to ${target.name}.`);
      destroyMarkedCreatures(game);
    }
    return;
  }
  if (effect.type === "DAMAGE_OPPONENT_FOR_EACH_DECLARED_ATTACKER_MATCHING") {
    const attackerIds = declaredAttackerIds(context.event);
    const maxPower = Number((effect.filter as Record<string, unknown> | undefined)?.maxPower ?? Number.POSITIVE_INFINITY);
    const powers = (context.event?.payload?.attackerPowers as Record<string, number> | undefined) ?? {};
    const matches = attackerIds.filter((id) => Number(powers[id] ?? Number.POSITIVE_INFINITY) <= maxPower).length;
    if (matches > 0) dealDamageToOpponent(game, context.side, matches * Number(effect.amount ?? 1));
    return;
  }
  if (effect.type === "PUMP_SELF_PER_ATTACKER_MATCHING") {
    if (!context.source) return;
    const source = context.source;
    const filter = effect.filter as CardFilter | undefined;
    const amount = game.combat.hordeAttackers
      .map((id) => game.horde.battlefield.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card))
      .filter((card) => matchesFilter(card, filter, source))
      .length;
    source.temporaryPower += amount * Number(effect.power ?? 0);
    source.temporaryToughness += amount * Number(effect.toughness ?? 0);
    return;
  }
  if (effect.type === "PUMP_GROUP_UNTIL_END_OF_TURN") {
    const controller = effect.controller === "OPPONENT"
      ? context.side === "player" ? "horde" : "player"
      : context.side;
    for (const target of game[controller].battlefield) {
      if (!matchesFilter(target, effect.filter as CardFilter | undefined, context.source)) continue;
      target.temporaryPower += Number(effect.power ?? 0);
      target.temporaryToughness += Number(effect.toughness ?? 0);
    }
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
// `onlySourceId` resolves a single source's triggers and records it on the event, so an
// animated caller can give each reacting card its own beat instead of firing them all at once.
export function resolveTriggeredEvent(
  game: GameState,
  event: EventItem,
  deferController?: "player" | "horde",
  onlySourceId?: string,
): boolean {
  if (event.type === "BURN_DAMAGE") {
    resolveBurnDamageEvent(game, event);
    return false;
  }
  let deferredAny = false;
  const alreadyResolved = resolvedTriggerSourceIds(event);
  const pending: Array<{ source: CardInstance; wrapper: EffectDefinition }> = [];
  for (const source of triggeredSourcesForEvent(game, event)) {
    if (alreadyResolved.includes(source.instanceId)) continue;
    if (onlySourceId && source.instanceId !== onlySourceId) continue;
    if (deferController && source.controller === deferController) {
      deferredAny = true;
      continue;
    }
    for (const wrapper of source.effects) {
      if (wrapper.type !== "TRIGGERED_ABILITY" || wrapper.trigger !== event.type) continue;
      if (effectNeedsManualTarget(wrapper.effect)) continue;
      if (!triggerConditionMet(game, wrapper.condition as Record<string, unknown> | undefined, source, event)) continue;
      pending.push({ source, wrapper });
    }
  }
  if (event.type === "ATTACK_DECLARED") {
    pending.sort((left, right) => attackTriggerPriority(left.wrapper.effect) - attackTriggerPriority(right.wrapper.effect));
  }
  for (const { source, wrapper } of pending) {
    resolveEffect(game, wrapper.effect as EffectDefinition, { source, side: source.controller, event });
  }
  if (onlySourceId) markTriggerSourceResolved(event, onlySourceId);
  return deferredAny;
}

// A permanent can only react to what it was already in play to see. `witnessIds` is stamped by
// `enqueue`; older/synthetic events without it are treated as witnessed by everyone.
function witnessedEvent(event: EventItem, source: CardInstance): boolean {
  const witnessIds = event.payload?.witnessIds;
  if (!Array.isArray(witnessIds)) return true;
  return source.instanceId === event.sourceId || witnessIds.includes(source.instanceId);
}

export function resolvedTriggerSourceIds(event: EventItem): string[] {
  const ids = event.payload?.resolvedSourceIds;
  return Array.isArray(ids) ? ids.map(String) : [];
}

/** Sources of `event` that still owe a reaction, i.e. have not been resolved individually yet. */
export function pendingTriggerSources(game: GameState, event: EventItem): CardInstance[] {
  const alreadyResolved = resolvedTriggerSourceIds(event);
  return triggeredSourcesForEvent(game, event).filter((source) => !alreadyResolved.includes(source.instanceId));
}

function markTriggerSourceResolved(event: EventItem, sourceId: string): void {
  event.payload = { ...(event.payload ?? {}), resolvedSourceIds: [...resolvedTriggerSourceIds(event), sourceId] };
}

export function triggeredSourcesForEvent(game: GameState, event: EventItem): CardInstance[] {
  // Self-scoped: only the card that entered reacts, never every other card with an ETB ability.
  if (event.type === "ENTERS_BATTLEFIELD") {
    const source = [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === event.sourceId);
    if (!source || (event.triggerController && source.controller !== event.triggerController)) return [];
    return source.effects.some(
      (wrapper) => wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === event.type && !effectNeedsManualTarget(wrapper.effect),
    )
      ? [source]
      : [];
  }
  if (event.type === "THIS_DIES") {
    const source = [...game.player.graveyard, ...game.horde.graveyard].find((card) => card.instanceId === event.sourceId);
    if (!source || (event.triggerController && source.controller !== event.triggerController)) return [];
    return source.effects.some(
      (wrapper) => wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === event.type && !effectNeedsManualTarget(wrapper.effect),
    )
      ? [source]
      : [];
  }
  const sources = [...game.player.battlefield, ...game.horde.battlefield];
  const deadSource = [...game.player.graveyard, ...game.horde.graveyard].find((card) => card.instanceId === event.sourceId);
  if (event.type === "CREATURE_DIED" && deadSource) sources.push(deadSource);
  return sources.filter(
    (source) =>
      witnessedEvent(event, source) &&
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

// `deferSelfTriggers` queues the card's own enters-the-battlefield ability instead of resolving
// it inline, so a creature that arrives as the RESULT of another effect still gets its own beat.
// Without it, Beetleback Chief exiled onto the battlefield by Rundvelt simply spat out its tokens
// with no activation of its own, while the same card arriving through the normal Horde reveal
// (which defers via HordeController) announced itself properly.
export function runEnterBattlefieldTriggers(
  game: GameState,
  card: CardInstance,
  targets?: Record<string, string | string[]>,
  options: { deferSelfTriggers?: boolean } = {},
): void {
  if (options.deferSelfTriggers) {
    if (card.effects.some((wrapper) => wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === "ENTERS_BATTLEFIELD")) {
      enqueue(game, {
        type: "ENTERS_BATTLEFIELD",
        sourceId: card.instanceId,
        payload: { controller: card.controller, definitionId: card.definitionId },
      });
    }
  } else {
    for (const wrapper of card.effects) {
      if (wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === "ENTERS_BATTLEFIELD") {
        resolveEffect(game, wrapper.effect as EffectDefinition, { source: card, side: card.controller, targets });
      }
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
  runEnterBattlefieldTriggers(game, card, undefined, { deferSelfTriggers: true });
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
  const amount = Math.max(0, Math.floor(resolveNumericAmount(game, effect.amount ?? 1, context)));
  for (let i = 0; i < amount; i += 1) {
    const token = createToken(
      found,
      controller,
      `${game.turnNumber}-${game[controller].battlefield.length}-${i}`,
      game.gameMode === "chaos" ? game.chaosMutations[controller][found.id] : undefined,
    );
    token.zone = "battlefield";
    token.summoningSickness = controller === "player";
    token.tapped = Boolean(effect.tapped);
    game[controller].battlefield.push(token);
    runEnterBattlefieldTriggers(game, token, undefined, { deferSelfTriggers: true });
    if (effect.attacking && controller === "horde" && game.phase === "combat") {
      token.tapped = true;
      game.combat.hordeAttackers.push(token.instanceId);
    }
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
  if (condition.type === "ALL_OF") {
    const conditions = Array.isArray(condition.conditions) ? condition.conditions as Array<Record<string, unknown>> : [];
    return conditions.every((item) => triggerConditionMet(game, item, source, event));
  }
  if (condition.type === "ACTIVE_PLAYER_IS") {
    return condition.player !== "SELF" || game.activeSide === source.controller;
  }
  if (condition.type === "SOURCE_IS_ATTACKING") {
    return declaredAttackerIds(event).includes(source.instanceId);
  }
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

function effectConditionMet(
  game: GameState,
  condition: Record<string, unknown> | undefined,
  context: ResolveContext,
): boolean {
  if (!condition) return true;
  if (condition.type === "ATTACK_TOTAL_POWER_AT_LEAST") {
    return Number(context.event?.payload?.totalPower ?? 0) >= Number(condition.amount ?? 0);
  }
  if (condition.type === "DECLARED_ATTACKER_MATCHES") {
    const filters = condition.filters as CardFilter | undefined;
    return declaredAttackerIds(context.event).some((id) => {
      const card = game[context.side].battlefield.find((item) => item.instanceId === id);
      return Boolean(card && matchesFilter(card, filters, context.source));
    });
  }
  return true;
}

function declaredAttackerIds(event?: EventItem): string[] {
  return Array.isArray(event?.payload?.attackerIds) ? event.payload.attackerIds.map(String) : [];
}

function dealDamageToOpponent(game: GameState, sourceSide: Side, amount: number): void {
  if (amount <= 0) return;
  if (sourceSide === "horde") {
    game.player.life -= amount;
    game.log.unshift(`Horde deals ${amount} damage to Player.`);
  }
}

function queueRandomOpponentPermanentDamage(
  game: GameState,
  effect: EffectDefinition,
  context: ResolveContext,
): void {
  const opponent = context.side === "player" ? "horde" : "player";
  const targetDefinition = effect.target && typeof effect.target === "object"
    ? effect.target as Record<string, unknown>
    : undefined;
  const filters = targetDefinition?.filters as CardFilter | undefined;
  const candidates = game[opponent].battlefield.filter((card) => matchesFilter(card, filters, context.source));
  if (candidates.length === 0) {
    game.log.unshift(`${context.source?.name ?? "Effect"} has no valid Burn target.`);
    return;
  }
  const target = candidates[randomInt(game, candidates.length)];
  enqueueBurnDamage(
    game,
    context.source,
    target,
    resolveNumericAmount(game, effect.amount ?? 1, context),
    String(effect.animation ?? "BURN"),
  );
}

function enqueueBurnDamage(
  game: GameState,
  source: CardInstance | undefined,
  target: CardInstance,
  amount: number,
  animation: string,
): void {
  enqueue(game, {
    type: "BURN_DAMAGE",
    sourceId: source?.instanceId,
    payload: { targetId: target.instanceId, amount, animation },
  });
}

function resolveBurnDamageEvent(game: GameState, event: EventItem): void {
  const targetId = String(event.payload?.targetId ?? "");
  const target = findPermanent(game, targetId);
  if (!target) return;
  const amount = Math.max(0, Number(event.payload?.amount ?? 0));
  dealDamageToCreature(game, target, amount, false);
  target.flags.burnSmoke = true;
  const source = [...game.player.battlefield, ...game.horde.battlefield, ...game.player.graveyard, ...game.horde.graveyard]
    .find((card) => card.instanceId === event.sourceId);
  game.log.unshift(`${source?.name ?? "Burn"} deals ${amount} damage to ${target.name}.`);
  destroyMarkedCreatures(game);
}

function resolveNumericAmount(game: GameState, amount: unknown, context: ResolveContext): number {
  if (typeof amount === "number") return amount;
  if (!amount || typeof amount !== "object") return Number(amount) || 0;
  const data = amount as Record<string, unknown>;
  if (data.type === "STAT") {
    const objectRef = String(data.object ?? "");
    const source = objectRef === "SELF"
      ? context.source
      : findPermanent(game, String(context.targets?.[objectRef] ?? ""));
    if (!source) return 0;
    const stats = getPowerToughness(game, source);
    return String(data.stat ?? "").toUpperCase() === "TOUGHNESS" ? stats.toughness : stats.power;
  }
  if (data.type === "COUNT_PERMANENTS") {
    const controller = data.controller === "OPPONENT"
      ? context.side === "player" ? "horde" : "player"
      : context.side;
    return game[controller].battlefield.filter((card) =>
      matchesFilter(card, data.filters as CardFilter | undefined, context.source)
    ).length;
  }
  return Number(amount) || 0;
}

function attackTriggerPriority(effect: unknown): number {
  if (!effect || typeof effect !== "object") return 10;
  const data = effect as Record<string, unknown>;
  if (data.type === "CREATE_TOKEN") return 0;
  if (data.type === "CONDITIONAL") return attackTriggerPriority(data.effect);
  if (data.type === "SEQUENCE" && Array.isArray(data.effects) && data.effects.some((step) => attackTriggerPriority(step) === 0)) return 0;
  if (data.type === "PUMP_SELF_PER_ATTACKER_MATCHING") return 10;
  return 20;
}

function chooseEffectOption(
  game: GameState,
  effect: EffectDefinition,
  context: ResolveContext,
): Record<string, unknown> | undefined {
  const options = Array.isArray(effect.options) ? effect.options as Array<Record<string, unknown>> : [];
  if (options.length === 0) return undefined;
  if (context.side !== "horde") return options[0];
  return options.reduce((best, option) =>
    effectOptionAttackPower(game, option, context) >= effectOptionAttackPower(game, best, context) ? option : best
  );
}

function effectOptionAttackPower(
  game: GameState,
  option: Record<string, unknown>,
  context: ResolveContext,
): number {
  const effects = Array.isArray(option.effects) ? option.effects as EffectDefinition[] : [];
  return effects.reduce((score, effect) => {
    if (effect.type === "CREATE_TOKEN") {
      const definition = findCardDefinition(String(effect.tokenId));
      return score + resolveNumericAmount(game, effect.amount ?? 1, context) * Number(definition?.power ?? 0);
    }
    if (effect.type === "PUMP_GROUP_UNTIL_END_OF_TURN") {
      const affected = game[context.side].battlefield.filter((card) =>
        matchesFilter(card, effect.filter as CardFilter | undefined, context.source)
      ).length;
      return score + affected * Number(effect.power ?? 0);
    }
    return score;
  }, 0);
}
