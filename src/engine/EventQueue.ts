import type { EventItem, GameState, Side } from "./GameTypes";
import { resolveTriggeredEvent } from "./EffectResolver";

export function enqueue(game: GameState, event: Omit<EventItem, "id">): void {
  game.eventQueue.push({
    ...event,
    id: `event-${game.eventQueue.length}-${Date.now()}`,
    payload: {
      ...(event.payload ?? {}),
      // Only permanents already in play when the event happened may react to it. Without this,
      // a creature that reaches the battlefield BECAUSE of this event reacts to it: Rundvelt
      // Invoking Pashalik from the Archive made Pashalik burn for the death that summoned it.
      // The event's own source is always allowed — a dying card has already left the battlefield
      // by the time its death event is queued.
      witnessIds: [...game.player.field, ...game.horde.field].map((card) => card.instanceId),
    },
  });
}

/** Resolves exactly one queued event. Returns false when the queue was already empty.
 *  Kept separate from `drainEventQueue` on purpose: that one parks deferred events until the whole
 *  drain is over, which a single step cannot do without re-processing them immediately. */
export function drainNextEvent(game: GameState): boolean {
  const event = game.eventQueue.shift();
  if (!event) return false;
  resolveTriggeredEvent(game, event);
  return true;
}

// `deferController` resolves every triggered source EXCEPT that side's, re-queuing any event
// that still has a trigger for the deferred side so it can be drained later. Used so a player
// cast can apply its own reactive triggers (e.g. Beast-Kin's self-buff) immediately while the
// Horde's reaction to the same cast is held back to glow after the card is visible.
export function drainEventQueue(
  game: GameState,
  options?: { deferController?: Side; deferControllers?: Side[] },
): void {
  const deferred: EventItem[] = [];
  const deferredControllers = options?.deferControllers
    ?? (options?.deferController ? [options.deferController] : []);
  while (game.eventQueue.length > 0) {
    const event = game.eventQueue.shift();
    if (!event) continue;
    if (resolveTriggeredEvent(game, event, deferredControllers)) {
      deferred.push({
        ...event,
        // A single controller can be stamped as an optimization/filter. When both sides defer,
        // the event must remain visible to both runners.
        triggerController: deferredControllers.length === 1
          ? deferredControllers[0]
          : event.triggerController,
      });
    }
  }
  if (deferred.length > 0) game.eventQueue.push(...deferred);
}
