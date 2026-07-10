import { create } from "zustand";
import { createInitialGame } from "../engine/GameState";
import type { AbilityOptions, CastOptions, GameState, Phase } from "../engine/GameTypes";
import { playerDeck, hordeDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { castCard, playLand, tapForMana, toggleTap, activateAbility } from "../engine/GameActions";
import { declareBlocker, prepareHordeAttackers, resolveHordeCombat, resolvePlayerCombat, togglePlayerAttacker } from "../engine/CombatResolver";
import { finishHordeTurn, runFullHordeTurn } from "../engine/HordeController";
import { hasKeyword } from "../engine/Keywords";
import { getPowerToughness } from "../engine/StaticEffects";
import { useAudioStore } from "./useAudioStore";

type GameStore = {
  game: GameState;
  hordeAttackAnimation?: HordeAttackAnimation;
  playerAttackAnimation?: PlayerAttackAnimation;
  selectedHandId?: string;
  selectedPlayerCreatureId?: string;
  selectedHordeCreatureId?: string;
  hoveredCardId?: string;
  focusedCardId?: string;
  seed: string;
  reset: (seed?: string, setupTurns?: number) => void;
  setSeed: (seed: string) => void;
  selectHand: (id?: string) => void;
  selectPlayerCreature: (id?: string) => void;
  selectHordeCreature: (id?: string) => void;
  setHoveredCardId: (id?: string) => void;
  setFocusedCardId: (id?: string) => void;
  advancePhase: (phase?: Phase) => void;
  endPlayerTurn: () => void;
  playLand: (id: string) => void;
  castCard: (id: string, options?: CastOptions) => void;
  tapForMana: (id: string) => void;
  toggleTap: (id: string) => void;
  activateAbility: (id: string, abilityId: string, options?: AbilityOptions) => void;
  toggleAttacker: (id: string) => void;
  resolvePlayerCombat: () => void;
  finishPlayerCombat: () => void;
  runHordeMain: () => void;
  prepareHordeAttackers: () => void;
  declareBlocker: (blockerId: string, attackerId: string) => void;
  cancelBlocks: () => void;
  resolveHordeCombat: () => void;
  finishHordeTurn: () => void;
};

const defaultSeed = "horde-mvp-001";
const HORDE_ATTACK_ANIMATION_MS = 500;
const PLAYER_ATTACK_ANIMATION_MS = 500;

type HordeAttackAnimation = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  eventId: number;
};

type HordeAttackEvent = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
};

type PlayerAttackAnimation = {
  attackerId: string;
  eventId: number;
};

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(playerDeck, hordeDeck, defaultSeed, 3),
  hordeAttackAnimation: undefined,
  playerAttackAnimation: undefined,
  seed: defaultSeed,
  reset: (seed = get().seed, setupTurns = 3) =>
    set(() => {
      const next = createInitialGame(playerDeck, hordeDeck, seed, setupTurns);
      useAudioStore.getState().playSfx("draw");
      return {
        game: next,
        selectedHandId: undefined,
        selectedPlayerCreatureId: undefined,
        selectedHordeCreatureId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
        hordeAttackAnimation: undefined,
        playerAttackAnimation: undefined,
      };
    }),
  setSeed: (seed) => set({ seed }),
  selectHand: (id) => set({ selectedHandId: id }),
  selectPlayerCreature: (id) => set({ selectedPlayerCreatureId: id }),
  selectHordeCreature: (id) => set({ selectedHordeCreatureId: id }),
  setHoveredCardId: (id) => set({ hoveredCardId: id }),
  setFocusedCardId: (id) => set({ focusedCardId: id }),
  advancePhase: (phase) =>
    set(({ game }) => {
      const next = advancePhase(game, phase);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next };
    }),
  endPlayerTurn: () =>
    set(({ game }) => {
      const next = endPlayerTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next };
    }),
  playLand: (id) =>
    set(({ game }) => {
      const card = game.player.hand.find((item) => item.instanceId === id);
      const next = playLand(game, id);
      if (card?.cardTypes.includes("Land") && !next.player.hand.some((item) => item.instanceId === id)) useAudioStore.getState().playSfx("playLand");
      return { game: next, selectedHandId: undefined, focusedCardId: undefined };
    }),
  castCard: (id, options) =>
    set(({ game }) => {
      const card = game.player.hand.find((item) => item.instanceId === id);
      const sfx = card && card.cardTypes.includes("Creature") ? monsterSfx(card) : undefined;
      const next = castCard(game, id, options);
      const castSucceeded = Boolean(card && !next.player.hand.some((item) => item.instanceId === id));
      if (sfx && castSucceeded) useAudioStore.getState().playSfx(sfx);
      return { game: next, selectedHandId: undefined, focusedCardId: undefined };
    }),
  tapForMana: (id) => set(({ game }) => ({ game: tapForMana(game, id) })),
  toggleTap: (id) => set(({ game }) => ({ game: toggleTap(game, id) })),
  activateAbility: (id, abilityId, options) => set(({ game }) => ({ game: activateAbility(game, id, abilityId, options) })),
  toggleAttacker: (id) =>
    set(({ game }) => {
      const wasAttacking = game.combat.playerAttackers.includes(id);
      const next = togglePlayerAttacker(game, id);
      const changed = wasAttacking !== next.combat.playerAttackers.includes(id);
      if (changed) useAudioStore.getState().playSfx("playLand");
      return { game: next };
    }),
  resolvePlayerCombat: () => set(({ game }) => ({ game: resolvePlayerCombat(game) })),
  finishPlayerCombat: () => {
    const { game, playerAttackAnimation } = get();
    if (playerAttackAnimation) return;

    const attackers = [...game.combat.playerAttackers];
    if (attackers.length === 0) {
      set({ game: endPlayerTurn(resolvePlayerCombat(game)), selectedPlayerCreatureId: undefined });
      return;
    }

    attackers.forEach((attackerId, index) => {
      const startAt = index * PLAYER_ATTACK_ANIMATION_MS;
      window.setTimeout(() => {
        useAudioStore.getState().playSfx("attack", { volume: 0.75 });
        set({ playerAttackAnimation: { attackerId, eventId: index } });
      }, startAt);
    });

    window.setTimeout(() => {
      const latest = get().game;
      set({ game: endPlayerTurn(resolvePlayerCombat(latest)), playerAttackAnimation: undefined, selectedPlayerCreatureId: undefined });
    }, attackers.length * PLAYER_ATTACK_ANIMATION_MS + 40);
  },
  runHordeMain: () => set(({ game }) => ({ game: runFullHordeTurn(game), selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined })),
  prepareHordeAttackers: () => set(({ game }) => ({ game: prepareHordeAttackers(game) })),
  declareBlocker: (blockerId, attackerId) =>
    set(({ game }) => {
      const wasBlocking = Object.values(game.combat.blockers).some((ids) => ids.includes(blockerId));
      const next = declareBlocker(game, blockerId, attackerId);
      const isBlockingTarget = next.combat.blockers[attackerId]?.includes(blockerId) ?? false;
      if (!wasBlocking && isBlockingTarget) useAudioStore.getState().playSfx("playLand");
      return { game: next };
    }),
  cancelBlocks: () =>
    set(({ game }) => {
      const next = structuredClone(game) as GameState;
      next.combat.blockers = {};
      return { game: next, selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined };
    }),
  resolveHordeCombat: () => {
    const { game, hordeAttackAnimation, playerAttackAnimation } = get();
    if (hordeAttackAnimation || playerAttackAnimation) return;

    const attackEvents = buildHordeAttackEvents(game);
    if (attackEvents.length === 0) {
      set({ game: resolveHordeCombat(game), hordeAttackAnimation: undefined });
      return;
    }

    attackEvents.forEach((event, index) => {
      const startAt = index * HORDE_ATTACK_ANIMATION_MS;
      window.setTimeout(() => {
        useAudioStore.getState().playSfx(event.blockerDies ? "defend" : "attack", { volume: 0.75 });
        set({
          hordeAttackAnimation: {
            attackerId: event.attackerId,
            attackerDies: event.attackerDies,
            blockerId: event.blockerId,
            blockerDies: event.blockerDies,
            playerDamage: event.playerDamage,
            eventId: index,
          },
        });
      }, startAt);
    });

    window.setTimeout(() => {
      const latest = get().game;
      set({ game: resolveHordeCombat(latest), hordeAttackAnimation: undefined, selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined });
    }, attackEvents.length * HORDE_ATTACK_ANIMATION_MS + 40);
  },
  finishHordeTurn: () =>
    set(({ game }) => {
      const next = finishHordeTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next };
    }),
}));

function monsterSfx(card: GameState["player"]["hand"][number]) {
  if (card.basePower > 4 || card.baseToughness > 4) return "playMonsterHeavy" as const;
  if (card.effects.length > 0 || card.activatedAbilities.length > 0 || card.requiresTargets.length > 0) return "playMonsterEffect" as const;
  return "playMonster" as const;
}

function playDrawOneIfPlayerDrew(previous: GameState, next: GameState) {
  if (next.player.hand.length > previous.player.hand.length && next.player.library.length < previous.player.library.length) {
    useAudioStore.getState().playSfx("drawOne");
  }
}

function blockerWillDie(game: GameState, blockerId: string, attackerId: string) {
  const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
  if (!attacker) return false;

  const blockers = (game.combat.blockers[attackerId] ?? [])
    .map((id) => game.player.battlefield.find((card) => card.instanceId === id))
    .filter((card): card is GameState["player"]["battlefield"][number] => Boolean(card));

  const attackerStats = getPowerToughness(game, attacker);
  let remaining = attackerStats.power;
  for (const blocker of blockers) {
    const blockerStats = getPowerToughness(game, blocker);
    const lethal = hasKeyword(game, attacker, "DEATHTOUCH") ? 1 : Math.max(1, blockerStats.toughness - blocker.damageMarked);
    const assigned = hasKeyword(game, attacker, "TRAMPLE") ? Math.min(remaining, lethal) : remaining;
    if (blocker.instanceId === blockerId) {
      return assigned > 0 && (hasKeyword(game, attacker, "DEATHTOUCH") || blocker.damageMarked + assigned >= blockerStats.toughness);
    }
    remaining -= assigned;
    if (remaining <= 0) return false;
  }

  return false;
}

function buildHordeAttackEvents(game: GameState): HordeAttackEvent[] {
  const events: HordeAttackEvent[] = [];
  for (const attackerId of game.combat.hordeAttackers) {
    const blockerIds = game.combat.blockers[attackerId] ?? [];
    const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) continue;
    const attackerStats = getPowerToughness(game, attacker);

    if (blockerIds.length === 0) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    let attackerDamage = attacker.damageMarked;

    for (const blockerId of blockerIds) {
      const blocker = game.player.battlefield.find((card) => card.instanceId === blockerId);
      if (!blocker) continue;
      const blockerStats = getPowerToughness(game, blocker);
      const attackerDies = blockerStats.power > 0 && (hasKeyword(game, blocker, "DEATHTOUCH") || attackerDamage + blockerStats.power >= attackerStats.toughness);
      events.push({
        attackerId,
        attackerDies,
        blockerId,
        blockerDies: blockerWillDie(game, blockerId, attackerId),
        playerDamage: 0,
      });
      attackerDamage += blockerStats.power;
      if (attackerDies) break;
    }
  }
  return events;
}
