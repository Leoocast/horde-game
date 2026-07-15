import type { GameState } from "./GameTypes";
import type { CardInstance } from "./GameTypes";
import { blockRestrictionReason, canAttack, canBlockAttacker, getToxicAmount, hasKeyword } from "./Keywords";
import { dealDamageToCreature, destroyMarkedCreatures, millHorde } from "./EffectResolver";
import { getPowerToughness } from "./StaticEffects";
import { drainEventQueue } from "./EventQueue";

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

export function prepareHordeAttackers(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  next.activeSide = "horde";
  next.phase = "combat";
  const attackers = next.horde.battlefield.filter((card) => canAttack(next, card));
  next.combat.hordeAttackers = attackers.map((card) => card.instanceId);
  for (const attacker of attackers) attacker.tapped = true;
  log(next, `Horde attacks with ${next.combat.hordeAttackers.length} creature(s).`);
  return next;
}

export function resolveHordeCombat(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  if (next.combat.hordeAttackers.length === 0) {
    return log(next, "No Horde attackers to resolve. Press Attack after Horde Turn first.");
  }
  let playerDamage = 0;
  for (const attackerId of next.combat.hordeAttackers) {
    const attacker = next.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) continue;
    const blockers = (next.combat.blockers[attackerId] ?? [])
      .map((id) => next.player.battlefield.find((card) => card.instanceId === id))
      .filter((card): card is CardInstance => Boolean(card));
    if (blockers.length === 0) {
      playerDamage += getPowerToughness(next, attacker).power;
      continue;
    }
    if (hasKeyword(next, attacker, "MENACE") && blockers.length < 2) {
      playerDamage += getPowerToughness(next, attacker).power;
      continue;
    }
    const attackerStats = getPowerToughness(next, attacker);
    let attackerDamage = attacker.damageMarked;
    for (const blocker of blockers) {
      const blockerStats = getPowerToughness(next, blocker);
      dealDamageToCreature(next, blocker, attackerStats.power, hasKeyword(next, attacker, "DEATHTOUCH"));
      dealDamageToCreature(next, attacker, blockerStats.power, hasKeyword(next, blocker, "DEATHTOUCH"));
      attackerDamage += blockerStats.power;
      if (hasKeyword(next, blocker, "DEATHTOUCH") || attackerDamage >= attackerStats.toughness) break;
    }
    destroyMarkedCreatures(next);
  }
  if (playerDamage > 0) {
    next.player.life -= playerDamage;
    log(next, `Horde deals ${playerDamage} damage to Player.`);
  }
  drainEventQueue(next);
  next.combat.hordeAttackers = [];
  next.combat.blockers = {};
  checkWinLoss(next);
  return next;
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
  return [...attackerIds].sort((left, right) => battlefieldIndex(game, left) - battlefieldIndex(game, right));
}

function battlefieldIndex(game: GameState, id: string): number {
  const index = game.player.battlefield.findIndex((card) => card.instanceId === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
