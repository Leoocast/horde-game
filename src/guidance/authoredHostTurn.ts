import type { GameState } from "../engine/GameTypes";

export type AuthoredHostTurnPlan = Readonly<{
  revealCount: number;
  reason: string;
}>;

export type AuthoredHostTurnPolicy = Readonly<{
  journeyId: string;
  plan(game: GameState): AuthoredHostTurnPlan | undefined;
}>;

/** Optional encounter seam for a Host turn whose reveal count depends on the live board. */
export class AuthoredHostTurnGate {
  #policy: AuthoredHostTurnPolicy | undefined;

  activate(policy: AuthoredHostTurnPolicy): void {
    if (!policy.journeyId.trim()) throw new Error("Authored Host-turn policies require a journey id.");
    this.#policy = policy;
  }

  deactivate(journeyId?: string): void {
    if (journeyId && this.#policy?.journeyId !== journeyId) return;
    this.#policy = undefined;
  }

  plan(game: GameState): AuthoredHostTurnPlan | undefined {
    const plan = this.#policy?.plan(game);
    if (!plan) return undefined;
    if (!Number.isInteger(plan.revealCount) || plan.revealCount < 1) {
      throw new Error(`Invalid authored Host reveal count: ${plan.revealCount}.`);
    }
    return Object.freeze({ ...plan });
  }

  resetForTests(): void {
    this.#policy = undefined;
  }
}

export const authoredHostTurnGate = new AuthoredHostTurnGate();
