import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  visible?: boolean;
  className?: string;
};

export function GameTooltip({ content, children, side = "top", visible = false, className = "" }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [interactiveVisible, setInteractiveVisible] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const open = Boolean(content) && (visible || interactiveVisible);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      const safeHalfWidth = Math.min(180, Math.max(24, window.innerWidth / 2 - 12));
      const center = rect.left + rect.width / 2;
      setPosition({
        left: Math.min(Math.max(center, safeHalfWidth), window.innerWidth - safeHalfWidth),
        top: side === "top" ? rect.top - 7 : rect.bottom + 7,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, side]);

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setInteractiveVisible(false);
  }

  const tooltipStyle = position ? ({ left: position.left, top: position.top } satisfies CSSProperties) : undefined;

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
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <span
              className={["game-tooltip", "game-tooltip-portal", side === "bottom" ? "game-tooltip-bottom" : "game-tooltip-top", "game-tooltip-visible"].join(" ")}
              style={tooltipStyle}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
