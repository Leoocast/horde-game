import { destroyPermanent } from "../engine/EffectResolver";
import { drainEventQueue, drainNextEvent } from "../engine/EventQueue";
import { MAX_PLAYER_LANDS, playerLandCount } from "../engine/GameRules";
import { drawCards } from "../engine/GameState";
import type { CardInstance, GameState, Side, ZoneName } from "../engine/GameTypes";
import {
  STORED_ENERGY_CAP,
  addAvailableEnergy,
  addStoredEnergy as addStoredEnergyToPool,
  emptyEnergyPool,
  totalEnergyCost,
} from "../engine/EnergySystem";
import { placeEnergySources, playerEnergyDefinitionId } from "./scenario";

/**
 * Playground actions on a live game. Every one of them goes through the engine's own helpers, and
 * every one records `lastActionResult` the way engine actions do — the dock reads that, so an
 * action can never fail silently.
 */
export type PlaygroundActionResult = { game: GameState; ok: boolean; reason?: string };

function fail(game: GameState, reason: string): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  next.lastActionResult = { ok: false, reason };
  return { game: next, ok: false, reason };
}

function succeed(game: GameState, message: string): PlaygroundActionResult {
  game.lastActionResult = { ok: true };
  game.log.unshift(message);
  return { game, ok: true };
}

export function drawPlayerCard(game: GameState): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  if (next.player.archive.length === 0) return fail(game, "The Chronicler Archive is empty.");
  drawCards(next, "player", 1);
  return succeed(next, "Playground draws a card.");
}

/**
 * The Playground manipulates the same two Energy sources as the game: ready Sources and Stored
 * Energy. It never creates a second, hidden resource channel.
 */
export function addEnergySource(game: GameState, amount = 1): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  if (!playerEnergyDefinitionId(next)) return fail(game, "This deck has no land to use as an energy source.");
  if (playerLandCount(next) >= MAX_PLAYER_LANDS) {
    return fail(game, `The player already controls ${MAX_PLAYER_LANDS} energy sources.`);
  }
  const placed = placeEnergySources(next, amount);
  return succeed(next, `Playground adds ${placed} energy source(s).`);
}

/** Readies every Energy Source and hands the Energy action back — a fresh turn's worth of Energy
 *  without advancing the turn. */
export function refillEnergy(game: GameState): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  const lands = next.player.field.filter((card) => card.kinds.includes("SOURCE"));
  if (lands.length === 0) return fail(game, "There are no energy sources to refill. Add one first.");
  let restored = 0;
  for (const land of lands) {
    if (land.exhausted || land.activatedThisTurn) restored += 1;
    land.exhausted = false;
    land.activatedThisTurn = false;
  }
  next.player.energyActionUsedThisTurn = false;
  return succeed(next, `Playground refills ${restored} energy.`);
}

export function addStoredEnergy(game: GameState, amount = 1): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  const added = addStoredEnergyToPool(next, amount);
  if (added === 0) return fail(game, `Stored energy is already at its cap of ${STORED_ENERGY_CAP}.`);
  return succeed(next, `Playground stores ${added} energy.`);
}

/** Spends everything: Exhausts every Energy Source and empties the pool. The counterpart to refill,
 *  for testing what a card does with nothing left. */
export function drainEnergy(game: GameState): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  for (const card of next.player.field) {
    if (!card.kinds.includes("SOURCE")) continue;
    card.exhausted = true;
    card.activatedThisTurn = true;
  }
  next.player.energyPool = emptyEnergyPool();
  next.player.pendingStoredEnergy = 0;
  return succeed(next, "Playground drains all energy.");
}

/**
 * Tops the pool up to exactly the card's printed cost so the normal cast path can pay it. The cast
 * itself still runs every check, trigger and target requirement — this only removes the cost.
 */
export function grantEnergyForCard(game: GameState, handId: string): PlaygroundActionResult {
  const card = game.player.hand.find((item) => item.instanceId === handId);
  if (!card) return fail(game, "That card is not in hand.");
  const next = structuredClone(game) as GameState;
  const cost = totalEnergyCost(card.energyCost, card.variableCost?.hasX ? 1 : 0);
  const pooled = next.player.energyPool.available + next.player.energyPool.stored;
  const granted = Math.max(0, cost - pooled);
  next.player.energyPool = addAvailableEnergy(next.player.energyPool, granted);
  return succeed(next, `Playground grants ${granted} Energy for ${card.name}.`);
}

/** Real destruction: death triggers included. */
export function destroyCard(game: GameState, cardId: string): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  const card = findBattlefieldCard(next, cardId);
  if (!card) return fail(game, "Select a card on the Field first.");
  destroyPermanent(next, card);
  drainEventQueue(next);
  return succeed(next, `Playground destroys ${card.name}.`);
}

/** Raw zone move, no death triggers — the difference from destroy is deliberate. */
export function sendCardToGraveyard(game: GameState, cardId: string): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  const located = locateCard(next, cardId);
  if (!located) return fail(game, "That card is not in play.");
  const { card, side, zone } = located;
  if (zone === "memory") return fail(game, `${card.name} is already in Memory.`);
  removeFromZone(next, side, zone, cardId);
  card.zone = "memory";
  next[side].memory.push(card);
  return succeed(next, `Playground moves ${card.name} to Memory.`);
}

/**
 * Sweeps a side's permanents off the board with no deaths and no triggers — the lab equivalent of
 * clearing the table. Deliberately not `destroyPermanent`: wiping a board to set up the next test
 * should not fire six death triggers on the way out.
 */
export function clearBattlefield(game: GameState, side: Side): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  const removed = next[side].field;
  if (removed.length === 0) return fail(game, `The ${side === "horde" ? "Host" : "Chronicler"} Field is already empty.`);
  for (const card of removed) card.zone = "memory";
  next[side].memory.push(...removed);
  next[side].field = [];
  return succeed(next, `Playground clears ${removed.length} permanent(s) from the ${side} board.`);
}

export function resolveNextEvent(game: GameState): PlaygroundActionResult {
  if (game.eventQueue.length === 0) return fail(game, "The event queue is empty.");
  const next = structuredClone(game) as GameState;
  drainNextEvent(next);
  return succeed(next, "Playground resolves one queued event.");
}

export function resolveAllEvents(game: GameState): PlaygroundActionResult {
  if (game.eventQueue.length === 0) return fail(game, "The event queue is empty.");
  const next = structuredClone(game) as GameState;
  const resolved = next.eventQueue.length;
  drainEventQueue(next);
  return succeed(next, `Playground resolves ${resolved} queued event(s).`);
}

function findBattlefieldCard(game: GameState, cardId: string): CardInstance | undefined {
  return [...game.player.field, ...game.horde.field].find((card) => card.instanceId === cardId);
}

function locateCard(game: GameState, cardId: string): { card: CardInstance; side: Side; zone: ZoneName } | undefined {
  for (const side of ["player", "horde"] as const) {
    for (const zone of ["field", "hand", "archive", "memory", "oblivion"] as const) {
      if (side === "horde" && zone === "hand") continue;
      const card = (game[side] as unknown as Record<string, CardInstance[]>)[zone]?.find((item) => item.instanceId === cardId);
      if (card) return { card, side, zone };
    }
  }
  return undefined;
}

function removeFromZone(game: GameState, side: Side, zone: ZoneName, cardId: string): void {
  const container = game[side] as unknown as Record<string, CardInstance[]>;
  container[zone] = container[zone].filter((card) => card.instanceId !== cardId);
}
