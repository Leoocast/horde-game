import type { EventItem, GameState } from "./GameTypes";
import { resolveTriggeredEvent } from "./EffectResolver";

export function enqueue(game: GameState, event: Omit<EventItem, "id">): void {
  game.eventQueue.push({
    ...event,
    id: `event-${game.eventQueue.length}-${Date.now()}`,
    payload: {
      ...(event.payload ?? {}),
      // Only permanents already in play when the event happened may react to it. Without this,
      // a creature that reaches the battlefield BECAUSE of this event reacts to it: Rundvelt
      // exiling Pashalik onto the battlefield made Pashalik burn for the death that summoned it.
      // The event's own source is always allowed — a dying card has already left the battlefield
      // by the time its death event is queued.
      witnessIds: [...game.player.battlefield, ...game.horde.battlefield].map((card) => card.instanceId),
    },
  });
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
