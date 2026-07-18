import { create } from "zustand";
import { createInitialGame } from "../engine/GameState";
import type { AbilityOptions, CardInstance, CastOptions, EffectDefinition, EventItem, GameState, Phase } from "../engine/GameTypes";
import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID, getHordeDeck, getPlayerDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { castCard, playLand, activateAbility } from "../engine/GameActions";
import { checkWinLoss, declareBlocker, prepareHordeAttackers, resolveHordeCombat, resolvePlayerCombat, sortPlayerAttackersLeftToRight, togglePlayerAttacker } from "../engine/CombatResolver";
import { finishHordeTurn, runHordeMain as runHordeMainPhase } from "../engine/HordeController";
import { canAttack, hasKeyword } from "../engine/Keywords";
import { getPowerToughness } from "../engine/StaticEffects";
import { destroyMarkedCreatures, destroyPermanent, discardChosenCard, effectNeedsManualTarget, millHorde, resolveEffect, resolveTriggeredEvent, runEnterBattlefieldTriggers, triggeredSourcesForEvent, triggerConditionMet } from "../engine/EffectResolver";
import { drainEventQueue } from "../engine/EventQueue";
import { targetCandidates, weakestCreature } from "../engine/Targeting";
import type { TutorialStepId } from "../engine/Tutorial";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { playerHandOverflow } from "../engine/GameRules";

type GameStore = {
  game: GameState;
  hordeAttackAnimation?: HordeAttackAnimation;
  playerAttackAnimation?: PlayerAttackAnimation;
  resolvingHordeCombat: boolean;
  summoningAnimationCount: number;
  pendingTriggeredEffectCount: number;
  hordeAutoTriggerCount: number;
  hordeCombatVisualDamage?: Record<string, number>;
  hordeCombatDeadCardIds: string[];
  specialDeadCardIds: string[];
  hordeMillAnimationQueue: HordeMillAnimationItem[];
  hordeMillPreviewCards: CardInstance[];
  playerDiscardAnimationQueue: PlayerDiscardAnimationItem[];
  handLimitDiscardActive: boolean;
  handLimitSelectionId?: string;
  autoPaidLandAnimation?: AutoPaidLandAnimation;
  blockDrag?: BlockDragState;
  playerAttackDrag?: PlayerAttackDragState;
  cardContextMenu?: CardContextMenuState;
  counterTargeting?: CounterTargetingState;
  smallpoxCard?: CardInstance;
  smallpoxSelection?: SmallpoxSelectionState;
  spellTargeting?: SpellTargetingState;
  spellFightAnimation?: SpellFightAnimationState;
  pendingSpellHandId?: string;
  buffAnimationCardIds: string[];
  buffAnimationEventId?: number;
  lifeBuffAnimationId?: number;
  selectedHandId?: string;
  selectedPlayerCreatureId?: string;
  selectedHordeCreatureId?: string;
  activeEffectCardId?: string;
  closingEffectCardId?: string;
  activatingEffectCardId?: string;
  hoveredCardId?: string;
  focusedCardId?: string;
  tutorialAcknowledgedStepId?: TutorialStepId;
  seed: string;
  playerDeckId: string;
  hordeDeckId: string;
  reset: (seed?: string, setupTurns?: number, playerDeckId?: string, hordeDeckId?: string) => void;
  setSeed: (seed: string) => void;
  acknowledgeTutorialStep: (stepId: TutorialStepId) => void;
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
  updateSmallpoxSelectionPointer: (x: number, y: number) => void;
  lockSmallpoxSelectionTarget: (targetId: string) => void;
  deselectSmallpoxSelectionTarget: () => void;
  confirmSmallpoxSelection: () => void;
  selectHandLimitDiscard: (id?: string) => void;
  confirmHandLimitDiscard: () => void;
  startSpellTargeting: (handId: string, x: number, y: number) => void;
  updateSpellTargetPointer: (x: number, y: number) => void;
  lockSpellTarget: (targetId: string) => void;
  deselectSpellTarget: () => void;
  cancelSpellTargeting: () => void;
  confirmSpellTargeting: () => void;
  setHoveredCardId: (id?: string) => void;
  setFocusedCardId: (id?: string) => void;
  advancePhase: (phase?: Phase) => void;
  endPlayerTurn: () => void;
  playLand: (id: string) => void;
  castCard: (id: string, options?: CastOptions) => void;
  activateAbility: (id: string, abilityId: string, options?: AbilityOptions) => void;
  toggleAttacker: (id: string) => void;
  attackAll: () => void;
  cancelPlayerAttackers: () => void;
  beginSummoningAnimation: () => void;
  endSummoningAnimation: () => void;
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
  queueHordeMillPreview: (card: CardInstance) => void;
  openCardContextMenu: (cardId: string, x: number, y: number) => void;
  closeCardContextMenu: () => void;
  completePlayerDiscardAnimation: (id: string) => void;
  resolveHordeCombat: () => void;
  finishHordeTurn: () => void;
  completeHordeMillAnimation: (id: string) => void;
  triggerEndGame: (winner: "player" | "horde") => void;
};

const SEED_STORAGE_KEY = "horde-game-seed";
const defaultSeed = readStoredSeed();
const HORDE_ATTACK_ANIMATION_MS = 500;
const PLAYER_ATTACK_ANIMATION_MS = 500;
const HORDE_MILL_ANIMATION_MS = 720;
const PLAYER_ATTACK_MILL_START_MS = 90;
const PLAYER_ATTACK_MILL_GAP_MS = 35;
const PLAYER_ATTACK_NEXT_AFTER_MILL_MS = 470;
const AUTO_PAID_LAND_FLASH_MS = 900;
const BUFF_ANIMATION_MS = 1120;
const SUMMONING_ANIMATION_SAFETY_CLEAR_MS = 900;
const HORDE_ENTER_TRIGGER_START_MS = 680;
const HORDE_ENTER_TRIGGER_STEP_MS = 920;
const HORDE_ENTER_TRIGGER_RESOLVE_MS = 430;
let autoPaidLandFlashTimer: number | undefined;
let activeEffectCloseTimer: number | undefined;
let effectActivationPulseTimer: number | undefined;
let buffAnimationTimer: number | undefined;
let lifeBuffAnimationTimer: number | undefined;
let summoningAnimationSafetyTimer: number | undefined;
let hordeAutoTriggerSequenceId = 0;

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

export type HordeMillAnimationItem = {
  id: string;
  card: CardInstance;
  preview?: boolean;
};

export type PlayerDiscardAnimationItem = {
  id: string;
  card: CardInstance;
  origin?: { x: number; y: number };
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

export type SmallpoxSelectionState = {
  kind: "discard" | "sacrifice-creature" | "sacrifice-land";
  targetId?: string;
  x: number;
  y: number;
};

export type SpellTargetingState = {
  handId: string;
  stepIndex: number;
  targets: Record<string, string | string[]>;
  x: number;
  y: number;
};

export type SpellFightAnimationState = {
  friendlyId: string;
  enemyId: string;
  enemyMoves?: boolean;
  eventId: number;
};

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(getPlayerDeck(DEFAULT_PLAYER_DECK_ID), getHordeDeck(DEFAULT_HORDE_DECK_ID), defaultSeed, 3),
  hordeAttackAnimation: undefined,
  playerAttackAnimation: undefined,
  resolvingHordeCombat: false,
  summoningAnimationCount: 0,
  pendingTriggeredEffectCount: 0,
  hordeAutoTriggerCount: 0,
  hordeCombatVisualDamage: undefined,
  hordeCombatDeadCardIds: [],
  specialDeadCardIds: [],
  hordeMillAnimationQueue: [],
  hordeMillPreviewCards: [],
  playerDiscardAnimationQueue: [],
  handLimitDiscardActive: false,
  handLimitSelectionId: undefined,
  autoPaidLandAnimation: undefined,
  blockDrag: undefined,
  playerAttackDrag: undefined,
  cardContextMenu: undefined,
  counterTargeting: undefined,
  smallpoxCard: undefined,
  smallpoxSelection: undefined,
  spellTargeting: undefined,
  spellFightAnimation: undefined,
  pendingSpellHandId: undefined,
  buffAnimationCardIds: [],
  buffAnimationEventId: undefined,
  lifeBuffAnimationId: undefined,
  tutorialAcknowledgedStepId: undefined,
  seed: defaultSeed,
  playerDeckId: DEFAULT_PLAYER_DECK_ID,
  hordeDeckId: DEFAULT_HORDE_DECK_ID,
  reset: (seed = get().seed, setupTurns = 3, playerDeckId = get().playerDeckId, hordeDeckId = get().hordeDeckId) =>
    set(() => {
      hordeAutoTriggerSequenceId += 1;
      persistSeed(seed);
      const next = createInitialGame(getPlayerDeck(playerDeckId), getHordeDeck(hordeDeckId), seed, setupTurns);
      return {
        game: next,
        seed,
        playerDeckId,
        hordeDeckId,
        tutorialAcknowledgedStepId: undefined,
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
        resolvingHordeCombat: false,
        summoningAnimationCount: 0,
        pendingTriggeredEffectCount: 0,
        hordeAutoTriggerCount: 0,
        hordeCombatVisualDamage: undefined,
        hordeCombatDeadCardIds: [],
        specialDeadCardIds: [],
        hordeMillAnimationQueue: [],
        hordeMillPreviewCards: [],
        playerDiscardAnimationQueue: [],
        handLimitDiscardActive: false,
        handLimitSelectionId: undefined,
        autoPaidLandAnimation: undefined,
        blockDrag: undefined,
        playerAttackDrag: undefined,
        cardContextMenu: undefined,
        counterTargeting: undefined,
        smallpoxCard: undefined,
        smallpoxSelection: undefined,
        spellTargeting: undefined,
        spellFightAnimation: undefined,
        pendingSpellHandId: undefined,
        buffAnimationCardIds: [],
        buffAnimationEventId: undefined,
        lifeBuffAnimationId: undefined,
      };
    }),
  setSeed: (seed) => {
    persistSeed(seed);
    set({ seed });
  },
  acknowledgeTutorialStep: (stepId) => set({ tutorialAcknowledgedStepId: stepId }),
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
  cancelCounterTargeting: () => set((state) => ({ counterTargeting: undefined, pendingTriggeredEffectCount: state.counterTargeting ? Math.max(0, state.pendingTriggeredEffectCount - 1) : state.pendingTriggeredEffectCount })),
  confirmCounterTargeting: () =>
    set(({ game, counterTargeting }) => {
      if (!counterTargeting?.targetId) return {};
      const next = structuredClone(game) as GameState;
      const source = findBattlefieldCard(next, counterTargeting.sourceId);
      const target = findBattlefieldCard(next, counterTargeting.targetId);
      if (!source || !target) return { counterTargeting: undefined, pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1) };
      const previousLife = next.player.life;
      const manualTrigger = findManualEnterTargetTrigger(source);
      if (manualTrigger) {
        resolveEffect(next, manualTrigger.effect as EffectDefinition, {
          source,
          side: source.controller,
          targets: {
            target: target.instanceId,
            targetCreature: target.instanceId,
          },
        });
      }
      useAudioStore.getState().playSfx("buff", { volume: 0.82 });
      if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
      if (lifeBuffAnimationTimer) window.clearTimeout(lifeBuffAnimationTimer);
      buffAnimationTimer = window.setTimeout(() => {
        useGameStore.setState({ buffAnimationCardIds: [] });
        buffAnimationTimer = undefined;
      }, BUFF_ANIMATION_MS);
      lifeBuffAnimationTimer = window.setTimeout(() => {
        useGameStore.setState({ lifeBuffAnimationId: undefined });
        lifeBuffAnimationTimer = undefined;
      }, BUFF_ANIMATION_MS);
      return {
        game: next,
        counterTargeting: undefined,
        pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1),
        buffAnimationCardIds: [target.instanceId],
        buffAnimationEventId: Date.now(),
        lifeBuffAnimationId: next.player.life > previousLife ? Date.now() : get().lifeBuffAnimationId,
      };
    }),
  updateSmallpoxSelectionPointer: (x, y) =>
    set(({ smallpoxSelection }) => ({
      smallpoxSelection: smallpoxSelection && !smallpoxSelection.targetId ? { ...smallpoxSelection, x, y } : smallpoxSelection,
    })),
  lockSmallpoxSelectionTarget: (targetId) =>
    set(({ smallpoxSelection }) => {
      if (!smallpoxSelection) return {};
      useAudioStore.getState().playSfx("playLand", { volume: 0.72 });
      return { smallpoxSelection: { ...smallpoxSelection, targetId } };
    }),
  deselectSmallpoxSelectionTarget: () =>
    set(({ smallpoxSelection }) => ({
      smallpoxSelection: smallpoxSelection ? { ...smallpoxSelection, targetId: undefined } : undefined,
    })),
  confirmSmallpoxSelection: () => {
    const { game, smallpoxSelection } = get();
    if (!smallpoxSelection?.targetId) return;
    const { kind, targetId } = smallpoxSelection;
    if (kind === "discard") {
      const next = structuredClone(game) as GameState;
      discardChosenCard(next, targetId);
      notifyDiscardEffects(game, next);
      set({ game: next, smallpoxSelection: undefined });
      window.setTimeout(() => advanceSmallpoxSequence("after-discard"), 480);
      return;
    }
    set({ smallpoxSelection: undefined, specialDeadCardIds: [targetId] });
    useAudioStore.getState().playSfx("attack", { volume: 0.72 });
    window.setTimeout(() => {
      set((state) => {
        const resolved = structuredClone(state.game) as GameState;
        const target = resolved.player.battlefield.find((card) => card.instanceId === targetId);
        if (target) destroyPermanent(resolved, target);
        return { game: resolved, specialDeadCardIds: [] };
      });
      window.setTimeout(() => advanceSmallpoxSequence(kind === "sacrifice-creature" ? "after-sacrifice-creature" : "after-sacrifice-land"), 320);
    }, 260);
  },
  selectHandLimitDiscard: (id) => {
    if (id) useAudioStore.getState().playSfx("playLand", { volume: 0.68 });
    set({ handLimitSelectionId: id, hoveredCardId: undefined, focusedCardId: undefined });
  },
  confirmHandLimitDiscard: () => {
    const state = get();
    const { handLimitSelectionId, game } = state;
    if (!handLimitSelectionId || playerHandOverflow(game) <= 0) return;
    const next = structuredClone(game) as GameState;
    discardChosenCard(next, handLimitSelectionId);
    notifyDiscardEffects(game, next, { title: "Hand limit", tone: "warning" });
    const overflow = playerHandOverflow(next);
    set({
      game: next,
      handLimitSelectionId: undefined,
      handLimitDiscardActive: overflow > 0,
      selectedHandId: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
    });
  },
  startSpellTargeting: (handId, x, y) =>
    set((state) =>
      combatResolutionInProgress(state)
        ? {}
        : {
            spellTargeting: { handId, stepIndex: 0, targets: {}, x, y },
            selectedHandId: handId,
            focusedCardId: undefined,
            hoveredCardId: undefined,
            activeEffectCardId: undefined,
            cardContextMenu: undefined,
          },
    ),
  updateSpellTargetPointer: (x, y) =>
    set(({ spellTargeting }) => ({
      spellTargeting: spellTargeting ? { ...spellTargeting, x, y } : undefined,
    })),
  lockSpellTarget: (targetId) =>
    set(({ game, spellTargeting }) => {
      if (!spellTargeting) return {};
      const card = game.player.hand.find((item) => item.instanceId === spellTargeting.handId);
      const req = card?.requiresTargets[spellTargeting.stepIndex];
      if (!card || !req) return {};
      const valid = targetCandidates(game, "player", req).some((candidate) => candidate.instanceId === targetId);
      if (!valid) return {};
      const targets = { ...spellTargeting.targets, [req.id]: targetId };
      const nextStep = spellTargeting.stepIndex + 1;
      useAudioStore.getState().playSfx(nextStep >= card.requiresTargets.length ? "playLand" : "buff", { volume: 0.68 });
      if (req.controller === "SELF") {
        if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
        buffAnimationTimer = window.setTimeout(() => {
          useGameStore.setState({ buffAnimationCardIds: [] });
          buffAnimationTimer = undefined;
        }, BUFF_ANIMATION_MS);
      }
      return {
        spellTargeting: { ...spellTargeting, stepIndex: Math.min(nextStep, card.requiresTargets.length - 1), targets },
        buffAnimationCardIds: req.controller === "SELF" ? [targetId] : get().buffAnimationCardIds,
        buffAnimationEventId: req.controller === "SELF" ? Date.now() : get().buffAnimationEventId,
      };
    }),
  deselectSpellTarget: () =>
    set(({ game, spellTargeting }) => {
      if (!spellTargeting) return {};
      const card = game.player.hand.find((item) => item.instanceId === spellTargeting.handId);
      if (!card) return { spellTargeting: undefined };
      const stepIndex = Math.max(0, Math.min(spellTargeting.stepIndex, card.requiresTargets.length - 1));
      const activeReq = card.requiresTargets[stepIndex];
      const targetReqIndex = activeReq && spellTargeting.targets[activeReq.id] ? stepIndex : Math.max(0, stepIndex - 1);
      const req = card.requiresTargets[targetReqIndex];
      const targets = { ...spellTargeting.targets };
      if (req) delete targets[req.id];
      return {
        spellTargeting: { ...spellTargeting, stepIndex: targetReqIndex, targets },
        buffAnimationCardIds: req?.controller === "SELF" ? [] : get().buffAnimationCardIds,
      };
    }),
  cancelSpellTargeting: () => set({ spellTargeting: undefined, selectedHandId: undefined, focusedCardId: undefined, buffAnimationCardIds: [] }),
  confirmSpellTargeting: () => set((state) => runConfirmSpellTargeting(state)),
  setHoveredCardId: (id) => set({ hoveredCardId: id }),
  setFocusedCardId: (id) => set({ focusedCardId: id }),
  advancePhase: (phase) =>
    set(({ game }) => {
      const next = advancePhase(game, phase);
      playDrawOneIfPlayerDrew(game, next);
      return {
        game: next,
        playerAttackDrag: undefined,
        handLimitDiscardActive: next.activeSide === "player" && next.phase === "end" && playerHandOverflow(next) > 0,
        handLimitSelectionId: undefined,
      };
    }),
  endPlayerTurn: () =>
    set((state) => {
      const { game } = state;
      const overflow = playerHandOverflow(game);
      if (overflow > 0) {
        useToastStore.getState().pushToast({
          title: "Hand limit",
          message: `Discard ${overflow} card${overflow === 1 ? "" : "s"} before ending your turn.`,
          tone: "warning",
        });
        return { handLimitDiscardActive: true, handLimitSelectionId: undefined };
      }
      const next = endPlayerTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, handLimitDiscardActive: false, handLimitSelectionId: undefined, hordeMillAnimationQueue: appendHordeMillAnimations(state, game, next) };
    }),
  playLand: (id) =>
    set((state) => {
      if (combatResolutionInProgress(state)) return {};
      if (state.pendingTriggeredEffectCount > 0) {
        showActionToast("Resolve the triggered effect before playing another card.");
        return {};
      }
      const { game } = state;
      const card = game.player.hand.find((item) => item.instanceId === id);
      const previousLog = game.log[0];
      const next = playLand(game, id);
      const playSucceeded = Boolean(card?.cardTypes.includes("Land") && !next.player.hand.some((item) => item.instanceId === id));
      if (playSucceeded) useAudioStore.getState().playSfx("playLand");
      else if (card && next.log[0] !== previousLog) showActionToast(next.log[0]);
      if (playSucceeded) scheduleSummoningAnimationSafetyClear();
      return { game: next, selectedHandId: undefined, hoveredCardId: undefined, focusedCardId: undefined, activeEffectCardId: undefined, summoningAnimationCount: playSucceeded ? state.summoningAnimationCount + 1 : state.summoningAnimationCount };
    }),
  castCard: (id, options) =>
    set((state) => {
      if (combatResolutionInProgress(state)) return {};
      if (state.pendingTriggeredEffectCount > 0) {
        showActionToast("Resolve the triggered effect before playing another card.");
        return {};
      }
      return buildCastCardPatch(state, id, options);
    }),
  activateAbility: (id, abilityId, options) => set(({ game }) => ({ game: activateAbility(game, id, abilityId, options), activeEffectCardId: undefined })),
  toggleAttacker: (id) =>
    set(({ game }) => {
      const wasAttacking = game.combat.playerAttackers.includes(id);
      const next = togglePlayerAttacker(game, id);
      const changed = wasAttacking !== next.combat.playerAttackers.includes(id);
      if (changed) useAudioStore.getState().playSfx("playLand");
      return { game: next };
    }),
  attackAll: () =>
    set(({ game }) => {
      if (game.activeSide !== "player" || game.phase !== "combat") return {};
      const next = structuredClone(game) as GameState;
      const selected = new Set(next.combat.playerAttackers);
      for (const card of next.player.battlefield) {
        if (!card.cardTypes.includes("Creature") || selected.has(card.instanceId)) continue;
        if (!canAttack(next, card)) continue;
        selected.add(card.instanceId);
        if (!hasKeyword(next, card, "VIGILANCE")) card.tapped = true;
      }
      next.combat.playerAttackers = sortPlayerAttackersLeftToRight(next, [...selected]);
      next.log.unshift(`Player attacks with ${next.combat.playerAttackers.length} creature(s).`);
      if (next.combat.playerAttackers.length > game.combat.playerAttackers.length) useAudioStore.getState().playSfx("playLand");
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
  beginSummoningAnimation: () => set((state) => ({ summoningAnimationCount: state.summoningAnimationCount + 1 })),
  endSummoningAnimation: () => set((state) => ({ summoningAnimationCount: Math.max(0, state.summoningAnimationCount - 1) })),
  resolvePlayerCombat: () => set((state) => {
    const next = resolvePlayerCombat(state.game);
    return { game: next, hordeMillAnimationQueue: appendHordeMillAnimations(state, state.game, next) };
  }),
  finishPlayerCombat: () => {
    const { game, playerAttackAnimation } = get();
    if (playerAttackAnimation) return;

    const attackers = sortPlayerAttackersLeftToRight(game, game.combat.playerAttackers);
    if (attackers.length === 0) {
      const resolved = resolvePlayerCombat(game);
      const next = advancePhase(resolved, "end");
      set((state) => ({ game: next, selectedPlayerCreatureId: undefined, hordeMillAnimationQueue: appendHordeMillAnimations(state, game, next) }));
      return;
    }

    const previewMillCards = previewPlayerCombatMillCards(game, attackers);
    let elapsed = 0;
    attackers.forEach((attackerId, index) => {
      const attackerMillCards = previewMillCards.filter((item) => item.attackerIndex === index);
      const startAt = elapsed;
      window.setTimeout(() => {
        useAudioStore.getState().playSfx("attack", { volume: 0.75 });
        set({ playerAttackAnimation: { attackerId, eventId: index } });
      }, startAt);
      for (const preview of attackerMillCards) {
        window.setTimeout(() => {
          useGameStore.getState().queueHordeMillPreview(preview.card);
        }, startAt + PLAYER_ATTACK_MILL_START_MS + preview.cardIndexInHit * (HORDE_MILL_ANIMATION_MS + PLAYER_ATTACK_MILL_GAP_MS));
      }
      elapsed +=
        attackerMillCards.length > 0
          ? PLAYER_ATTACK_MILL_START_MS + (attackerMillCards.length - 1) * (HORDE_MILL_ANIMATION_MS + PLAYER_ATTACK_MILL_GAP_MS) + PLAYER_ATTACK_NEXT_AFTER_MILL_MS
          : PLAYER_ATTACK_ANIMATION_MS;
    });

    window.setTimeout(() => {
      const latest = get().game;
      const resolved = resolvePlayerCombat(latest);
      const next = advancePhase(resolved, "end");
      set((state) => ({
        game: next,
        handLimitDiscardActive: playerHandOverflow(next) > 0,
        handLimitSelectionId: undefined,
        playerAttackAnimation: undefined,
        selectedPlayerCreatureId: undefined,
        hordeMillPreviewCards: [],
        hordeMillAnimationQueue: previewMillCards.length > 0 ? state.hordeMillAnimationQueue : appendHordeMillAnimations(state, latest, next),
      }));
    }, elapsed + 40);
  },
  runHordeMain: () => {
    const state = get();
    const { game } = state;
    const previousHordeBattlefieldIds = new Set(game.horde.battlefield.map((card) => card.instanceId));
    const main = runHordeMainPhase(game, { deferEnterBattlefieldTriggers: true });
    const enteredCards = main.horde.battlefield.filter((card) => !previousHordeBattlefieldIds.has(card.instanceId));
    const triggerCards = enteredCards.filter(hasEnterBattlefieldTrigger);
    if (triggerCards.length > 0) scheduleHordeEnterTriggers(triggerCards);
    if (main.horde.pendingCard) {
      const pendingCard = main.horde.pendingCard;
      set({
        game: main,
        selectedHordeCreatureId: undefined,
        selectedPlayerCreatureId: undefined,
        hordeAutoTriggerCount: triggerCards.length,
        hordeMillAnimationQueue: appendHordeMillAnimations(state, game, main),
      });
      runSmallpoxSequence(pendingCard);
      return;
    }
    const next = prepareHordeAttackers(main);
    if (next.horde.battlefield.length > game.horde.battlefield.length) useAudioStore.getState().playSfx("draw");
    set({
      game: next,
      selectedHordeCreatureId: undefined,
      selectedPlayerCreatureId: undefined,
      hordeAutoTriggerCount: triggerCards.length,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, game, next),
    });
  },
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
  queueHordeMillPreview: (card) =>
    set((state) => ({
      hordeMillAnimationQueue: [
        ...state.hordeMillAnimationQueue,
        {
          id: `horde-mill-preview-${card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          card,
          preview: true,
        },
      ],
      hordeMillPreviewCards: state.hordeMillPreviewCards.some((item) => item.instanceId === card.instanceId)
        ? state.hordeMillPreviewCards
        : [...state.hordeMillPreviewCards, card],
    })),
  openCardContextMenu: (cardId, x, y) => set({ cardContextMenu: { cardId, x, y }, focusedCardId: undefined }),
  closeCardContextMenu: () => set({ cardContextMenu: undefined }),
  completePlayerDiscardAnimation: (id) =>
    set((state) => ({
      playerDiscardAnimationQueue: state.playerDiscardAnimationQueue.filter((item) => item.id !== id),
    })),
  completeHordeMillAnimation: (id) =>
    set((state) => ({
      hordeMillAnimationQueue: state.hordeMillAnimationQueue.filter((item) => item.id !== id),
    })),
  resolveHordeCombat: () => {
    const { game, hordeAttackAnimation, playerAttackAnimation } = get();
    if (hordeAttackAnimation || playerAttackAnimation) return;

    const attackEvents = buildHordeAttackEvents(game);
    if (attackEvents.length === 0) {
      const resolved = resolveHordeCombat(game, { deferTriggeredEvents: true });
      const next = advancePhase(resolved, "end");
      notifyDiscardEffects(game, next);
      set({ game: next, hordeAttackAnimation: undefined, resolvingHordeCombat: false, hordeCombatVisualDamage: undefined, hordeCombatDeadCardIds: [], selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined });
      scheduleQueuedHordeTriggers();
      return;
    }
    set({ resolvingHordeCombat: true, selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined });

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
      const resolved = resolveHordeCombat(latest, { deferTriggeredEvents: true });
      const next = advancePhase(resolved, "end");
      notifyDiscardEffects(latest, next);
      set({ game: next, hordeAttackAnimation: undefined, resolvingHordeCombat: false, hordeCombatVisualDamage: undefined, hordeCombatDeadCardIds: [], selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined });
      scheduleQueuedHordeTriggers();
    }, attackEvents.length * HORDE_ATTACK_ANIMATION_MS + 40);
  },
  finishHordeTurn: () =>
    set(({ game }) => {
      const next = finishHordeTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, hordeAutoTriggerCount: 0 };
    }),
  triggerEndGame: (winner) =>
    set((state) => {
      const next = structuredClone(state.game) as GameState;
      next.winner = winner;
      return { game: next };
    }),
}));

function readStoredSeed(): string {
  if (typeof window === "undefined") return "horde-seed";
  const storedSeed = window.localStorage.getItem(SEED_STORAGE_KEY);
  return storedSeed?.trim().toLowerCase() === "developer" ? "horde-seed" : storedSeed ?? "horde-seed";
}

function persistSeed(seed: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEED_STORAGE_KEY, seed);
}

function combatResolutionInProgress(state: GameStore): boolean {
  return Boolean(state.playerAttackAnimation || state.hordeAttackAnimation || state.resolvingHordeCombat);
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

function scheduleHordeEnterTriggers(cards: CardInstance[]): void {
  const sequenceId = ++hordeAutoTriggerSequenceId;
  cards.forEach((card, index) => {
    const triggerAt = HORDE_ENTER_TRIGGER_START_MS + index * HORDE_ENTER_TRIGGER_STEP_MS;
    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
      useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
      useToastStore.getState().pushToast({
        title: "Horde effect",
        message: hordeEnterTriggerMessage(card),
        tone: "horde",
      });
    }, triggerAt);
    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useGameStore.setState((state) => {
        const previous = state.game;
        const next = structuredClone(previous) as GameState;
        const source = next.horde.battlefield.find((item) => item.instanceId === card.instanceId);
        if (source) {
          runEnterBattlefieldTriggers(next, source);
          drainEventQueue(next);
        }
        const remainingTriggers = Math.max(0, state.hordeAutoTriggerCount - 1);
        notifyDiscardEffects(previous, next);
        return {
          game: next,
          hordeAutoTriggerCount: remainingTriggers,
          hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
        };
      });
    }, triggerAt + HORDE_ENTER_TRIGGER_RESOLVE_MS);
  });
}

function scheduleQueuedHordeTriggers(onComplete?: () => void): void {
  const sequenceId = hordeAutoTriggerSequenceId;
  let event: EventItem | undefined;
  let sources: CardInstance[] = [];

  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    while (next.eventQueue.length > 0) {
      const candidate = next.eventQueue[0];
      const candidateSources = triggeredSourcesForEvent(next, candidate);
      if (candidateSources.some((source) => source.controller === "horde")) {
        event = candidate;
        sources = candidateSources;
        break;
      }
      next.eventQueue.shift();
      resolveTriggeredEvent(next, candidate);
    }
    if (!event) checkWinLoss(next);
    return {
      game: next,
      hordeAutoTriggerCount: event ? 1 : 0,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
    };
  });

  if (!event) {
    onComplete?.();
    return;
  }
  useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
  for (const source of sources) useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
  useToastStore.getState().pushToast({
    title: "Horde effect",
    message: queuedHordeTriggerMessage(sources[0]),
    tone: "horde",
  });

  window.setTimeout(() => {
    if (sequenceId !== hordeAutoTriggerSequenceId || !event) return;
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      const queued = next.eventQueue[0];
      if (queued?.id === event?.id) {
        next.eventQueue.shift();
        resolveTriggeredEvent(next, queued);
      }
      const summoned = next.horde.battlefield.find((card) => !previous.horde.battlefield.some((old) => old.instanceId === card.instanceId));
      if (summoned) useAudioStore.getState().playSfx(monsterSfx(summoned));
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
      };
    });
    window.setTimeout(() => {
      if (sequenceId === hordeAutoTriggerSequenceId) scheduleQueuedHordeTriggers(onComplete);
    }, 260);
  }, HORDE_ENTER_TRIGGER_RESOLVE_MS);
}

function queuedHordeTriggerMessage(source?: CardInstance): string {
  if (source?.definitionId === "rundvelt_hordemaster") {
    return `${source.name} triggers. Horde exiles the top card of its library.`;
  }
  if (source?.definitionId === "crow_of_dark_tidings") {
    return `${source.name} triggers. Horde mills 2 cards.`;
  }
  return `${source?.name ?? "Horde card"} resolves its triggered effect.`;
}

function scheduleSummoningAnimationSafetyClear(): void {
  if (summoningAnimationSafetyTimer) window.clearTimeout(summoningAnimationSafetyTimer);
  summoningAnimationSafetyTimer = window.setTimeout(() => {
    useGameStore.setState({ summoningAnimationCount: 0 });
    summoningAnimationSafetyTimer = undefined;
  }, SUMMONING_ANIMATION_SAFETY_CLEAR_MS);
}

function notifyDiscardEffects(previous: GameState, next: GameState, options?: { title: string; tone: "warning" | "horde" }): void {
  const newLogCount = Math.max(0, next.log.length - previous.log.length);
  const discardLogs = next.log.slice(0, newLogCount).filter((message) => message.startsWith("Player discards "));
  const previousPlayerGraveyardIds = new Set(previous.player.graveyard.map((card) => card.instanceId));
  const discardedCards = next.player.graveyard.filter((card) => previous.player.hand.some((item) => item.instanceId === card.instanceId) && !previousPlayerGraveyardIds.has(card.instanceId));
  if (discardedCards.length > 0) {
    const origins = new Map(
      discardedCards.map((card) => {
        const rect = document.querySelector<HTMLElement>(`[data-hand-card-id="${card.instanceId}"]`)?.getBoundingClientRect();
        return [card.instanceId, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined] as const;
      }),
    );
    useGameStore.setState((state) => ({
      playerDiscardAnimationQueue: [
        ...state.playerDiscardAnimationQueue,
        ...discardedCards.map((card) => ({
          id: `player-discard-${card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          card,
          origin: origins.get(card.instanceId),
        })),
      ],
    }));
  }
  for (const message of discardLogs) {
    useAudioStore.getState().playSfx("drawOne", { volume: 0.82 });
    useToastStore.getState().pushToast({
      title: options?.title ?? "Horde effect",
      message,
      tone: options?.tone ?? "horde",
    });
  }
}

function hasEnterBattlefieldTrigger(card: CardInstance): boolean {
  return card.effects.some((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "ENTERS_BATTLEFIELD" && !effectNeedsManualTarget(effect.effect));
}

function hordeEnterTriggerMessage(card: CardInstance): string {
  const trigger = card.effects.find((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "ENTERS_BATTLEFIELD");
  const effect = trigger?.effect as EffectDefinition | undefined;
  if (effect?.type === "CREATE_TOKEN") return `${card.name} resolves. Horde creates ${Number(effect.amount ?? 1)} token(s).`;
  if (effect?.type === "MILL_SELF" || effect?.type === "MILL_HORDE") return `${card.name} resolves. Horde mills ${Number(effect.amount ?? 1)} card(s).`;
  if (effect?.type === "EACH_OPPONENT_DISCARDS") return `${card.name} resolves. Player discards ${Number(effect.amount ?? 1)} card(s).`;
  if (effect?.type === "EACH_OPPONENT_LOSES_LIFE") return `${card.name} resolves. Player loses ${Number(effect.amount ?? 1)} life.`;
  return `${card.name} resolves its triggered effect.`;
}

function hordeMillAnimationsFrom(previous: GameState, next: GameState): HordeMillAnimationItem[] {
  const previousLibraryIds = new Set(previous.horde.library.map((card) => card.instanceId));
  return next.horde.graveyard
    .filter((card) => previousLibraryIds.has(card.instanceId))
    .map((card) => ({
      id: `horde-mill-${card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      card,
      preview: false,
    }));
}

function appendHordeMillAnimations(state: GameStore, previous: GameState, next: GameState): HordeMillAnimationItem[] {
  const milled = hordeMillAnimationsFrom(previous, next);
  return milled.length > 0 ? [...state.hordeMillAnimationQueue, ...milled] : state.hordeMillAnimationQueue;
}

function previewPlayerCombatMillCards(game: GameState, attackers: string[]): Array<{ attackerIndex: number; cardIndexInHit: number; card: CardInstance }> {
  const previews: Array<{ attackerIndex: number; cardIndexInHit: number; card: CardInstance }> = [];
  let totalDamage = 0;
  let previousMill = 0;

  attackers.forEach((attackerId, attackerIndex) => {
    const attacker = game.player.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) return;
    totalDamage += getPowerToughness(game, attacker).power;
    const nextMill = Math.floor(totalDamage / 3);
    const newMill = nextMill - previousMill;
    previousMill = nextMill;
    for (let index = 0; index < newMill; index += 1) {
      const card = game.horde.library[previews.length];
      if (card) previews.push({ attackerIndex, cardIndexInHit: index, card });
    }
  });

  return previews;
}

function findBattlefieldCard(game: GameState, id: string) {
  return [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === id);
}

function findTemporaryStatBuffedCardIds(previous: GameState, next: GameState): string[] {
  const previousStats = new Map(
    [...previous.player.battlefield, ...previous.horde.battlefield].map((card) => [
      card.instanceId,
      { power: card.temporaryPower, toughness: card.temporaryToughness },
    ]),
  );
  return [...next.player.battlefield, ...next.horde.battlefield]
    .filter((card) => {
      const before = previousStats.get(card.instanceId);
      if (!before) return false;
      return card.temporaryPower > before.power || card.temporaryToughness > before.toughness;
    })
    .map((card) => card.instanceId);
}

function findMarkedCreatureIds(game: GameState): string[] {
  return [...game.player.battlefield, ...game.horde.battlefield]
    .filter((card) => {
      if (!card.cardTypes.includes("Creature")) return false;
      const { toughness } = getPowerToughness(game, card);
      return card.damageMarked >= toughness || card.deathtouchDamage;
    })
    .map((card) => card.instanceId);
}

function isFightEffect(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") return false;
  const data = effect as Record<string, unknown>;
  if (data.type === "FIGHT_SIMULTANEOUS") return true;
  if (data.type === "SEQUENCE" && Array.isArray(data.effects)) return data.effects.some(isFightEffect);
  return false;
}

function isSourceDamageEffect(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") return false;
  const data = effect as Record<string, unknown>;
  if (data.type === "DEAL_DAMAGE" || data.type === "DEAL_DAMAGE_FROM_SOURCE_POWER") return true;
  if (data.type === "SEQUENCE" && Array.isArray(data.effects)) return data.effects.some(isSourceDamageEffect);
  return false;
}

function isDestroyEffect(effect: unknown): boolean {
  if (!effect || typeof effect !== "object") return false;
  const data = effect as Record<string, unknown>;
  if (data.type === "DESTROY" || data.type === "DESTROY_TARGET") return true;
  if (data.type === "SEQUENCE" && Array.isArray(data.effects)) return data.effects.some(isDestroyEffect);
  return false;
}

function hasManualEnterTargetTrigger(card?: GameState["player"]["hand"][number]): boolean {
  return Boolean(card && findManualEnterTargetTrigger(card));
}

function findCardCastReactionSources(game: GameState, card: CardInstance): CardInstance[] {
  const previewEvent: EventItem = { id: "preview-card-cast", type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } };
  return game.horde.battlefield.filter((source) =>
    source.effects.some(
      (effect) =>
        effect.type === "TRIGGERED_ABILITY" &&
        effect.trigger === "CARD_CAST" &&
        !effectNeedsManualTarget(effect.effect) &&
        triggerConditionMet(game, effect.condition as Record<string, unknown> | undefined, source, previewEvent),
    ),
  );
}

function cardCastReactionMessage(card: CardInstance): string {
  const trigger = card.effects.find((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "CARD_CAST");
  const effect = trigger?.effect as EffectDefinition | undefined;
  const inner = effect?.type === "SEQUENCE" ? ((effect.effects as EffectDefinition[] | undefined)?.find((item) => item.type === "CREATE_TOKEN") ?? effect) : effect;
  if (inner?.type === "CREATE_TOKEN") return `${card.name} resolves. Horde creates a token.`;
  return `${card.name} resolves its triggered effect.`;
}

const CARD_CAST_REACTION_RESOLVE_MS = 620;
const MANUAL_TRIGGER_AFTER_REACTION_MS = 420;

function scheduleManualTriggerOverlay(manualTriggeredCard: CardInstance, startDelayMs: number): void {
  window.setTimeout(() => {
    const latest = useGameStore.getState().game;
    if (!findBattlefieldCard(latest, manualTriggeredCard.instanceId)) {
      useGameStore.setState((state) => ({ pendingTriggeredEffectCount: Math.max(0, state.pendingTriggeredEffectCount - 1) }));
      return;
    }
    useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
    useGameStore.getState().triggerEffectActivationPulse(manualTriggeredCard.instanceId);
    window.setTimeout(() => {
      useGameStore.setState({
        counterTargeting: {
          sourceId: manualTriggeredCard.instanceId,
          x: window.innerWidth * 0.62,
          y: window.innerHeight * 0.48,
        },
      });
    }, 520);
  }, startDelayMs);
}

// Card already entered play (or resolved) synchronously with `deferReactiveTriggers`; this only
// resolves the Horde's reaction to that cast (e.g. Noosegraf Mob), so it can glow and finish
// *after* the card is already visible, without delaying the cast itself. Horde resolves before
// any manual trigger on the just-cast card (APNAP: non-active player's trigger goes on top of the stack).
function scheduleCardCastReaction(sources: CardInstance[], manualTriggeredCard: CardInstance | undefined): void {
  useGameStore.setState((state) => ({ hordeAutoTriggerCount: state.hordeAutoTriggerCount + 1 }));
  useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
  for (const source of sources) useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
  useToastStore.getState().pushToast({
    title: "Horde effect",
    message: sources.length === 1 ? cardCastReactionMessage(sources[0]) : "Horde resolves its triggered effects.",
    tone: "horde",
  });
  window.setTimeout(() => {
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      drainEventQueue(next);
      const triggeredBuffCardIds = findTemporaryStatBuffedCardIds(previous, next);
      if (triggeredBuffCardIds.length > 0) {
        useAudioStore.getState().playSfx("buff", { volume: 0.72 });
        if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
        buffAnimationTimer = window.setTimeout(() => {
          useGameStore.setState({ buffAnimationCardIds: [] });
          buffAnimationTimer = undefined;
        }, BUFF_ANIMATION_MS);
      }
      const newHordeCreatures = next.horde.battlefield.filter((card) => !previous.horde.battlefield.some((old) => old.instanceId === card.instanceId));
      if (newHordeCreatures.length > 0) useAudioStore.getState().playSfx(monsterSfx(newHordeCreatures[0]));
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hordeAutoTriggerCount: Math.max(0, state.hordeAutoTriggerCount - 1),
        hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
        buffAnimationCardIds: triggeredBuffCardIds.length > 0 ? triggeredBuffCardIds : state.buffAnimationCardIds,
        buffAnimationEventId: triggeredBuffCardIds.length > 0 ? Date.now() : state.buffAnimationEventId,
      };
    });
    if (manualTriggeredCard) scheduleManualTriggerOverlay(manualTriggeredCard, MANUAL_TRIGGER_AFTER_REACTION_MS);
  }, CARD_CAST_REACTION_RESOLVE_MS);
}

// Smallpox: revealed by the Horde but parked unresolved by HordeController (see `pendingCard`)
// because it needs a bespoke, multi-step, player-interactive resolution — first the Horde afflicts
// itself (mill 1, sacrifice its weakest creature), then it turns on the player (lose 1 life, choose
// a card to discard, choose a creature to sacrifice, choose a land to sacrifice). Everything here is
// sequential and blocks the board via `hordeAutoTriggerCount`, same as other Horde reactions.
function runSmallpoxSequence(card: CardInstance): void {
  const resetEpoch = hordeAutoTriggerSequenceId;
  useGameStore.setState((state) => {
    const next = structuredClone(state.game) as GameState;
    next.horde.pendingCard = undefined;
    return { game: next, smallpoxCard: card, hordeAutoTriggerCount: state.hordeAutoTriggerCount + 1 };
  });
  useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
  useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: "Horde effect", message: `${card.name} afflicts the Horde.`, tone: "horde" });
  window.setTimeout(() => {
    if (resetEpoch !== hordeAutoTriggerSequenceId) return;
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      millHorde(next, 1);
      return { game: next, hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next) };
    });
    window.setTimeout(() => {
      if (resetEpoch !== hordeAutoTriggerSequenceId) return;
      let sacrificedId: string | undefined;
      useGameStore.setState((state) => {
        const next = structuredClone(state.game) as GameState;
        sacrificedId = weakestCreature(next, "horde")?.instanceId;
        return { game: next };
      });
      if (!sacrificedId) {
        window.setTimeout(() => beginSmallpoxPlayerRound(resetEpoch), 200);
        return;
      }
      useGameStore.setState({ specialDeadCardIds: [sacrificedId] });
      useAudioStore.getState().playSfx("attack", { volume: 0.72 });
      window.setTimeout(() => {
        if (resetEpoch !== hordeAutoTriggerSequenceId) return;
        useGameStore.setState((state) => {
          const next = structuredClone(state.game) as GameState;
          const target = next.horde.battlefield.find((item) => item.instanceId === sacrificedId);
          if (target) destroyPermanent(next, target);
          return { game: next, specialDeadCardIds: [] };
        });
        scheduleQueuedHordeTriggers(() => {
          window.setTimeout(() => beginSmallpoxPlayerRound(resetEpoch), 320);
        });
      }, 260);
    }, 650);
  }, 700);
}

function beginSmallpoxPlayerRound(resetEpoch: number): void {
  if (resetEpoch !== hordeAutoTriggerSequenceId) return;
  const card = useGameStore.getState().smallpoxCard;
  useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
  if (card) useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: "Horde effect", message: `${card?.name ?? "Smallpox"} turns against you.`, tone: "horde" });
  window.setTimeout(() => {
    if (resetEpoch !== hordeAutoTriggerSequenceId) return;
    useGameStore.setState((state) => {
      const next = structuredClone(state.game) as GameState;
      next.player.life -= 1;
      next.log.unshift("Player loses 1 life.");
      return { game: next };
    });
    window.setTimeout(() => {
      if (resetEpoch !== hordeAutoTriggerSequenceId) return;
      if (useGameStore.getState().game.player.hand.length > 0) startSmallpoxSelectionStep("discard");
      else advanceSmallpoxSequence("after-discard");
    }, 480);
  }, 700);
}

function startSmallpoxSelectionStep(kind: SmallpoxSelectionState["kind"]): void {
  useGameStore.setState({
    smallpoxSelection: { kind, targetId: undefined, x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 },
  });
}

function advanceSmallpoxSequence(from: "after-discard" | "after-sacrifice-creature" | "after-sacrifice-land"): void {
  const game = useGameStore.getState().game;
  if (from === "after-discard") {
    const hasCreature = game.player.battlefield.some((card) => card.cardTypes.includes("Creature"));
    if (hasCreature) startSmallpoxSelectionStep("sacrifice-creature");
    else advanceSmallpoxSequence("after-sacrifice-creature");
    return;
  }
  if (from === "after-sacrifice-creature") {
    const hasLand = game.player.battlefield.some((card) => card.cardTypes.includes("Land"));
    if (hasLand) startSmallpoxSelectionStep("sacrifice-land");
    else advanceSmallpoxSequence("after-sacrifice-land");
    return;
  }
  finishSmallpoxSequence();
}

function finishSmallpoxSequence(): void {
  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    const card = state.smallpoxCard;
    if (card) {
      card.zone = "graveyard";
      next.horde.graveyard.push(card);
      next.log.unshift(`${card.name} goes to the Horde graveyard.`);
      useAudioStore.getState().playSfx("draw");
    }
    const withAttackers = prepareHordeAttackers(next);
    if (withAttackers.horde.battlefield.length > previous.horde.battlefield.length) useAudioStore.getState().playSfx("draw");
    return {
      game: withAttackers,
      smallpoxCard: undefined,
      hordeAutoTriggerCount: Math.max(0, state.hordeAutoTriggerCount - 1),
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, withAttackers),
    };
  });
}

function buildCastCardPatch(state: GameStore, id: string, options?: CastOptions): Partial<GameStore> {
  const { game } = state;
  const card = game.player.hand.find((item) => item.instanceId === id);
  const sfx = card && card.cardTypes.includes("Creature") ? monsterSfx(card) : undefined;
  const previousLog = game.log[0];
  const untappedLandIds = new Set(game.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
  const reactionSources = card ? findCardCastReactionSources(game, card) : [];
  const next = castCard(game, id, { ...options, deferReactiveTriggers: reactionSources.length > 0 });
  const castSucceeded = Boolean(card && !next.player.hand.some((item) => item.instanceId === id));
  const triggeredBuffCardIds = findTemporaryStatBuffedCardIds(game, next);
  if (sfx && castSucceeded) useAudioStore.getState().playSfx(sfx);
  else if (card && !castSucceeded && next.log[0] !== previousLog) showActionToast(next.log[0]);
  if (triggeredBuffCardIds.length > 0) {
    useAudioStore.getState().playSfx("buff", { volume: 0.72 });
    if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
    buffAnimationTimer = window.setTimeout(() => {
      useGameStore.setState({ buffAnimationCardIds: [] });
      buffAnimationTimer = undefined;
    }, BUFF_ANIMATION_MS);
  }
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
  const manualTriggeredCard = hasManualEnterTargetTrigger(card) && castSucceeded ? card : undefined;
  const startsSummoningAnimation = Boolean(castSucceeded && card && !card.cardTypes.includes("Instant") && !card.cardTypes.includes("Sorcery"));
  if (startsSummoningAnimation) scheduleSummoningAnimationSafetyClear();
  if (castSucceeded && reactionSources.length > 0) {
    scheduleCardCastReaction(reactionSources, manualTriggeredCard);
  } else if (manualTriggeredCard) {
    scheduleManualTriggerOverlay(manualTriggeredCard, 420);
  }
  return {
    game: next,
    selectedHandId: undefined,
    hoveredCardId: undefined,
    focusedCardId: undefined,
    activeEffectCardId: undefined,
    hordeMillAnimationQueue: appendHordeMillAnimations(state, game, next),
    autoPaidLandAnimation,
    buffAnimationCardIds: triggeredBuffCardIds.length > 0 ? triggeredBuffCardIds : state.buffAnimationCardIds,
    buffAnimationEventId: triggeredBuffCardIds.length > 0 ? Date.now() : state.buffAnimationEventId,
    summoningAnimationCount: startsSummoningAnimation ? state.summoningAnimationCount + 1 : state.summoningAnimationCount,
    pendingTriggeredEffectCount: manualTriggeredCard ? state.pendingTriggeredEffectCount + 1 : state.pendingTriggeredEffectCount,
  };
}

function runConfirmSpellTargeting(state: GameStore): Partial<GameStore> {
  const { game, spellTargeting } = state;
  if (!spellTargeting) return {};
  const card = game.player.hand.find((item) => item.instanceId === spellTargeting.handId);
  if (!card || !card.requiresTargets.every((req) => Boolean(spellTargeting.targets[req.id]))) return {};
  const friendlyId = String(spellTargeting.targets.yourCreature ?? spellTargeting.targets.sourceCreature ?? "");
  const enemyId = String(spellTargeting.targets.opponentCreature ?? spellTargeting.targets.damageTarget ?? "");
  const targets = { ...spellTargeting.targets };
  const handId = spellTargeting.handId;
  const isFightSpell = Boolean(friendlyId && enemyId && card.effects.some(isFightEffect));
  const isSourceDamageSpell = Boolean(friendlyId && enemyId && card.effects.some(isSourceDamageEffect));
  const isDestroySpell = card.effects.some(isDestroyEffect);
  const destroyTargetIds = isDestroySpell ? Object.values(targets).flatMap((target) => (Array.isArray(target) ? target : [target])).map(String) : [];
  const resolveSpell = (latest: GameState) => {
    const previousLog = latest.log[0];
    const untappedLandIds = new Set(latest.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
    const reactionSources = findCardCastReactionSources(latest, card);
    const next = castCard(latest, handId, { targets, deferReactiveTriggers: reactionSources.length > 0 });
    const castSucceeded = !next.player.hand.some((item) => item.instanceId === handId);
    if (!castSucceeded && next.log[0] !== previousLog) showActionToast(next.log[0]);
    const triggeredBuffCardIds = findTemporaryStatBuffedCardIds(latest, next);
    if (triggeredBuffCardIds.length > 0) {
      useAudioStore.getState().playSfx("buff", { volume: 0.72 });
      if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
      buffAnimationTimer = window.setTimeout(() => {
        useGameStore.setState({ buffAnimationCardIds: [] });
        buffAnimationTimer = undefined;
      }, BUFF_ANIMATION_MS);
    }
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
    if (castSucceeded && reactionSources.length > 0) scheduleCardCastReaction(reactionSources, undefined);
    return {
      game: next,
      spellFightAnimation: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
      hordeMillAnimationQueue: appendHordeMillAnimations(useGameStore.getState(), latest, next),
      autoPaidLandAnimation,
      buffAnimationCardIds: triggeredBuffCardIds.length > 0 ? triggeredBuffCardIds : useGameStore.getState().buffAnimationCardIds,
      buffAnimationEventId: triggeredBuffCardIds.length > 0 ? Date.now() : useGameStore.getState().buffAnimationEventId,
    };
  };
  if (!isFightSpell) {
    if (isDestroySpell && destroyTargetIds.length > 0) {
      useAudioStore.getState().playSfx("attack", { volume: 0.72 });
      window.setTimeout(() => {
        useGameStore.setState((state) => ({
          ...resolveSpell(state.game),
          specialDeadCardIds: [],
          pendingSpellHandId: undefined,
        }));
      }, 260);
      return {
        spellTargeting: undefined,
        selectedHandId: undefined,
        focusedCardId: undefined,
        pendingSpellHandId: handId,
        specialDeadCardIds: destroyTargetIds,
      };
    }
    if (isSourceDamageSpell) {
      useAudioStore.getState().playSfx("attack", { volume: 0.76 });
      window.setTimeout(() => {
        useGameStore.setState(({ game }) => {
          const deadCardIds = findMarkedCreatureIds(game);
          if (deadCardIds.length === 0) return { spellFightAnimation: undefined };
          return { specialDeadCardIds: deadCardIds, spellFightAnimation: undefined };
        });
        window.setTimeout(() => {
          useGameStore.setState(({ game }) => {
            const next = structuredClone(game) as GameState;
            destroyMarkedCreatures(next);
            return { game: next, specialDeadCardIds: [] };
          });
          scheduleQueuedHordeTriggers();
        }, 260);
      }, 520);
    }
    return {
      ...resolveSpell(game),
      spellTargeting: undefined,
      selectedHandId: undefined,
      focusedCardId: undefined,
      spellFightAnimation: isSourceDamageSpell ? { friendlyId, enemyId, enemyMoves: false, eventId: Date.now() } : undefined,
    };
  }
  useAudioStore.getState().playSfx("attack", { volume: 0.76 });
  window.setTimeout(() => {
    const resolved = resolveSpell(useGameStore.getState().game);
    const deadCardIds = findMarkedCreatureIds(resolved.game);
    useGameStore.setState({ ...resolved, specialDeadCardIds: deadCardIds });
    if (deadCardIds.length > 0) {
      window.setTimeout(() => {
        useGameStore.setState(({ game }) => {
          const next = structuredClone(game) as GameState;
          destroyMarkedCreatures(next);
          return { game: next, specialDeadCardIds: [] };
        });
        scheduleQueuedHordeTriggers();
      }, 260);
    }
  }, 520);
  return {
    spellTargeting: undefined,
    selectedHandId: undefined,
    focusedCardId: undefined,
    spellFightAnimation: { friendlyId, enemyId, enemyMoves: true, eventId: Date.now() },
  };
}

function findManualEnterTargetTrigger(card: GameState["player"]["hand"][number] | GameState["player"]["battlefield"][number] | undefined): EffectDefinition | undefined {
  return card?.effects.find(
    (effect) =>
      effect.type === "TRIGGERED_ABILITY" &&
      effect.trigger === "CREATURE_ENTERS_BATTLEFIELD" &&
      effectNeedsManualTarget(effect.effect),
  );
}

function buildHordeAttackEvents(game: GameState): HordeAttackEvent[] {
  const events: HordeAttackEvent[] = [];
  const damageById = new Map<string, number>();
  const deathtouchById = new Set<string>();
  const deadBuffSourceIds = new Set<string>();

  for (const attackerId of game.combat.hordeAttackers) {
    const blockerIds = game.combat.blockers[attackerId] ?? [];
    const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) continue;
    const attackerStats = getPowerToughness(game, attacker, deadBuffSourceIds);
    if (isVisuallyDead(attacker, attackerStats.toughness, damageById, deathtouchById)) continue;

    if (blockerIds.length === 0) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    if (hasKeyword(game, attacker, "MENACE") && blockerIds.length < 2) {
      events.push({ attackerId, attackerDies: false, blockerDies: false, playerDamage: attackerStats.power });
      continue;
    }

    const blockers = blockerIds
      .map((id) => game.player.battlefield.find((card) => card.instanceId === id))
      .filter((card): card is GameState["player"]["battlefield"][number] => Boolean(card));

    for (const blocker of blockers) {
      const blockerStats = getPowerToughness(game, blocker, deadBuffSourceIds);
      if (isVisuallyDead(blocker, blockerStats.toughness, damageById, deathtouchById)) continue;

      const attackerDamageMarked = visualDamage(attacker, damageById) + blockerStats.power;
      const blockerDamageMarked = visualDamage(blocker, damageById) + attackerStats.power;
      if (attackerStats.power > 0 && hasKeyword(game, attacker, "DEATHTOUCH")) deathtouchById.add(blocker.instanceId);
      if (blockerStats.power > 0 && hasKeyword(game, blocker, "DEATHTOUCH")) deathtouchById.add(attacker.instanceId);
      damageById.set(attacker.instanceId, attackerDamageMarked);
      damageById.set(blocker.instanceId, blockerDamageMarked);

      const blockerDies = isVisuallyDead(blocker, blockerStats.toughness, damageById, deathtouchById);
      const attackerDies = isVisuallyDead(attacker, attackerStats.toughness, damageById, deathtouchById);
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
