type HandCardPresentationInput = {
  index: number;
  hovered: boolean;
  selectedForDiscard: boolean;
  dragging: boolean;
};

export function getHandCardPresentationState({
  index,
  hovered,
  selectedForDiscard,
  dragging,
}: HandCardPresentationInput): { raised: boolean; zIndex: number } {
  if (dragging) return { raised: true, zIndex: 120 };
  if (hovered) return { raised: true, zIndex: 100 };
  if (selectedForDiscard) return { raised: true, zIndex: 90 };
  return { raised: false, zIndex: index + 1 };
}

/** Initial Hand cards mount directly in their settled pose (`initial={false}`). Tracking them as
 * an entry activity can leave guidance waiting for an animation-complete callback that already
 * fired before the activity token existed, especially in production without StrictMode's
 * development-only effect replay. */
export function shouldTrackHandEntryActivity(
  cardId: string,
  initialHandIds: ReadonlySet<string>,
): boolean {
  return !initialHandIds.has(cardId);
}

type HandArchiveEntryLayout = {
  archiveCenter: { x: number; y: number };
  handCenterX: number;
  handBaselineY: number;
  cardWidth: number;
  cardHeight: number;
  handSize: number;
  index: number;
  stackMargin: number;
  fanY: number;
};

/** Returns the translation that places a card's rendered face over the Archive before it joins
 * its final hand slot. Every card in a multi-draw therefore starts at the same physical origin. */
export function handArchiveEntryOffset({
  archiveCenter,
  handCenterX,
  handBaselineY,
  cardWidth,
  cardHeight,
  handSize,
  index,
  stackMargin,
  fanY,
}: HandArchiveEntryLayout): { x: number; y: number } {
  const safeHandSize = Math.max(1, Math.floor(handSize));
  const safeIndex = Math.max(0, Math.min(safeHandSize - 1, Math.floor(index)));
  const step = cardWidth + stackMargin;
  const handWidth = cardWidth + (safeHandSize - 1) * step;
  const slotCenterX = handCenterX - handWidth / 2 + cardWidth / 2 + safeIndex * step;
  const faceCenterY = handBaselineY - cardHeight / 2 + fanY;

  return {
    x: archiveCenter.x - slotCenterX,
    y: archiveCenter.y - faceCenterY,
  };
}
