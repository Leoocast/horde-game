import type { CardInstance, GameState } from "../engine/GameTypes";
import { cardStatState } from "../utils/selectors";

/**
 * Pure layout rules for the battlefield rows.
 *
 * These live outside `Battlefield.tsx` because they are the part of the board that has to stay
 * still while the Horde's attack sequence plays: they decide which cards share a stack, in which
 * order the stacks sit in the row, and which slots are held open for cards that already died.
 * Keeping them here means a regression can be reproduced in `tests/battlefieldLayout.test.js`
 * instead of only by playing a full Horde turn.
 */

export type GroupMeta = { order: number; suborder: number; anchorId: string };

export type CardGroup = { key: string; cards: CardInstance[] };

/**
 * A mutable box, so callers can pass a React ref straight in. Deliberately structural: the tests
 * hand in plain `{ current: ... }` objects.
 */
export type MutableBox<T> = { current: T };

export function isZombieToken(card: CardInstance): boolean {
  return card.isToken && card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
}

export function isGoblinToken(card: CardInstance): boolean {
  return card.controller === "horde"
    && card.isToken
    && card.subtypes.some((subtype) => subtype.toLowerCase() === "goblin");
}

export function isSwarmToken(card: CardInstance): boolean {
  return isZombieToken(card) || isGoblinToken(card);
}

export function groupBattlefieldCopies(
  game: GameState,
  cards: CardInstance[],
  cardOrder: Map<string, number>,
  familyOrder: Map<string, number>,
  swarmWaveByCardId: Map<string, number>,
  swarmWaveOrder: Map<number, number>,
  keepSeparateCardIds?: Set<string>,
  lastGroupKeys?: Map<string, string>,
  groupMeta?: Map<string, GroupMeta>,
  // Stats move constantly while combat resolves: a dying lord drops its static buff off every
  // creature it covered. Grouping by stats then would re-key and remount whole stacks mid-
  // sequence, which reads as the board reorganising itself. While the Horde sequence runs,
  // each card keeps the grouping key it already had (frozen in `lastGroupKeys`): stacks
  // neither merge nor split mid-sequence — cards with different stats must never collapse
  // into one stack — and the grouping settles once, at the end.
  stableGrouping = false,
): CardGroup[] {
  const groups = new Map<string, { cards: CardInstance[]; order: number; suborder: number }>();
  const groupOfCard = new Map<string, string>();
  const stackZombieTokens = cards.length > 7;

  for (const card of cards) {
    const zombieToken = isZombieToken(card);
    const goblinToken = isGoblinToken(card);
    const swarmToken = zombieToken || goblinToken;
    const stats = cardStatState(game, card);
    const visualStatsKey = `${stats.text}-${stats.damaged ? "damaged" : "healthy"}-${stats.buffed ? "buffed" : "base"}`;
    const swarmWaveId = swarmWaveByCardId.get(card.instanceId);
    const frozenKey = stableGrouping ? lastGroupKeys?.get(card.instanceId) : undefined;
    const groupingKey =
      frozenKey ??
      (keepSeparateCardIds?.has(card.instanceId)
        ? `pending-trigger-${card.instanceId}`
        : zombieToken && !stackZombieTokens
        ? `instance-${card.instanceId}`
        : swarmToken
          ? `swarm-wave-${swarmWaveId ?? card.instanceId}-${card.definitionId}-${visualStatsKey}`
          : `copy-${card.definitionId}-${visualStatsKey}`);
    lastGroupKeys?.set(card.instanceId, groupingKey);
    groupOfCard.set(card.instanceId, groupingKey);
    const instanceOrder = cardOrder.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    const order = swarmToken
      ? swarmWaveId === undefined
        ? instanceOrder
        : (swarmWaveOrder.get(swarmWaveId) ?? instanceOrder)
      : (familyOrder.get(card.definitionId) ?? instanceOrder);
    const group = groups.get(groupingKey);
    if (group) {
      group.cards.push(card);
      group.suborder = Math.min(group.suborder, instanceOrder);
    } else {
      groups.set(groupingKey, { cards: [card], order, suborder: instanceOrder });
    }
  }

  // A stack keeps the row position and React identity it was born with for as long as it
  // exists. Recomputing them from the current members meant a death inside a stack could
  // raise its suborder past a sibling stack (the two swap places) or change its anchor
  // member (React remounts the stack) — the row must never reorder because something died.
  const orderedGroups = Array.from(groups.entries()).map(([groupingKey, group]) => {
    const remembered = groupMeta?.get(groupingKey);
    const computedAnchor = group.cards.reduce((oldest, card) =>
      (cardOrder.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER) < (cardOrder.get(oldest.instanceId) ?? Number.MAX_SAFE_INTEGER) ? card : oldest,
    );
    // A dead anchor keeps naming its stack (no collision — it is in no group). An anchor that
    // MOVED to another stack must be replaced, or two stacks would share one React key.
    const anchorDefected = remembered && groupOfCard.has(remembered.anchorId) && groupOfCard.get(remembered.anchorId) !== groupingKey;
    const meta: GroupMeta = remembered && !anchorDefected
      ? { ...remembered, suborder: Math.min(remembered.suborder, group.suborder) }
      : {
          order: remembered?.order ?? group.order,
          suborder: remembered ? Math.min(remembered.suborder, group.suborder) : group.suborder,
          anchorId: computedAnchor.instanceId,
        };
    groupMeta?.set(groupingKey, meta);
    return { meta, cards: group.cards };
  });
  if (groupMeta) {
    for (const key of Array.from(groupMeta.keys())) {
      if (!groups.has(key)) groupMeta.delete(key);
    }
  }

  return orderedGroups
    .sort((left, right) => left.meta.order - right.meta.order || left.meta.suborder - right.meta.suborder)
    .map(({ meta, cards: groupedCards }) => ({ key: `anchor-${meta.anchorId}`, cards: groupedCards }));
}

/**
 * Returns the row's cards with combat casualties still in it while the Horde combat sequence runs.
 * Refs are read and written during render on purpose: the ghost has to exist in the very first
 * render after the card left game state, otherwise the row re-centers for one frame.
 */
export function holdCombatCasualties(
  cards: CardInstance[],
  holdCasualties: boolean,
  casualties: MutableBox<Map<string, CardInstance>>,
  previousCards: MutableBox<CardInstance[]>,
  cardOrder: MutableBox<Map<string, number>>,
): CardInstance[] {
  const liveIds = new Set(cards.map((card) => card.instanceId));
  if (holdCasualties) {
    for (const card of previousCards.current) {
      if (!liveIds.has(card.instanceId) && !casualties.current.has(card.instanceId)) {
        casualties.current.set(card.instanceId, card);
      }
    }
    // A creature arriving mid-combat takes over a held slot rather than landing past the gap the
    // casualty left, which read as the card entering after a hole. Rightmost held slot first.
    //
    // Creatures only, on BOTH sides of the swap. `cardOrder` is the creature row's registry:
    // `renderCardStacks` is called with the creature row alone and prunes everything else out of
    // it on every render, so lands and other permanents (Graf Harvest, a player's Forests) look
    // like brand-new arrivals on every single render. Without this guard the first one of them
    // consumed the ghost the instant a creature died — the held slot vanished mid-sequence and
    // the whole row re-centered, which is exactly the "everything regroups when something dies"
    // bug. They also have no business inheriting a creature's slot in the first place.
    for (const card of cards) {
      if (!isHeldRowCard(card)) continue;
      if (cardOrder.current.has(card.instanceId)) continue;
      let recycledId: string | undefined;
      let recycledOrder = Number.NEGATIVE_INFINITY;
      for (const [ghostId, ghost] of casualties.current) {
        if (!isHeldRowCard(ghost)) continue;
        const order = cardOrder.current.get(ghostId);
        if (order !== undefined && order > recycledOrder) {
          recycledOrder = order;
          recycledId = ghostId;
        }
      }
      if (recycledId === undefined) break;
      casualties.current.delete(recycledId);
      cardOrder.current.delete(recycledId);
      cardOrder.current.set(card.instanceId, recycledOrder);
    }
  } else if (casualties.current.size > 0) {
    casualties.current.clear();
  }
  previousCards.current = cards;
  if (casualties.current.size === 0) return cards;
  const ghosts = [...casualties.current.values()].filter((card) => !liveIds.has(card.instanceId));
  if (ghosts.length === 0) return cards;
  // Order matters, not just presence. Copies in a stack are laid out by DOM order (each slot
  // after the first carries a negative margin) and overlap by --copy-stack-index, so appending a
  // ghost sent a casualty from the middle of the stack to its end and shifted every copy behind
  // it. Re-sorting by entry order puts the held slot back exactly where the card stood.
  return [...cards, ...ghosts].sort(
    (left, right) =>
      (cardOrder.current.get(left.instanceId) ?? Number.MAX_SAFE_INTEGER) -
      (cardOrder.current.get(right.instanceId) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** The creature row is the only row whose slots are held open during a Horde sequence. */
function isHeldRowCard(card: CardInstance): boolean {
  return card.cardTypes.includes("Creature");
}
