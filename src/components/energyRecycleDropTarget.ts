export type EnergyRecycleDropPoint = Readonly<{ x: number; y: number }>;
export type EnergyRecycleDropViewport = Readonly<{ width: number; height: number }>;
export type EnergyRecycleDropBounds = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/**
 * The printed Archive is small and sits low on the board. Its drop target intentionally extends
 * farther below than above so a card released literally over the pile is never rejected for being
 * a few pixels too close to the bottom edge of the window.
 */
export function energyRecycleDropZoneContains(
  point: EnergyRecycleDropPoint,
  viewport: EnergyRecycleDropViewport,
  target?: EnergyRecycleDropBounds,
): boolean {
  // Preserve the original, intentionally broad gesture toward the right side of the board. The
  // measured Archive is an extension for literal drops over the low pile, not a replacement for
  // the path players already learned before the HUD exposed a concrete target element.
  const insideRightwardGesture = point.x >= viewport.width * 0.78
    && point.y <= viewport.height * 0.9;
  if (target) {
    const right = target.left + target.width;
    const bottom = target.top + target.height;
    const insideArchiveExtension = point.x >= target.left - 72
      && point.x <= right + 56
      && point.y >= target.top - 96
      && point.y <= bottom + 120;
    return insideRightwardGesture || insideArchiveExtension;
  }
  return insideRightwardGesture;
}
