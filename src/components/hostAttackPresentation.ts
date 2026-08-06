import type { PersonalAttackAnimationPlan, PersonalCombatAnimationPlan } from "../store/combatAnimation";

/** Default lunges hit the Chronicler HUD immediately. A personal projectile aimed at that HUD
 * defers its visible reaction until the projectile's registered impact. */
export function hostAttackPlayerHitDelay(
  animation?: PersonalCombatAnimationPlan | PersonalAttackAnimationPlan,
): number {
  return animation && "targetKind" in animation && animation.targetKind === "playerLife"
    ? animation.impactMs
    : 0;
}
