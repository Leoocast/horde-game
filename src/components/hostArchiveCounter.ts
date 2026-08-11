export type HostArchiveAttackPreview = {
  conversionCount: number;
  discardCount: number;
  projectedArchiveCount: number;
  visibleCardCount: number;
};

/** Pure presentation model for the attack declaration. It mirrors the engine's integer
 * conversion and caps the result to cards that actually remain in the Host Archive. */
export function hostArchiveAttackPreview(
  archiveCount: number,
  attackDamage: number,
  damagePerArchiveDiscard: number,
): HostArchiveAttackPreview {
  const safeArchiveCount = Math.max(0, Math.floor(archiveCount));
  const safeDamage = Math.max(0, attackDamage);
  const safeThreshold = Math.max(1, damagePerArchiveDiscard);
  const conversionCount = Math.floor(safeDamage / safeThreshold);
  const discardCount = Math.min(safeArchiveCount, conversionCount);
  const visibleCardCount = Math.min(3, discardCount);

  return {
    conversionCount,
    discardCount,
    projectedArchiveCount: safeArchiveCount - discardCount,
    visibleCardCount,
  };
}

/** Keeps the last `1` visible while its card is in flight, then closes without ever rendering 0.
 * A genuine zero remains useful while the player is still choosing attackers. */
export function hostArchiveDiscardCounterValue(
  plannedDiscards: number,
  startedDiscards: number,
  resolvingAttack: boolean,
  previewCardInFlight: boolean,
): number | undefined {
  const planned = Math.max(0, Math.floor(plannedDiscards));
  if (!resolvingAttack) return planned;

  const remaining = Math.max(0, planned - Math.max(0, Math.floor(startedDiscards)));
  if (remaining > 0) return remaining;
  return planned > 0 && previewCardInFlight ? 1 : undefined;
}

export function hostMillOriginSelector(preview: boolean): string {
  return preview
    ? "[data-host-attack-mill-origin='true']"
    : "[data-host-mill-origin='archive']";
}

export function completedHostMillPreviewCount(startedDiscards: number, previewCardInFlight: boolean): number {
  return Math.max(0, Math.floor(startedDiscards) - (previewCardInFlight ? 1 : 0));
}
