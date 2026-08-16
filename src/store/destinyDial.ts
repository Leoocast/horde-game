import type { GameState } from "../engine/GameTypes";

/** Degrees travelled for each card whose loss tips the Future toward one side. */
export const DESTINY_DIAL_STEP = 7;

function fieldCardsNewlyMovedToMemory(
  previous: GameState,
  next: GameState,
  side: "player" | "host",
): number {
  const previousFieldIds = new Set(previous[side].field.map((card) => card.instanceId));
  const previousMemoryIds = new Set(previous[side].memory.map((card) => card.instanceId));
  return next[side].memory.reduce(
    (count, card) => count + Number(
      previousFieldIds.has(card.instanceId) && !previousMemoryIds.has(card.instanceId),
    ),
    0,
  );
}

/**
 * Presentation-only reading of a committed rules transition.
 *
 * Every permanent lost from the Host Field turns the dial clockwise; every permanent
 * lost from the Chronicler Field turns it counter-clockwise. Looking at the zone move
 * instead of a particular combat/effect path covers combat, fights, lethal counters,
 * destruction and sacrifice without teaching the presentation about individual cards.
 */
export function destinyDialDeathDelta(previous: GameState, next: GameState): number {
  const hostLosses = fieldCardsNewlyMovedToMemory(previous, next, "host");
  const playerLosses = fieldCardsNewlyMovedToMemory(previous, next, "player");
  return (hostLosses - playerLosses) * DESTINY_DIAL_STEP;
}
