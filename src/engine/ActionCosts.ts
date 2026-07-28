import type { ActionCost, GameState } from "./GameTypes";

export function lifeCostAmount(cost?: ActionCost): number {
  const amount = Number(cost?.life ?? 0);
  return Number.isInteger(amount) && amount > 0 ? amount : 0;
}

/** Paying life is a cost, so it must leave the player alive. */
export function canPayLifeCost(game: GameState, cost?: ActionCost): boolean {
  return game.player.life > lifeCostAmount(cost);
}

export function lifeCostFailureReason(game: GameState, cost: ActionCost | undefined, sourceName: string): string | undefined {
  const amount = lifeCostAmount(cost);
  if (amount === 0 || canPayLifeCost(game, cost)) return undefined;
  return `You must keep at least 1 life after paying ${amount} life for ${sourceName}.`;
}
