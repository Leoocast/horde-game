import type { PersonalAttackAnimationPlan } from "../store/combatAnimation";

/** Default lunges hit immediately; personal projectiles defer the Host reaction to their impact. */
export function playerAttackHostHitDelay(
  customAnimation: PersonalAttackAnimationPlan | undefined,
): number {
  return Math.max(0, customAnimation?.impactMs ?? 0);
}
