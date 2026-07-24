import type { GameState } from "./GameTypes";
import type { CardInstance } from "./GameTypes";
import { blockRestrictionReason, canAttack, canBlockAttacker, getToxicAmount, hasKeyword } from "./Keywords";
import { destroyPermanent, millHorde } from "./EffectResolver";
import { getPowerToughness } from "./StaticEffects";
import { drainEventQueue } from "./EventQueue";
import { enqueue } from "./EventQueue";

export type HordeAttackEvent = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  attackerDamageMarked?: number;
  blockerDamageMarked?: number;
};

export function togglePlayerAttacker(game: GameState, id: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.battlefield.find((item) => item.instanceId === id);
  if (!card) return log(next, "That creature cannot attack.");
  const selected = next.combat.playerAttackers.includes(id);
  if (selected) {
    next.combat.playerAttackers = next.combat.playerAttackers.filter((item) => item !== id);
    if (!hasKeyword(next, card, "VIGILANCE")) card.tapped = false;
    return log(next, `${card.name} stops attacking.`);
  }
  if (!canAttack(next, card)) return log(next, "That creature cannot attack.");
  next.combat.playerAttackers = [...next.combat.playerAttackers, id];
  if (!hasKeyword(next, card, "VIGILANCE")) card.tapped = true;
  return log(next, `${card.name} ${selected ? "stops attacking" : "attacks the Horde"}.`);
}

export function declareBlocker(game: GameState, blockerId: string, attackerId: string): GameState {
  const next = structuredClone(game) as GameState;
  const blocker = next.player.battlefield.find((card) => card.instanceId === blockerId);
  const attacker = next.horde.battlefield.find((card) => card.instanceId === attackerId);
  if (!blocker || !attacker) return log(next, "Illegal block.");
  const restriction = blockRestrictionReason(next, blocker, attacker);
  if (restriction) return log(next, restriction);
  const current = next.combat.blockers[attackerId] ?? [];
  if (current.includes(blockerId)) {
    next.combat.blockers[attackerId] = current.filter((id) => id !== blockerId);
    return log(next, `${blocker.name} stops blocking ${attacker.name}.`);
  }
  const alreadyBlocking = Object.entries(next.combat.blockers).find(([otherAttackerId, blockerIds]) => otherAttackerId !== attackerId && blockerIds.includes(blockerId));
  if (alreadyBlocking) {
    const blockedAttacker = next.horde.battlefield.find((card) => card.instanceId === alreadyBlocking[0]);
    return log(next, `${blocker.name} is already blocking ${blockedAttacker?.name ?? "another attacker"}.`);
  }
  next.combat.blockers[attackerId] = [...current, blockerId];
  return log(next, `${blocker.name} blocks ${attacker.name}.`);
}

export function resolvePlayerCombat(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  let hordeDamage = 0;
  let poisonCounters = 0;
  for (const id of next.combat.playerAttackers) {
    const attacker = next.player.battlefield.find((card) => card.instanceId === id);
    if (!attacker) continue;
    const power = getPowerToughness(next, attacker).power;
    hordeDamage += power;
    if (power > 0) poisonCounters += getToxicAmount(next, attacker);
  }
  const cardsToMill = Math.floor(hordeDamage / 3);
  if (hordeDamage > 0) log(next, `Player deals ${hordeDamage} damage to Horde.`);
  if (poisonCounters > 0) {
    next.horde.poisonCounters += poisonCounters;
    log(next, `Horde gets ${poisonCounters} poison counter(s).`);
  }
  if (cardsToMill > 0) millHorde(next, cardsToMill);
  next.combat.playerAttackers = [];
  drainEventQueue(next);
  checkWinLoss(next);
  return next;
}

export function beginHordeCombat(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  const next = structuredClone(game) as GameState;
  next.activeSide = "horde";
  next.phase = "combat";
  enqueue(next, { type: "BEGIN_COMBAT", payload: { controller: "horde" } });
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  return next;
}

export function declareHordeAttackers(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  const next = structuredClone(game) as GameState;
  const attackers = sortBattlefieldCardsByVisualOrder(
    next.horde.battlefield,
    next.horde.battlefield.filter((card) => canAttack(next, card)),
  );
  next.combat.hordeAttackers = attackers.map((card) => card.instanceId);
  for (const attacker of attackers) attacker.tapped = true;
  const attackerPowers = Object.fromEntries(attackers.map((card) => [card.instanceId, getPowerToughness(next, card).power]));
  enqueue(next, {
    type: "ATTACK_DECLARED",
    payload: {
      controller: "horde",
      attackerIds: [...next.combat.hordeAttackers],
      attackerPowers,
      totalPower: Object.values(attackerPowers).reduce((total, power) => total + power, 0),
    },
  });
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  next.combat.hordeAttackers = sortBattlefieldCardsByVisualOrder(
    next.horde.battlefield,
    next.combat.hordeAttackers
      .map((id) => next.horde.battlefield.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card)),
  ).map((card) => card.instanceId);
  checkWinLoss(next);
  log(next, `Horde attacks with ${next.combat.hordeAttackers.length} creature(s).`);
  return next;
}

export function prepareHordeAttackers(game: GameState): GameState {
  return declareHordeAttackers(beginHordeCombat(game));
}

export function resolveHordeCombat(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  if (game.combat.hordeAttackers.length === 0) {
    return log(structuredClone(game) as GameState, "No Horde attackers to resolve. Press Attack after Horde Turn first.");
  }
  let next = structuredClone(game) as GameState;
  for (const event of buildHordeAttackEvents(next)) next = applyHordeAttackEvent(next, event);
  return finishHordeCombat(next, options);
}

export function buildHordeAttackEvents(game: GameState): HordeAttackEvent[] {
  const events: HordeAttackEvent[] = [];
  const damageById = new Map<string, number>();
  const deathtouchById = new Set<string>();
  const deadBuffSourceIds = new Set<string>();

  for (const attackerId of game.combat.hordeAttackers) {
    const blockerIds = game.combat.blockers[attackerId] ?? [];
    const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) continue;
    const attackerStats = getPowerToughness(game, attacker, deadBuffSourceIds);
    if (isEventCardDead(attacker, attackerStats.toughness, damageById, deathtouchById)) continue;

    if (blockerIds.length === 0 || (hasKeyword(game, attacker, "MENACE") && blockerIds.length < 2)) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    const blockers = blockerIds
      .map((id) => game.player.battlefield.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card));

    for (const blocker of blockers) {
      const blockerStats = getPowerToughness(game, blocker, deadBuffSourceIds);
      if (isEventCardDead(blocker, blockerStats.toughness, damageById, deathtouchById)) continue;

      const attackerFirstStrike = hasKeyword(game, attacker, "FIRST_STRIKE");
      const blockerFirstStrike = hasKeyword(game, blocker, "FIRST_STRIKE");
      let attackerDamageMarked = eventVisualDamage(attacker, damageById);
      let blockerDamageMarked = eventVisualDamage(blocker, damageById);

      if (attackerFirstStrike && !blockerFirstStrike) {
        blockerDamageMarked += attackerStats.power;
        if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
        damageById.set(blocker.instanceId, blockerDamageMarked);
        if (!isEventCardDead(blocker, blockerStats.toughness, damageById, deathtouchById)) {
          attackerDamageMarked += blockerStats.power;
          if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
        }
      } else if (blockerFirstStrike && !attackerFirstStrike) {
        attackerDamageMarked += blockerStats.power;
        if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
        damageById.set(attacker.instanceId, attackerDamageMarked);
        if (!isEventCardDead(attacker, attackerStats.toughness, damageById, deathtouchById)) {
          blockerDamageMarked += attackerStats.power;
          if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
        }
      } else {
        attackerDamageMarked += blockerStats.power;
        blockerDamageMarked += attackerStats.power;
        if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
        if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
      }
      damageById.set(attacker.instanceId, attackerDamageMarked);
      damageById.set(blocker.instanceId, blockerDamageMarked);

      const blockerDies = isEventCardDead(blocker, blockerStats.toughness, damageById, deathtouchById);
      const attackerDies = isEventCardDead(attacker, attackerStats.toughness, damageById, deathtouchById);
      if (blockerDies) deadBuffSourceIds.add(blocker.instanceId);
      if (attackerDies) deadBuffSourceIds.add(attacker.instanceId);
      events.push({
        attackerId,
        attackerDies,
        blockerId: blocker.instanceId,
        blockerDies,
        playerDamage: 0,
        attackerDamageMarked,
        blockerDamageMarked,
      });
      if (attackerDies) break;
    }
  }
  return events;
}

export function applyHordeAttackEvent(game: GameState, event: HordeAttackEvent): GameState {
  const next = structuredClone(game) as GameState;
  const attacker = next.horde.battlefield.find((card) => card.instanceId === event.attackerId);
  const blocker = event.blockerId
    ? next.player.battlefield.find((card) => card.instanceId === event.blockerId)
    : undefined;
  // Triggers resolve between animated combat impacts and may remove a later
  // participant. Removed cards must never deal "ghost" combat damage.
  if (!attacker || (event.blockerId && !blocker)) return next;
  if (attacker && event.attackerDamageMarked !== undefined) attacker.damageMarked = event.attackerDamageMarked;
  if (blocker && event.blockerDamageMarked !== undefined) blocker.damageMarked = event.blockerDamageMarked;
  if (event.playerDamage > 0) {
    next.player.life -= event.playerDamage;
    log(next, `Horde deals ${event.playerDamage} damage to Player.`);
  }
  if (event.blockerDies && blocker) destroyPermanent(next, blocker);
  if (event.attackerDies && attacker) destroyPermanent(next, attacker);
  return next;
}

export function isHordeAttackEventCurrent(game: GameState, event: HordeAttackEvent): boolean {
  const attackerExists = game.horde.battlefield.some((card) => card.instanceId === event.attackerId);
  if (!attackerExists) return false;
  return !event.blockerId || game.player.battlefield.some((card) => card.instanceId === event.blockerId);
}

export function finishHordeCombat(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  const next = structuredClone(game) as GameState;
  next.combat.hordeAttackers = [];
  next.combat.blockers = {};
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  checkWinLoss(next);
  return next;
}

function eventVisualDamage(card: CardInstance, damageById: Map<string, number>): number {
  return damageById.get(card.instanceId) ?? card.damageMarked;
}

function isEventCardDead(
  card: CardInstance,
  toughness: number,
  damageById: Map<string, number>,
  deathtouchById: Set<string>,
): boolean {
  return eventVisualDamage(card, damageById) >= toughness || deathtouchById.has(card.instanceId);
}

export function checkWinLoss(game: GameState): void {
  if (game.player.life <= 0) game.winner = "horde";
  const hordeCanDamage = game.horde.battlefield.some((card) => card.cardTypes.includes("Creature"));
  if (game.horde.library.length === 0 && !hordeCanDamage) game.winner = "player";
}

function log(game: GameState, message: string): GameState {
  game.log.unshift(message);
  return game;
}

export function sortPlayerAttackersLeftToRight(game: GameState, attackerIds: string[]): string[] {
  const attackers = attackerIds
    .map((id) => game.player.battlefield.find((card) => card.instanceId === id))
    .filter((card): card is CardInstance => Boolean(card));
  return sortBattlefieldCardsByVisualOrder(game.player.battlefield, attackers).map((card) => card.instanceId);
}

function sortBattlefieldCardsByVisualOrder(battlefield: CardInstance[], cards: CardInstance[]): CardInstance[] {
  const entryIndex = new Map(battlefield.map((card, index) => [card.instanceId, index]));
  // Zombie tokens are re-summoned every horde turn and reuse the same handful of
  // definitionIds, so grouping them by "first time this definitionId ever appeared"
  // (like non-zombie creatures) yanks later waves back in line with the very first
  // zombie of that name and attacks out of visual left-to-right order. The board
  // (Battlefield.tsx groupBattlefieldCopies) groups zombies by arrival wave instead,
  // which for ordering purposes is equivalent to plain chronological entry order.
  const familyIndex = new Map<string, number>();
  for (const card of battlefield) {
    if (isZombieToken(card)) continue;
    const index = entryIndex.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    if (!familyIndex.has(card.definitionId)) familyIndex.set(card.definitionId, index);
  }

  const orderOf = (card: CardInstance): number => {
    const own = entryIndex.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    return isZombieToken(card) ? own : (familyIndex.get(card.definitionId) ?? own);
  };

  return [...cards].sort((left, right) => {
    const orderDelta = orderOf(left) - orderOf(right);
    if (orderDelta !== 0) return orderDelta;
    return (entryIndex.get(left.instanceId) ?? Number.MAX_SAFE_INTEGER) - (entryIndex.get(right.instanceId) ?? Number.MAX_SAFE_INTEGER);
  });
}

function isZombieToken(card: CardInstance): boolean {
  return card.isToken && card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
}
