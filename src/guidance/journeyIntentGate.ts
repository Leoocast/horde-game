import type { GameplayIntent } from "./interactionGate";

export type JourneyIntentAuthorization =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; guidanceId: string; relatedCardIds?: readonly string[] }>;

export type JourneyIntentPolicy = Readonly<{
  journeyId: string;
  authorize(intent: GameplayIntent): JourneyIntentAuthorization;
}>;

/** Ephemeral structural limits for a semi-guided journey. Normal matches never activate it. */
export class JourneyIntentGate {
  #policy: JourneyIntentPolicy | undefined;

  activate(policy: JourneyIntentPolicy): void {
    if (!policy.journeyId.trim()) throw new Error("Journey intent policies require a journey id.");
    this.#policy = policy;
  }

  deactivate(journeyId?: string): void {
    if (journeyId && this.#policy?.journeyId !== journeyId) return;
    this.#policy = undefined;
  }

  authorize(intent: GameplayIntent): JourneyIntentAuthorization {
    return this.#policy?.authorize(intent) ?? Object.freeze({ allowed: true });
  }

  activeJourneyId(): string | undefined {
    return this.#policy?.journeyId;
  }

  resetForTests(): void {
    this.#policy = undefined;
  }
}

export const journeyIntentGate = new JourneyIntentGate();
