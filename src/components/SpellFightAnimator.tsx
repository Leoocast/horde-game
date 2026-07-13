import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

const FIGHT_DURATION_MS = 500;

export function SpellFightAnimator() {
  const spellFightAnimation = useGameStore((state) => state.spellFightAnimation);

  useEffect(() => {
    if (!spellFightAnimation) return;
    const friendly = document.querySelector<HTMLElement>(`[data-card-slot-id="${spellFightAnimation.friendlyId}"]`);
    const enemy = document.querySelector<HTMLElement>(`[data-card-slot-id="${spellFightAnimation.enemyId}"]`);
    const friendlyCleanup = friendly ? animatePlayerForward(friendly) : undefined;
    const enemyCleanup = enemy ? animateEnemyForward(enemy) : undefined;
    return () => {
      friendlyCleanup?.();
      enemyCleanup?.();
    };
  }, [spellFightAnimation]);

  return null;
}

function animatePlayerForward(element: HTMLElement): () => void {
  return animateTopLunge(element, "0px", "-30px", "26");
}

function animateEnemyForward(element: HTMLElement): () => void {
  return animateTopLunge(element, "0px", "30px", "25");
}

function animateTopLunge(element: HTMLElement, restTop: string, peakTop: string, zIndex: string): () => void {
  const previousZIndex = element.style.zIndex;
  const previousWillChange = element.style.willChange;
  element.style.zIndex = zIndex;
  element.style.willChange = "top, filter";

  const animation = element.animate(
    [
      { top: restTop, filter: "brightness(1)" },
      { top: peakTop, filter: "brightness(1.24) saturate(1.1)", offset: 0.55 },
      { top: restTop, filter: "brightness(1)" },
    ],
    {
      duration: FIGHT_DURATION_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    },
  );

  animation.onfinish = () => {
    element.style.zIndex = previousZIndex;
    element.style.willChange = previousWillChange;
  };

  return () => {
    animation.cancel();
    element.style.zIndex = previousZIndex;
    element.style.willChange = previousWillChange;
  };
}
