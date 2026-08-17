import type { GuidedCalloutPlacement, GuidedHighlightRole } from "./contracts";

export type GuidedRect = Readonly<{
  key: string;
  role: GuidedHighlightRole;
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type GuidedSize = Readonly<{ width: number; height: number }>;
export type GuidedPoint = Readonly<{ left: number; top: number }>;
export type GuidedBounds = Readonly<{ left: number; top: number; width: number; height: number }>;

const VIEWPORT_MARGIN = 16;
const TARGET_GAP = 22;

/** Includes visual controls that deliberately overflow their semantic anchor, such as an Echo's Action button. */
export function guidedUnionBounds(
  rects: readonly Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">[],
): GuidedBounds | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return Object.freeze({ left, top, width: right - left, height: bottom - top });
}

export function paddedGuidedRect(
  key: string,
  role: GuidedHighlightRole,
  rect: Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">,
  padding = 8,
): GuidedRect {
  return Object.freeze({
    key,
    role,
    left: Math.round((rect.left - padding) * 2) / 2,
    top: Math.round((rect.top - padding) * 2) / 2,
    width: Math.max(1, Math.round((rect.width + padding * 2) * 2) / 2),
    height: Math.max(1, Math.round((rect.height + padding * 2) * 2) / 2),
  });
}

export function placeGuidedCallout(
  viewport: GuidedSize,
  callout: GuidedSize,
  targets: readonly GuidedRect[],
  preferredPlacement: GuidedCalloutPlacement = "auto",
): GuidedPoint {
  const safeWidth = Math.min(callout.width, Math.max(0, viewport.width - VIEWPORT_MARGIN * 2));
  const safeHeight = Math.min(callout.height, Math.max(0, viewport.height - VIEWPORT_MARGIN * 2));
  if (targets.length === 0) {
    return Object.freeze({
      left: Math.max(VIEWPORT_MARGIN, (viewport.width - safeWidth) / 2),
      top: Math.max(VIEWPORT_MARGIN, (viewport.height - safeHeight) / 2),
    });
  }

  const bounds = unionRect(targets);
  if (preferredPlacement === "center") {
    return Object.freeze({
      left: Math.max(VIEWPORT_MARGIN, (viewport.width - safeWidth) / 2),
      top: Math.max(VIEWPORT_MARGIN, (viewport.height - safeHeight) / 2),
    });
  }
  const candidates: Array<Readonly<{ placement: Exclude<GuidedCalloutPlacement, "auto" | "center">; point: GuidedPoint }>> = [
    { placement: "top", point: { left: bounds.left + (bounds.width - safeWidth) / 2, top: bounds.top - safeHeight - TARGET_GAP } },
    { placement: "right", point: { left: bounds.left + bounds.width + TARGET_GAP, top: bounds.top + (bounds.height - safeHeight) / 2 } },
    { placement: "bottom", point: { left: bounds.left + (bounds.width - safeWidth) / 2, top: bounds.top + bounds.height + TARGET_GAP } },
    { placement: "left", point: { left: bounds.left - safeWidth - TARGET_GAP, top: bounds.top + (bounds.height - safeHeight) / 2 } },
  ];

  const placed = candidates.map((candidate, index) => {
    const clamped = clampPoint(candidate.point, viewport, { width: safeWidth, height: safeHeight });
    const calloutRect: GuidedRect = { key: "callout", role: "focus", ...clamped, width: safeWidth, height: safeHeight };
    const overlap = targets.reduce((total, target) => total + intersectionArea(calloutRect, target), 0);
    const displacement = Math.abs(clamped.left - candidate.point.left) + Math.abs(clamped.top - candidate.point.top);
    const preference = preferredPlacement === "auto" ? index : candidate.placement === preferredPlacement ? 0 : index + 20;
    return { point: clamped, score: overlap * 100 + displacement + preference };
  });
  placed.sort((left, right) => left.score - right.score);
  return Object.freeze(placed[0].point);
}

/** Places an upward cue over a card while keeping its motion contained inside the card silhouette. */
export function guidedDirectionalCueBounds(target: GuidedRect): GuidedBounds {
  const width = Math.max(34, Math.min(52, target.width * 0.3));
  const height = Math.max(76, target.height * 0.72);
  return Object.freeze({
    left: target.left + (target.width - width) / 2,
    top: target.top + target.height * 0.12,
    width,
    height,
  });
}

export function guidedConnectorPath(targets: readonly GuidedRect[]): string | undefined {
  const origin = targets.find((target) => target.role === "origin");
  const destination = targets.find((target) => target.role === "destination");
  if (!origin || !destination) return undefined;
  const startX = origin.left + origin.width / 2;
  const startY = origin.top + origin.height / 2;
  const endX = destination.left + destination.width / 2;
  const endY = destination.top + destination.height / 2;
  const vertical = Math.abs(endY - startY) >= Math.abs(endX - startX);
  const controlA = vertical
    ? { x: startX, y: startY + (endY - startY) * 0.45 }
    : { x: startX + (endX - startX) * 0.45, y: startY };
  const controlB = vertical
    ? { x: endX, y: startY + (endY - startY) * 0.55 }
    : { x: startX + (endX - startX) * 0.55, y: endY };
  return `M ${round(startX)} ${round(startY)} C ${round(controlA.x)} ${round(controlA.y)}, ${round(controlB.x)} ${round(controlB.y)}, ${round(endX)} ${round(endY)}`;
}

export function guidedRectsEqual(left: readonly GuidedRect[], right: readonly GuidedRect[]): boolean {
  return left.length === right.length && left.every((rect, index) => {
    const other = right[index];
    return Boolean(other) && rect.key === other.key && rect.role === other.role && rect.left === other.left &&
      rect.top === other.top && rect.width === other.width && rect.height === other.height;
  });
}

function unionRect(rects: readonly GuidedRect[]): GuidedRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { key: "union", role: "focus", left, top, width: right - left, height: bottom - top };
}

function clampPoint(point: GuidedPoint, viewport: GuidedSize, size: GuidedSize): GuidedPoint {
  return {
    left: Math.min(Math.max(VIEWPORT_MARGIN, point.left), Math.max(VIEWPORT_MARGIN, viewport.width - size.width - VIEWPORT_MARGIN)),
    top: Math.min(Math.max(VIEWPORT_MARGIN, point.top), Math.max(VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN)),
  };
}

function intersectionArea(left: GuidedRect, right: GuidedRect): number {
  const width = Math.max(0, Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top));
  return width * height;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
