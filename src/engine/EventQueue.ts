import type { EventItem, GameState } from "./GameTypes";
import { resolveTriggeredEvent } from "./EffectResolver";

export function enqueue(game: GameState, event: Omit<EventItem, "id">): void {
  game.eventQueue.push({ ...event, id: `event-${game.eventQueue.length}-${Date.now()}` });
}

// `deferController` resolves every triggered source EXCEPT that side's, re-queuing any event
// that still has a trigger for the deferred side so it can be drained later. Used so a player
// cast can apply its own reactive triggers (e.g. Beast-Kin's self-buff) immediately while the
// Horde's reaction to the same cast is held back to glow after the card is visible.
export function drainEventQueue(game: GameState, options?: { deferController?: "player" | "horde" }): void {
  const deferred: EventItem[] = [];
  while (game.eventQueue.length > 0) {
    const event = game.eventQueue.shift();
    if (!event) continue;
    if (resolveTriggeredEvent(game, event, options?.deferController)) {
      deferred.push({ ...event, triggerController: options?.deferController });
    }
  }
  if (deferred.length > 0) game.eventQueue.push(...deferred);
}
