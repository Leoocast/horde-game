import { castCard } from "../engine/GameActions";
import {
  buildHostAttackEvents,
  prepareHostAttackers,
  resolveHostCombat,
} from "../engine/CombatResolver";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { beginHostMain, revealHostCardFromTop } from "../engine/HostController";
import { getPowerEndurance } from "../engine/StaticEffects";
import { blockRestriction, hasTrait } from "../engine/Traits";

export const LEARN_TO_PLAY_TERMINAL_CARD_FLAG = "learnToPlayTerminalCard";
export const LEARN_TO_PLAY_TERMINAL_TITAN_FLAG = "learnToPlayTerminalTitan";
export const LEARN_TO_PLAY_SURGE_DISCARD_FLAG = "playerCombatArchiveDiscardPriorityInSurge";

const LEARN_TO_PLAY_TERMINAL_FIELD_CARDS = new Set([
  "maela_watcher_of_the_heights",
  "aelyra_heir_of_elarion",
  "vaelor_emerald_guardian",
  "veiled_dawn_flower",
  "echo_of_the_forgotten_city",
  "river_of_elarion",
  "harvester_of_the_fallen",
  "memory_thief",
  "graveless_titan",
  "graveless_soldier",
]);

export type LearnToPlayTerminalPlan = Readonly<{
  revealCount: number;
  maximumSurvivingLife: number;
  revealedCardIds: readonly string[];
}>;

/**
 * Adds one real Archive arrival at a time until even the Chronicler's best legal defense loses.
 * The Titan is mandatory even if a badly wounded branch would already die to the first Soldier.
 */
export function planLearnToPlayTerminalTurn(game: GameState): LearnToPlayTerminalPlan {
  let candidate = beginHostMain(game);
  const revealedCardIds: string[] = [];
  let titanRevealed = false;
  let maximumSurvivingLife = Number.POSITIVE_INFINITY;

  while (candidate.host.archive.length > 0) {
    const nextCard = candidate.host.archive[0];
    if (!nextCard.flags[LEARN_TO_PLAY_TERMINAL_CARD_FLAG]) {
      throw new Error(`Learn to Play terminal Archive reached unmarked card "${nextCard.definitionId}".`);
    }
    candidate = revealHostCardFromTop(candidate);
    revealedCardIds.push(nextCard.instanceId);
    titanRevealed ||= Boolean(nextCard.flags[LEARN_TO_PLAY_TERMINAL_TITAN_FLAG]);
    maximumSurvivingLife = maximumPlayerLifeAfterHostCombat(candidate);
    if (titanRevealed && maximumSurvivingLife <= 0) {
      return Object.freeze({
        revealCount: revealedCardIds.length,
        maximumSurvivingLife,
        revealedCardIds: Object.freeze([...revealedCardIds]),
      });
    }
  }

  throw new Error("Learn to Play terminal Archive cannot produce an unavoidable defeat.");
}

/** Exhaustively evaluates the approved response window: optional Choque de Ecos and all blocks. */
export function maximumPlayerLifeAfterHostCombat(game: GameState): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const response of quickResponseBranches(game)) {
    const combat = prepareHostAttackers(response);
    best = Math.max(best, maximumLifeAcrossBlocks(combat));
  }
  return best;
}

function quickResponseBranches(game: GameState): GameState[] {
  const branches: GameState[] = [];
  const signatures = new Set<string>();
  const addBranch = (branch: GameState) => {
    const signature = terminalCombatSignature(branch);
    if (signatures.has(signature)) return;
    signatures.add(signature);
    branches.push(branch);
  };
  addBranch(structuredClone(game) as GameState);
  const clash = game.player.hand.find((card) => card.definitionId === "clash_of_echoes");
  if (!clash || clash.requiresTargets.length < 2) return branches;
  const [sourceRequirement, targetRequirement] = clash.requiresTargets;
  const allies = game.player.field.filter(isEcho);
  const enemies = game.host.field.filter(isEcho);

  for (const ally of allies) {
    for (const enemy of enemies) {
      const cast = castCard(game, clash.instanceId, {
        targets: {
          [sourceRequirement.id]: ally.instanceId,
          [targetRequirement.id]: enemy.instanceId,
        },
      });
      if (cast.lastActionResult?.ok) addBranch(cast);
    }
  }
  return branches;
}

function maximumLifeAcrossBlocks(combat: GameState): number {
  const blockers = combat.player.field.filter(isEcho);
  const attackers = combat.combat.hostAttackers
    .map((attackerId) => combat.host.field.find((card) => card.instanceId === attackerId))
    .filter((card): card is CardInstance => Boolean(card));
  const canUseAuthoredFastPath = [...combat.player.field, ...combat.host.field]
    .every((card) => LEARN_TO_PLAY_TERMINAL_FIELD_CARDS.has(card.definitionId))
    && combat.combat.pendingDamageVolleys.length === 0
    && !combat.player.field.some((card) => isEcho(card) && hasTrait(combat, card, "DRAIN"));
  if (canUseAuthoredFastPath) {
    const direct = maximumLifeForAuthoredTerminalSet(combat, blockers, attackers);
    if (direct !== undefined) return direct;
  }
  const attackerGroups = groupAuthoredAttackers(combat, attackers, blockers.length, canUseAuthoredFastPath);
  const legalGroupsByBlocker = new Map(blockers.map((blocker) => [
    blocker.instanceId,
    attackerGroups
      .filter((group) => !blockRestriction(combat, blocker, group.attackers[0]))
      .sort((left, right) => right.power - left.power),
  ]));
  const assignments: Record<string, string[]> = {};
  const assignedByGroup = new Map<string, number>();
  let maximumLife = Number.NEGATIVE_INFINITY;
  let bestAssignments: Record<string, string[]> | undefined;

  const visit = (index: number) => {
    if (index >= blockers.length) {
      const branch = {
        ...combat,
        combat: {
          ...combat.combat,
          blockers: Object.fromEntries(
            Object.entries(assignments).map(([attackerId, blockerIds]) => [attackerId, [...blockerIds]]),
          ),
        },
      } as GameState;
      if (!validDauntingAssignments(branch)) return;
      const life = canUseAuthoredFastPath
        ? playerLifeFromAuthoredCombatEvents(branch)
        : resolveHostCombat(branch).player.life;
      if (life > maximumLife) {
        maximumLife = life;
        bestAssignments = Object.fromEntries(
          Object.entries(assignments).map(([attackerId, blockerIds]) => [attackerId, [...blockerIds]]),
        );
      }
      return;
    }

    const blockerId = blockers[index].instanceId;
    // Stronger attackers first makes the useful branch appear early without changing the complete
    // search. Assignments are built as plain data; the real resolver still decides every result.
    for (const group of legalGroupsByBlocker.get(blockerId) ?? []) {
      const assignedCount = assignedByGroup.get(group.key) ?? 0;
      if (assignedCount >= group.capacity) continue;
      const attackerId = group.canonicalDistinctBlocks
        ? group.attackers[assignedCount].instanceId
        : group.attackers[0].instanceId;
      (assignments[attackerId] ??= []).push(blockerId);
      assignedByGroup.set(group.key, assignedCount + 1);
      visit(index + 1);
      assignments[attackerId].pop();
      if (assignments[attackerId].length === 0) delete assignments[attackerId];
      if (assignedCount === 0) assignedByGroup.delete(group.key);
      else assignedByGroup.set(group.key, assignedCount);
    }
    visit(index + 1);
  };

  visit(0);
  if (canUseAuthoredFastPath && bestAssignments) {
    const verified = resolveHostCombat({
      ...combat,
      combat: { ...combat.combat, blockers: bestAssignments },
    } as GameState).player.life;
    if (verified !== maximumLife) {
      throw new Error(`Learn to Play terminal combat shortcut diverged from the engine (${maximumLife} !== ${verified}).`);
    }
  }
  return maximumLife;
}

/**
 * Every terminal attacker is grounded, Harvester acts first, and the approved defenders have no
 * Drain. A legal ordinary block therefore prevents that attack's full Power; Daunting costs two
 * defenders. This is a tiny 0/1 knapsack over the actual attackers. The selected optimum is then
 * resolved once by the engine, so a rules/card change that invalidates the shortcut fails closed.
 */
function maximumLifeForAuthoredTerminalSet(
  game: GameState,
  blockers: readonly CardInstance[],
  attackers: readonly CardInstance[],
): number | undefined {
  const harvesterIndex = attackers.findIndex((card) => card.definitionId === "harvester_of_the_fallen");
  if (harvesterIndex > 0) return undefined;

  const usableBlockers: CardInstance[] = [];
  for (const blocker of blockers) {
    const legalCount = attackers.filter((attacker) => !blockRestriction(game, blocker, attacker)).length;
    if (legalCount === attackers.length) usableBlockers.push(blocker);
    else if (legalCount !== 0) return undefined;
  }

  type Choice = Readonly<{ attacker: CardInstance; cost: number; prevented: number }>;
  type Cell = Readonly<{ prevented: number; choices: readonly Choice[] }>;
  const capacity = usableBlockers.length;
  const cells: Cell[] = Array.from({ length: capacity + 1 }, () => ({ prevented: 0, choices: [] }));
  for (const attacker of attackers) {
    const choice: Choice = {
      attacker,
      cost: hasTrait(game, attacker, "DAUNTING") ? 2 : 1,
      prevented: getPowerEndurance(game, attacker).power,
    };
    for (let used = capacity; used >= choice.cost; used -= 1) {
      const prior = cells[used - choice.cost];
      const candidate = prior.prevented + choice.prevented;
      if (candidate > cells[used].prevented) {
        cells[used] = { prevented: candidate, choices: [...prior.choices, choice] };
      }
    }
  }
  const best = cells.reduce((left, right) => right.prevented > left.prevented ? right : left);
  const assignments: Record<string, string[]> = {};
  let blockerIndex = 0;
  for (const choice of best.choices) {
    assignments[choice.attacker.instanceId] = usableBlockers
      .slice(blockerIndex, blockerIndex + choice.cost)
      .map((blocker) => blocker.instanceId);
    blockerIndex += choice.cost;
  }
  const totalPower = attackers.reduce(
    (total, attacker) => total + getPowerEndurance(game, attacker).power,
    0,
  );
  const calculated = game.player.life - totalPower + best.prevented;
  const verified = resolveHostCombat({
    ...game,
    combat: { ...game.combat, blockers: assignments },
  } as GameState).player.life;
  if (verified !== calculated) {
    throw new Error(`Learn to Play terminal combat plan diverged from the engine (${calculated} !== ${verified}).`);
  }
  return verified;
}

type AuthoredAttackerGroup = Readonly<{
  key: string;
  attackers: readonly CardInstance[];
  capacity: number;
  power: number;
  canonicalDistinctBlocks: boolean;
}>;

/**
 * In the approved terminal set, assigning a second blocker to an ordinary attacker cannot improve
 * final Life: there is no Drain and no aura source whose mid-combat death weakens later attackers.
 * Identical ordinary attackers are therefore represented by one group with one slot per copy;
 * Daunting attackers remain individual and expose exactly the two slots required to stop them.
 */
function groupAuthoredAttackers(
  game: GameState,
  attackers: readonly CardInstance[],
  blockerCount: number,
  authoredFastPath: boolean,
): AuthoredAttackerGroup[] {
  if (!authoredFastPath) {
    return attackers.map((attacker) => ({
      key: attacker.instanceId,
      attackers: [attacker],
      capacity: blockerCount,
      power: getPowerEndurance(game, attacker).power,
      canonicalDistinctBlocks: false,
    }));
  }

  const groups = new Map<string, CardInstance[]>();
  const result: AuthoredAttackerGroup[] = [];
  for (const attacker of attackers) {
    const stats = getPowerEndurance(game, attacker);
    if (hasTrait(game, attacker, "DAUNTING")) {
      result.push({
        key: attacker.instanceId,
        attackers: [attacker],
        capacity: Math.min(2, blockerCount),
        power: stats.power,
        canonicalDistinctBlocks: false,
      });
      continue;
    }
    const key = JSON.stringify([
      attacker.definitionId,
      stats.power,
      stats.endurance,
      attacker.damageMarked,
      attacker.lethalDamage,
      [...attacker.traits, ...attacker.temporaryTraits].sort(),
    ]);
    const group = groups.get(key);
    if (group) group.push(attacker);
    else groups.set(key, [attacker]);
  }
  for (const [key, group] of groups) {
    result.push({
      key,
      attackers: group,
      capacity: Math.min(group.length, blockerCount),
      power: getPowerEndurance(game, group[0]).power,
      canonicalDistinctBlocks: true,
    });
  }
  return result;
}

/**
 * The authored terminal card set has no Drain or life-changing death Reactions. The engine's
 * event builder already applies left-to-right order, restrictions and Harvester growth, so branch
 * ranking can avoid cloning the full Archive thousands of times. The winning branch is still
 * resolved once through `resolveHostCombat` above and any future divergence fails closed.
 */
function playerLifeFromAuthoredCombatEvents(game: GameState): number {
  return buildHostAttackEvents(game).reduce(
    (life, event) => life - event.playerDamage + event.playerLifeGain,
    game.player.life,
  );
}

/** Collapses isomorphic Choque targets (notably identical Soldiers) before block enumeration. */
function terminalCombatSignature(game: GameState): string {
  const card = (entry: CardInstance) => {
    const stats = getPowerEndurance(game, entry);
    return [
      entry.definitionId,
      stats.power,
      stats.endurance,
      entry.damageMarked,
      entry.lethalDamage,
      entry.exhausted,
      entry.stabilizing,
      entry.activatedThisTurn,
      Object.entries(entry.counters).sort(([left], [right]) => left.localeCompare(right)),
      [...entry.traits, ...entry.temporaryTraits].sort(),
    ];
  };
  return JSON.stringify({
    life: game.player.life,
    energy: game.player.energyPool,
    playerHand: game.player.hand.map((entry) => entry.definitionId),
    playerField: game.player.field.map(card),
    hostField: game.host.field.map(card),
  });
}

function validDauntingAssignments(game: GameState): boolean {
  return game.combat.hostAttackers.every((attackerId) => {
    const attacker = game.host.field.find((card) => card.instanceId === attackerId);
    if (!attacker || !hasTrait(game, attacker, "DAUNTING")) return true;
    return (game.combat.blockers[attackerId]?.length ?? 0) !== 1;
  });
}

function isEcho(card: CardInstance): boolean {
  return card.kinds.includes("ECHO");
}
