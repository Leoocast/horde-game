import { create } from "zustand";
import { createInitialGame } from "../engine/GameState";
import type { AbilityOptions, CastOptions, GameState, Phase } from "../engine/GameTypes";
import { playerDeck, hordeDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { castCard, playLand, tapForMana, toggleTap, activateAbility } from "../engine/GameActions";
import { declareBlocker, prepareHordeAttackers, resolveHordeCombat, resolvePlayerCombat, sortBlockersLeftToRight, togglePlayerAttacker } from "../engine/CombatResolver";
import { finishHordeTurn, runFullHordeTurn } from "../engine/HordeController";
import { hasKeyword } from "../engine/Keywords";
import { getPowerToughness } from "../engine/StaticEffects";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";

type GameStore = {
  game: GameState;
  hordeAttackAnimation?: HordeAttackAnimation;
  playerAttackAnimation?: PlayerAttackAnimation;
  autoPaidLandIds: string[];
  blockDrag?: BlockDragState;
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
  startBlockDrag: (blockerId: string, x: number, y: number) => void;
  updateBlockDrag: (x: number, y: number) => void;
  cancelBlockDrag: () => void;
  resolveHordeCombat: () => void;
  finishHordeTurn: () => void;
};

const defaultSeed = "horde-mvp-001";
const HORDE_ATTACK_ANIMATION_MS = 500;
const PLAYER_ATTACK_ANIMATION_MS = 500;
const AUTO_PAID_LAND_FLASH_MS = 900;
let autoPaidLandFlashTimer: number | undefined;

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

export type BlockDragState = {
  blockerId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(playerDeck, hordeDeck, defaultSeed, 4),
  hordeAttackAnimation: undefined,
  playerAttackAnimation: undefined,
  autoPaidLandIds: [],
  blockDrag: undefined,
  seed: defaultSeed,
  reset: (seed = get().seed, setupTurns = 4) =>
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
        autoPaidLandIds: [],
        blockDrag: undefined,
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
      const previousLog = game.log[0];
      const next = playLand(game, id);
      const playSucceeded = Boolean(card?.cardTypes.includes("Land") && !next.player.hand.some((item) => item.instanceId === id));
      if (playSucceeded) useAudioStore.getState().playSfx("playLand");
      else if (card && next.log[0] !== previousLog) showActionToast(next.log[0]);
      return { game: next, selectedHandId: undefined, focusedCardId: undefined };
    }),
  castCard: (id, options) =>
    set(({ game }) => {
      const card = game.player.hand.find((item) => item.instanceId === id);
      const sfx = card && card.cardTypes.includes("Creature") ? monsterSfx(card) : undefined;
      const previousLog = game.log[0];
      const untappedLandIds = new Set(game.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
      const next = castCard(game, id, options);
      const castSucceeded = Boolean(card && !next.player.hand.some((item) => item.instanceId === id));
      if (sfx && castSucceeded) useAudioStore.getState().playSfx(sfx);
      else if (card && !castSucceeded && next.log[0] !== previousLog) showActionToast(next.log[0]);
      const autoPaidLandIds = castSucceeded
        ? next.player.battlefield.filter((item) => item.cardTypes.includes("Land") && item.tapped && untappedLandIds.has(item.instanceId)).map((item) => item.instanceId)
        : [];
      if (autoPaidLandIds.length > 0) {
        if (autoPaidLandFlashTimer) window.clearTimeout(autoPaidLandFlashTimer);
        autoPaidLandFlashTimer = window.setTimeout(() => {
          useGameStore.setState({ autoPaidLandIds: [] });
          autoPaidLandFlashTimer = undefined;
        }, AUTO_PAID_LAND_FLASH_MS);
      }
      return { game: next, selectedHandId: undefined, focusedCardId: undefined, autoPaidLandIds };
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
  runHordeMain: () =>
    set(({ game }) => {
      const next = runFullHordeTurn(game);
      if (next.horde.battlefield.length > game.horde.battlefield.length) useAudioStore.getState().playSfx("draw");
      return { game: next, selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined };
    }),
  prepareHordeAttackers: () => set(({ game }) => ({ game: prepareHordeAttackers(game) })),
  declareBlocker: (blockerId, attackerId) =>
    set(({ game }) => {
      const wasBlocking = Object.values(game.combat.blockers).some((ids) => ids.includes(blockerId));
      const next = declareBlocker(game, blockerId, attackerId);
      const isBlockingTarget = next.combat.blockers[attackerId]?.includes(blockerId) ?? false;
      if (!wasBlocking && isBlockingTarget) useAudioStore.getState().playSfx("playLand");
      return { game: next, blockDrag: undefined };
    }),
  cancelBlocks: () =>
    set(({ game }) => {
      const next = structuredClone(game) as GameState;
      next.combat.blockers = {};
      return { game: next, selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined, blockDrag: undefined };
    }),
  startBlockDrag: (blockerId, x, y) => set({ blockDrag: { blockerId, startX: x, startY: y, x, y } }),
  updateBlockDrag: (x, y) =>
    set(({ blockDrag }) => ({
      blockDrag: blockDrag ? { ...blockDrag, x, y } : undefined,
    })),
  cancelBlockDrag: () => set({ blockDrag: undefined }),
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

function showActionToast(message?: string) {
  if (!message) return;
  useToastStore.getState().pushToast({
    title: "Action unavailable",
    message,
    tone: "warning",
  });
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

    if (hasKeyword(game, attacker, "MENACE") && blockerIds.length < 2) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    let attackerDamage = attacker.damageMarked;
    const blockers = sortBlockersLeftToRight(
      game,
      blockerIds
        .map((id) => game.player.battlefield.find((card) => card.instanceId === id))
        .filter((card): card is GameState["player"]["battlefield"][number] => Boolean(card)),
    );

    for (const blocker of blockers) {
      const blockerStats = getPowerToughness(game, blocker);
      const blockerDies = attackerStats.power > 0 && (hasKeyword(game, attacker, "DEATHTOUCH") || blocker.damageMarked + attackerStats.power >= blockerStats.toughness);
      const attackerDies = blockerStats.power > 0 && (hasKeyword(game, blocker, "DEATHTOUCH") || attackerDamage + blockerStats.power >= attackerStats.toughness);
      events.push({
        attackerId,
        attackerDies,
        blockerId: blocker.instanceId,
        blockerDies,
        playerDamage: 0,
      });
      attackerDamage += blockerStats.power;
      if (attackerDies) break;
    }
  }
  return events;
}
