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
