import type { CardInstance, GameState } from "../engine/GameTypes";
import { cardStatState } from "../utils/selectors";

/**
 * Pure layout rules for the battlefield rows.
 *
 * These live outside `Battlefield.tsx` because they are the part of the board that has to stay
 * still while the Host's attack sequence plays: they decide which cards share a stack, in which
 * order the stacks sit in the row, and which slots are held open for cards that already died.
 * Keeping them here means a regression can be reproduced in `tests/battlefieldLayout.test.js`
 * instead of only by playing a full Host turn.
 */

export type GroupMeta = { order: number; suborder: number; anchorId: string };

export type CardGroup = { key: string; cards: CardInstance[] };

export type DefenseArrowLink = { attackerId: string; blockerId: string };

/**
 * A mutable box, so callers can pass a React ref straight in. Deliberately structural: the tests
 * hand in plain `{ current: ... }` objects.
 */
export type MutableBox<T> = { current: T };

/** Cards mounted with a loaded board are already committed; only later ids are arrival work. */
export function createBattlefieldArrivalRegistry(cards: CardInstance[]): Set<string> {
  return new Set(cards.map((card) => card.instanceId));
}

/** Pure lookup used before the component claims an id after finding its rendered card slot. */
export function unregisteredBattlefieldArrivals(cards: CardInstance[], registeredIds: Set<string>): CardInstance[] {
  return cards.filter((card) => !registeredIds.has(card.instanceId));
}

/**
 * Combat assignments can outlive a permanent for a few presentation beats. The battlefield also
 * keeps dead cards mounted as invisible layout ghosts, so DOM presence alone cannot decide
 * whether an arrow is still valid. Both rules endpoints must still be live on their fields.
 */
export function activeDefenseArrowLinks(game: GameState): DefenseArrowLink[] {
  const liveAttackers = new Set(game.host.field.map((card) => card.instanceId));
  const declaredAttackers = new Set(game.combat.hostAttackers);
  const liveBlockers = new Set(game.player.field.map((card) => card.instanceId));
  const links: DefenseArrowLink[] = [];

  for (const [attackerId, blockerIds] of Object.entries(game.combat.blockers)) {
    if (!liveAttackers.has(attackerId) || !declaredAttackers.has(attackerId)) continue;
    for (const blockerId of blockerIds) {
      if (liveBlockers.has(blockerId)) links.push({ attackerId, blockerId });
    }
  }

  return links;
}

export function isZombieToken(card: CardInstance): boolean {
  return card.isToken && card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
}

export function isGoblinToken(card: CardInstance): boolean {
  return card.controller === "host"
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
  // sequence, which reads as the board reorganising itself. While the Host sequence runs,
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
          : card.controller === "host"
            ? `host-turn-${card.fieldEntryTurn ?? card.instanceId}-${card.definitionId}-${visualStatsKey}`
            : `copy-${card.definitionId}-${visualStatsKey}`);
    lastGroupKeys?.set(card.instanceId, groupingKey);
    groupOfCard.set(card.instanceId, groupingKey);
    const instanceOrder = cardOrder.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    const order = swarmToken
      ? swarmWaveId === undefined
        ? instanceOrder
        : (swarmWaveOrder.get(swarmWaveId) ?? instanceOrder)
      : card.controller === "host"
        ? instanceOrder
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
 * Returns the row's cards with combat casualties still in it while the Host combat sequence runs.
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
    // New creatures keep their actual arrival order. In particular, a Goblin summoned by
    // Summoner of the Ranks after another Goblin dies must not inherit the casualty's middle slot: combat
    // still resolves it last because the engine appended it to `host.field`. Keeping the
    // ghost until the sequence ends makes the visual row agree with that rules order.
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
