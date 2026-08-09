import type { PersonalAttackAnimationPlan, PersonalCombatAnimationPlan } from "../store/combatAnimation";
import { useGameStore } from "../store/useGameStore";
import { VampireBiteImpact } from "./VampireBiteImpact";

const ignoreCompletion = () => undefined;

export function PersonalBiteAttackAnimator() {
  const playerAttack = useGameStore((state) => state.playerAttackAnimation);
  const spellAttack = useGameStore((state) => state.spellFightAnimation);
  const playerPlan = playerAttack?.customAnimation;
  const spellPlan = spellAttack?.customAnimation;

  return (
    <>
      {playerPlan?.effect.type === "bite" && (
        <BiteAttack
          animationId={`player-bite-${playerAttack?.attackerId}-${playerAttack?.eventId}`}
          plan={playerPlan}
        />
      )}
      {spellPlan?.effect.type === "bite" && (
        <BiteAttack
          animationId={`spell-bite-${spellAttack?.eventId}`}
          plan={spellPlan}
        />
      )}
    </>
  );
}

function BiteAttack({
  animationId,
  plan,
}: {
  animationId: string;
  plan: PersonalAttackAnimationPlan | PersonalCombatAnimationPlan;
}) {
  if (plan.effect.type !== "bite") return null;
  const targetsCard = "targetId" in plan;
  const targetsPlayer = "targetKind" in plan && plan.targetKind === "playerLife";
  const primarySelector = targetsCard
    ? `[data-card-slot-id="${plan.targetId}"]`
    : targetsPlayer
      ? '[data-player-life-emblem="true"]'
      : '[data-host-life-emblem="true"]';
  const fallbackSelector = targetsCard
    ? undefined
    : targetsPlayer
      ? '[data-player-life-panel="true"]'
      : '[data-host-life-panel="true"]';

  return (
    <VampireBiteImpact
      animationId={animationId}
      primarySelector={primarySelector}
      fallbackSelector={fallbackSelector}
      fallbackAnchor={targetsPlayer ? "player" : "host"}
      impactMs={plan.impactMs}
      onComplete={ignoreCompletion}
      playSound={false}
      variant={plan.effect.variant}
    />
  );
}
