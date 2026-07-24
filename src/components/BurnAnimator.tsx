import { useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "../store/useGameStore";

type BurnGeometry = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

const SPARK_COUNT = 7;

export function BurnAnimator() {
  const burn = useGameStore((state) => state.burnAnimation);
  const [geometry, setGeometry] = useState<BurnGeometry>();

  useLayoutEffect(() => {
    if (!burn) {
      setGeometry(undefined);
      return;
    }
    const source = burn.sourceId
      ? document.querySelector<HTMLElement>(`[data-card-slot-id="${burn.sourceId}"]`)
      : undefined;
    const target = document.querySelector<HTMLElement>(`[data-card-slot-id="${burn.targetId}"]`);
    if (!target) return;
    const sourceRect = source?.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setGeometry({
      startX: sourceRect ? sourceRect.left + sourceRect.width / 2 : window.innerWidth * 0.5,
      startY: sourceRect ? sourceRect.top + sourceRect.height / 2 : window.innerHeight * 0.28,
      endX: targetRect.left + targetRect.width / 2,
      endY: targetRect.top + targetRect.height / 2,
    });
  }, [burn]);

  if (!burn || !geometry) return null;
  const dx = geometry.endX - geometry.startX;
  const dy = geometry.endY - geometry.startY;
  // The tail streak and the flame licks trail behind the core, so they need the travel heading.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const style = {
    "--burn-start-x": `${geometry.startX}px`,
    "--burn-start-y": `${geometry.startY}px`,
    "--burn-dx": `${dx}px`,
    "--burn-dy": `${dy}px`,
    "--burn-mid-x": `${dx * 0.68}px`,
    "--burn-mid-y": `${dy * 0.68 - Math.min(64, Math.abs(dx) * 0.16)}px`,
    "--burn-end-x": `${geometry.endX}px`,
    "--burn-end-y": `${geometry.endY}px`,
    "--burn-angle": `${angle}deg`,
  } as CSSProperties;

  return createPortal(
    <div key={burn.id} className="burn-animation-layer" style={style} aria-hidden="true">
      <span className="burn-projectile">
        <span className="burn-projectile-trail" />
        <span className="burn-projectile-flame">
          <i />
          <i />
          <i />
        </span>
        <span className="burn-projectile-core" />
      </span>
      <span className="burn-impact-ring">
        <i />
      </span>
      <span className="burn-impact-sparks">
        {Array.from({ length: SPARK_COUNT }, (_, index) => (
          <i key={index} style={{ "--burn-spark-angle": `${(360 / SPARK_COUNT) * index + 12}deg` } as CSSProperties} />
        ))}
      </span>
      <span className="burn-damage-number">-{burn.amount}</span>
    </div>,
    document.body,
  );
}
