import type { AbilityOptions, ActionCost, ActionFailureCode, ActivatedAbility, CardInstance, CastOptions, GameState, Side } from "./GameTypes";
import { lifeCostAmount, lifeCostFailureReason } from "./ActionCosts";
import { drawCards, recordFieldEntry } from "./GameState";
import { drainEventQueue, enqueue } from "./EventQueue";
import { destroyPermanent, hasEffectPresentation, losePlayerLife, resolveEffect, resolveEffects, runInvokedTriggers } from "./EffectResolver";
import { MAX_PLAYER_LANDS, canPlayerPutAnotherLand, canPlayerRecycleEnergy } from "./GameRules";
import { canPayEnergy, payEnergy, payEnergyAutomatically, storedEnergySpace, totalEnergyCost } from "./EnergySystem";
import { targetCandidatesWithSelectedTargets } from "./Targeting";
import { isQuickSpell } from "./hostfallVocabulary";

export function playLand(game: GameState, handId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (next.winner || next.activeSide !== "player" || next.phase !== "main") return fail(next, "Sources can only be played during your Main phase.");
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card || !card.kinds.includes("SOURCE")) return fail(next, "Choose a Source to play.");
  if (!canPlayerPutAnotherLand(next)) return fail(next, `The Chronicler cannot control more than ${MAX_PLAYER_LANDS} Sources.`);
  if (next.player.energyActionUsedThisTurn) return fail(next, "The Chronicler already used their Energy Action this turn.");
  moveHandToBattlefield(next, card);
  next.player.energyActionUsedThisTurn = true;
  return succeed(log(next, `Player plays ${card.name}.`));
}

export function recycleEnergy(game: GameState, handId: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card || !card.kinds.includes("SOURCE")) return fail(next, "Choose a Source to recycle.");
  if (next.setupTurnsRemaining > 0) return fail(next, "A Source cannot be recycled during setup.");
  if (!canPlayerRecycleEnergy(next)) return fail(next, "A Source can only be recycled once during your Main phase.");

  next.player.hand = next.player.hand.filter((item) => item.instanceId !== handId);
  card.zone = "archive";
  next.player.archive.push(card);
  next.player.energyActionUsedThisTurn = true;
  drawCards(next, "player", 1);
  return succeed(log(next, `Player recycles ${card.name} and draws a card.`));
}

export function castCard(game: GameState, handId: string, options: CastOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card) return fail(next, "That card is no longer in hand.", { silent: true });
  if (!canCastAtCurrentTiming(next, card)) return fail(next, `${card.name} cannot be played right now.`);
  if (card.kinds.includes("SOURCE")) return playLand(next, handId);
  const targetFailure = castTargetFailureReason(next, card, options.targets);
  if (targetFailure) return fail(next, targetFailure);
  const lifeFailure = lifeCostFailureReason(next, card.additionalCost, card.name);
  if (lifeFailure) return fail(next, lifeFailure);
  const cost = totalEnergyCost(card.energyCost, options.xValue ?? 0);
  if (!payEnergyAutomatically(next, cost)) {
    return fail(next, `Not enough available Energy to play ${card.name}.`, { code: "NOT_ENOUGH_ENERGY" });
  }
  payLifeCost(next, card.additionalCost, card.instanceId, card.name);
  card.xValuePaid = options.xValue ?? 0;
  next.player.hand = next.player.hand.filter((item) => item.instanceId !== handId);
  if (card.kinds.includes("SPELL")) {
    const immediateEffects = options.deferFightResolution
      ? card.effects.filter((effect) => !hasEffectPresentation([effect], "fight"))
      : card.effects;
    resolveEffects(next, immediateEffects, { source: card, side: "player", targets: options.targets, distribution: options.distribution });
    card.zone = "memory";
    next.player.memory.push(card);
  } else {
    card.zone = "field";
    card.exhausted = card.entersExhausted;
    card.stabilizing = card.kinds.includes("ECHO");
    if (card.attachTo?.targetRef) card.attachedTo = String(options.targets?.[card.attachTo.targetRef] ?? "");
    applyVariableCounters(card);
    next.player.field.push(card);
    recordFieldEntry(next, card);
    runInvokedTriggers(next, card, options.targets);
  }
  enqueue(next, { type: "CARD_PLAYED", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  // Always resolve the player's own reactive triggers now (so e.g. Beast-Kin's self-buff lands
  // in the same frame the new creature enters, never flickering through a same-stats stack).
  // When a Host reaction is pending, defer only the Host's triggers to glow after the cast.
  const deferredControllers: Side[] = [];
  if (options.deferPlayerTriggers) deferredControllers.push("player");
  if (options.deferReactiveTriggers) deferredControllers.push("host");
  drainEventQueue(next, deferredControllers.length > 0 ? { deferControllers: deferredControllers } : undefined);
  return succeed(log(next, `Player casts ${card.name}.`));
}

function castTargetFailureReason(
  game: GameState,
  card: CardInstance,
  targets?: Record<string, string | string[]>,
): string | undefined {
  const selectedTargets: Record<string, string | string[]> = {};
  for (const requirement of card.requiresTargets) {
    const selected = targets?.[requirement.id];
    const selectedIds = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (selectedIds.length === 0) return `Choose a valid target for ${card.name}.`;
    const candidateIds = new Set(
      targetCandidatesWithSelectedTargets(game, "player", requirement, selectedTargets)
        .map((candidate) => candidate.instanceId),
    );
    if (selectedIds.some((id) => !candidateIds.has(id))) {
      return `Choose a valid target for ${card.name}.`;
    }
    selectedTargets[requirement.id] = selectedIds.length === 1 ? selectedIds[0] : selectedIds;
  }
  return undefined;
}

function canCastAtCurrentTiming(game: GameState, card: import("./GameTypes").CardInstance): boolean {
  if (game.winner) return false;
  if (isQuickSpell(card)) {
    if (game.activeSide === "player" && (game.phase === "main" || game.phase === "combat")) return true;
    return game.activeSide === "host" && game.phase === "combat" && game.combat.hostAttackers.length > 0;
  }
  return game.activeSide === "player" && game.phase === "main";
}

export function activateAbility(game: GameState, permanentId: string, abilityId: string, options: AbilityOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.field.find((item) => item.instanceId === permanentId);
  const ability = card?.activatedAbilities.find((item) => item.id === abilityId);
  if (!card || !ability) return fail(next, "That Action is not available.", { silent: true });
  const failure = activatedAbilityFailureReason(next, card, ability);
  if (failure) return fail(next, failure);
  const cost = activatedAbilityEnergyCost(ability.cost);
  next.player.energyPool = payEnergy(next.player.energyPool, cost);
  payLifeCost(next, ability.cost, card.instanceId, card.name);
  if (ability.cost?.exhaust) card.exhausted = true;
  card.activatedThisTurn = true;
  if (ability.cost?.sacrificeSelf) destroyPermanent(next, card);
  resolveEffect(next, ability.effect, { source: card, side: "player", targets: options.targets });
  drainEventQueue(next, options.deferReactiveTriggers ? { deferController: "player" } : undefined);
  return succeed(log(next, `Player activates ${card.name}.`));
}

export function activatedAbilityFailureReason(game: GameState, card: CardInstance, ability: ActivatedAbility): string | undefined {
  if (game.winner || game.activeSide !== "player" || game.phase !== "main") return "Actions can only be used during your Main phase.";
  if (card.controller !== "player" || card.zone !== "field") return "That Action is not available.";
  if (card.activatedThisTurn) return `${card.name} has already used an Action this turn.`;
  if (ability.requiresStabilized && card.kinds.includes("ECHO") && card.stabilizing) {
    return `${card.name} cannot use this Action while Stabilizing.`;
  }
  if (card.kinds.includes("ECHO") && ability.effect.type === "GAIN_ENERGY" && storedEnergySpace(game) === 0) {
    return "Stored Energy is already full.";
  }
  if (ability.cost?.exhaust) {
    if (card.exhausted) return `${card.name} is already Exhausted.`;
    if (card.stabilizing && card.kinds.includes("ECHO")) return `${card.name} is Stabilizing.`;
  }
  const cost = activatedAbilityEnergyCost(ability.cost);
  if (!canPayEnergy(game.player.energyPool, cost)) return `Not enough Energy to use ${card.name}.`;
  return lifeCostFailureReason(game, ability.cost, card.name);
}

function activatedAbilityEnergyCost(actionCost?: ActionCost): number {
  return Math.max(0, Number(actionCost?.energy ?? 0));
}

function payLifeCost(game: GameState, cost: ActionCost | undefined, sourceId: string, sourceName: string): void {
  const amount = lifeCostAmount(cost, game.player.life);
  if (amount === 0) return;
  const paidBefore = game.player.lifePaidThisTurn ?? 0;
  losePlayerLife(game, amount, sourceId);
  game.player.lifePaidThisTurn = paidBefore + amount;
  enqueue(game, {
    type: "LIFE_PAID",
    sourceId,
    payload: {
      amount,
      firstPaymentThisTurn: paidBefore === 0,
      totalPaidThisTurn: game.player.lifePaidThisTurn,
    },
  });
  game.log.unshift(`Player pays ${amount} life for ${sourceName}.`);
}

function moveHandToBattlefield(game: GameState, card: { instanceId: string; zone: string }): void {
  game.player.hand = game.player.hand.filter((item) => item.instanceId !== card.instanceId);
  const permanent = card as never as import("./GameTypes").CardInstance;
  permanent.zone = "field";
  permanent.exhausted = permanent.entersExhausted;
  game.player.field.push(permanent);
  recordFieldEntry(game, permanent);
}

function applyVariableCounters(card: import("./GameTypes").CardInstance): void {
  if (!card.variableCost) return;
  card.counters["+1/+1"] = (card.counters["+1/+1"] ?? 0) + (card.xValuePaid ?? 0);
}

function log(game: GameState, message: string): GameState {
  game.log.unshift(message);
  return game;
}

function succeed(game: GameState): GameState {
  game.lastActionResult = { ok: true };
  return game;
}

/** Failed action: records the typed outcome and logs the reason (unless silent). */
function fail(game: GameState, reason: string, options: { silent?: boolean; code?: ActionFailureCode } = {}): GameState {
  game.lastActionResult = { ok: false, reason, ...(options.code ? { code: options.code } : {}) };
  if (!options.silent) game.log.unshift(reason);
  return game;
}
