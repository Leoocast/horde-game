import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

const ATTACK_DURATION_MS = 500;

export function PlayerAttackAnimator() {
  const playerAttackAnimation = useGameStore((state) => state.playerAttackAnimation);

  useEffect(() => {
    if (!playerAttackAnimation) return;

    const attacker = document.querySelector<HTMLElement>(`[data-card-slot-id="${playerAttackAnimation.attackerId}"]`);
    if (!attacker) return;

    const cleanup = animateAttacker(attacker);
    return cleanup;
  }, [playerAttackAnimation]);

  return null;
}

function animateAttacker(element: HTMLElement): () => void {
  const previousZIndex = element.style.zIndex;
  const previousWillChange = element.style.willChange;
  element.style.zIndex = "26";
  element.style.willChange = "top, filter";

  const animation = element.animate(
    [
      { top: "-18px", filter: "brightness(1)" },
      { top: "-48px", filter: "brightness(1.25) saturate(1.1)", offset: 0.55 },
      { top: "-34px", filter: "brightness(1.12)", offset: 0.72 },
      { top: "-18px", filter: "brightness(1)" },
    ],
    {
      duration: ATTACK_DURATION_MS,
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
