import type { GameplayIntent } from "./interactionGate";

export type ContextualIntentAuthorization =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; conceptId: string }>;

type ContextualIntentInterceptor = (intent: GameplayIntent) => ContextualIntentAuthorization;

/** Thin indirection keeps the gameplay entry boundary independent from the contextual runtime. */
export class ContextualIntentGate {
  #interceptor: ContextualIntentInterceptor | undefined;

  install(interceptor: ContextualIntentInterceptor): () => void {
    this.#interceptor = interceptor;
    return () => {
      if (this.#interceptor === interceptor) this.#interceptor = undefined;
    };
  }

  authorize(intent: GameplayIntent): ContextualIntentAuthorization {
    return this.#interceptor?.(intent) ?? { allowed: true };
  }

  resetForTests(): void {
    this.#interceptor = undefined;
  }
}

export const contextualIntentGate = new ContextualIntentGate();
