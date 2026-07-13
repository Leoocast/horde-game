import type { ReactNode } from "react";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  visible?: boolean;
  className?: string;
};

export function GameTooltip({ content, children, side = "top", visible = false, className = "" }: Props) {
  return (
    <span className={`game-tooltip-host ${className}`}>
      {children}
      {content ? (
        <span className={["game-tooltip", side === "bottom" ? "game-tooltip-bottom" : "game-tooltip-top", visible ? "game-tooltip-visible" : ""].join(" ")}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
