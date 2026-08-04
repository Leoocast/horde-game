export const CARD_IMAGE_WIDTH = 976;
export const CARD_IMAGE_HEIGHT = 1360;

export const LARGE_CARD_DISPLAY_WIDTH = CARD_IMAGE_WIDTH / 2;
export const LARGE_CARD_DISPLAY_HEIGHT = CARD_IMAGE_HEIGHT / 2;

export const HAND_CARD_DISPLAY_WIDTH = CARD_IMAGE_WIDTH / 4;
export const HAND_CARD_DISPLAY_HEIGHT = CARD_IMAGE_HEIGHT / 4;

export const HOVER_CARD_DISPLAY_WIDTH = CARD_IMAGE_WIDTH * 3 / 8;
export const HOVER_CARD_DISPLAY_HEIGHT = CARD_IMAGE_HEIGHT * 3 / 8;

const CARD_ASPECT_WIDTH_UNIT = 61;
const CARD_ASPECT_HEIGHT_UNIT = 85;
const MIN_PREVIEW_ASPECT_UNITS = 2;

export function fitHoverCardDisplay(maxWidth: number): { width: number; height: number } {
  const boundedWidth = Math.min(HOVER_CARD_DISPLAY_WIDTH, Math.floor(maxWidth));
  const aspectUnits = Math.max(
    MIN_PREVIEW_ASPECT_UNITS,
    Math.floor(boundedWidth / CARD_ASPECT_WIDTH_UNIT),
  );

  return {
    width: aspectUnits * CARD_ASPECT_WIDTH_UNIT,
    height: aspectUnits * CARD_ASPECT_HEIGHT_UNIT,
  };
}
