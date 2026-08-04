export const PRINTED_CARD_WIDTH = 976;

export type CardStatFrame = {
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function cqw(value: number) {
  return `${(value / PRINTED_CARD_WIDTH) * 100}cqw`;
}

export function cardStatFrameCssVariables(
  frame?: CardStatFrame,
): Record<string, string> {
  if (!frame) return {};
  const values = [frame.right, frame.bottom, frame.width, frame.height];
  if (!values.every(Number.isFinite) || frame.width <= 0 || frame.height <= 0) return {};
  return {
    "--card-stat-right": cqw(frame.right),
    "--card-stat-bottom": cqw(frame.bottom),
    "--card-stat-width": cqw(frame.width),
    "--card-stat-height": cqw(frame.height),
  };
}
