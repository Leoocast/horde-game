import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

const ATTACK_DURATION_MS = 500;

export function HordeAttackAnimator() {
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);

  useEffect(() => {
    if (!hordeAttackAnimation) return;

    const attacker = document.querySelector<HTMLElement>(`[data-card-slot-id="${hordeAttackAnimation.attackerId}"]`);
    if (!attacker) return;

    const attackerCleanup = animateAttacker(attacker);
    const blocker = hordeAttackAnimation.blockerId ? document.querySelector<HTMLElement>(`[data-card-slot-id="${hordeAttackAnimation.blockerId}"]`) : undefined;
    const blockerCleanup = blocker ? animateBlocker(blocker, hordeAttackAnimation.blockerDies) : undefined;

    return () => {
      attackerCleanup();
      blockerCleanup?.();
    };
  }, [hordeAttackAnimation]);

  return null;
}

function animateAttacker(element: HTMLElement): () => void {
  const previousZIndex = element.style.zIndex;
  const previousWillChange = element.style.willChange;
  element.style.zIndex = "25";
  element.style.willChange = "top, filter";

  const animation = element.animate(
    [
      { top: "0px", filter: "brightness(1)" },
      { top: "30px", filter: "brightness(1.18) saturate(1.08)", offset: 0.55 },
      { top: "22px", filter: "brightness(1.12) saturate(1.04)", offset: 0.72 },
      { top: "0px", filter: "brightness(1)" },
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

function animateBlocker(element: HTMLElement, dies: boolean): () => void {
  const previousZIndex = element.style.zIndex;
  const previousWillChange = element.style.willChange;
  element.style.zIndex = "24";
  element.style.willChange = "top, opacity, filter";

  const animation = element.animate(
    dies
      ? [
          { top: "0px", opacity: 1, filter: "brightness(1)" },
          { top: "-22px", opacity: 0.95, filter: "brightness(1.3) saturate(1.1)", offset: 0.45 },
          { top: "-18px", opacity: 0, filter: "brightness(0.45) saturate(0.55)" },
        ]
      : [
          { top: "0px", filter: "brightness(1)" },
          { top: "-22px", filter: "brightness(1.22) saturate(1.08)", offset: 0.52 },
          { top: "-12px", filter: "brightness(1.08)", offset: 0.72 },
          { top: "0px", filter: "brightness(1)" },
        ],
    {
      duration: ATTACK_DURATION_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    },
  );

  animation.onfinish = () => {
    element.style.zIndex = previousZIndex;
    element.style.willChange = previousWillChange;
    if (dies) {
      element.style.opacity = "0";
      element.style.visibility = "hidden";
    }
  };

  return () => {
    animation.cancel();
    element.style.zIndex = previousZIndex;
    element.style.willChange = previousWillChange;
    if (dies) {
      element.style.opacity = "0";
      element.style.visibility = "hidden";
    }
  };
}
