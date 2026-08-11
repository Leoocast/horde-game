import { useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import {
  EnergyFlowImpact,
  EnergyFlowTravel,
  energyFlowPathBetween,
  type EnergyFlowPath,
} from "./EnergyFlowVfx";

export function EnergyFlowAnimator() {
  const animation = useGameStore((state) => state.energyFlowAnimation);
  const resolve = useGameStore((state) => state.resolveEnergyFlowAnimation);
  const complete = useGameStore((state) => state.completeEnergyFlowAnimation);
  const reduceMotion = useReducedMotion();
  const [path, setPath] = useState<EnergyFlowPath | null>(null);

  useLayoutEffect(() => {
    if (!animation) {
      setPath(null);
      return;
    }
    setPath(readEnergyPath(animation.sourceId));
  }, [animation?.id, animation?.sourceId]);

  useEffect(() => {
    if (!animation || animation.phase !== "impact") return;
    const timer = window.setTimeout(() => complete(animation.id), reduceMotion ? 110 : 240);
    return () => window.clearTimeout(timer);
  }, [animation, complete, reduceMotion]);

  if (!animation || !path) return null;

  return (
    <div className="mana-flow-vfx" aria-hidden="true">
      {animation.phase === "travel" ? (
        <EnergyFlowTravel
          id={animation.id}
          path={path}
          reduceMotion={Boolean(reduceMotion)}
          onComplete={() => resolve(animation.id)}
        />
      ) : (
        <EnergyFlowImpact target={path.target} />
      )}
    </div>
  );
}

function readEnergyPath(sourceId: string): EnergyFlowPath {
  const sourceRect = document.querySelector<HTMLElement>(`[data-card-slot-id="${sourceId}"]`)?.getBoundingClientRect();
  const targetRect =
    document.querySelector<HTMLElement>("[data-energy-kind='stored'][data-energy-state='empty']")?.getBoundingClientRect() ??
    document.querySelector<HTMLElement>("[data-energy-track='stored']")?.getBoundingClientRect() ??
    document.querySelector<HTMLElement>("[data-player-mana-core='true']")?.getBoundingClientRect();
  const origin = sourceRect
    ? { x: sourceRect.left + sourceRect.width * 0.5, y: sourceRect.top + sourceRect.height * 0.68 }
    : { x: window.innerWidth * 0.5, y: window.innerHeight * 0.64 };
  const target = targetRect
    ? { x: targetRect.left + targetRect.width * 0.5, y: targetRect.top + targetRect.height * 0.5 }
    : { x: 130, y: window.innerHeight - 82 };
  return energyFlowPathBetween(origin, target);
}
