import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

export function HordeAttackAnimator() {
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);

  useEffect(() => {
    if (!hordeAttackAnimation) return;

    const element = document.querySelector<HTMLElement>(`[data-card-slot-id="${hordeAttackAnimation.attackerId}"]`);
    if (!element) return;

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
        duration: 500,
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
  }, [hordeAttackAnimation]);

  return null;
}
