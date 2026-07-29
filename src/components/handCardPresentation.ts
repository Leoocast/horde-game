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
