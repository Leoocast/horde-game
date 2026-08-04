import { useEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

const HOST_ATTACK_LINK_CLEAR_MS = 470;

export function useHiddenDefenseLinkIds(game: GameState): ReadonlySet<string> {
  const hostAttackAnimation = useGameStore((state) => state.hostAttackAnimation);
  const [hiddenLinkIds, setHiddenLinkIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (Object.keys(game.combat.blockers).length === 0) setHiddenLinkIds(new Set());
  }, [game.combat.blockers]);

  useEffect(() => {
    if (!hostAttackAnimation?.blockerId) return;
    const currentLinkId = `${hostAttackAnimation.attackerId}-${hostAttackAnimation.blockerId}`;
    const linkIds = hostAttackAnimation.attackerDies
      ? (game.combat.blockers[hostAttackAnimation.attackerId] ?? []).map(
          (blockerId) => `${hostAttackAnimation.attackerId}-${blockerId}`,
        )
      : hostAttackAnimation.blockerDies
        ? [currentLinkId]
        : [];

    if (linkIds.length > 0) {
      hideLinks(linkIds, setHiddenLinkIds);
      return;
    }

    const timeout = window.setTimeout(() => {
      hideLinks([currentLinkId], setHiddenLinkIds);
    }, HOST_ATTACK_LINK_CLEAR_MS);
    return () => window.clearTimeout(timeout);
  }, [game.combat.blockers, hostAttackAnimation]);

  return hiddenLinkIds;
}

function hideLinks(linkIds: string[], setHiddenLinkIds: (updater: (current: Set<string>) => Set<string>) => void): void {
  setHiddenLinkIds((current) => {
    if (linkIds.every((linkId) => current.has(linkId))) return current;
    const next = new Set(current);
    for (const linkId of linkIds) next.add(linkId);
    return next;
  });
}
