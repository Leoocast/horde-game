import type { AbilityOptions, CastOptions, GameState } from "./GameTypes";
import { drawCards } from "./GameState";
import { drainEventQueue, enqueue } from "./EventQueue";
import { destroyPermanent, resolveEffect, resolveEffects, runEnterBattlefieldTriggers } from "./EffectResolver";
import { MAX_PLAYER_LANDS, canPlayerPutAnotherLand, canPlayerRecycleEnergy } from "./GameRules";
import { canPay, parseManaCost, payMana, payManaAutomatically, storedManaSpace } from "./ManaSystem";

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
  const cost = parseManaCost(card.manaCost, options.xValue ?? 0);
  if (!payManaAutomatically(next, cost)) return fail(next, `Not enough available mana to cast ${card.name}.`);
  card.xValuePaid = options.xValue ?? 0;
  next.player.hand = next.player.hand.filter((item) => item.instanceId !== handId);
  if (card.cardTypes.includes("Instant") || card.cardTypes.includes("Sorcery")) {
    resolveEffects(next, card.effects, { source: card, side: "player", targets: options.targets, distribution: options.distribution });
    card.zone = "graveyard";
    next.player.graveyard.push(card);
  } else {
    card.zone = "battlefield";
    card.tapped = card.entersTapped;
    card.summoningSickness = card.cardTypes.includes("Creature");
    if (card.attachTo?.targetRef) card.attachedTo = String(options.targets?.[card.attachTo.targetRef] ?? "");
    applyVariableCounters(card);
    next.player.battlefield.push(card);
    runEnterBattlefieldTriggers(next, card, options.targets);
  }
  enqueue(next, { type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  // Always resolve the player's own reactive triggers now (so e.g. Beast-Kin's self-buff lands
  // in the same frame the new creature enters, never flickering through a same-stats stack).
  // When a Horde reaction is pending, defer only the Horde's triggers to glow after the cast.
  drainEventQueue(next, options.deferReactiveTriggers ? { deferController: "horde" } : undefined);
  return succeed(log(next, `Player casts ${card.name}.`));
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
  if (next.winner || next.activeSide !== "player" || next.phase !== "main") return fail(next, "Abilities can only be activated during your main phase.");
  const card = next.player.battlefield.find((item) => item.instanceId === permanentId);
  const ability = card?.activatedAbilities.find((item) => item.id === abilityId);
  if (!card || !ability) return fail(next, "That ability is not available.", { silent: true });
  if (card.activatedThisTurn) return fail(next, `${card.name} has already activated an ability this turn.`);
  if (card.cardTypes.includes("Creature") && ability.effect.type === "ADD_MANA" && storedManaSpace(next) === 0) {
    return fail(next, "Stored mana is already full.");
  }
  if (ability.cost?.tap) {
    if (card.tapped) return fail(next, `${card.name} is already tapped.`);
    if (card.summoningSickness && card.cardTypes.includes("Creature")) return fail(next, `${card.name} has summoning sickness.`);
  }
  const generic = Number(ability.cost?.genericMana ?? 0);
  const colored = ability.cost?.coloredMana as Record<string, number> | undefined;
  const cost = { ...parseManaCost(""), colorless: generic };
  if (colored?.G) cost.green = colored.G;
  if (!canPay(next.player.manaPool, cost)) return fail(next, `Not enough mana to activate ${card.name}.`);
  next.player.manaPool = payMana(next.player.manaPool, cost);
  if (ability.cost?.tap) card.tapped = true;
  card.activatedThisTurn = true;
  if (ability.cost?.sacrificeSelf) destroyPermanent(next, card);
  resolveEffect(next, ability.effect, { source: card, side: "player", targets: options.targets });
  drainEventQueue(next);
  return succeed(log(next, `Player activates ${card.name}.`));
}

function moveHandToBattlefield(game: GameState, card: { instanceId: string; zone: string }): void {
  game.player.hand = game.player.hand.filter((item) => item.instanceId !== card.instanceId);
  const permanent = card as never as import("./GameTypes").CardInstance;
  permanent.zone = "battlefield";
  permanent.tapped = permanent.entersTapped;
  game.player.battlefield.push(permanent);
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
