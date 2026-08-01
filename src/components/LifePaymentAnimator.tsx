import { useGameStore } from "../store/useGameStore";
import { VampireBiteImpact } from "./VampireBiteImpact";

export function LifePaymentAnimator() {
  const active = useGameStore((state) => state.lifePaymentAnimation);
  const complete = useGameStore((state) => state.completeLifePaymentAnimation);

  if (!active) return null;

  return (
    <VampireBiteImpact
      animationId={active.id}
      primarySelector='[data-player-life-emblem="true"]'
      fallbackSelector='[data-player-life-panel="true"]'
      fallbackAnchor="player"
      onComplete={complete}
    />
  );
}
