import type { AbilityOptions, ActionCost, ActivatedAbility, CardInstance, CastOptions, GameState, Side } from "./GameTypes";
import { lifeCostAmount, lifeCostFailureReason } from "./ActionCosts";
import { drawCards, recordBattlefieldEntry } from "./GameState";
import { drainEventQueue, enqueue } from "./EventQueue";
import { destroyPermanent, hasEffectPresentation, losePlayerLife, resolveEffect, resolveEffects, runEnterBattlefieldTriggers } from "./EffectResolver";
import { MAX_PLAYER_LANDS, canPlayerPutAnotherLand, canPlayerRecycleEnergy } from "./GameRules";
import { canPay, parseManaCost, payMana, payManaAutomatically, storedManaSpace } from "./ManaSystem";
import { targetCandidatesWithSelectedTargets } from "./Targeting";

export function playLand(game: GameState, handId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (next.winner || next.activeSide !== "player" || next.phase !== "main") return fail(next, "Lands can only be played during your main phase.");
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card || !card.cardTypes.includes("Land")) return fail(next, "Choose a land to play.");
  if (!canPlayerPutAnotherLand(next)) return fail(next, `Player cannot control more than ${MAX_PLAYER_LANDS} lands.`);
  if (next.player.energyActionUsedThisTurn) return fail(next, "Player already used their Energy action this turn.");
  moveHandToBattlefield(next, card);
  next.player.energyActionUsedThisTurn = true;
  return succeed(log(next, `Player plays ${card.name}.`));
}

export function recycleEnergy(game: GameState, handId: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card || !card.cardTypes.includes("Land")) return fail(next, "Choose an Energy to recycle.");
  if (next.setupTurnsRemaining > 0) return fail(next, "Energy cannot be recycled during setup.");
  if (!canPlayerRecycleEnergy(next)) return fail(next, "Energy can only be recycled once during your main phase.");

  next.player.hand = next.player.hand.filter((item) => item.instanceId !== handId);
  card.zone = "library";
  next.player.library.push(card);
  next.player.energyActionUsedThisTurn = true;
  drawCards(next, "player", 1);
  return succeed(log(next, `Player recycles ${card.name} and draws a card.`));
}

export function castCard(game: GameState, handId: string, options: CastOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card) return fail(next, "That card is no longer in hand.", { silent: true });
  if (!canCastAtCurrentTiming(next, card)) return fail(next, `${card.name} cannot be cast right now.`);
  if (card.cardTypes.includes("Land")) return playLand(next, handId);
  const targetFailure = castTargetFailureReason(next, card, options.targets);
  if (targetFailure) return fail(next, targetFailure);
  const lifeFailure = lifeCostFailureReason(next, card.additionalCost, card.name);
  if (lifeFailure) return fail(next, lifeFailure);
  const cost = parseManaCost(card.manaCost, options.xValue ?? 0);
  if (!payManaAutomatically(next, cost)) return fail(next, `Not enough available mana to cast ${card.name}.`);
  payLifeCost(next, card.additionalCost, card.instanceId, card.name);
  card.xValuePaid = options.xValue ?? 0;
  next.player.hand = next.player.hand.filter((item) => item.instanceId !== handId);
  if (card.cardTypes.includes("Instant") || card.cardTypes.includes("Sorcery")) {
    const immediateEffects = options.deferFightResolution
      ? card.effects.filter((effect) => !hasEffectPresentation([effect], "fight"))
      : card.effects;
    resolveEffects(next, immediateEffects, { source: card, side: "player", targets: options.targets, distribution: options.distribution });
    card.zone = "graveyard";
    next.player.graveyard.push(card);
  } else {
    card.zone = "battlefield";
    card.tapped = card.entersTapped;
    card.summoningSickness = card.cardTypes.includes("Creature");
    if (card.attachTo?.targetRef) card.attachedTo = String(options.targets?.[card.attachTo.targetRef] ?? "");
    applyVariableCounters(card);
    next.player.battlefield.push(card);
    recordBattlefieldEntry(next, card);
    runEnterBattlefieldTriggers(next, card, options.targets);
  }
  enqueue(next, { type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  // Always resolve the player's own reactive triggers now (so e.g. Beast-Kin's self-buff lands
  // in the same frame the new creature enters, never flickering through a same-stats stack).
  // When a Horde reaction is pending, defer only the Horde's triggers to glow after the cast.
  const deferredControllers: Side[] = [];
  if (options.deferPlayerTriggers) deferredControllers.push("player");
  if (options.deferReactiveTriggers) deferredControllers.push("horde");
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
  if (card.cardTypes.includes("Instant")) {
    if (game.activeSide === "player" && (game.phase === "main" || game.phase === "combat")) return true;
    return game.activeSide === "horde" && game.phase === "combat" && game.combat.hordeAttackers.length > 0;
  }
  return game.activeSide === "player" && game.phase === "main";
}

export function activateAbility(game: GameState, permanentId: string, abilityId: string, options: AbilityOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.battlefield.find((item) => item.instanceId === permanentId);
  const ability = card?.activatedAbilities.find((item) => item.id === abilityId);
  if (!card || !ability) return fail(next, "That ability is not available.", { silent: true });
  const failure = activatedAbilityFailureReason(next, card, ability);
  if (failure) return fail(next, failure);
  const cost = activatedAbilityManaCost(ability.cost);
  next.player.manaPool = payMana(next.player.manaPool, cost);
  payLifeCost(next, ability.cost, card.instanceId, card.name);
  if (ability.cost?.tap) card.tapped = true;
  card.activatedThisTurn = true;
  if (ability.cost?.sacrificeSelf) destroyPermanent(next, card);
  resolveEffect(next, ability.effect, { source: card, side: "player", targets: options.targets });
  drainEventQueue(next, options.deferReactiveTriggers ? { deferController: "player" } : undefined);
  return succeed(log(next, `Player activates ${card.name}.`));
}

export function activatedAbilityFailureReason(game: GameState, card: CardInstance, ability: ActivatedAbility): string | undefined {
  if (game.winner || game.activeSide !== "player" || game.phase !== "main") return "Abilities can only be activated during your main phase.";
  if (card.controller !== "player" || card.zone !== "battlefield") return "That ability is not available.";
  if (card.activatedThisTurn) return `${card.name} has already activated an ability this turn.`;
  if (ability.requiresNoSummoningSickness && card.cardTypes.includes("Creature") && card.summoningSickness) {
    return `${card.name} cannot activate this ability while it has summoning sickness.`;
  }
  if (card.cardTypes.includes("Creature") && ability.effect.type === "ADD_MANA" && storedManaSpace(game) === 0) {
    return "Stored mana is already full.";
  }
  if (ability.cost?.tap) {
    if (card.tapped) return `${card.name} is already tapped.`;
    if (card.summoningSickness && card.cardTypes.includes("Creature")) return `${card.name} has summoning sickness.`;
  }
  const cost = activatedAbilityManaCost(ability.cost);
  if (!canPay(game.player.manaPool, cost)) return `Not enough mana to activate ${card.name}.`;
  return lifeCostFailureReason(game, ability.cost, card.name);
}

function activatedAbilityManaCost(actionCost?: ActionCost) {
  const generic = Number(actionCost?.genericMana ?? 0);
  const colored = actionCost?.coloredMana;
  const cost = { ...parseManaCost(""), colorless: generic };
  cost.green = Number(colored?.G ?? 0);
  cost.red = Number(colored?.R ?? 0);
  cost.blue = Number(colored?.U ?? 0);
  cost.white = Number(colored?.W ?? 0);
  cost.black = Number(colored?.B ?? 0);
  return cost;
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
  permanent.zone = "battlefield";
  permanent.tapped = permanent.entersTapped;
  game.player.battlefield.push(permanent);
  recordBattlefieldEntry(game, permanent);
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
function fail(game: GameState, reason: string, options: { silent?: boolean } = {}): GameState {
  game.lastActionResult = { ok: false, reason };
  if (!options.silent) game.log.unshift(reason);
  return game;
}
