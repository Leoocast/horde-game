import type { GameState } from "./GameTypes";
import type { CardInstance } from "./GameTypes";
import { blockRestrictionReason, canAttack, canBlockAttacker, getToxicAmount, hasKeyword } from "./Keywords";
import { destroyPermanent, enqueueSurvivedDamageEvent, losePlayerLife, millHorde } from "./EffectResolver";
import { getPowerToughness } from "./StaticEffects";
import { drainEventQueue } from "./EventQueue";
import { enqueue } from "./EventQueue";

export type HordeAttackEvent = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  playerLifeGain: number;
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
  if (!blocker || !attacker) return failAction(next, "Illegal block.");
  const restriction = blockRestrictionReason(next, blocker, attacker);
  if (restriction) return failAction(next, restriction);
  const current = next.combat.blockers[attackerId] ?? [];
  if (current.includes(blockerId)) {
    next.combat.blockers[attackerId] = current.filter((id) => id !== blockerId);
    next.lastActionResult = { ok: true };
    return log(next, `${blocker.name} stops blocking ${attacker.name}.`);
  }
  const alreadyBlocking = Object.entries(next.combat.blockers).find(([otherAttackerId, blockerIds]) => otherAttackerId !== attackerId && blockerIds.includes(blockerId));
  if (alreadyBlocking) {
    const blockedAttacker = next.horde.battlefield.find((card) => card.instanceId === alreadyBlocking[0]);
    return failAction(next, `${blocker.name} is already blocking ${blockedAttacker?.name ?? "another attacker"}.`);
  }
  next.combat.blockers[attackerId] = [...current, blockerId];
  next.lastActionResult = { ok: true };
  return log(next, `${blocker.name} blocks ${attacker.name}.`);
}

function failAction(game: GameState, reason: string): GameState {
  game.lastActionResult = { ok: false, reason };
  return log(game, reason);
}

export function resolvePlayerCombat(
  game: GameState,
  options: { skipLifesteal?: boolean; skipPoison?: boolean } = {},
): GameState {
  const next = structuredClone(game) as GameState;
  let hordeDamage = 0;
  let poisonCounters = 0;
  for (const id of next.combat.playerAttackers) {
    const attacker = next.player.battlefield.find((card) => card.instanceId === id);
    if (!attacker) continue;
    attacker.attacksMade = (attacker.attacksMade ?? 0) + 1;
    const power = getPowerToughness(next, attacker).power;
    hordeDamage += power;
    if (!options.skipLifesteal) applyCombatLifesteal(next, attacker, power);
    if (!options.skipPoison && power > 0) poisonCounters += getToxicAmount(next, attacker);
  }
  const cardsToMill = Math.floor(hordeDamage / next.hordeRules.damagePerMill);
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
  const attackers = sortCardsByBattlefieldOrder(
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
  next.combat.hordeAttackers = sortCardsByBattlefieldOrder(
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
      events.push({
        attackerId,
        attackerDies: false,
        blockerDies: false,
        playerDamage: attackerStats.power,
        playerLifeGain: 0,
      });
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
      let blockerDamageDealt = 0;

      if (attackerFirstStrike && !blockerFirstStrike) {
        blockerDamageMarked += attackerStats.power;
        if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
        damageById.set(blocker.instanceId, blockerDamageMarked);
        if (!isEventCardDead(blocker, blockerStats.toughness, damageById, deathtouchById)) {
          attackerDamageMarked += blockerStats.power;
          blockerDamageDealt = blockerStats.power;
          if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
        }
      } else if (blockerFirstStrike && !attackerFirstStrike) {
        attackerDamageMarked += blockerStats.power;
        blockerDamageDealt = blockerStats.power;
        if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
        damageById.set(attacker.instanceId, attackerDamageMarked);
        if (!isEventCardDead(attacker, attackerStats.toughness, damageById, deathtouchById)) {
          blockerDamageMarked += attackerStats.power;
          if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
        }
      } else {
        attackerDamageMarked += blockerStats.power;
        blockerDamageMarked += attackerStats.power;
        blockerDamageDealt = blockerStats.power;
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
        playerLifeGain: hasKeyword(game, blocker, "LIFESTEAL")
          ? Math.max(0, blockerDamageDealt)
          : 0,
        attackerDamageMarked,
        blockerDamageMarked,
      });
      if (attackerDies) break;
    }
  }
  return events;
}

/** Re-evaluates one planned animated impact against the current board. Player reactions resolve
 * between Horde attackers, so a later blocker may have different power or keywords than it had
 * when the combat sequence was first planned (Blood Page is the common case). */
export function refreshHordeAttackEvent(game: GameState, planned: HordeAttackEvent): HordeAttackEvent | undefined {
  const attacker = game.horde.battlefield.find((card) => card.instanceId === planned.attackerId);
  if (!attacker) return undefined;
  const attackerStats = getPowerToughness(game, attacker);

  if (!planned.blockerId) {
    return {
      ...planned,
      attackerDies: false,
      blockerDies: false,
      playerDamage: attackerStats.power,
      playerLifeGain: 0,
      attackerDamageMarked: undefined,
      blockerDamageMarked: undefined,
    };
  }

  const blocker = game.player.battlefield.find((card) => card.instanceId === planned.blockerId);
  if (!blocker) return undefined;
  const blockerStats = getPowerToughness(game, blocker);
  let attackerDamageMarked = attacker.damageMarked;
  let blockerDamageMarked = blocker.damageMarked;
  let blockerDamageDealt = 0;
  let attackerTookDeathtouch = attacker.deathtouchDamage;
  let blockerTookDeathtouch = blocker.deathtouchDamage;
  const attackerFirstStrike = hasKeyword(game, attacker, "FIRST_STRIKE");
  const blockerFirstStrike = hasKeyword(game, blocker, "FIRST_STRIKE");

  if (attackerFirstStrike && !blockerFirstStrike) {
    blockerDamageMarked += attackerStats.power;
    blockerTookDeathtouch ||= attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH");
    if (!blockerTookDeathtouch && blockerDamageMarked < blockerStats.toughness) {
      attackerDamageMarked += blockerStats.power;
      blockerDamageDealt = blockerStats.power;
      attackerTookDeathtouch ||= blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH");
    }
  } else if (blockerFirstStrike && !attackerFirstStrike) {
    attackerDamageMarked += blockerStats.power;
    blockerDamageDealt = blockerStats.power;
    attackerTookDeathtouch ||= blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH");
    if (!attackerTookDeathtouch && attackerDamageMarked < attackerStats.toughness) {
      blockerDamageMarked += attackerStats.power;
      blockerTookDeathtouch ||= attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH");
    }
  } else {
    attackerDamageMarked += blockerStats.power;
    blockerDamageMarked += attackerStats.power;
    blockerDamageDealt = blockerStats.power;
    attackerTookDeathtouch ||= blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH");
    blockerTookDeathtouch ||= attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH");
  }

  return {
    ...planned,
    attackerDies: attackerTookDeathtouch || attackerDamageMarked >= attackerStats.toughness,
    blockerDies: blockerTookDeathtouch || blockerDamageMarked >= blockerStats.toughness,
    playerDamage: 0,
    playerLifeGain: hasKeyword(game, blocker, "LIFESTEAL") ? Math.max(0, blockerDamageDealt) : 0,
    attackerDamageMarked,
    blockerDamageMarked,
  };
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
  const attackerDamageBefore = attacker.damageMarked;
  const blockerDamageBefore = blocker?.damageMarked ?? 0;
  if (attacker && event.attackerDamageMarked !== undefined) attacker.damageMarked = event.attackerDamageMarked;
  if (blocker && event.blockerDamageMarked !== undefined) blocker.damageMarked = event.blockerDamageMarked;
  if (event.playerDamage > 0) {
    losePlayerLife(next, event.playerDamage, attacker.instanceId);
    log(next, `Horde deals ${event.playerDamage} damage to Player.`);
  }
  if (event.playerLifeGain > 0) {
    next.player.life += event.playerLifeGain;
    log(next, `Player recovers ${event.playerLifeGain} life with Lifesteal.`);
  }
  // Survival is established at this impact, after damage is marked but before casualties enqueue
  // their death reactions. Zero-power hits do not count as receiving damage.
  if (!event.attackerDies && event.attackerDamageMarked !== undefined) {
    enqueueSurvivedDamageEvent(next, attacker, event.attackerDamageMarked - attackerDamageBefore, {
      damageSourceId: blocker?.instanceId,
      combat: true,
    });
  }
  if (blocker && !event.blockerDies && event.blockerDamageMarked !== undefined) {
    enqueueSurvivedDamageEvent(next, blocker, event.blockerDamageMarked - blockerDamageBefore, {
      damageSourceId: attacker.instanceId,
      attackerId: attacker.instanceId,
      blockerId: blocker.instanceId,
      combat: true,
    });
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
  const next = resolvePendingHordeCombatDamageVolleys(game);
  next.combat.hordeAttackers = [];
  next.combat.blockers = {};
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  checkWinLoss(next);
  return next;
}

/** Commits one animated player's Lifesteal impact without resolving the rest of player combat.
 *  The batch resolver uses the same rule by default; its `skipLifesteal` option prevents a second
 *  gain after the store has already landed each attacker's recovery at its visual impact. */
export function resolvePlayerAttackerLifesteal(game: GameState, attackerId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (!next.combat.playerAttackers.includes(attackerId)) return next;
  const attacker = next.player.battlefield.find((card) => card.instanceId === attackerId);
  if (!attacker) return next;
  applyCombatLifesteal(next, attacker, getPowerToughness(next, attacker).power);
  return next;
}

/** Commits one animated player's poison counters at that attacker's impact frame.
 *  The batch resolver can skip poison afterwards so the same counters are not applied twice. */
export function resolvePlayerAttackerPoison(game: GameState, attackerId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (!next.combat.playerAttackers.includes(attackerId)) return next;
  const attacker = next.player.battlefield.find((card) => card.instanceId === attackerId);
  if (!attacker || getPowerToughness(next, attacker).power <= 0) return next;
  const amount = getToxicAmount(next, attacker);
  if (amount <= 0) return next;
  next.horde.poisonCounters += amount;
  log(next, `Horde gets ${amount} poison counter(s).`);
  return next;
}

export function pendingHordeCombatDamageVolley(game: GameState): {
  sourceId?: string;
  attackerCount: number;
  damage: number;
} | undefined {
  if (game.combat.pendingDamageVolleys.length === 0) return undefined;
  return {
    sourceId: game.combat.pendingDamageVolleys.find((volley) => volley.sourceId)?.sourceId,
    attackerCount: game.combat.pendingDamageVolleys.reduce((total, volley) => total + volley.attackerIds.length, 0),
    damage: game.combat.pendingDamageVolleys.reduce(
      (total, volley) => total + volley.attackerIds.length * volley.amountPerAttacker,
      0,
    ),
  };
}

/** Commits deferred combat damage at the presentation's impact frame. Kept separate from
 * `finishHordeCombat` so the store can animate the volley first; non-animated callers still
 * receive the same rule because `finishHordeCombat` invokes it as a fallback. */
export function resolvePendingHordeCombatDamageVolleys(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  const pending = pendingHordeCombatDamageVolley(next);
  next.combat.pendingDamageVolleys = [];
  if (!pending || pending.damage <= 0) return next;
  losePlayerLife(next, pending.damage, pending.sourceId);
  log(next, `Horde combat volley deals ${pending.damage} damage to Player.`);
  checkWinLoss(next);
  return next;
}

function eventVisualDamage(card: CardInstance, damageById: Map<string, number>): number {
  return damageById.get(card.instanceId) ?? card.damageMarked;
}

function applyCombatLifesteal(game: GameState, source: CardInstance, damageDealt: number): number {
  const amount = Math.max(0, damageDealt);
  if (amount === 0 || source.controller !== "player" || !hasKeyword(game, source, "LIFESTEAL")) {
    return 0;
  }
  game.player.life += amount;
  log(game, `Player recovers ${amount} life with ${source.name}.`);
  return amount;
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
  return sortBattlefieldCardsByVisualOrder(game, game.player.battlefield, attackers).map((card) => card.instanceId);
}

/** Horde battlefield insertion order is summon order. Never regroup identical definitions here:
 * stacking is a visual concern, while combat must preserve the chronology in which cards entered. */
function sortCardsByBattlefieldOrder(battlefield: CardInstance[], cards: CardInstance[]): CardInstance[] {
  const entryIndex = new Map(battlefield.map((card, index) => [card.instanceId, index]));
  return [...cards].sort(
    (left, right) =>
      (entryIndex.get(left.instanceId) ?? Number.MAX_SAFE_INTEGER) -
      (entryIndex.get(right.instanceId) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortBattlefieldCardsByVisualOrder(game: GameState, battlefield: CardInstance[], cards: CardInstance[]): CardInstance[] {
  const entryIndex = new Map(battlefield.map((card, index) => [card.instanceId, index]));
  // Horde swarm tokens are re-summoned throughout the encounter and reuse the same
  // definitionIds. The board groups swarm tokens (per-deck subtypes in hordeRules) by
  // arrival wave so a later wave stays where it entered instead of jumping back into
  // the first stack. For attack ordering, that visual wave order equals entry order.
  const familyIndex = new Map<string, number>();
  for (const card of battlefield) {
    if (isEntryWaveToken(game, card)) continue;
    const index = entryIndex.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    if (!familyIndex.has(card.definitionId)) familyIndex.set(card.definitionId, index);
  }

  const orderOf = (card: CardInstance): number => {
    const own = entryIndex.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    return isEntryWaveToken(game, card) ? own : (familyIndex.get(card.definitionId) ?? own);
  };

  return [...cards].sort((left, right) => {
    const orderDelta = orderOf(left) - orderOf(right);
    if (orderDelta !== 0) return orderDelta;
    return (entryIndex.get(left.instanceId) ?? Number.MAX_SAFE_INTEGER) - (entryIndex.get(right.instanceId) ?? Number.MAX_SAFE_INTEGER);
  });
}

function isEntryWaveToken(game: GameState, card: CardInstance): boolean {
  if (!card.isToken) return false;
  return card.subtypes.some((subtype) =>
    game.hordeRules.swarmTokenSubtypes.some((swarmSubtype) => swarmSubtype.toLowerCase() === subtype.toLowerCase()),
  );
}
