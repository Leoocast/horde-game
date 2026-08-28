import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tooltipCenterWithinViewport } from "./tooltipGeometry";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  visible?: boolean;
  className?: string;
  tooltipClassName?: string;
};

export function GameTooltip({
  content,
  children,
  side = "top",
  visible = false,
  className = "",
  tooltipClassName = "",
}: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [interactiveVisible, setInteractiveVisible] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const open = Boolean(content) && (visible || interactiveVisible);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      const center = rect.left + rect.width / 2;
      const tooltipWidth = tooltipRef.current?.getBoundingClientRect().width ?? 0;
      const nextPosition = {
        left: tooltipCenterWithinViewport(center, tooltipWidth, window.innerWidth),
        top: side === "top" ? rect.top - 7 : rect.bottom + 7,
      };
      setPosition((current) => current
        && Math.abs(current.left - nextPosition.left) < 0.1
        && Math.abs(current.top - nextPosition.top) < 0.1
          ? current
          : nextPosition);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [content, open, side, tooltipClassName]);

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setInteractiveVisible(false);
  }

  const tooltipStyle = position
    ? ({ left: position.left, top: position.top } satisfies CSSProperties)
    : ({ left: 0, top: 0, visibility: "hidden" } satisfies CSSProperties);

  return (
    <span
      ref={hostRef}
      className={`game-tooltip-host ${className}`}
      onMouseEnter={() => setInteractiveVisible(true)}
      onMouseLeave={() => setInteractiveVisible(false)}
      onFocusCapture={() => setInteractiveVisible(true)}
      onBlurCapture={handleBlur}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tooltipRef}
              className={[
                "game-tooltip",
                "game-tooltip-portal",
                side === "bottom" ? "game-tooltip-bottom" : "game-tooltip-top",
                "game-tooltip-visible",
                tooltipClassName,
              ].filter(Boolean).join(" ")}
              style={tooltipStyle}
              role="tooltip"
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
