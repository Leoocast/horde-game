import { useGameStore } from "../store/useGameStore";
import { VampireBiteImpact } from "./VampireBiteImpact";

export function DrainEssenceBiteAnimator() {
  const active = useGameStore((state) => state.drainEssenceAnimation);
  const resolve = useGameStore((state) => state.resolveDrainEssenceAnimation);
  const complete = useGameStore((state) => state.completeDrainEssenceAnimation);

  if (!active || active.variant !== "bite") return null;

  return (
    <VampireBiteImpact
      animationId={active.id}
      primarySelector={`[data-card-slot-id="${active.targetId}"]`}
      fallbackAnchor="player"
      onImpact={resolve}
      onComplete={complete}
    />
  );
}
