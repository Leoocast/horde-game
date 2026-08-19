import { useEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { consumedDefenseArrowLinkIds } from "./battlefieldLayout";

export function useHiddenDefenseLinkIds(game: GameState): ReadonlySet<string> {
  const hostAttackAnimation = useGameStore((state) => state.hostAttackAnimation);
  const [hiddenLinkIds, setHiddenLinkIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (Object.keys(game.combat.blockers).length === 0) setHiddenLinkIds(new Set());
  }, [game.combat.blockers]);

  useEffect(() => {
    const linkIds = consumedDefenseArrowLinkIds(game, hostAttackAnimation);
    if (linkIds.length > 0) hideLinks(linkIds, setHiddenLinkIds);
  }, [game.combat.blockers, hostAttackAnimation]);

  const activeFightLinkIds = consumedDefenseArrowLinkIds(game, hostAttackAnimation);
  if (activeFightLinkIds.length === 0 || activeFightLinkIds.every((linkId) => hiddenLinkIds.has(linkId))) {
    return hiddenLinkIds;
  }
  return new Set([...hiddenLinkIds, ...activeFightLinkIds]);
}

function hideLinks(linkIds: string[], setHiddenLinkIds: (updater: (current: Set<string>) => Set<string>) => void): void {
  setHiddenLinkIds((current) => {
    if (linkIds.every((linkId) => current.has(linkId))) return current;
    const next = new Set(current);
    for (const linkId of linkIds) next.add(linkId);
    return next;
  });
}
