import type { GameMode } from "../engine/GameTypes";

export type HistorySessionKind =
  | "normal"
  | "tutorial"
  | "journey"
  | "initial-session"
  | "playground"
  | "seed-explorer"
  | "developer";

export type HistoryEligibilityReason = "eligible" | "session-excluded" | "mode-excluded";

/**
 * Single product policy for attempt creation. Integrations must identify their session explicitly;
 * this domain never guesses from a seed, deck, Echo name, or screen transition.
 */
export const HISTORY_ELIGIBILITY_MATRIX: Readonly<
  Record<HistorySessionKind, Readonly<Record<GameMode, boolean>>>
> = Object.freeze({
  normal: Object.freeze({ standard: true, chaos: false }),
  tutorial: Object.freeze({ standard: false, chaos: false }),
  journey: Object.freeze({ standard: false, chaos: false }),
  "initial-session": Object.freeze({ standard: false, chaos: false }),
  playground: Object.freeze({ standard: false, chaos: false }),
  "seed-explorer": Object.freeze({ standard: false, chaos: false }),
  developer: Object.freeze({ standard: false, chaos: false }),
});

export function historyEligibility(
  sessionKind: HistorySessionKind,
  gameMode: GameMode,
): Readonly<{ eligible: boolean; reason: HistoryEligibilityReason }> {
  if (gameMode !== "standard") return Object.freeze({ eligible: false, reason: "mode-excluded" });
  if (!HISTORY_ELIGIBILITY_MATRIX[sessionKind][gameMode]) {
    return Object.freeze({ eligible: false, reason: "session-excluded" });
  }
  return Object.freeze({ eligible: true, reason: "eligible" });
}
