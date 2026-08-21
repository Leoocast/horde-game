import type { GameStore } from "../store/useGameStore";

/**
 * Un checkpoint sólo representa reglas ya asentadas. Selecciones visuales simples se omiten del
 * save, pero cualquier beat, commit diferido o elección que pueda cambiar reglas lo vuelve inseguro.
 */
export function isSafeResumeCheckpoint(state: GameStore): boolean {
  const game = state.game;
  if (game.winner) return false;
  if (game.eventQueue.length > 0 || game.host.pendingCard) return false;
  if (
    game.combat.playerAttackers.length > 0 ||
    game.combat.hostAttackers.length > 0 ||
    Object.keys(game.combat.blockers).length > 0 ||
    game.combat.pendingDamageVolleys.length > 0
  ) return false;
  return !(
    state.hostAttackAnimation ||
    state.burnAnimation ||
    state.lifePaymentAnimation ||
    state.lifestealAttackAnimations.length > 0 ||
    state.poisonAttackAnimation ||
    state.poisonConsumeAnimation ||
    state.bloodPactAnimation ||
    state.drainEssenceAnimation ||
    state.finalBanquetAnimation ||
    state.energyFlowAnimation ||
    state.deathRevealCard ||
    state.hostSpellCard ||
    state.pendingStaticAuras.length > 0 ||
    state.playerAttackAnimation ||
    state.resolvingHostCombat ||
    state.summoningAnimationCount > 0 ||
    state.pendingTriggeredEffectCount > 0 ||
    state.hostAutoTriggerCount > 0 ||
    state.playerAutoTriggerCount > 0 ||
    state.surgeTransitionActive ||
    state.surgeRevealPending ||
    state.hostMillAnimationQueue.length > 0 ||
    state.hostMillPreviewCards.length > 0 ||
    state.playerDiscardAnimationQueue.length > 0 ||
    state.landPlayAnimationQueue.length > 0 ||
    state.energyRecycleAnimation ||
    state.handLimitDiscardActive ||
    state.counterTargeting ||
    state.tributeOfTheFourSorrowsCard ||
    state.tributeOfTheFourSorrowsSelection ||
    state.spellTargeting ||
    state.spellFightAnimation ||
    state.rootsTouchedSkyAnimation ||
    state.pendingSpellHandId ||
    state.buffAnimationEventId ||
    state.lifeBuffAnimationId
  );
}
