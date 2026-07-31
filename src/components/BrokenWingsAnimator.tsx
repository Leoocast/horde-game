import { useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "../store/useGameStore";

const FALLING_FRAGMENTS = [
  { x: 21, y: 42, dx: -14, dy: 68, r: -76, delay: 190, kind: "leaf" },
  { x: 34, y: 50, dx: -7, dy: 82, r: 58, delay: 215, kind: "feather" },
  { x: 45, y: 44, dx: 8, dy: 74, r: -48, delay: 180, kind: "leaf" },
  { x: 56, y: 52, dx: -4, dy: 91, r: 86, delay: 240, kind: "feather" },
  { x: 66, y: 39, dx: 15, dy: 73, r: 48, delay: 205, kind: "leaf" },
  { x: 75, y: 46, dx: 21, dy: 84, r: -92, delay: 255, kind: "feather" },
  { x: 29, y: 56, dx: 2, dy: 76, r: 112, delay: 275, kind: "splinter" },
  { x: 51, y: 59, dx: 17, dy: 65, r: -110, delay: 230, kind: "splinter" },
  { x: 70, y: 54, dx: -11, dy: 78, r: 74, delay: 285, kind: "splinter" },
] as const;

export function BrokenWingsAnimator() {
  const animation = useGameStore((state) => state.brokenWingsAnimation);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!animation) {
      setHost(null);
      return;
    }
    setHost(document.querySelector<HTMLElement>(`[data-card-slot-id="${animation.targetId}"]`));
  }, [animation]);

  if (!animation || !host) return null;

  return createPortal(
    <span key={animation.id} className="broken-wings-vfx" aria-hidden="true">
      <span className="broken-wings-impact-haze" />
      <svg className="broken-wings-slashes" viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${animation.id}-slash`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#2a721e" stopOpacity="0" />
            <stop offset="0.25" stopColor="#5fe443" />
            <stop offset="0.56" stopColor="#c8ff83" />
            <stop offset="0.82" stopColor="#43c938" />
            <stop offset="1" stopColor="#1d641d" stopOpacity="0" />
          </linearGradient>
          <filter id={`${animation.id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          className="broken-wings-slash broken-wings-slash-back"
          pathLength="1"
          d="M -10 111 C 20 91, 49 63, 110 19"
          stroke={`url(#${animation.id}-slash)`}
          filter={`url(#${animation.id}-glow)`}
        />
        <path
          className="broken-wings-slash broken-wings-slash-front"
          pathLength="1"
          d="M -8 124 C 26 97, 56 72, 111 35"
          stroke={`url(#${animation.id}-slash)`}
          filter={`url(#${animation.id}-glow)`}
        />
      </svg>
      <span className="broken-wings-fragments">
        {FALLING_FRAGMENTS.map((fragment, index) => (
          <i
            key={`${fragment.kind}-${index}`}
            className={`broken-wings-fragment broken-wings-fragment-${fragment.kind}`}
            style={{
              "--fragment-x": `${fragment.x}%`,
              "--fragment-y": `${fragment.y}%`,
              "--fragment-dx": `${fragment.dx}px`,
              "--fragment-dy": `${fragment.dy}px`,
              "--fragment-rotation": `${fragment.r}deg`,
              "--fragment-delay": `${fragment.delay}ms`,
            } as CSSProperties}
          />
        ))}
      </span>
    </span>,
    host,
  );
}
