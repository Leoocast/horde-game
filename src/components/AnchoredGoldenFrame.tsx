import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  guidedAnchorRegistry,
  guidedCardAnchorKey,
  guidedSurfaceAnchorKey,
  type GuidedSurfaceAnchor,
} from "../guidance";

type Target = Readonly<{
  kind: "surface";
  anchor: GuidedSurfaceAnchor;
  padding?: number;
}> | Readonly<{
  kind: "card";
  instanceId: string;
  padding?: number;
}>;

const subscribeAnchors = (listener: () => void) => guidedAnchorRegistry.subscribe(listener);
const readAnchors = () => guidedAnchorRegistry.snapshot();

/** Canonical Marco Dorado: one material for cards, buttons and semantic surfaces. */
export function AnchoredGoldenFrame({
  target,
  className = "",
}: {
  target: Target;
  className?: string;
}) {
  const anchors = useSyncExternalStore(subscribeAnchors, readAnchors, readAnchors);
  const [rect, setRect] = useState<DOMRect>();
  const rectRef = useRef<DOMRect | undefined>(undefined);
  const key = target.kind === "card" ? guidedCardAnchorKey(target.instanceId) : guidedSurfaceAnchorKey(target.anchor);

  useLayoutEffect(() => {
    const element = guidedAnchorRegistry.preferred(key);
    if (!element) {
      setRect(undefined);
      rectRef.current = undefined;
      return;
    }
    let frame = 0;
    const measure = () => {
      const next = element.getBoundingClientRect();
      const previous = rectRef.current;
      if (!previous || previous.left !== next.left || previous.top !== next.top || previous.width !== next.width || previous.height !== next.height) {
        rectRef.current = next;
        setRect(next);
      }
      frame = window.requestAnimationFrame(measure);
    };
    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [anchors.revision, key]);

  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const padding = target.padding ?? 7;
  return (
    <span
      className={`guided-tutorial-ring anchored-golden-frame ${className}`}
      data-tone="gold"
      data-anchor-key={key}
      style={{
        left: rect.left - padding,
        top: rect.top - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }}
      aria-hidden="true"
    />
  );
}
