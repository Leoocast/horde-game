export type TemporalDialLabelPoint = {
  x: number;
  y: number;
};

function compactDegrees(degrees: number): string {
  return Number(degrees.toFixed(2)).toString();
}

export function temporalDialTransform(degrees: number): string {
  return `translate(500 281) rotate(${compactDegrees(degrees)})`;
}

/** Counter-rotates one orbiting label around its own anchor so its baseline stays horizontal. */
export function uprightTemporalDialLabelTransform(
  degrees: number,
  point: TemporalDialLabelPoint,
): string {
  return `rotate(${compactDegrees(-degrees)} ${point.x} ${point.y})`;
}
