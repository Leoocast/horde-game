export function tooltipCenterWithinViewport(
  anchorCenter: number,
  tooltipWidth: number,
  viewportWidth: number,
  viewportPadding = 12,
): number {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safePadding = Math.min(Math.max(0, viewportPadding), safeViewportWidth / 2);
  const availableWidth = Math.max(0, safeViewportWidth - safePadding * 2);
  const renderedWidth = Math.min(Math.max(0, tooltipWidth), availableWidth);
  const halfWidth = renderedWidth / 2;
  const minimumCenter = safePadding + halfWidth;
  const maximumCenter = Math.max(minimumCenter, safeViewportWidth - safePadding - halfWidth);

  return Math.min(Math.max(anchorCenter, minimumCenter), maximumCenter);
}
