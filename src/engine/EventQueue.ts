import type { EventItem, GameState } from "./GameTypes";
import { resolveTriggeredEvent } from "./EffectResolver";

export function enqueue(game: GameState, event: Omit<EventItem, "id">): void {
  game.eventQueue.push({ ...event, id: `event-${game.eventQueue.length}-${Date.now()}` });
}

export function drainEventQueue(game: GameState): void {
  while (game.eventQueue.length > 0) {
    const event = game.eventQueue.shift();
    if (event) resolveTriggeredEvent(game, event);
  }
}
