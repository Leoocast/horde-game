import type { ActionCost, GameState } from "./GameTypes";

export function lifeCostAmount(cost?: ActionCost, currentLife = 0): number {
  const life = cost?.life;
  if (typeof life === "number") {
    return Number.isInteger(life) && life > 0 ? life : 0;
  }
  if (
    !life
    || life.type !== "CURRENT_LIFE_FRACTION"
    || !Number.isInteger(life.numerator)
    || life.numerator <= 0
    || !Number.isInteger(life.denominator)
    || life.denominator <= 0
    || !Number.isInteger(currentLife)
    || currentLife <= 0
  ) {
    return 0;
  }
  const rawAmount = currentLife * life.numerator / life.denominator;
  return life.rounding === "DOWN" ? Math.floor(rawAmount) : Math.ceil(rawAmount);
}

/** Paying life is a cost, so it must leave the player alive. */
export function canPayLifeCost(game: GameState, cost?: ActionCost): boolean {
  return game.player.life > lifeCostAmount(cost, game.player.life);
}

export function lifeCostFailureReason(game: GameState, cost: ActionCost | undefined, sourceName: string): string | undefined {
  const amount = lifeCostAmount(cost, game.player.life);
  if (amount === 0 || canPayLifeCost(game, cost)) return undefined;
  return `You must keep at least 1 Life after paying ${amount} Life for ${sourceName}.`;
}
