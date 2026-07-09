import type { AbilityOptions, CastOptions, GameState } from "./GameTypes";
import { drainEventQueue, enqueue } from "./EventQueue";
import { destroyPermanent, resolveEffect, resolveEffects, runEnterBattlefieldTriggers } from "./EffectResolver";
import { canPay, parseManaCost, payMana, payManaWithAvailableLands, tapForMana } from "./ManaSystem";

export { tapForMana };

export function toggleTap(game: GameState, id: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = [...next.player.battlefield, ...next.horde.battlefield].find((item) => item.instanceId === id);
  if (card) {
    card.tapped = !card.tapped;
    next.log.unshift(`${card.name} is ${card.tapped ? "tapped" : "untapped"}.`);
  }
  return next;
}

export function playLand(game: GameState, handId: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card || !card.cardTypes.includes("Land")) return log(next, "Choose a land to play.");
  if (next.player.landPlayedThisTurn) return log(next, "Player already played a land this turn.");
  moveHandToBattlefield(next, card);
  next.player.landPlayedThisTurn = true;
  return log(next, `Player plays ${card.name}.`);
}

export function castCard(game: GameState, handId: string, options: CastOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.hand.find((item) => item.instanceId === handId);
  if (!card) return next;
  if (card.cardTypes.includes("Land")) return playLand(next, handId);
  const cost = parseManaCost(card.manaCost, options.xValue ?? 0);
  if (!payManaWithAvailableLands(next, cost)) return log(next, `Not enough land mana to cast ${card.name}. Tap creature mana manually if needed.`);
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
  drainEventQueue(next);
  return log(next, `Player casts ${card.name}.`);
}

export function activateAbility(game: GameState, permanentId: string, abilityId: string, options: AbilityOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.battlefield.find((item) => item.instanceId === permanentId);
  const ability = card?.activatedAbilities.find((item) => item.id === abilityId);
  if (!card || !ability) return next;
  if (ability.cost?.tap) {
    if (card.tapped) return log(next, `${card.name} is already tapped.`);
    if (card.summoningSickness && card.cardTypes.includes("Creature")) return log(next, `${card.name} has summoning sickness.`);
    card.tapped = true;
  }
  const generic = Number(ability.cost?.genericMana ?? 0);
  const colored = ability.cost?.coloredMana as Record<string, number> | undefined;
  const cost = { ...parseManaCost(""), colorless: generic };
  if (colored?.G) cost.green = colored.G;
  if (!canPay(next.player.manaPool, cost)) return log(next, `Not enough mana to activate ${card.name}.`);
  next.player.manaPool = payMana(next.player.manaPool, cost);
  if (ability.cost?.sacrificeSelf) destroyPermanent(next, card);
  resolveEffect(next, ability.effect, { source: card, side: "player", targets: options.targets });
  drainEventQueue(next);
  return log(next, `Player activates ${card.name}.`);
}

function moveHandToBattlefield(game: GameState, card: { instanceId: string; zone: string }): void {
  game.player.hand = game.player.hand.filter((item) => item.instanceId !== card.instanceId);
  const permanent = card as never as import("./GameTypes").CardInstance;
  permanent.zone = "battlefield";
  permanent.tapped = permanent.entersTapped;
  game.player.battlefield.push(permanent);
}

function applyVariableCounters(card: import("./GameTypes").CardInstance): void {
  if (!card.variableCost && card.definitionId !== "wildwood_scourge") return;
  card.counters["+1/+1"] = (card.counters["+1/+1"] ?? 0) + (card.xValuePaid ?? 0);
}

function log(game: GameState, message: string): GameState {
  game.log.unshift(message);
  return game;
}
