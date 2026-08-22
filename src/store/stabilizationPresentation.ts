import type { GameState, Side } from "../engine/GameTypes";

export const STABILIZATION_COMPLETION_MS = 620;
export const STABILIZATION_COMPLETION_STAGGER_MS = 70;

export type StabilizationCompletionCard = Readonly<{
  cardId: string;
  side: Side;
}>;

/**
 * Presentation-only diff for the moment an Echo finishes Stabilizing. Rules have already
 * committed the ready card; the UI retains its material long enough to close that visual beat.
 */
export function completedStabilizationCards(
  previous: GameState,
  next: GameState,
): readonly StabilizationCompletionCard[] {
  const completed: StabilizationCompletionCard[] = [];

  for (const side of ["player", "host"] as const) {
    const nextById = new Map(next[side].field.map((card) => [card.instanceId, card]));
    for (const card of previous[side].field) {
      const current = nextById.get(card.instanceId);
      if (
        card.kinds.includes("ECHO") &&
        card.stabilizing &&
        current?.kinds.includes("ECHO") &&
        !current.stabilizing
      ) {
        completed.push({ cardId: card.instanceId, side });
      }
    }
  }

  return Object.freeze(completed);
}

export function stabilizationCompletionDelayMs(index: number): number {
  return Math.max(0, index) * STABILIZATION_COMPLETION_STAGGER_MS;
}

export function stabilizationCompletionTotalMs(cardCount: number): number {
  if (cardCount <= 0) return 0;
  return STABILIZATION_COMPLETION_MS + stabilizationCompletionDelayMs(cardCount - 1);
}
