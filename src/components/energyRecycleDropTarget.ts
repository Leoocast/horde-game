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
  if (target) {
    const right = target.left + target.width;
    const bottom = target.top + target.height;
    return point.x >= target.left - 72
      && point.x <= right + 56
      && point.y >= target.top - 96
      && point.y <= bottom + 120;
  }
  return point.x >= viewport.width * 0.78 && point.y <= viewport.height * 0.9;
}
