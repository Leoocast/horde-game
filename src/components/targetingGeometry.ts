export type RectangleBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type Point = {
  x: number;
  y: number;
};

export function rectanglesOverlap(first: RectangleBounds, second: RectangleBounds): boolean {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

export function shouldRevealOverlappedTargets(
  source: RectangleBounds,
  targets: RectangleBounds[],
  pointer: Point,
): boolean {
  const pointerInsideSource =
    pointer.x >= source.left &&
    pointer.x <= source.right &&
    pointer.y >= source.top &&
    pointer.y <= source.bottom;
  return pointerInsideSource && targets.some((target) => rectanglesOverlap(source, target));
}
