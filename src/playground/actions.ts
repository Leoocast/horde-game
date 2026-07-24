import { destroyPermanent } from "../engine/EffectResolver";
import { drainEventQueue, drainNextEvent } from "../engine/EventQueue";
import { drawCards } from "../engine/GameState";
import type { CardInstance, Color, GameState, Side, ZoneName } from "../engine/GameTypes";
import { addMana, emptyManaPool, parseManaCost } from "../engine/ManaSystem";

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
  if (next.player.library.length === 0) return fail(game, "The player library is empty.");
  drawCards(next, "player", 1);
  return succeed(next, "Playground draws a card.");
}

export function addPlayerMana(game: GameState, color: Color, amount = 1): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  next.player.manaPool = addMana(next.player.manaPool, color, amount);
  return succeed(next, `Playground adds ${amount} ${color} mana.`);
}

export function clearPlayerMana(game: GameState): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  next.player.manaPool = emptyManaPool();
  next.player.pendingStoredMana = 0;
  return succeed(next, "Playground clears the mana pool.");
}

/**
 * Tops the pool up to exactly the card's printed cost so the normal cast path can pay it. The cast
 * itself still runs every check, trigger and target requirement — this only removes the cost.
 */
export function grantManaForCard(game: GameState, handId: string): PlaygroundActionResult {
  const card = game.player.hand.find((item) => item.instanceId === handId);
  if (!card) return fail(game, "That card is not in hand.");
  const next = structuredClone(game) as GameState;
  const cost = parseManaCost(card.manaCost, card.variableCost?.hasX ? 1 : 0);
  for (const [key, color] of [["green", "G"], ["red", "R"], ["blue", "U"], ["white", "W"], ["black", "B"]] as const) {
    const missing = cost[key] - next.player.manaPool[key];
    if (missing > 0) next.player.manaPool = addMana(next.player.manaPool, color as Color, missing);
  }
  // Generic cost is covered with green: every colored symbol is already paid above, and the engine's
  // payment routine spends colored mana on generic when nothing else is left.
  const totalColored = cost.green + cost.red + cost.blue + cost.white + cost.black;
  if (cost.colorless > 0) next.player.manaPool = addMana(next.player.manaPool, "G", cost.colorless);
  return succeed(next, `Playground grants ${totalColored + cost.colorless} mana for ${card.name}.`);
}

/** Real destruction: death triggers included. */
export function destroyCard(game: GameState, cardId: string): PlaygroundActionResult {
  const next = structuredClone(game) as GameState;
  const card = findBattlefieldCard(next, cardId);
  if (!card) return fail(game, "Select a permanent on the battlefield first.");
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
  if (zone === "graveyard") return fail(game, `${card.name} is already in the graveyard.`);
  removeFromZone(next, side, zone, cardId);
  card.zone = "graveyard";
  next[side].graveyard.push(card);
  return succeed(next, `Playground moves ${card.name} to the graveyard.`);
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
  return [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === cardId);
}

function locateCard(game: GameState, cardId: string): { card: CardInstance; side: Side; zone: ZoneName } | undefined {
  for (const side of ["player", "horde"] as const) {
    for (const zone of ["battlefield", "hand", "library", "graveyard", "exile"] as const) {
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
