import { useGameStore } from "../store/useGameStore";
import { VampireBiteImpact } from "./VampireBiteImpact";

export function LifestealAttackAnimator() {
  const activeAnimations = useGameStore((state) => state.lifestealAttackAnimations);
  const complete = useGameStore((state) => state.completeLifestealAttackAnimation);

  return (
    <>
      {activeAnimations.map((animation) => (
        <VampireBiteImpact
          key={animation.id}
          animationId={animation.id}
          primarySelector='[data-host-life-emblem="true"]'
          fallbackSelector='[data-host-life-panel="true"]'
          fallbackAnchor="host"
          onComplete={complete}
          playSound={false}
        />
      ))}
    </>
  );
}
