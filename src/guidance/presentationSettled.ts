import type { GameStore } from "../store/useGameStore";
import type { GuidedPresentationActivitySnapshot } from "./presentationActivity";

/**
 * Unlike a resume checkpoint, a guided checkpoint may intentionally retain queued effects,
 * combat selections or a manual target choice. Only work that is already presenting or whose
 * rules commit is still in flight prevents the guide from speaking.
 */
export function guidedPresentationBlockers(
  state: GameStore,
  activity: GuidedPresentationActivitySnapshot,
): readonly string[] {
  const blockers: string[] = [];
  if (activity.activeCount > 0) blockers.push(...activity.active.map(({ kind, detail }) => detail ? `${kind}:${detail}` : kind));
  if (state.hostAttackAnimation) blockers.push("host.attack");
  if (state.burnAnimation) blockers.push("burn");
  if (state.lifePaymentAnimation) blockers.push("life.payment");
  if (state.lifestealAttackAnimations.length > 0) blockers.push("lifesteal.attack");
  if (state.poisonAttackAnimation) blockers.push("poison.attack");
  if (state.poisonConsumeAnimation) blockers.push("poison.consume");
  if (state.bloodPactAnimation) blockers.push("blood.pact");
  if (state.drainEssenceAnimation) blockers.push("drain.essence");
  if (state.finalBanquetAnimation) blockers.push("final.banquet");
  if (state.energyFlowAnimation) blockers.push("energy.flow");
  if (state.deathRevealCard) blockers.push("death.reveal");
  if (state.hostSpellCard) blockers.push("host.spell");
  if (state.playerAttackAnimation) blockers.push("player.attack");
  if (state.summoningAnimationCount > 0) blockers.push("summoning");
  if (state.surgeTransitionActive) blockers.push("surge.transition");
  if (state.hostMillAnimationQueue.length > 0) blockers.push("host.archive.discard");
  if (state.hostMillPreviewCards.length > 0) blockers.push("host.archive.preview");
  if (state.playerDiscardAnimationQueue.length > 0) blockers.push("player.discard");
  if (state.landPlayAnimationQueue.length > 0) blockers.push("source.entry");
  if (state.energyRecycleAnimation) blockers.push("source.recycle");
  if (state.spellFightAnimation) blockers.push("spell.fight");
  if (state.rootsTouchedSkyAnimation) blockers.push("roots.touched.sky");
  if (state.pendingSpellHandId) blockers.push("spell.pending");
  if (state.buffAnimationCardIds.length > 0) blockers.push("buff");
  if (state.lifeBuffAnimationId) blockers.push("life.buff");
  if (state.autoPaidLandAnimation) blockers.push("energy.auto-pay");
  if (state.energyRecycleDragActive || state.blockDrag || state.playerAttackDrag) blockers.push("drag");
  return Object.freeze(blockers);
}

export function isGuidedPresentationSettled(
  state: GameStore,
  activity: GuidedPresentationActivitySnapshot,
): boolean {
  return guidedPresentationBlockers(state, activity).length === 0;
}
