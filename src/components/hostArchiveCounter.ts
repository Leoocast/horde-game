/**
 * The attack declaration owns the total discard preview, while the mill animator progressively
 * moves those cards out of the visible Archive. Only the still-pending amount belongs beside the
 * live Archive count; returning undefined keeps the HUD from flashing a misleading `- 0`.
 */
export function remainingArchiveDiscardPreview(
  plannedDiscards: number,
  alreadyPreviewedDiscards: number,
): number | undefined {
  const remaining = Math.max(0, plannedDiscards - alreadyPreviewedDiscards);
  return remaining > 0 ? remaining : undefined;
}
