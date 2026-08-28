import type { ActionFailureCode, GameState } from "./GameTypes";
import type { CardInstance } from "./GameTypes";
import { attackRestriction, blockRestriction, canAttack, getPoisonAmount, hasTrait } from "./Traits";
import {
  destroyPermanent,
  discardHostArchiveToMemory,
  enqueueSurvivedDamageEvent,
  losePlayerLife,
  selectHostArchiveDiscardCards,
} from "./EffectResolver";
import { getPowerEndurance, hostInSurge } from "./StaticEffects";
import { drainEventQueue } from "./EventQueue";
import { enqueue } from "./EventQueue";

export type HostAttackEvent = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  playerLifeGain: number;
  attackerDamageMarked?: number;
  blockerDamageMarked?: number;
};

const PLAYER_COMBAT_DISCARD_PRIORITY_FLAG = "playerCombatArchiveDiscardPriority";
const PLAYER_COMBAT_SURGE_DISCARD_PRIORITY_FLAG = "playerCombatArchiveDiscardPriorityInSurge";

export type PlayerCombatArchiveDiscardPreview = Readonly<{
  attackerIndex: number;
  cardIndexInHit: number;
  card: CardInstance;
}>;

/** Mirrors the exact Archive cards combat will discard, including authored expendable cards. */
export function previewPlayerCombatArchiveDiscards(
  game: GameState,
  attackers: readonly string[],
): PlayerCombatArchiveDiscardPreview[] {
  const previews: PlayerCombatArchiveDiscardPreview[] = [];
  const preferredCardIds = playerCombatDiscardPriorityIds(game);
  let totalDamage = 0;
  let previousDiscardCount = 0;

  attackers.forEach((attackerId, attackerIndex) => {
    const attacker = game.player.field.find((card) => card.instanceId === attackerId);
    if (!attacker) return;
    totalDamage += getPowerEndurance(game, attacker).power;
    const nextDiscardCount = Math.floor(totalDamage / game.hostRules.damagePerArchiveDiscard);
    const planned = selectHostArchiveDiscardCards(game, nextDiscardCount, preferredCardIds);
    planned.slice(previousDiscardCount).forEach((card, cardIndexInHit) => {
      previews.push({ attackerIndex, cardIndexInHit, card });
    });
    previousDiscardCount = nextDiscardCount;
  });

  return previews;
}

export function togglePlayerAttacker(game: GameState, id: string): GameState {
  const next = structuredClone(game) as GameState;
  const card = next.player.field.find((item) => item.instanceId === id);
  if (next.winner || next.activeSide !== "player" || next.phase !== "combat") {
    return failAction(next, "Attackers can only be chosen during your Combat phase.", "WRONG_PHASE");
  }
  if (!card) return failAction(next, "That creature cannot attack.");
  const selected = next.combat.playerAttackers.includes(id);
  if (selected) {
    next.combat.playerAttackers = next.combat.playerAttackers.filter((item) => item !== id);
    if (!hasTrait(next, card, "ALERT")) card.exhausted = false;
    next.lastActionResult = { ok: true };
    return log(next, `${card.name} stops attacking.`);
  }
  const restriction = attackRestriction(next, card);
  if (restriction) return failAction(next, restriction.reason, restriction.code);
  next.combat.playerAttackers = [...next.combat.playerAttackers, id];
  if (!hasTrait(next, card, "ALERT")) card.exhausted = true;
  next.lastActionResult = { ok: true };
  return log(next, `${card.name} ${selected ? "stops attacking" : "attacks the Host"}.`);
}

export function declareBlocker(game: GameState, blockerId: string, attackerId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (next.winner || next.activeSide !== "host" || next.phase !== "combat" || !next.combat.hostAttackers.includes(attackerId)) {
    return failAction(next, "Defenders can only be assigned during Host combat.", "WRONG_PHASE");
  }
  const blocker = next.player.field.find((card) => card.instanceId === blockerId);
  const attacker = next.host.field.find((card) => card.instanceId === attackerId);
  if (!blocker || !attacker) return failAction(next, "Illegal block.");
  const restriction = blockRestriction(next, blocker, attacker);
  if (restriction) return failAction(next, restriction.reason, restriction.code);
  const current = next.combat.blockers[attackerId] ?? [];
  if (current.includes(blockerId)) {
    next.combat.blockers[attackerId] = current.filter((id) => id !== blockerId);
    next.lastActionResult = { ok: true };
    return log(next, `${blocker.name} stops blocking ${attacker.name}.`);
  }
  const alreadyBlocking = Object.entries(next.combat.blockers).find(([otherAttackerId, blockerIds]) => otherAttackerId !== attackerId && blockerIds.includes(blockerId));
  if (alreadyBlocking) {
    const blockedAttacker = next.host.field.find((card) => card.instanceId === alreadyBlocking[0]);
    return failAction(next, `${blocker.name} is already blocking ${blockedAttacker?.name ?? "another attacker"}.`, "ALREADY_BLOCKING");
  }
  next.combat.blockers[attackerId] = [...current, blockerId];
  next.lastActionResult = { ok: true };
  return log(next, `${blocker.name} blocks ${attacker.name}.`);
}

function failAction(game: GameState, reason: string, code?: ActionFailureCode): GameState {
  game.lastActionResult = { ok: false, reason, ...(code ? { code } : {}) };
  return log(game, reason);
}

export function resolvePlayerCombat(
  game: GameState,
  options: { skipDrain?: boolean; skipPoison?: boolean } = {},
): GameState {
  const next = structuredClone(game) as GameState;
  let hostDamage = 0;
  let poisonCounters = 0;
  for (const id of next.combat.playerAttackers) {
    const attacker = next.player.field.find((card) => card.instanceId === id);
    if (!attacker) continue;
    attacker.attacksMade = (attacker.attacksMade ?? 0) + 1;
    const power = getPowerEndurance(next, attacker).power;
    hostDamage += power;
    if (!options.skipDrain) applyCombatDrain(next, attacker, power);
    if (!options.skipPoison && power > 0) poisonCounters += getPoisonAmount(next, attacker);
  }
  const archiveDiscards = Math.floor(hostDamage / next.hostRules.damagePerArchiveDiscard);
  if (hostDamage > 0) log(next, `Chronicler deals ${hostDamage} damage to the Host.`);
  if (poisonCounters > 0) {
    next.host.poisonCounters += poisonCounters;
    log(next, `Host gets ${poisonCounters} poison counter(s).`);
  }
  if (archiveDiscards > 0) {
    discardHostArchiveToMemory(next, archiveDiscards, {
      preferredCardIds: playerCombatDiscardPriorityIds(next),
    });
  }
  next.combat.playerAttackers = [];
  drainEventQueue(next);
  checkWinLoss(next);
  return next;
}

function playerCombatDiscardPriorityIds(game: GameState): string[] {
  return game.host.archive
    .filter((card) => card.flags[PLAYER_COMBAT_DISCARD_PRIORITY_FLAG]
      || (hostInSurge(game) && card.flags[PLAYER_COMBAT_SURGE_DISCARD_PRIORITY_FLAG]))
    .map((card) => card.instanceId);
}

export function beginHostCombat(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  const next = structuredClone(game) as GameState;
  next.activeSide = "host";
  next.phase = "combat";
  enqueue(next, { type: "BEGIN_BATTLE", payload: { controller: "host" } });
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  return next;
}

export function declareHostAttackers(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  const next = structuredClone(game) as GameState;
  const attackers = sortCardsByFieldOrder(
    next.host.field,
    next.host.field.filter((card) => canAttack(next, card)),
  );
  next.combat.hostAttackers = attackers.map((card) => card.instanceId);
  for (const attacker of attackers) attacker.exhausted = true;
  const attackerPowers = Object.fromEntries(attackers.map((card) => [card.instanceId, getPowerEndurance(next, card).power]));
  enqueue(next, {
    type: "ATTACK_DECLARED",
    payload: {
      controller: "host",
      attackerIds: [...next.combat.hostAttackers],
      attackerPowers,
      totalPower: Object.values(attackerPowers).reduce((total, power) => total + power, 0),
    },
  });
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  next.combat.hostAttackers = sortCardsByFieldOrder(
    next.host.field,
    next.combat.hostAttackers
      .map((id) => next.host.field.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card)),
  ).map((card) => card.instanceId);
  checkWinLoss(next);
  log(next, `Host attacks with ${next.combat.hostAttackers.length} creature(s).`);
  return next;
}

export function prepareHostAttackers(game: GameState): GameState {
  return declareHostAttackers(beginHostCombat(game));
}

export function resolveHostCombat(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  if (game.combat.hostAttackers.length === 0) {
    return log(structuredClone(game) as GameState, "No Host attackers to resolve. Press Attack after Host Turn first.");
  }
  let next = structuredClone(game) as GameState;
  for (const event of buildHostAttackEvents(next)) next = applyHostAttackEvent(next, event);
  return finishHostCombat(next, options);
}

export function buildHostAttackEvents(game: GameState): HostAttackEvent[] {
  const events: HostAttackEvent[] = [];
  const damageById = new Map<string, number>();
  const lethalDamageById = new Set<string>();
  const deadBuffSourceIds = new Set<string>();

  for (const attackerId of game.combat.hostAttackers) {
    const blockerIds = game.combat.blockers[attackerId] ?? [];
    const attacker = game.host.field.find((card) => card.instanceId === attackerId);
    if (!attacker) continue;
    const attackerStats = getPowerEndurance(game, attacker, deadBuffSourceIds);
    if (isEventCardDead(attacker, attackerStats.endurance, damageById, lethalDamageById)) continue;

    if (blockerIds.length === 0 || (hasTrait(game, attacker, "DAUNTING") && blockerIds.length < 2)) {
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
      .map((id) => game.player.field.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card));

    for (const blocker of blockers) {
      const blockerStats = getPowerEndurance(game, blocker, deadBuffSourceIds);
      if (isEventCardDead(blocker, blockerStats.endurance, damageById, lethalDamageById)) continue;

      const attackerHasReflex = hasTrait(game, attacker, "REFLEX");
      const blockerHasReflex = hasTrait(game, blocker, "REFLEX");
      let attackerDamageMarked = eventVisualDamage(attacker, damageById);
      let blockerDamageMarked = eventVisualDamage(blocker, damageById);
      let blockerDamageDealt = 0;

      if (attackerHasReflex && !blockerHasReflex) {
        blockerDamageMarked += attackerStats.power;
        if (attackerStats.power > 0 && hasTrait(game, attacker, "LETHAL")) lethalDamageById.add(blocker.instanceId);
        damageById.set(blocker.instanceId, blockerDamageMarked);
        if (!isEventCardDead(blocker, blockerStats.endurance, damageById, lethalDamageById)) {
          attackerDamageMarked += blockerStats.power;
          blockerDamageDealt = blockerStats.power;
          if (blockerStats.power > 0 && hasTrait(game, blocker, "LETHAL")) lethalDamageById.add(attacker.instanceId);
        }
      } else if (blockerHasReflex && !attackerHasReflex) {
        attackerDamageMarked += blockerStats.power;
        blockerDamageDealt = blockerStats.power;
        if (blockerStats.power > 0 && hasTrait(game, blocker, "LETHAL")) lethalDamageById.add(attacker.instanceId);
        damageById.set(attacker.instanceId, attackerDamageMarked);
        if (!isEventCardDead(attacker, attackerStats.endurance, damageById, lethalDamageById)) {
          blockerDamageMarked += attackerStats.power;
          if (attackerStats.power > 0 && hasTrait(game, attacker, "LETHAL")) lethalDamageById.add(blocker.instanceId);
        }
      } else {
        attackerDamageMarked += blockerStats.power;
        blockerDamageMarked += attackerStats.power;
        blockerDamageDealt = blockerStats.power;
        if (attackerStats.power > 0 && hasTrait(game, attacker, "LETHAL")) lethalDamageById.add(blocker.instanceId);
        if (blockerStats.power > 0 && hasTrait(game, blocker, "LETHAL")) lethalDamageById.add(attacker.instanceId);
      }
      damageById.set(attacker.instanceId, attackerDamageMarked);
      damageById.set(blocker.instanceId, blockerDamageMarked);

      const blockerDies = isEventCardDead(blocker, blockerStats.endurance, damageById, lethalDamageById);
      const attackerDies = isEventCardDead(attacker, attackerStats.endurance, damageById, lethalDamageById);
      if (blockerDies) deadBuffSourceIds.add(blocker.instanceId);
      if (attackerDies) deadBuffSourceIds.add(attacker.instanceId);
      events.push({
        attackerId,
        attackerDies,
        blockerId: blocker.instanceId,
        blockerDies,
        playerDamage: 0,
        playerLifeGain: hasTrait(game, blocker, "DRAIN")
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
 * between Host attackers, so a later blocker may have different power or traits than it had
 * when the combat sequence was first planned (Blood Page is the common case). */
export function refreshHostAttackEvent(game: GameState, planned: HostAttackEvent): HostAttackEvent | undefined {
  const attacker = game.host.field.find((card) => card.instanceId === planned.attackerId);
  if (!attacker) return undefined;
  const attackerStats = getPowerEndurance(game, attacker);

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

  const blocker = game.player.field.find((card) => card.instanceId === planned.blockerId);
  if (!blocker) return undefined;
  const blockerStats = getPowerEndurance(game, blocker);
  let attackerDamageMarked = attacker.damageMarked;
  let blockerDamageMarked = blocker.damageMarked;
  let blockerDamageDealt = 0;
  let attackerTookLethalDamage = attacker.lethalDamage;
  let blockerTookLethalDamage = blocker.lethalDamage;
  const attackerHasReflex = hasTrait(game, attacker, "REFLEX");
  const blockerHasReflex = hasTrait(game, blocker, "REFLEX");

  if (attackerHasReflex && !blockerHasReflex) {
    blockerDamageMarked += attackerStats.power;
    blockerTookLethalDamage ||= attackerStats.power > 0 && hasTrait(game, attacker, "LETHAL");
    if (!blockerTookLethalDamage && blockerDamageMarked < blockerStats.endurance) {
      attackerDamageMarked += blockerStats.power;
      blockerDamageDealt = blockerStats.power;
      attackerTookLethalDamage ||= blockerStats.power > 0 && hasTrait(game, blocker, "LETHAL");
    }
  } else if (blockerHasReflex && !attackerHasReflex) {
    attackerDamageMarked += blockerStats.power;
    blockerDamageDealt = blockerStats.power;
    attackerTookLethalDamage ||= blockerStats.power > 0 && hasTrait(game, blocker, "LETHAL");
    if (!attackerTookLethalDamage && attackerDamageMarked < attackerStats.endurance) {
      blockerDamageMarked += attackerStats.power;
      blockerTookLethalDamage ||= attackerStats.power > 0 && hasTrait(game, attacker, "LETHAL");
    }
  } else {
    attackerDamageMarked += blockerStats.power;
    blockerDamageMarked += attackerStats.power;
    blockerDamageDealt = blockerStats.power;
    attackerTookLethalDamage ||= blockerStats.power > 0 && hasTrait(game, blocker, "LETHAL");
    blockerTookLethalDamage ||= attackerStats.power > 0 && hasTrait(game, attacker, "LETHAL");
  }

  return {
    ...planned,
    attackerDies: attackerTookLethalDamage || attackerDamageMarked >= attackerStats.endurance,
    blockerDies: blockerTookLethalDamage || blockerDamageMarked >= blockerStats.endurance,
    playerDamage: 0,
    playerLifeGain: hasTrait(game, blocker, "DRAIN") ? Math.max(0, blockerDamageDealt) : 0,
    attackerDamageMarked,
    blockerDamageMarked,
  };
}

export function applyHostAttackEvent(game: GameState, event: HostAttackEvent): GameState {
  const next = structuredClone(game) as GameState;
  const attacker = next.host.field.find((card) => card.instanceId === event.attackerId);
  const blocker = event.blockerId
    ? next.player.field.find((card) => card.instanceId === event.blockerId)
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
    log(next, `Host deals ${event.playerDamage} damage to the Chronicler.`);
  }
  if (event.playerLifeGain > 0) {
    next.player.life += event.playerLifeGain;
    log(next, `Chronicler recovers ${event.playerLifeGain} Life with Drain.`);
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

export function isHostAttackEventCurrent(game: GameState, event: HostAttackEvent): boolean {
  const attackerExists = game.host.field.some((card) => card.instanceId === event.attackerId);
  if (!attackerExists) return false;
  return !event.blockerId || game.player.field.some((card) => card.instanceId === event.blockerId);
}

export function finishHostCombat(game: GameState, options: { deferTriggeredEvents?: boolean } = {}): GameState {
  const next = resolvePendingHostCombatDamageVolleys(game);
  next.combat.hostAttackers = [];
  next.combat.blockers = {};
  if (!options.deferTriggeredEvents) drainEventQueue(next);
  checkWinLoss(next);
  return next;
}

/** Commits one animated player's Drain impact without resolving the rest of player combat.
 *  The batch resolver uses the same rule by default; its `skipDrain` option prevents a second
 *  gain after the store has already landed each attacker's recovery at its visual impact. */
export function resolvePlayerAttackerDrain(game: GameState, attackerId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (!next.combat.playerAttackers.includes(attackerId)) return next;
  const attacker = next.player.field.find((card) => card.instanceId === attackerId);
  if (!attacker) return next;
  applyCombatDrain(next, attacker, getPowerEndurance(next, attacker).power);
  return next;
}

/** Life the currently selected player attackers will recover if combat resolves now. Keeping this
 * beside combat resolution makes the HUD preview follow conditional Traits and effective Power. */
export function previewPlayerAttackDrain(game: GameState): number {
  return game.combat.playerAttackers.reduce((total, attackerId) => {
    const attacker = game.player.field.find((card) => card.instanceId === attackerId);
    if (!attacker || !hasTrait(game, attacker, "DRAIN")) return total;
    return total + Math.max(0, getPowerEndurance(game, attacker).power);
  }, 0);
}

/** Commits one animated player's poison counters at that attacker's impact frame.
 *  The batch resolver can skip poison afterwards so the same counters are not applied twice. */
export function resolvePlayerAttackerPoison(game: GameState, attackerId: string): GameState {
  const next = structuredClone(game) as GameState;
  if (!next.combat.playerAttackers.includes(attackerId)) return next;
  const attacker = next.player.field.find((card) => card.instanceId === attackerId);
  if (!attacker || getPowerEndurance(next, attacker).power <= 0) return next;
  const amount = getPoisonAmount(next, attacker);
  if (amount <= 0) return next;
  next.host.poisonCounters += amount;
  log(next, `Host gets ${amount} poison counter(s).`);
  return next;
}

export function pendingHostCombatDamageVolley(game: GameState): {
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
 * `finishHostCombat` so the store can animate the volley first; non-animated callers still
 * receive the same rule because `finishHostCombat` invokes it as a fallback. */
export function resolvePendingHostCombatDamageVolleys(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  const pending = pendingHostCombatDamageVolley(next);
  next.combat.pendingDamageVolleys = [];
  if (!pending || pending.damage <= 0) return next;
  losePlayerLife(next, pending.damage, pending.sourceId);
  log(next, `Host attack volley deals ${pending.damage} damage to the Chronicler.`);
  checkWinLoss(next);
  return next;
}

function eventVisualDamage(card: CardInstance, damageById: Map<string, number>): number {
  return damageById.get(card.instanceId) ?? card.damageMarked;
}

function applyCombatDrain(game: GameState, source: CardInstance, damageDealt: number): number {
  const amount = Math.max(0, damageDealt);
  if (amount === 0 || source.controller !== "player" || !hasTrait(game, source, "DRAIN")) {
    return 0;
  }
  game.player.life += amount;
  log(game, `Chronicler recovers ${amount} Life with ${source.name}.`);
  return amount;
}

function isEventCardDead(
  card: CardInstance,
  endurance: number,
  damageById: Map<string, number>,
  lethalDamageById: Set<string>,
): boolean {
  return eventVisualDamage(card, damageById) >= endurance || lethalDamageById.has(card.instanceId);
}

export function checkWinLoss(game: GameState): void {
  if (game.player.life <= 0) game.winner = "host";
  const hostCanDamage = game.host.field.some((card) => card.kinds.includes("ECHO"));
  if (game.host.archive.length === 0 && !hostCanDamage) game.winner = "player";
}

function log(game: GameState, message: string): GameState {
  game.log.unshift(message);
  return game;
}

export function sortPlayerAttackersLeftToRight(game: GameState, attackerIds: string[]): string[] {
  const attackers = attackerIds
    .map((id) => game.player.field.find((card) => card.instanceId === id))
    .filter((card): card is CardInstance => Boolean(card));
  return sortFieldCardsByVisualOrder(game, game.player.field, attackers).map((card) => card.instanceId);
}

/** Host Field insertion order is summon order. Never regroup identical definitions here:
 * stacking is a visual concern, while combat must preserve the chronology in which cards entered. */
function sortCardsByFieldOrder(field: CardInstance[], cards: CardInstance[]): CardInstance[] {
  const entryIndex = new Map(field.map((card, index) => [card.instanceId, index]));
  return [...cards].sort(
    (left, right) =>
      (entryIndex.get(left.instanceId) ?? Number.MAX_SAFE_INTEGER) -
      (entryIndex.get(right.instanceId) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortFieldCardsByVisualOrder(game: GameState, field: CardInstance[], cards: CardInstance[]): CardInstance[] {
  const entryIndex = new Map(field.map((card, index) => [card.instanceId, index]));
  // Host swarm tokens are re-summoned throughout the encounter and reuse the same
  // definitionIds. The board groups swarm tokens (per-deck subtypes in hostRules) by
  // arrival wave so a later wave stays where it entered instead of jumping back into
  // the first stack. For attack ordering, that visual wave order equals entry order.
  const familyIndex = new Map<string, number>();
  for (const card of field) {
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
    game.hostRules.swarmTokenSubtypes.some((swarmSubtype) => swarmSubtype.toLowerCase() === subtype.toLowerCase()),
  );
}
