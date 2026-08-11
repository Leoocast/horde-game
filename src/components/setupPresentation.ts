export type SetupProgress = Readonly<{
  completed: number;
  current: number;
  total: number;
}>;

export type SetupPrimaryAction = "next" | "awaken";

function wholeNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/**
 * Derives the visible Preparation step from the persisted original total and the engine's
 * remaining-step counter. The total lives in the resume envelope, so resuming step 2 of 3 keeps
 * the same progress instead of treating the remaining two steps as a new Preparation.
 */
export function setupProgress(totalSetupTurns: number, setupTurnsRemaining: number): SetupProgress | undefined {
  const remaining = wholeNonNegative(setupTurnsRemaining);
  if (remaining === 0) return undefined;

  const total = Math.max(remaining, wholeNonNegative(totalSetupTurns), 1);
  const current = Math.min(total, Math.max(1, total - remaining + 1));
  return { completed: current, current, total };
}

export function setupPrimaryAction(setupTurnsRemaining: number): SetupPrimaryAction | undefined {
  const remaining = wholeNonNegative(setupTurnsRemaining);
  if (remaining === 0) return undefined;
  return remaining === 1 ? "awaken" : "next";
}

export function setupJustCompleted(previousRemaining: number, currentRemaining: number): boolean {
  return wholeNonNegative(previousRemaining) > 0 && wholeNonNegative(currentRemaining) === 0;
}
