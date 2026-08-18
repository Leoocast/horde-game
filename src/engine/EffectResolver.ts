import type { CardFilter, CardInstance, EffectDefinition, EventItem, GameState, Side, TargetRequirement } from "./GameTypes";
import { createToken, drawCards, recordFieldEntry } from "./GameState";
import { findCardDefinition } from "../data/decks";
import { enqueue } from "./EventQueue";
import { hasTrait } from "./Traits";
import { isTrait } from "./hostfallVocabulary";
import { addAvailableEnergy, addStoredEnergy } from "./EnergySystem";
import { randomInt } from "./RNG";
import { getPowerEndurance, matchesFilter } from "./StaticEffects";
import { chooseHostTarget, findPermanent } from "./Targeting";
import { hasUsedOncePerTurn, markOncePerTurnUsed } from "./OncePerTurn";

export type ResolveContext = {
  source?: CardInstance;
  side: Side;
  targets?: Record<string, string | string[]>;
  distribution?: Record<string, number>;
  /** Last known Field stats, keyed by instance id. Destruction records them so later
   *  effects in the same sequence can still use the destroyed object's effective stats. */
  lastKnownStats?: Record<string, { power: number; endurance: number }>;
  tokenDefinitions?: CardInstance[] | never;
  event?: EventItem;
};

export function resolveEffects(game: GameState, effects: EffectDefinition[], context: ResolveContext): void {
  for (const effect of effects) resolveEffect(game, effect, context);
}

export function resolveEffect(game: GameState, effect: EffectDefinition, context: ResolveContext): void {
  // Unknown types resolve to nothing at runtime; deck lint guarantees no deck JSON can
  // reach this point with a type the registry does not know.
  EFFECT_HANDLERS[String(effect.type)]?.(game, effect, context);
}

/** The engine's effect vocabulary derives from the registry keys — adding a handler here is
 *  the single step that makes an effect type legal in deck JSONs. */
export function registeredEffectTypes(): Set<string> {
  return new Set(Object.keys(EFFECT_HANDLERS));
}

type EffectHandler = (game: GameState, effect: EffectDefinition, context: ResolveContext) => void;

// Wrapper/static types are consumed elsewhere (resolveTriggeredEvent, StaticEffects, Traits);
// resolving them directly is deliberately a no-op.
const skipWrapperOrStatic: EffectHandler = () => {};

const EFFECT_HANDLERS: Record<string, EffectHandler> = {
  TRIGGERED_ABILITY: skipWrapperOrStatic,
  STATIC_BUFF: skipWrapperOrStatic,
  STATIC_GRANT_KEYWORD: skipWrapperOrStatic,
  STATIC_CONDITIONAL_BUFF: skipWrapperOrStatic,
  STATIC_CONDITIONAL_GRANT_KEYWORD: skipWrapperOrStatic,
  SEQUENCE: (game, effect, context) => {
    resolveEffects(game, (effect.effects as EffectDefinition[]) ?? [], context);
  },
  CONDITIONAL: (game, effect, context) => {
    if (effectConditionMet(game, effect.condition as Record<string, unknown> | undefined, context)) {
      resolveEffect(game, effect.effect as EffectDefinition, context);
    }
  },
  CHOOSE: (game, effect, context) => {
    const option = chooseEffectOption(game, effect, context);
    if (option) resolveEffects(game, (option.effects as EffectDefinition[]) ?? [], context);
  },
  REVEAL_HOST_ROUND: (game, _effect, context) => {
    if (context.side !== "host") return;
    game.host.pendingRevealRounds = (game.host.pendingRevealRounds ?? 0) + 1;
    game.log.unshift("Host effect calls for another normal reveal round.");
  },
  HOST_INSPECT_TOP_ECHO: (game, _effect, context) => {
    inspectTopEcho(game, context.source?.name);
  },
  GAIN_ENERGY: (game, effect, context) => {
    const amount = Math.max(0, Number(effect.amount ?? 1));
    if (context.side === "player" && context.source?.kinds.includes("ECHO")) {
      const added = addStoredEnergy(game, amount);
      if (added > 0) game.log.unshift(`${context.source.name} adds ${added} Stored Energy.`);
      return;
    }
    game.player.energyPool = addAvailableEnergy(game.player.energyPool, amount);
  },
  DRAW_CARD: (game, effect) => {
    drawCards(game, "player", Number(effect.amount ?? 1));
    game.log.unshift(`Player draws ${Number(effect.amount ?? 1)} card(s).`);
  },
  CREATE_TOKEN: (game, effect, context) => {
    createTokens(game, effect, context);
  },
  DEAL_DAMAGE_TO_OPPONENT: (game, effect, context) => {
    const amount = Number(effect.amount ?? 1);
    if (effect.animation === "BURN_TO_PLAYER") {
      enqueue(game, {
        type: "BURN_VOLLEY_DAMAGE",
        sourceId: context.source?.instanceId,
        payload: {
          sourceSide: context.side,
          sourceDefinitionId: context.source?.definitionId,
          targetPlayer: context.side === "host",
          targetIds: [],
          amount,
        },
      });
      return;
    }
    dealDamageToOpponent(game, context.side, amount);
  },
  DEAL_DAMAGE_TO_RANDOM_OPPONENT_ECHO: (game, effect, context) => {
    queueRandomOpponentEchoDamage(game, effect, context);
  },
  DEAL_DAMAGE_TO_OPPONENT_AND_ECHOS: (game, effect, context) => {
    const opponent = context.side === "player" ? "host" : "player";
    const amount = Number(effect.amount ?? 1);
    const targetIds = game[opponent].field
      .filter((card) => card.kinds.includes("ECHO"))
      .map((card) => card.instanceId);
    if (effect.animation === "BURN_VOLLEY") {
      enqueue(game, {
        type: "BURN_VOLLEY_DAMAGE",
        sourceId: context.source?.instanceId,
        payload: {
          sourceSide: context.side,
          sourceDefinitionId: context.source?.definitionId,
          targetPlayer: context.side === "host",
          targetIds,
          amount,
        },
      });
      return;
    }
    dealDamageToOpponent(game, context.side, amount);
    for (const targetId of targetIds) {
      const target = findPermanent(game, targetId);
      if (target) dealDamageToCreature(game, target, amount, false);
    }
    destroyMarkedCreatures(game);
  },
  DEAL_DAMAGE_TO_OPPONENT_ECHO: (game, effect, context) => {
    const amount = resolveNumericAmount(game, effect.amount ?? 0, context);
    const targetId = chooseHostTarget(game, "damage", amount);
    const target = targetId ? findPermanent(game, targetId) : undefined;
    if (target) {
      if (effect.animation === "BURN") {
        enqueueBurnDamage(game, context.source, target, amount, "BURN");
        return;
      }
      dealDamageToCreature(game, target, amount, Boolean(context.source && hasTrait(game, context.source, "LETHAL")));
      game.log.unshift(`${context.source?.name ?? "Host"} deals ${amount} damage to ${target.name}.`);
      destroyMarkedCreatures(game);
    }
  },
  DAMAGE_OPPONENT_FOR_EACH_DECLARED_ATTACKER_MATCHING: (game, effect, context) => {
    const attackerIds = declaredAttackerIds(context.event);
    const filter = effect.filter as (CardFilter & { maxPower?: number }) | undefined;
    const maxPower = Number(filter?.maxPower ?? Number.POSITIVE_INFINITY);
    const powers = (context.event?.payload?.attackerPowers as Record<string, number> | undefined) ?? {};
    const matchingIds = attackerIds.filter((id) => {
      const attacker = game[context.side].field.find((card) => card.instanceId === id);
      return Boolean(
        attacker &&
        matchesFilter(attacker, filter, context.source) &&
        Number(powers[id] ?? Number.POSITIVE_INFINITY) <= maxPower
      );
    });
    if (matchingIds.length === 0) return;
    const amountPerAttacker = Number(effect.amount ?? 1);
    if (context.side === "host" && effect.deferUntil === "HOST_ATTACK_SEQUENCE_END") {
      game.combat.pendingDamageVolleys.push({
        sourceId: context.source?.instanceId,
        attackerIds: matchingIds,
        amountPerAttacker,
      });
      game.log.unshift(`${context.source?.name ?? "Host"} readies ${matchingIds.length * amountPerAttacker} damage for the end of combat.`);
      return;
    }
    dealDamageToOpponent(game, context.side, matchingIds.length * amountPerAttacker);
  },
  PUMP_SELF_PER_ATTACKER_MATCHING: (game, effect, context) => {
    if (!context.source) return;
    const source = context.source;
    const filter = effect.filter as CardFilter | undefined;
    const amount = game.combat.hostAttackers
      .map((id) => game.host.field.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card))
      .filter((card) => matchesFilter(card, filter, source))
      .length;
    source.temporaryPower += amount * Number(effect.power ?? 0);
    source.temporaryEndurance += amount * Number(effect.endurance ?? 0);
  },
  PUMP_GROUP_UNTIL_END_OF_TURN: (game, effect, context) => {
    const controller = effect.controller === "OPPONENT"
      ? context.side === "player" ? "host" : "player"
      : context.side;
    const targets = game[controller].field.filter((target) =>
      matchesFilter(target, effect.filter as CardFilter | undefined, context.source)
    );
    if (context.side === "host" && effect.animation === "BUFF" && targets.length > 0) {
      enqueue(game, {
        type: "HOST_GROUP_BUFF",
        sourceId: context.source?.instanceId,
        payload: {
          affectedIds: targets.map((target) => target.instanceId),
          power: Number(effect.power ?? 0),
          endurance: Number(effect.endurance ?? 0),
        },
      });
      return;
    }
    for (const target of targets) {
      target.temporaryPower += Number(effect.power ?? 0);
      target.temporaryEndurance += Number(effect.endurance ?? 0);
    }
  },
  PUT_COUNTER: (game, effect, context) => {
    const targets = resolveTargetCards(game, effect, context);
    const counterType = String(effect.counterType ?? "+1/+1");
    const amount = Number(effect.amount ?? 1);
    if (effect.animation === "EMERALD_FIREBALL_VOLLEY" && targets.length > 0) {
      enqueue(game, {
        type: "COUNTER_VOLLEY",
        sourceId: context.source?.instanceId,
        payload: {
          sourceSide: context.side,
          targetIds: targets.map((target) => target.instanceId),
          counterType,
          amount,
          projectileGapMs: 0,
          deferForPresentation: true,
        },
      });
      return;
    }
    for (const target of targets) {
      target.counters[counterType] = (target.counters[counterType] ?? 0) + amount;
      game.log.unshift(`${target.name} gets ${amount} ${counterType} counter(s).`);
    }
    if (counterType === "-1/-1" && amount > 0) destroyMarkedCreatures(game);
  },
  REMOVE_COUNTER: (game, effect, context) => {
    const targets = resolveTargetCards(game, { ...effect, target: effect.from ?? effect.target }, context);
    const counterType = String(effect.counterType ?? "+1/+1");
    const amount = Number(effect.amount ?? 1);
    for (const target of targets) {
      const current = target.counters[counterType] ?? 0;
      target.counters[counterType] = Math.max(0, current - amount);
      game.log.unshift(`${target.name} loses ${amount} ${counterType} counter(s).`);
    }
  },
  GAIN_LIFE: (game, effect, context) => {
    const side = effect.player === "OPPONENT" ? (context.side === "player" ? "host" : "player") : context.side;
    const amount = Number(effect.amount ?? 1);
    if (side === "player") {
      game.player.life += amount;
      game.log.unshift(`Player gains ${amount} life.`);
    }
  },
  LOSE_LIFE: (game, effect, context) => {
    const side = effect.player === "OPPONENT" ? (context.side === "player" ? "host" : "player") : context.side;
    if (side !== "player") return;
    const amount = Math.max(0, resolveNumericAmount(game, effect.amount ?? 1, context));
    losePlayerLife(game, amount, context.source?.instanceId);
    game.log.unshift(`Player loses ${amount} life.`);
  },
  PUMP_UNTIL_END_OF_TURN: (game, effect, context) => {
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      target.temporaryPower += Number(effect.power ?? 0);
      target.temporaryEndurance += Number(effect.endurance ?? 0);
      game.log.unshift(`${target.name} gets +${Number(effect.power ?? 0)}/+${Number(effect.endurance ?? 0)} until end of turn.`);
    }
  },
  PUMP_UNTIL_NEXT_PLAYER_TURN: (game, effect, context) => {
    const targets = resolveTargetCards(game, effect, context);
    const oncePerTurnKey = typeof effect.oncePerTurnKey === "string"
      ? effect.oncePerTurnKey.trim()
      : "";
    if (oncePerTurnKey && context.source && hasUsedOncePerTurn(context.source, oncePerTurnKey)) return;
    if (targets.length === 0) return;
    if (oncePerTurnKey && context.source) markOncePerTurnUsed(context.source, oncePerTurnKey);
    for (const target of targets) {
      target.untilNextPlayerTurnPower =
        (target.untilNextPlayerTurnPower ?? 0) + Number(effect.power ?? 0);
      target.untilNextPlayerTurnEndurance =
        (target.untilNextPlayerTurnEndurance ?? 0) + Number(effect.endurance ?? 0);
      game.log.unshift(
        `${target.name} gets +${Number(effect.power ?? 0)}/+${Number(effect.endurance ?? 0)} until the next player turn.`,
      );
    }
  },
  GRANT_KEYWORD_UNTIL_END_OF_TURN: (game, effect, context) => {
    const targets = resolveTargetCards(game, effect, context);
    if (isTrait(effect.keyword)) {
      for (const target of targets) target.temporaryTraits.push(effect.keyword);
    }
  },
  DEAL_DAMAGE_FROM_SOURCE_POWER: (game, effect, context) => {
    const source = findPermanent(game, String(context.targets?.[String(effect.sourceRef)] ?? ""));
    const target = findPermanent(game, String(context.targets?.[String(effect.targetRef)] ?? ""));
    if (source && target) {
      const amount = getPowerEndurance(game, source).power;
      dealDamageToCreature(game, target, amount, hasTrait(game, source, "LETHAL"));
      game.log.unshift(`${source.name} deals ${amount} damage to ${target.name}.`);
      destroyMarkedCreatures(game);
    }
  },
  DEAL_DAMAGE: (game, effect, context) => {
    const source = findPermanent(game, String(context.targets?.[String(effect.source)] ?? ""));
    const target = findPermanent(game, String(context.targets?.[String(effect.target)] ?? ""));
    if (source && target) {
      const amount = resolveDamageAmount(game, effect.amount, context);
      dealDamageToCreature(game, target, amount, hasTrait(game, source, "LETHAL"));
      game.log.unshift(`${source.name} deals ${amount} damage to ${target.name}.`);
    }
  },
  DEAL_DAMAGE_TO_TARGET: (game, effect, context) => {
    const amount = resolveDamageAmount(game, effect.amount, context);
    for (const target of resolveTargetCards(game, effect, context)) {
      dealDamageToCreature(game, target, amount, false);
      game.log.unshift(`${context.source?.name ?? "Spell"} deals ${amount} damage to ${target.name}.`);
    }
  },
  FIGHT_SIMULTANEOUS: (game, effect, context) => {
    const source = findPermanent(game, String(context.targets?.[String(effect.sourceRef)] ?? ""));
    const target = findPermanent(game, String(context.targets?.[String(effect.targetRef)] ?? ""));
    if (source && target) {
      const sourcePower = getPowerEndurance(game, source).power;
      const targetPower = getPowerEndurance(game, target).power;
      dealDamageToCreature(game, target, sourcePower, hasTrait(game, source, "LETHAL"));
      dealDamageToCreature(game, source, targetPower, hasTrait(game, target, "LETHAL"));
      game.log.unshift(`${source.name} and ${target.name} fight.`);
    }
  },
  DESTROY: handleDestroy,
  DESTROY_TARGET: handleDestroy,
  DISTRIBUTE_COUNTERS: (game, effect, context) => {
    if (context.side === "player") return;
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      const amount = context.distribution?.[target.instanceId] ?? 1;
      target.counters[String(effect.counterType ?? "+1/+1")] = (target.counters[String(effect.counterType ?? "+1/+1")] ?? 0) + amount;
    }
  },
  DOUBLE_COUNTERS_ON_TARGETS: (game, effect, context) => {
    if (context.side === "player") return;
    const targets = resolveTargetCards(game, effect, context);
    for (const target of targets) {
      const key = String(effect.counterType ?? "+1/+1");
      target.counters[key] = (target.counters[key] ?? 0) * 2;
    }
  },
  DISCARD_OWN_ARCHIVE_TO_MEMORY: handleDiscardOwnArchive,
  EACH_OPPONENT_DISCARDS: (game, effect) => {
    discardPlayer(game, Number(effect.amount ?? 1));
  },
  EACH_OPPONENT_LOSES_LIFE: (game, effect, context) => {
    const amount = Number(effect.amount ?? 1);
    if (effect.animation === "OIL_BURN") {
      enqueue(game, {
        type: "BURN_PLAYER_LIFE_LOSS",
        sourceId: context.source?.instanceId,
        payload: {
          sourceSide: context.side,
          sourceDefinitionId: context.source?.definitionId,
          targetPlayer: context.side === "host",
          targetIds: [],
          amount,
          variant: "oil",
        },
      });
      return;
    }
    losePlayerLife(game, amount, context.source?.instanceId);
    game.log.unshift(`Player loses ${amount} life.`);
  },
};

export type EffectPresentation = "fight" | "sourceDamage" | "targetDamage" | "destroy";

// Which battle animation a spell's resolution should play. Registry metadata: the store asks
// for a presentation kind instead of re-learning effect types.
const EFFECT_PRESENTATIONS: Partial<Record<string, EffectPresentation>> = {
  FIGHT_SIMULTANEOUS: "fight",
  DEAL_DAMAGE: "sourceDamage",
  DEAL_DAMAGE_FROM_SOURCE_POWER: "sourceDamage",
  DEAL_DAMAGE_TO_TARGET: "targetDamage",
  DESTROY: "destroy",
  DESTROY_TARGET: "destroy",
};

export function hasEffectPresentation(effects: EffectDefinition[] | undefined, kind: EffectPresentation): boolean {
  return (effects ?? []).some((effect) => effectHasPresentation(effect, kind));
}

/** Applies every kind of player life loss through one rules path. Payments call this too, then
 * emit their more specific LIFE_PAID event so cards may still distinguish costs from damage. */
export function losePlayerLife(game: GameState, amount: number, sourceId?: string): void {
  const lost = Math.max(0, Number(amount) || 0);
  if (lost <= 0) return;
  const lostBefore = game.player.lifeLostThisTurn ?? 0;
  game.player.life -= lost;
  game.player.lifeLostThisTurn = lostBefore + lost;
  enqueue(game, {
    type: "LIFE_LOST",
    sourceId,
    payload: {
      amount: lost,
      firstLossThisTurn: lostBefore === 0,
      totalLostThisTurn: game.player.lifeLostThisTurn,
    },
  });
  if (game.player.life <= 0) game.winner = "host";
}

function effectHasPresentation(effect: unknown, kind: EffectPresentation): boolean {
  if (!effect || typeof effect !== "object") return false;
  const data = effect as Record<string, unknown>;
  if (EFFECT_PRESENTATIONS[String(data.type)] === kind) return true;
  if (data.type === "SEQUENCE" && Array.isArray(data.effects)) return data.effects.some((step) => effectHasPresentation(step, kind));
  return false;
}

export type EffectAnnouncement = "createsTokens" | "discardsArchive" | "discards" | "lifeLoss";

/** What a Host trigger's resolution announces in its toast. Registry metadata, same idea. */
export const EFFECT_ANNOUNCEMENTS: Partial<Record<string, EffectAnnouncement>> = {
  CREATE_TOKEN: "createsTokens",
  DISCARD_OWN_ARCHIVE_TO_MEMORY: "discardsArchive",
  EACH_OPPONENT_DISCARDS: "discards",
  EACH_OPPONENT_LOSES_LIFE: "lifeLoss",
};

function handleDestroy(game: GameState, effect: EffectDefinition, context: ResolveContext): void {
  const targets = resolveTargetCards(game, effect, context);
  for (const target of targets) {
    context.lastKnownStats ??= {};
    context.lastKnownStats[target.instanceId] = getPowerEndurance(game, target);
    destroyPermanent(game, target);
  }
}

function handleDiscardOwnArchive(game: GameState, effect: EffectDefinition): void {
  discardHostArchiveToMemory(game, Number(effect.amount ?? 1));
}

function resolveDamageAmount(game: GameState, amount: unknown, context: ResolveContext): number {
  if (typeof amount === "number") return amount;
  if (!amount || typeof amount !== "object") return 0;
  const data = amount as Record<string, unknown>;
  if (data.type === "STAT") {
    const objectRef = String(data.object ?? "");
    const instanceId = String(context.targets?.[objectRef] ?? "");
    const source = findPermanent(game, instanceId);
    const stat = String(data.stat ?? "").toUpperCase();
    const stats = source ? getPowerEndurance(game, source) : context.lastKnownStats?.[instanceId];
    if (!stats) return 0;
    return stat === "TOUGHNESS" ? stats.endurance : stats.power;
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
  deferController?: Side | Side[],
  onlySourceId?: string,
): boolean {
  if (event.type === "HOST_GROUP_BUFF") {
    resolveHostGroupBuffEvent(game, event);
    return false;
  }
  if (event.type === "BURN_DAMAGE") {
    resolveBurnDamageEvent(game, event);
    return false;
  }
  if (event.type === "BURN_VOLLEY_DAMAGE") {
    resolveBurnVolleyDamageEvent(game, event);
    return false;
  }
  if (event.type === "BURN_PLAYER_LIFE_LOSS") {
    resolveBurnPlayerLifeLossEvent(game, event);
    return false;
  }
  if (event.type === "COUNTER_VOLLEY") {
    resolveCounterVolleyEvent(game, event);
    return false;
  }
  let deferredAny = false;
  const deferredControllers = Array.isArray(deferController)
    ? deferController
    : deferController
      ? [deferController]
      : [];
  const alreadyResolved = resolvedTriggerSourceIds(event);
  const pending: Array<{ source: CardInstance; wrapper: EffectDefinition }> = [];
  for (const source of triggeredSourcesForEvent(game, event)) {
    if (alreadyResolved.includes(source.instanceId)) continue;
    if (onlySourceId && source.instanceId !== onlySourceId) continue;
    if (deferredControllers.includes(source.controller)) {
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

function resolveHostGroupBuffEvent(game: GameState, event: EventItem): void {
  const affectedIds = new Set(
    Array.isArray(event.payload?.affectedIds) ? event.payload.affectedIds.map(String) : [],
  );
  const power = Number(event.payload?.power ?? 0);
  const endurance = Number(event.payload?.endurance ?? 0);
  for (const target of game.host.field) {
    if (!affectedIds.has(target.instanceId)) continue;
    target.temporaryPower += power;
    target.temporaryEndurance += endurance;
  }
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
  // Self-scoped: only the permanent named by the event reacts, never every other card carrying
  // the same ability. Both sources are still on the Field when these events resolve.
  if (event.type === "INVOKED" || event.type === "SURVIVED_DAMAGE") {
    const source = [...game.player.field, ...game.host.field].find((card) => card.instanceId === event.sourceId);
    if (!source || (event.triggerController && source.controller !== event.triggerController)) return [];
    return source.effects.some(
      (wrapper) => wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === event.type && !effectNeedsManualTarget(wrapper.effect),
    )
      ? [source]
      : [];
  }
  if (event.type === "THIS_DIES") {
    const source = [...game.player.memory, ...game.host.memory].find((card) => card.instanceId === event.sourceId);
    if (!source || (event.triggerController && source.controller !== event.triggerController)) return [];
    return source.effects.some(
      (wrapper) => wrapper.type === "TRIGGERED_ABILITY" && wrapper.trigger === event.type && !effectNeedsManualTarget(wrapper.effect),
    )
      ? [source]
      : [];
  }
  const sources = [...game.player.field, ...game.host.field];
  const deadSource = [...game.player.memory, ...game.host.memory].find((card) => card.instanceId === event.sourceId);
  if (event.type === "ECHO_DIED" && deadSource) sources.push(deadSource);
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

// `deferSelfTriggers` queues the card's own invoked ability instead of resolving
// it inline, so a creature that arrives as the RESULT of another effect still gets its own beat.
// Without it, Chief of the Double Guard Invoked from the Archive by Summoner of the Ranks simply spat out its tokens
// with no activation of its own, while the same card arriving through the normal Host reveal
// (which defers via HostController) announced itself properly.
export function runInvokedTriggers(
  game: GameState,
  card: CardInstance,
  targets?: Record<string, string | string[]>,
  options: { deferSelfTriggers?: boolean; causeSourceId?: string } = {},
): void {
  if (options.deferSelfTriggers) {
    if (card.effects.some(
      (wrapper) =>
        wrapper.type === "TRIGGERED_ABILITY" &&
        wrapper.trigger === "INVOKED" &&
        !effectNeedsManualTarget(wrapper.effect),
    )) {
      enqueue(game, {
        type: "INVOKED",
        sourceId: card.instanceId,
        payload: {
          controller: card.controller,
          definitionId: card.definitionId,
          causeSourceId: options.causeSourceId,
        },
      });
    }
  } else {
    for (const wrapper of card.effects) {
      if (
        wrapper.type === "TRIGGERED_ABILITY" &&
        wrapper.trigger === "INVOKED" &&
        !effectNeedsManualTarget(wrapper.effect)
      ) {
        resolveEffect(game, wrapper.effect as EffectDefinition, { source: card, side: card.controller, targets });
      }
    }
  }
  if (card.kinds.includes("ECHO")) {
    enqueue(game, {
      type: "ECHO_INVOKED",
      sourceId: card.instanceId,
      payload: {
        controller: card.controller,
        definitionId: card.definitionId,
        kinds: card.kinds,
        subtypes: card.subtypes,
        causeSourceId: options.causeSourceId,
      },
    });
  }
}

export function dealDamageToCreature(game: GameState, target: CardInstance, amount: number, lethal = false): void {
  const damage = Math.max(0, amount);
  target.damageMarked += damage;
  if (lethal && damage > 0) target.lethalDamage = true;
  enqueueSurvivedDamageEvent(game, target, damage);
}

export function enqueueSurvivedDamageEvent(
  game: GameState,
  target: CardInstance,
  amount: number,
  payload: Record<string, unknown> = {},
): void {
  if (amount <= 0 || !target.kinds.includes("ECHO")) return;
  if (!game[target.controller].field.some((card) => card.instanceId === target.instanceId)) return;
  const { endurance } = getPowerEndurance(game, target);
  if (target.damageMarked >= endurance || target.lethalDamage) return;
  enqueue(game, {
    type: "SURVIVED_DAMAGE",
    sourceId: target.instanceId,
    triggerController: target.controller,
    payload: {
      controller: target.controller,
      targetId: target.instanceId,
      amount,
      ...payload,
    },
  });
}

export function destroyMarkedCreatures(game: GameState): void {
  for (const side of ["player", "host"] as const) {
    for (const card of [...game[side].field]) {
      const { endurance } = getPowerEndurance(game, card);
      if (card.kinds.includes("ECHO") && (card.damageMarked >= endurance || card.lethalDamage)) {
        destroyPermanent(game, card);
      }
    }
  }
}

export function destroyPermanent(game: GameState, card: CardInstance): void {
  const side = card.controller;
  game[side].field = game[side].field.filter((item) => item.instanceId !== card.instanceId);
  card.zone = "memory";
  card.exhausted = false;
  card.damageMarked = 0;
  game[side].memory.push(card);
  const isEcho = card.kinds.includes("ECHO");
  game.log.unshift(`${card.name} ${isEcho ? "dies" : "is destroyed"}.`);
  if (!isEcho) return;
  enqueue(game, {
    type: "THIS_DIES",
    sourceId: card.instanceId,
    payload: { controller: side, definitionId: card.definitionId, kinds: card.kinds, subtypes: card.subtypes },
  });
  enqueue(game, {
    type: "ECHO_DIED",
    sourceId: card.instanceId,
    payload: { controller: side, definitionId: card.definitionId, kinds: card.kinds, subtypes: card.subtypes },
  });
}

function inspectTopEcho(game: GameState, sourceName = "Host effect"): void {
  const card = game.host.archive.shift();
  if (!card) {
    game.log.unshift(`${sourceName} finds no card to inspect.`);
    return;
  }
  game.log.unshift(`${sourceName} inspects ${card.name}.`);
  if (!card.kinds.includes("ECHO")) {
    game.host.archive.push(card);
    game.log.unshift(`${card.name} moves to the bottom of the Host Archive.`);
    return;
  }

  card.zone = "field";
  card.exhausted = false;
  card.stabilizing = false;
  game.host.field.push(card);
  recordFieldEntry(game, card);
  game.log.unshift(`${card.name} is Invoked from the Host Archive.`);
  runInvokedTriggers(game, card, undefined, { deferSelfTriggers: true });
}

export function selectHostArchiveDiscardCards(
  game: GameState,
  amount: number,
  preferredCardIds: readonly string[] = [],
): CardInstance[] {
  const byId = new Map(game.host.archive.map((card) => [card.instanceId, card]));
  const preferred = preferredCardIds.flatMap((instanceId) => {
    const card = byId.get(instanceId);
    if (!card) return [];
    byId.delete(instanceId);
    return [card];
  });
  const remaining = game.host.archive.filter((card) => byId.has(card.instanceId));
  return [...preferred, ...remaining].slice(0, Math.max(0, amount));
}

export function discardHostArchiveToMemory(
  game: GameState,
  amount: number,
  options: Readonly<{ preferredCardIds?: readonly string[] }> = {},
): void {
  let discarded = 0;
  const selected = selectHostArchiveDiscardCards(game, amount, options.preferredCardIds);
  for (const card of selected) {
    const archiveIndex = game.host.archive.findIndex((candidate) => candidate.instanceId === card.instanceId);
    if (archiveIndex < 0) continue;
    game.host.archive.splice(archiveIndex, 1);
    card.zone = "memory";
    game.host.memory.push(card);
    discarded += 1;
  }
  if (discarded > 0) game.log.unshift(`Host discards ${discarded} card(s) from its Archive to its Memory.`);
}

function createTokens(game: GameState, effect: EffectDefinition, context: ResolveContext): void {
  const controller = effect.controller === "HOST" ? "host" : effect.controller === "SELF" ? context.side : context.side;
  const tokenId = String(effect.tokenId);
  const found = findCardDefinition(tokenId);
  if (!found) return;
  const amount = Math.max(0, Math.floor(resolveNumericAmount(game, effect.amount ?? 1, context)));
  for (let i = 0; i < amount; i += 1) {
    const token = createToken(
      found,
      controller,
      `${game.turnNumber}-${game[controller].field.length}-${i}`,
      game.gameMode === "chaos" ? game.chaosMutations[controller][found.id] : undefined,
    );
    token.zone = "field";
    token.stabilizing = token.kinds.includes("ECHO") &&
      (controller === "player" || !game.hostRules.hostEchosHaveImpetus);
    token.exhausted = Boolean(effect.exhausted);
    game[controller].field.push(token);
    recordFieldEntry(game, token);
    runInvokedTriggers(game, token, undefined, {
      deferSelfTriggers: true,
      causeSourceId: context.source?.instanceId,
    });
    if (effect.attacking && controller === "host" && game.phase === "combat") {
      token.exhausted = true;
      game.combat.hostAttackers.push(token.instanceId);
    }
    game.log.unshift(`${controller === "player" ? "Player" : "Host"} creates ${token.name}.`);
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
  if (target?.type === "TARGET_ECHO") {
    const explicit = context.targets?.targetCreature ?? context.targets?.target;
    const ids = Array.isArray(explicit) ? explicit : explicit ? [explicit] : [];
    return ids.map((id) => findPermanent(game, id)).filter(Boolean) as CardInstance[];
  }
  if (target?.type === "ALL_ECHOS") {
    const controller = target.controller === "SELF" ? context.side : context.side === "player" ? "host" : "player";
    return game[controller].field.filter((card) => card.kinds.includes("ECHO"));
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

export function findManualInvokedTargetTrigger(card?: CardInstance): EffectDefinition | undefined {
  return card?.effects.find(
    (effect) =>
      effect.type === "TRIGGERED_ABILITY" &&
      effect.trigger === "INVOKED" &&
      effectNeedsManualTarget(effect.effect),
  );
}

export function manualInvokedTargetRequirement(card?: CardInstance): TargetRequirement | undefined {
  const requirements = findManualInvokedTargetTrigger(card)?.requiresTargets;
  return Array.isArray(requirements) ? requirements[0] as TargetRequirement | undefined : undefined;
}

function discardPlayer(game: GameState, amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    if (game.player.hand.length === 0) break;
    const randomIndex = randomInt(game, game.player.hand.length);
    const [card] = game.player.hand.splice(randomIndex, 1);
    card.zone = "memory";
    game.player.memory.push(card);
    game.log.unshift(`Player discards ${card.name}.`);
  }
}

export function discardChosenCard(game: GameState, instanceId: string): void {
  const index = game.player.hand.findIndex((card) => card.instanceId === instanceId);
  if (index < 0) return;
  const [card] = game.player.hand.splice(index, 1);
  card.zone = "memory";
  game.player.memory.push(card);
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
  if (condition.type === "FIRST_LIFE_PAYMENT_THIS_TURN") {
    return event.type === "LIFE_PAID" && event.payload?.firstPaymentThisTurn === true;
  }
  if (condition.type === "FIRST_LIFE_LOSS_THIS_TURN") {
    return event.type === "LIFE_LOST" && event.payload?.firstLossThisTurn === true;
  }
  if (condition.type === "SOURCE_IS_READY") {
    return !source.exhausted;
  }
  if (condition.type === "SOURCE_IS_ATTACKING") {
    return declaredAttackerIds(event).includes(source.instanceId);
  }
  if (condition.type === "SOURCE_ONCE_PER_TURN_UNUSED") {
    const key = typeof condition.key === "string" ? condition.key.trim() : "";
    return key.length > 0 && !hasUsedOncePerTurn(source, key);
  }
  if (condition.type === "PLAYED_CARD_IS_NON_TOKEN") {
    return event.sourceId !== source.instanceId && event.payload?.nonToken === true;
  }
  if (condition.type === "ANOTHER_ALLIED_ECHO_DIED") {
    return (
      event.sourceId !== source.instanceId &&
      event.payload?.controller === source.controller &&
      eventObjectMatchesFilters(event, condition.filter as Record<string, unknown> | undefined)
    );
  }
  if (condition.type === "ANOTHER_ALLIED_ECHO_INVOKED") {
    return (
      event.sourceId !== source.instanceId &&
      event.payload?.controller === source.controller &&
      eventObjectMatchesFilters(event, condition.filters as Record<string, unknown> | undefined)
    );
  }
  if (condition.type === "EVENT_OBJECT_MATCHES") {
    const controllerMatches = condition.controller !== "SELF" || event.payload?.controller === source.controller;
    const sourceMatches = !condition.excludeSource || event.sourceId !== source.instanceId;
    return controllerMatches && sourceMatches && eventObjectMatchesFilters(event, condition.filters as Record<string, unknown> | undefined);
  }
  return true;
}

function eventObjectMatchesFilters(event: EventItem, filters?: Record<string, unknown>): boolean {
  if (!filters) return true;
  const kinds = Array.isArray(filters.kinds) ? filters.kinds.map(String) : [];
  const subtypes = Array.isArray(filters.subtypes) ? filters.subtypes.map(String) : [];
  const eventCardKinds = Array.isArray(event.payload?.kinds) ? event.payload.kinds.map(String) : [];
  const eventSubtypes = Array.isArray(event.payload?.subtypes) ? event.payload.subtypes.map(String) : [];
  return kinds.every((type) => eventCardKinds.includes(type)) && subtypes.every((subtype) => eventSubtypes.includes(subtype));
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
      const card = game[context.side].field.find((item) => item.instanceId === id);
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
  if (sourceSide === "host") {
    losePlayerLife(game, amount);
    game.log.unshift(`Host deals ${amount} damage to Player.`);
  }
}

function queueRandomOpponentEchoDamage(
  game: GameState,
  effect: EffectDefinition,
  context: ResolveContext,
): void {
  const opponent = context.side === "player" ? "host" : "player";
  const targetDefinition = effect.target && typeof effect.target === "object"
    ? effect.target as Record<string, unknown>
    : undefined;
  const filters = targetDefinition?.filters as CardFilter | undefined;
  const candidates = game[opponent].field.filter((card) =>
    card.kinds.includes("ECHO") && matchesFilter(card, filters, context.source)
  );
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
    payload: {
      targetId: target.instanceId,
      amount,
      animation,
      sourceDefinitionId: source?.definitionId,
    },
  });
}

function resolveBurnDamageEvent(game: GameState, event: EventItem): void {
  const targetId = String(event.payload?.targetId ?? "");
  const target = findPermanent(game, targetId);
  if (!target) return;
  const amount = Math.max(0, Number(event.payload?.amount ?? 0));
  dealDamageToCreature(game, target, amount, false);
  target.flags.burnSmoke = true;
  const source = [...game.player.field, ...game.host.field, ...game.player.memory, ...game.host.memory]
    .find((card) => card.instanceId === event.sourceId);
  game.log.unshift(`${source?.name ?? "Burn"} deals ${amount} damage to ${target.name}.`);
  destroyMarkedCreatures(game);
}

function resolveBurnVolleyDamageEvent(game: GameState, event: EventItem): void {
  const amount = Math.max(0, Number(event.payload?.amount ?? 0));
  const sourceSide = event.payload?.sourceSide === "player" ? "player" : "host";
  const targetIds = Array.isArray(event.payload?.targetIds) ? event.payload.targetIds.map(String) : [];
  if (event.payload?.targetPlayer === true) dealDamageToOpponent(game, sourceSide, amount);
  for (const targetId of targetIds) {
    const target = findPermanent(game, targetId);
    if (!target) continue;
    dealDamageToCreature(game, target, amount, false);
    target.flags.burnSmoke = true;
  }
  const source = [...game.player.field, ...game.host.field, ...game.player.memory, ...game.host.memory]
    .find((card) => card.instanceId === event.sourceId);
  game.log.unshift(`${source?.name ?? "Burn volley"} deals ${amount} damage to each opposing target.`);
  destroyMarkedCreatures(game);
}

function resolveBurnPlayerLifeLossEvent(game: GameState, event: EventItem): void {
  const amount = Math.max(0, Number(event.payload?.amount ?? 0));
  const sourceSide = event.payload?.sourceSide === "player" ? "player" : "host";
  if (sourceSide !== "host" || event.payload?.targetPlayer !== true || amount <= 0) return;
  losePlayerLife(game, amount, event.sourceId);
  const source = [...game.player.field, ...game.host.field, ...game.player.memory, ...game.host.memory]
    .find((card) => card.instanceId === event.sourceId);
  game.log.unshift(`${source?.name ?? "Host effect"} causes Player to lose ${amount} life.`);
}

function resolveCounterVolleyEvent(game: GameState, event: EventItem): void {
  const amount = Math.max(0, Number(event.payload?.amount ?? 0));
  const counterType = String(event.payload?.counterType ?? "+1/+1");
  const targetIds = Array.isArray(event.payload?.targetIds) ? event.payload.targetIds.map(String) : [];
  const affected: CardInstance[] = [];
  for (const targetId of targetIds) {
    const target = findPermanent(game, targetId);
    if (!target) continue;
    target.counters[counterType] = (target.counters[counterType] ?? 0) + amount;
    affected.push(target);
  }
  if (affected.length > 0) {
    const source = [...game.player.field, ...game.host.field, ...game.player.memory, ...game.host.memory]
      .find((card) => card.instanceId === event.sourceId);
    game.log.unshift(`${source?.name ?? "Counter volley"} puts ${amount} ${counterType} counter(s) on ${affected.length} opposing Echo(es).`);
  }
  if (counterType === "-1/-1" && amount > 0) destroyMarkedCreatures(game);
}

function resolveNumericAmount(game: GameState, amount: unknown, context: ResolveContext): number {
  if (typeof amount === "number") return amount;
  if (!amount || typeof amount !== "object") return Number(amount) || 0;
  const data = amount as Record<string, unknown>;
  if (data.type === "STAT") {
    const objectRef = String(data.object ?? "");
    const instanceId = objectRef === "SELF"
      ? context.source?.instanceId ?? ""
      : String(context.targets?.[objectRef] ?? "");
    const source = objectRef === "SELF" ? context.source : findPermanent(game, instanceId);
    const stats = source ? getPowerEndurance(game, source) : context.lastKnownStats?.[instanceId];
    if (!stats) return 0;
    return String(data.stat ?? "").toUpperCase() === "TOUGHNESS" ? stats.endurance : stats.power;
  }
  if (data.type === "COUNT_ECHOS") {
    const controller = data.controller === "OPPONENT"
      ? context.side === "player" ? "host" : "player"
      : context.side;
    return game[controller].field.filter((card) =>
      card.kinds.includes("ECHO") &&
      matchesFilter(card, data.filters as CardFilter | undefined, context.source)
    ).length;
  }
  if (data.type === "COUNT_ECHOS_INVOKED_THIS_TURN") {
    const controller = data.controller === "OPPONENT"
      ? context.side === "player" ? "host" : "player"
      : context.side;
    const filters = data.filters as CardFilter | undefined;
    return game.fieldEntriesThisTurn.filter((entry) => {
      if (entry.controller !== controller) return false;
      if (!entry.kinds.includes("ECHO")) return false;
      if (filters?.excludeSelf && entry.instanceId === context.source?.instanceId) return false;
      if (filters?.kinds?.some((type) => !entry.kinds.includes(type))) return false;
      if (filters?.subtypes?.some((subtype) => !entry.subtypes.includes(subtype))) return false;
      return true;
    }).length;
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
  if (context.side !== "host") return options[0];
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
      const affected = game[context.side].field.filter((card) =>
        matchesFilter(card, effect.filter as CardFilter | undefined, context.source)
      ).length;
      return score + affected * Number(effect.power ?? 0);
    }
    return score;
  }, 0);
}
