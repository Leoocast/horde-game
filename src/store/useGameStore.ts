import { create } from "zustand";
import { createInitialGame } from "../engine/GameState";
import type { AbilityOptions, CastOptions, GameState, Phase } from "../engine/GameTypes";
import { playerDeck, hordeDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { castCard, playLand, tapForMana, toggleTap, activateAbility } from "../engine/GameActions";
import { declareBlocker, prepareHordeAttackers, resolveHordeCombat, resolvePlayerCombat, sortBlockersLeftToRight, sortPlayerAttackersLeftToRight, togglePlayerAttacker } from "../engine/CombatResolver";
import { finishHordeTurn, runFullHordeTurn } from "../engine/HordeController";
import { hasKeyword } from "../engine/Keywords";
import { getPowerToughness } from "../engine/StaticEffects";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";

type GameStore = {
  game: GameState;
  hordeAttackAnimation?: HordeAttackAnimation;
  playerAttackAnimation?: PlayerAttackAnimation;
  hordeCombatVisualDamage?: Record<string, number>;
  hordeCombatDeadCardIds: string[];
  autoPaidLandAnimation?: AutoPaidLandAnimation;
  blockDrag?: BlockDragState;
  playerAttackDrag?: PlayerAttackDragState;
  cardContextMenu?: CardContextMenuState;
  counterTargeting?: CounterTargetingState;
  buffAnimationCardId?: string;
  lifeBuffAnimationId?: number;
  selectedHandId?: string;
  selectedPlayerCreatureId?: string;
  selectedHordeCreatureId?: string;
  activeEffectCardId?: string;
  closingEffectCardId?: string;
  activatingEffectCardId?: string;
  hoveredCardId?: string;
  focusedCardId?: string;
  seed: string;
  reset: (seed?: string, setupTurns?: number) => void;
  setSeed: (seed: string) => void;
  selectHand: (id?: string) => void;
  selectPlayerCreature: (id?: string) => void;
  selectHordeCreature: (id?: string) => void;
  selectActiveEffectCard: (id?: string) => void;
  triggerEffectActivationPulse: (id: string) => void;
  updateCounterTargetPointer: (x: number, y: number) => void;
  lockCounterTarget: (targetId: string) => void;
  deselectCounterTarget: () => void;
  cancelCounterTargeting: () => void;
  confirmCounterTargeting: () => void;
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
  cancelPlayerAttackers: () => void;
  resolvePlayerCombat: () => void;
  finishPlayerCombat: () => void;
  runHordeMain: () => void;
  prepareHordeAttackers: () => void;
  declareBlocker: (blockerId: string, attackerId: string) => void;
  cancelBlocks: () => void;
  startBlockDrag: (blockerId: string, x: number, y: number) => void;
  updateBlockDrag: (x: number, y: number) => void;
  cancelBlockDrag: () => void;
  startPlayerAttackDrag: (attackerId: string, x: number, y: number) => void;
  updatePlayerAttackDrag: (x: number, y: number) => void;
  cancelPlayerAttackDrag: () => void;
  openCardContextMenu: (cardId: string, x: number, y: number) => void;
  closeCardContextMenu: () => void;
  resolveHordeCombat: () => void;
  finishHordeTurn: () => void;
};

const SEED_STORAGE_KEY = "horde-game-seed";
const defaultSeed = readStoredSeed();
const HORDE_ATTACK_ANIMATION_MS = 500;
const PLAYER_ATTACK_ANIMATION_MS = 500;
const AUTO_PAID_LAND_FLASH_MS = 900;
const BUFF_ANIMATION_MS = 1120;
let autoPaidLandFlashTimer: number | undefined;
let activeEffectCloseTimer: number | undefined;
let effectActivationPulseTimer: number | undefined;
let buffAnimationTimer: number | undefined;
let lifeBuffAnimationTimer: number | undefined;

type HordeAttackAnimation = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  attackerDamageMarked?: number;
  blockerDamageMarked?: number;
  eventId: number;
};

type HordeAttackEvent = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  attackerDamageMarked?: number;
  blockerDamageMarked?: number;
};

type PlayerAttackAnimation = {
  attackerId: string;
  eventId: number;
};

type AutoPaidLandAnimation = {
  ids: string[];
  eventId: number;
};

export type BlockDragState = {
  blockerId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

export type PlayerAttackDragState = {
  attackerId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

export type CardContextMenuState = {
  cardId: string;
  x: number;
  y: number;
};

export type CounterTargetingState = {
  sourceId: string;
  targetId?: string;
  x: number;
  y: number;
};

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(playerDeck, hordeDeck, defaultSeed, 4),
  hordeAttackAnimation: undefined,
  playerAttackAnimation: undefined,
  hordeCombatVisualDamage: undefined,
  hordeCombatDeadCardIds: [],
  autoPaidLandAnimation: undefined,
  blockDrag: undefined,
  playerAttackDrag: undefined,
  cardContextMenu: undefined,
  counterTargeting: undefined,
  buffAnimationCardId: undefined,
  lifeBuffAnimationId: undefined,
  seed: defaultSeed,
  reset: (seed = get().seed, setupTurns = 4) =>
    set(() => {
      persistSeed(seed);
      const next = createInitialGame(playerDeck, hordeDeck, seed, setupTurns);
      useAudioStore.getState().playSfx("draw");
      return {
        game: next,
        seed,
        selectedHandId: undefined,
        selectedPlayerCreatureId: undefined,
        selectedHordeCreatureId: undefined,
        activeEffectCardId: undefined,
        closingEffectCardId: undefined,
        activatingEffectCardId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
        hordeAttackAnimation: undefined,
        playerAttackAnimation: undefined,
        hordeCombatVisualDamage: undefined,
        hordeCombatDeadCardIds: [],
        autoPaidLandAnimation: undefined,
        blockDrag: undefined,
        playerAttackDrag: undefined,
        cardContextMenu: undefined,
        counterTargeting: undefined,
        buffAnimationCardId: undefined,
        lifeBuffAnimationId: undefined,
      };
    }),
  setSeed: (seed) => {
    persistSeed(seed);
    set({ seed });
  },
  selectHand: (id) => set({ selectedHandId: id }),
  selectPlayerCreature: (id) => set({ selectedPlayerCreatureId: id }),
  selectHordeCreature: (id) => set({ selectedHordeCreatureId: id }),
  selectActiveEffectCard: (id) =>
    set(({ activeEffectCardId }) => {
      if (activeEffectCloseTimer) {
        window.clearTimeout(activeEffectCloseTimer);
        activeEffectCloseTimer = undefined;
      }
      if (id) return { activeEffectCardId: id, closingEffectCardId: undefined };
      if (!activeEffectCardId) return { activeEffectCardId: undefined, closingEffectCardId: undefined };
      activeEffectCloseTimer = window.setTimeout(() => {
        useGameStore.setState({ closingEffectCardId: undefined });
        activeEffectCloseTimer = undefined;
      }, 190);
      return { activeEffectCardId: undefined, closingEffectCardId: activeEffectCardId };
    }),
  triggerEffectActivationPulse: (id) => {
    if (effectActivationPulseTimer) {
      window.clearTimeout(effectActivationPulseTimer);
      effectActivationPulseTimer = undefined;
    }
    set({ activatingEffectCardId: id });
    effectActivationPulseTimer = window.setTimeout(() => {
      useGameStore.setState({ activatingEffectCardId: undefined });
      effectActivationPulseTimer = undefined;
    }, 460);
  },
  updateCounterTargetPointer: (x, y) =>
    set(({ counterTargeting }) => ({
      counterTargeting: counterTargeting && !counterTargeting.targetId ? { ...counterTargeting, x, y } : counterTargeting,
    })),
  lockCounterTarget: (targetId) =>
    set(({ counterTargeting }) => {
      if (!counterTargeting) return {};
      useAudioStore.getState().playSfx("playLand", { volume: 0.72 });
      return { counterTargeting: { ...counterTargeting, targetId } };
    }),
  deselectCounterTarget: () =>
    set(({ counterTargeting }) => ({
      counterTargeting: counterTargeting ? { ...counterTargeting, targetId: undefined } : undefined,
    })),
  cancelCounterTargeting: () => set({ counterTargeting: undefined }),
  confirmCounterTargeting: () =>
    set(({ game, counterTargeting }) => {
      if (!counterTargeting?.targetId) return {};
      const next = structuredClone(game) as GameState;
      const target = findBattlefieldCard(next, counterTargeting.targetId);
      if (!target) return { counterTargeting: undefined };
      target.counters["+1/+1"] = (target.counters["+1/+1"] ?? 0) + 1;
      next.player.life += 1;
      next.log.unshift(`${target.name} gets a +1/+1 counter. Player gains 1 life.`);
      useAudioStore.getState().playSfx("buff", { volume: 0.82 });
      if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
      if (lifeBuffAnimationTimer) window.clearTimeout(lifeBuffAnimationTimer);
      buffAnimationTimer = window.setTimeout(() => {
        useGameStore.setState({ buffAnimationCardId: undefined });
        buffAnimationTimer = undefined;
      }, BUFF_ANIMATION_MS);
      lifeBuffAnimationTimer = window.setTimeout(() => {
        useGameStore.setState({ lifeBuffAnimationId: undefined });
        lifeBuffAnimationTimer = undefined;
      }, BUFF_ANIMATION_MS);
      return {
        game: next,
        counterTargeting: undefined,
        buffAnimationCardId: target.instanceId,
        lifeBuffAnimationId: Date.now(),
      };
    }),
  setHoveredCardId: (id) => set({ hoveredCardId: id }),
  setFocusedCardId: (id) => set({ focusedCardId: id }),
  advancePhase: (phase) =>
    set(({ game }) => {
      const next = advancePhase(game, phase);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, playerAttackDrag: undefined };
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
      return { game: next, selectedHandId: undefined, focusedCardId: undefined, activeEffectCardId: undefined };
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
      const autoPaidLandAnimation = autoPaidLandIds.length > 0 ? { ids: autoPaidLandIds, eventId: Date.now() } : undefined;
      if (autoPaidLandAnimation) {
        if (autoPaidLandFlashTimer) window.clearTimeout(autoPaidLandFlashTimer);
        autoPaidLandFlashTimer = window.setTimeout(() => {
          useGameStore.setState({ autoPaidLandAnimation: undefined });
          autoPaidLandFlashTimer = undefined;
        }, AUTO_PAID_LAND_FLASH_MS);
      }
      if (card?.definitionId === "sunshower_druid" && castSucceeded) {
        window.setTimeout(() => {
          const latest = useGameStore.getState().game;
          if (!findBattlefieldCard(latest, card.instanceId)) return;
          useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
          useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
          window.setTimeout(() => {
            useGameStore.setState({
              counterTargeting: {
                sourceId: card.instanceId,
                x: window.innerWidth * 0.62,
                y: window.innerHeight * 0.48,
              },
            });
          }, 520);
        }, 420);
      }
      return {
        game: next,
        selectedHandId: undefined,
        focusedCardId: undefined,
        activeEffectCardId: undefined,
        autoPaidLandAnimation,
      };
    }),
  tapForMana: (id) => set(({ game }) => ({ game: tapForMana(game, id) })),
  toggleTap: (id) => set(({ game }) => ({ game: toggleTap(game, id) })),
  activateAbility: (id, abilityId, options) => set(({ game }) => ({ game: activateAbility(game, id, abilityId, options), activeEffectCardId: undefined })),
  toggleAttacker: (id) =>
    set(({ game }) => {
      const wasAttacking = game.combat.playerAttackers.includes(id);
      const next = togglePlayerAttacker(game, id);
      const changed = wasAttacking !== next.combat.playerAttackers.includes(id);
      if (changed) useAudioStore.getState().playSfx("playLand");
      return { game: next };
    }),
  cancelPlayerAttackers: () =>
    set(({ game }) => {
      const next = structuredClone(game) as GameState;
      const attackers = new Set(next.combat.playerAttackers);
      for (const card of next.player.battlefield) {
        if (attackers.has(card.instanceId) && !hasKeyword(next, card, "VIGILANCE")) card.tapped = false;
      }
      next.combat.playerAttackers = [];
      next.log.unshift("Player cancels attackers.");
      return { game: next, selectedPlayerCreatureId: undefined, playerAttackDrag: undefined };
    }),
  resolvePlayerCombat: () => set(({ game }) => ({ game: resolvePlayerCombat(game) })),
  finishPlayerCombat: () => {
    const { game, playerAttackAnimation } = get();
    if (playerAttackAnimation) return;

    const attackers = sortPlayerAttackersLeftToRight(game, game.combat.playerAttackers);
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
      const previousLog = game.log[0];
      const wasBlocking = Object.values(game.combat.blockers).some((ids) => ids.includes(blockerId));
      const next = declareBlocker(game, blockerId, attackerId);
      const isBlockingTarget = next.combat.blockers[attackerId]?.includes(blockerId) ?? false;
      if (!wasBlocking && isBlockingTarget) useAudioStore.getState().playSfx("playLand");
      else if (!isBlockingTarget && next.log[0] !== previousLog && !next.log[0]?.includes("stops blocking")) showActionToast(next.log[0]);
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
  startPlayerAttackDrag: (attackerId, x, y) => set({ playerAttackDrag: { attackerId, startX: x, startY: y, x, y } }),
  updatePlayerAttackDrag: (x, y) =>
    set(({ playerAttackDrag }) => ({
      playerAttackDrag: playerAttackDrag ? { ...playerAttackDrag, x, y } : undefined,
    })),
  cancelPlayerAttackDrag: () => set({ playerAttackDrag: undefined }),
  openCardContextMenu: (cardId, x, y) => set({ cardContextMenu: { cardId, x, y }, focusedCardId: undefined }),
  closeCardContextMenu: () => set({ cardContextMenu: undefined }),
  resolveHordeCombat: () => {
    const { game, hordeAttackAnimation, playerAttackAnimation } = get();
    if (hordeAttackAnimation || playerAttackAnimation) return;

    const attackEvents = buildHordeAttackEvents(game);
    if (attackEvents.length === 0) {
      set({ game: resolveHordeCombat(game), hordeAttackAnimation: undefined, hordeCombatVisualDamage: undefined, hordeCombatDeadCardIds: [] });
      return;
    }

    attackEvents.forEach((event, index) => {
      const startAt = index * HORDE_ATTACK_ANIMATION_MS;
      window.setTimeout(() => {
        useAudioStore.getState().playSfx(event.blockerDies ? "defend" : "attack", { volume: 0.75 });
        set({
          hordeCombatVisualDamage: nextVisualDamage(event),
          hordeAttackAnimation: {
            attackerId: event.attackerId,
            attackerDies: event.attackerDies,
            blockerId: event.blockerId,
            blockerDies: event.blockerDies,
            playerDamage: event.playerDamage,
            attackerDamageMarked: event.attackerDamageMarked,
            blockerDamageMarked: event.blockerDamageMarked,
            eventId: index,
          },
        });
      }, startAt);
      if (event.attackerDies || event.blockerDies) {
        window.setTimeout(() => {
          set({ hordeCombatDeadCardIds: nextDeadCardIds(event) });
        }, startAt + HORDE_ATTACK_ANIMATION_MS - 35);
      }
    });

    window.setTimeout(() => {
      const latest = get().game;
      set({ game: resolveHordeCombat(latest), hordeAttackAnimation: undefined, hordeCombatVisualDamage: undefined, hordeCombatDeadCardIds: [], selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined });
    }, attackEvents.length * HORDE_ATTACK_ANIMATION_MS + 40);
  },
  finishHordeTurn: () =>
    set(({ game }) => {
      const next = finishHordeTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next };
    }),
}));

function readStoredSeed(): string {
  if (typeof window === "undefined") return "developer";
  return window.localStorage.getItem(SEED_STORAGE_KEY) ?? "developer";
}

function persistSeed(seed: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEED_STORAGE_KEY, seed);
}

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

function findBattlefieldCard(game: GameState, id: string) {
  return [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === id);
}

function buildHordeAttackEvents(game: GameState): HordeAttackEvent[] {
  const events: HordeAttackEvent[] = [];
  const damageById = new Map<string, number>();
  const deathtouchById = new Set<string>();

  for (const attackerId of game.combat.hordeAttackers) {
    const blockerIds = game.combat.blockers[attackerId] ?? [];
    const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) continue;
    const attackerStats = getPowerToughness(game, attacker);
    if (isVisuallyDead(attacker, attackerStats.toughness, damageById, deathtouchById)) continue;

    if (blockerIds.length === 0) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    if (hasKeyword(game, attacker, "MENACE") && blockerIds.length < 2) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    const blockers = sortBlockersLeftToRight(
      game,
      blockerIds
        .map((id) => game.player.battlefield.find((card) => card.instanceId === id))
        .filter((card): card is GameState["player"]["battlefield"][number] => Boolean(card)),
    );

    for (const blocker of blockers) {
      const blockerStats = getPowerToughness(game, blocker);
      if (isVisuallyDead(blocker, blockerStats.toughness, damageById, deathtouchById)) continue;

      const attackerDamageMarked = visualDamage(attacker, damageById) + blockerStats.power;
      const blockerDamageMarked = visualDamage(blocker, damageById) + attackerStats.power;
      if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
      if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
      damageById.set(attacker.instanceId, attackerDamageMarked);
      damageById.set(blocker.instanceId, blockerDamageMarked);

      const blockerDies = isVisuallyDead(blocker, blockerStats.toughness, damageById, deathtouchById);
      const attackerDies = isVisuallyDead(attacker, attackerStats.toughness, damageById, deathtouchById);
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

function visualDamage(card: GameState["player"]["battlefield"][number], damageById: Map<string, number>): number {
  return damageById.get(card.instanceId) ?? card.damageMarked;
}

function isVisuallyDead(card: GameState["player"]["battlefield"][number], toughness: number, damageById: Map<string, number>, deathtouchById: Set<string>): boolean {
  return visualDamage(card, damageById) >= toughness || deathtouchById.has(card.instanceId);
}

function nextVisualDamage(event: HordeAttackEvent): Record<string, number> {
  const current = useGameStore.getState().hordeCombatVisualDamage ?? {};
  const next = { ...current };
  if (event.attackerDamageMarked !== undefined) next[event.attackerId] = event.attackerDamageMarked;
  if (event.blockerId && event.blockerDamageMarked !== undefined) next[event.blockerId] = event.blockerDamageMarked;
  return next;
}

function nextDeadCardIds(event: HordeAttackEvent): string[] {
  const next = new Set(useGameStore.getState().hordeCombatDeadCardIds);
  if (event.attackerDies) next.add(event.attackerId);
  if (event.blockerDies && event.blockerId) next.add(event.blockerId);
  return [...next];
}
