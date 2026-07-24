import { create } from "zustand";
import { acceptOpeningHand, createInitialGame, mulliganOpeningHand } from "../engine/GameState";
import type { AbilityOptions, CardInstance, CastOptions, DifficultyMode, EffectDefinition, EventItem, GameMode, GameState, Phase } from "../engine/GameTypes";
import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID, getHordeDeck, getPlayerDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { activateAbility, castCard, playLand, recycleEnergy } from "../engine/GameActions";
import {
  applyHordeAttackEvent,
  beginHordeCombat,
  buildHordeAttackEvents,
  checkWinLoss,
  declareBlocker,
  declareHordeAttackers,
  finishHordeCombat,
  isHordeAttackEventCurrent,
  resolvePlayerCombat,
  sortPlayerAttackersLeftToRight,
  togglePlayerAttacker,
  type HordeAttackEvent,
} from "../engine/CombatResolver";
import { finishHordeTurn, runHordeMain as runHordeMainPhase } from "../engine/HordeController";
import { canAttack, hasKeyword } from "../engine/Keywords";
import { getPowerToughness, hordeInSurge } from "../engine/StaticEffects";
import { EFFECT_ANNOUNCEMENTS, destroyMarkedCreatures, destroyPermanent, discardChosenCard, effectNeedsManualTarget, findManualEnterTargetTrigger, hasEffectPresentation, resolveEffect, triggerConditionMet } from "../engine/EffectResolver";
import { type StaticAura } from "../engine/StaticAuras";
import { drainEventQueue } from "../engine/EventQueue";
import { targetCandidates } from "../engine/Targeting";
import type { TutorialStepId } from "../engine/Tutorial";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { canPlayerRecycleEnergy, playerHandOverflow } from "../engine/GameRules";
import {
  captureStaticAuraBeats,
  hasEnterBattlefieldTrigger,
  resetHordeSequence,
  scheduleHordeEnterTriggers,
  scheduleQueuedHordeTriggers,
  startHordeCombatSequence,
} from "./hordeBeats";
import { advanceSmallpoxSequence, runSmallpoxSequence } from "./smallpoxSequence";
import {
  appendHordeMillAnimations,
  discardPauseInProgress,
  findBattlefieldCard,
  flashAutoPaidLands,
  monsterSfx,
  notifyDiscardEffects,
  playDrawOneIfPlayerDrew,
  resumeAfterDiscardPause,
  showActionToast,
  startBuffBeat,
  startLifeBuffBeat,
  uiCardName,
  uiText,
} from "./presentationEffects";

export type GameStore = {
  game: GameState;
  gameSessionId: number;
  hordeAttackAnimation?: HordeAttackAnimation;
  burnAnimation?: BurnAnimationState;
  burnImpactCardId?: string;
  burnImpactEventId?: number;
  deathRevealCard?: CardInstance;
  /** Horde static auras whose announcement beat has not played yet. */
  pendingStaticAuras: StaticAura[];
  /** Stat bonus withheld from each card until its aura's beat plays. Presentation only. */
  heldStaticAuraBonuses: Record<string, { power: number; toughness: number }>;
  playerAttackAnimation?: PlayerAttackAnimation;
  resolvingHordeCombat: boolean;
  summoningAnimationCount: number;
  pendingTriggeredEffectCount: number;
  pendingTriggeredEffectSourceId?: string;
  hordeAutoTriggerCount: number;
  surgeTransitionActive: boolean;
  surgeTransitionShown: boolean;
  hordeCombatVisualDamage?: Record<string, number>;
  hordeCombatDeadCardIds: string[];
  specialDeadCardIds: string[];
  hordeMillAnimationQueue: HordeMillAnimationItem[];
  hordeMillPreviewCards: CardInstance[];
  playerDiscardAnimationQueue: PlayerDiscardAnimationItem[];
  landPlayAnimationQueue: LandPlayAnimationItem[];
  energyRecycleAnimation?: EnergyRecycleAnimation;
  energyRecycleDragActive: boolean;
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
  reset: (seed?: string, setupTurns?: number, playerDeckId?: string, hordeDeckId?: string, difficulty?: DifficultyMode, gameMode?: GameMode) => void;
  setSeed: (seed: string) => void;
  acceptOpeningHand: () => void;
  mulliganOpeningHand: () => void;
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
  startEnergyRecycle: (id: string, origin: { x: number; y: number }) => void;
  setEnergyRecycleDragActive: (active: boolean) => void;
  completeEnergyRecycleAnimation: () => void;
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
  completeSurgeTransition: () => void;
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
  materializeLandPlayAnimation: (id: string) => void;
  completeLandPlayAnimation: (id: string) => void;
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
const SUMMONING_ANIMATION_SAFETY_CLEAR_MS = 900;
let activeEffectCloseTimer: number | undefined;
let effectActivationPulseTimer: number | undefined;
let summoningAnimationSafetyTimer: number | undefined;
let landPlaySummoningSafetyTimer: number | undefined;

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

export type LandPlayAnimationItem = {
  id: string;
  card: CardInstance;
  origin?: { x: number; y: number };
  materialized?: boolean;
};

export type EnergyRecycleAnimation = {
  id: string;
  card: CardInstance;
  origin: { x: number; y: number };
};

export type BurnAnimationState = {
  id: string;
  sourceId?: string;
  targetId: string;
  amount: number;
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
  gameSessionId: 0,
  hordeAttackAnimation: undefined,
  burnAnimation: undefined,
  burnImpactCardId: undefined,
  burnImpactEventId: undefined,
  deathRevealCard: undefined,
  pendingStaticAuras: [],
  heldStaticAuraBonuses: {},
  playerAttackAnimation: undefined,
  resolvingHordeCombat: false,
  summoningAnimationCount: 0,
  pendingTriggeredEffectCount: 0,
  pendingTriggeredEffectSourceId: undefined,
  hordeAutoTriggerCount: 0,
  surgeTransitionActive: false,
  surgeTransitionShown: false,
  hordeCombatVisualDamage: undefined,
  hordeCombatDeadCardIds: [],
  specialDeadCardIds: [],
  hordeMillAnimationQueue: [],
  hordeMillPreviewCards: [],
  playerDiscardAnimationQueue: [],
  landPlayAnimationQueue: [],
  energyRecycleAnimation: undefined,
  energyRecycleDragActive: false,
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
  reset: (seed = get().seed, setupTurns = 3, playerDeckId = get().playerDeckId, hordeDeckId = get().hordeDeckId, difficulty = get().game.difficulty, gameMode = get().game.gameMode) =>
    set((state) => {
      resetHordeSequence();
      persistSeed(seed);
      useAudioStore.getState().setMusicVariant("battle");
      const next = createInitialGame(getPlayerDeck(playerDeckId), getHordeDeck(hordeDeckId), seed, setupTurns, difficulty, gameMode);
      return {
        game: next,
        gameSessionId: state.gameSessionId + 1,
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
        burnAnimation: undefined,
        burnImpactCardId: undefined,
        burnImpactEventId: undefined,
        deathRevealCard: undefined,
        pendingStaticAuras: [],
        heldStaticAuraBonuses: {},
        playerAttackAnimation: undefined,
        resolvingHordeCombat: false,
        summoningAnimationCount: 0,
        pendingTriggeredEffectCount: 0,
        pendingTriggeredEffectSourceId: undefined,
        hordeAutoTriggerCount: 0,
        surgeTransitionActive: false,
        surgeTransitionShown: false,
        hordeCombatVisualDamage: undefined,
        hordeCombatDeadCardIds: [],
        specialDeadCardIds: [],
        hordeMillAnimationQueue: [],
        hordeMillPreviewCards: [],
        playerDiscardAnimationQueue: [],
        landPlayAnimationQueue: [],
        energyRecycleAnimation: undefined,
        energyRecycleDragActive: false,
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
  acceptOpeningHand: () =>
    set(({ game }) => ({
      game: acceptOpeningHand(game),
      selectedHandId: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
    })),
  mulliganOpeningHand: () =>
    set(({ game }) => {
      const next = mulliganOpeningHand(game);
      if (next.mulligansTaken !== game.mulligansTaken) useAudioStore.getState().playSfx("draw");
      return {
        game: next,
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
      };
    }),
  setEnergyRecycleDragActive: (active) => {
    if (get().energyRecycleDragActive === active) return;
    set({ energyRecycleDragActive: active });
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
  cancelCounterTargeting: () =>
    set((state) => ({
      counterTargeting: undefined,
      pendingTriggeredEffectCount: state.counterTargeting ? Math.max(0, state.pendingTriggeredEffectCount - 1) : state.pendingTriggeredEffectCount,
      pendingTriggeredEffectSourceId: state.counterTargeting ? undefined : state.pendingTriggeredEffectSourceId,
    })),
  confirmCounterTargeting: () =>
    set(({ game, counterTargeting }) => {
      if (!counterTargeting?.targetId) return {};
      const next = structuredClone(game) as GameState;
      const source = findBattlefieldCard(next, counterTargeting.sourceId);
      const target = findBattlefieldCard(next, counterTargeting.targetId);
      if (!source || !target) {
        return {
          counterTargeting: undefined,
          pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1),
          pendingTriggeredEffectSourceId: undefined,
        };
      }
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
      const lifeBeat = startLifeBuffBeat();
      return {
        game: next,
        counterTargeting: undefined,
        pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1),
        pendingTriggeredEffectSourceId: undefined,
        ...startBuffBeat([target.instanceId]),
        lifeBuffAnimationId: next.player.life > previousLife ? lifeBeat.lifeBuffAnimationId : get().lifeBuffAnimationId,
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
      resumeAfterDiscardPause(() => advanceSmallpoxSequence("after-discard"));
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
    notifyDiscardEffects(game, next, { title: uiText("toast.handLimit"), tone: "warning" });
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
      const buffBeat = req.controller === "SELF" ? startBuffBeat([targetId]) : undefined;
      return {
        spellTargeting: { ...spellTargeting, stepIndex: Math.min(nextStep, card.requiresTargets.length - 1), targets },
        ...(buffBeat ?? {}),
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
    set((state) => {
      if (discardPauseInProgress(state) || state.energyRecycleAnimation) return {};
      const { game } = state;
      const next = advancePhase(game, phase);
      playDrawOneIfPlayerDrew(game, next);
      return {
        game: next,
        playerAttackDrag: undefined,
        // The hand limit is checked when the player explicitly ends the turn,
        // not merely when combat advances into the end phase.
        handLimitDiscardActive: false,
        handLimitSelectionId: undefined,
      };
    }),
  endPlayerTurn: () =>
    set((state) => {
      if (discardPauseInProgress(state) || state.energyRecycleAnimation) return {};
      const { game } = state;
      const overflow = playerHandOverflow(game);
      if (overflow > 0) {
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
      const handCardRect = document.querySelector<HTMLElement>(`[data-hand-card-id="${id}"]`)?.getBoundingClientRect();
      const animationOrigin = handCardRect
        ? { x: handCardRect.left + handCardRect.width / 2, y: handCardRect.top + handCardRect.height / 2 }
        : undefined;
      const next = playLand(game, id);
      const playSucceeded = next.lastActionResult?.ok === true;
      if (playSucceeded) useAudioStore.getState().playSfx("playLand");
      else if (card) showActionToast(next.lastActionResult?.reason);
      if (playSucceeded) scheduleLandPlaySummoningSafetyClear();
      return {
        game: next,
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
        activeEffectCardId: undefined,
        summoningAnimationCount: playSucceeded ? state.summoningAnimationCount + 1 : state.summoningAnimationCount,
        landPlayAnimationQueue: playSucceeded && card
          ? [...state.landPlayAnimationQueue, {
              id: `land-play-${card.instanceId}-${Date.now()}`,
              card,
              origin: animationOrigin,
            }]
          : state.landPlayAnimationQueue,
      };
    }),
  startEnergyRecycle: (id, origin) =>
    set((state) => {
      if (combatResolutionInProgress(state) || state.energyRecycleAnimation) return {};
      if (state.pendingTriggeredEffectCount > 0) {
        showActionToast("Resolve the triggered effect before playing another card.");
        return {};
      }
      const card = state.game.player.hand.find((item) => item.instanceId === id);
      if (!card?.cardTypes.includes("Land")) return {};
      if (!canPlayerRecycleEnergy(state.game)) {
        showActionToast(
          state.game.setupTurnsRemaining > 0
            ? "Energy cannot be recycled during setup."
            : "You already used your Energy action this turn.",
        );
        return {};
      }
      useAudioStore.getState().playSfx("playLand", { volume: 0.62 });
      return {
        energyRecycleAnimation: {
          id: `energy-recycle-${card.instanceId}-${Date.now()}`,
          card,
          origin,
        },
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
        activeEffectCardId: undefined,
      };
    }),
  completeEnergyRecycleAnimation: () =>
    set((state) => {
      const active = state.energyRecycleAnimation;
      if (!active) return {};
      const next = recycleEnergy(state.game, active.card.instanceId);
      const succeeded = next.lastActionResult?.ok === true;
      if (succeeded) useAudioStore.getState().playSfx("drawOne", { volume: 0.84 });
      else showActionToast(next.lastActionResult?.reason);
      return {
        game: next,
        energyRecycleAnimation: undefined,
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
      };
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
    const state = get();
    if (discardPauseInProgress(state)) return;
    const { game, playerAttackAnimation } = state;
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
        handLimitDiscardActive: false,
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
    if (discardPauseInProgress(state) || state.surgeTransitionActive) return;
    const { game } = state;
    if (!state.surgeTransitionShown) {
      const preview = runHordeMainPhase(game, { deferEnterBattlefieldTriggers: true });
      if (hordeInSurge(preview)) {
        set({
          surgeTransitionActive: true,
          surgeTransitionShown: true,
          selectedHordeCreatureId: undefined,
          selectedPlayerCreatureId: undefined,
          hoveredCardId: undefined,
          focusedCardId: undefined,
        });
        return;
      }
    }
    const previousHordeBattlefieldIds = new Set(game.horde.battlefield.map((card) => card.instanceId));
    const main = runHordeMainPhase(game, { deferEnterBattlefieldTriggers: true });
    const enteredCards = main.horde.battlefield.filter((card) => !previousHordeBattlefieldIds.has(card.instanceId));
    const triggerCards = enteredCards.filter(hasEnterBattlefieldTrigger);
    if (main.horde.pendingCard) {
      const pendingCard = main.horde.pendingCard;
      set({
        game: main,
        selectedHordeCreatureId: undefined,
        selectedPlayerCreatureId: undefined,
        hordeAutoTriggerCount: triggerCards.length,
        hordeMillAnimationQueue: appendHordeMillAnimations(state, game, main),
      });
      captureStaticAuraBeats();
      if (triggerCards.length > 0) scheduleHordeEnterTriggers(triggerCards);
      runSmallpoxSequence(pendingCard);
      return;
    }
    if (main.horde.battlefield.length > game.horde.battlefield.length) useAudioStore.getState().playSfx("draw");
    set({
      game: main,
      selectedHordeCreatureId: undefined,
      selectedPlayerCreatureId: undefined,
      hordeAutoTriggerCount: triggerCards.length,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, game, main),
    });
    // Before any frame renders the new creatures: hold back the buffs they just gained so the
    // announcement beat still has something to reveal.
    captureStaticAuraBeats();
    if (triggerCards.length > 0) {
      scheduleHordeEnterTriggers(triggerCards, () => startHordeCombatSequence());
    } else {
      startHordeCombatSequence();
    }
  },
  completeSurgeTransition: () => {
    if (!get().surgeTransitionActive) return;
    set({ surgeTransitionActive: false });
    get().runHordeMain();
  },
  prepareHordeAttackers: () => {
    if (discardPauseInProgress(get())) return;
    startHordeCombatSequence();
  },
  declareBlocker: (blockerId, attackerId) =>
    set(({ game }) => {
      const wasBlocking = Object.values(game.combat.blockers).some((ids) => ids.includes(blockerId));
      const next = declareBlocker(game, blockerId, attackerId);
      const isBlockingTarget = next.combat.blockers[attackerId]?.includes(blockerId) ?? false;
      if (!wasBlocking && isBlockingTarget) useAudioStore.getState().playSfx("playLand");
      else if (next.lastActionResult?.ok === false) showActionToast(next.lastActionResult.reason);
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
  materializeLandPlayAnimation: (id) =>
    set((state) => ({
      landPlayAnimationQueue: state.landPlayAnimationQueue.map((item) => item.id === id ? { ...item, materialized: true } : item),
    })),
  completeLandPlayAnimation: (id) =>
    set((state) => ({
      landPlayAnimationQueue: state.landPlayAnimationQueue.filter((item) => item.id !== id),
      summoningAnimationCount: Math.max(0, state.summoningAnimationCount - 1),
    })),
  completeHordeMillAnimation: (id) =>
    set((state) => ({
      hordeMillAnimationQueue: state.hordeMillAnimationQueue.filter((item) => item.id !== id),
    })),
  resolveHordeCombat: () => {
    const state = get();
    if (discardPauseInProgress(state)) return;
    const { game, hordeAttackAnimation, playerAttackAnimation, burnAnimation } = state;
    if (hordeAttackAnimation || playerAttackAnimation || burnAnimation) return;

    const attackEvents = buildHordeAttackEvents(game);
    if (attackEvents.length === 0) {
      finishAnimatedHordeCombat();
      return;
    }
    set({ resolvingHordeCombat: true, selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined });
    runHordeCombatEventSequence(attackEvents, 0);
  },
  finishHordeTurn: () =>
    set((state) => {
      if (discardPauseInProgress(state)) return {};
      const { game } = state;
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

function runHordeCombatEventSequence(events: HordeAttackEvent[], index: number): void {
  const event = events[index];
  if (!event) {
    finishAnimatedHordeCombat();
    return;
  }
  if (!isHordeAttackEventCurrent(useGameStore.getState().game, event)) {
    runHordeCombatEventSequence(events, index + 1);
    return;
  }
  useAudioStore.getState().playSfx("attack", { volume: 0.75 });
  if (event.blockerDies) useAudioStore.getState().playSfx("defend", { volume: 0.68 });
  useGameStore.setState({
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

  window.setTimeout(() => {
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = applyHordeAttackEvent(previous, event);
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hordeCombatDeadCardIds: nextDeadCardIds(event),
      };
    });
  }, HORDE_ATTACK_ANIMATION_MS - 35);

  window.setTimeout(() => {
    useGameStore.setState({ hordeAttackAnimation: undefined });
    scheduleQueuedHordeTriggers(() => {
      useGameStore.setState({ hordeCombatDeadCardIds: [] });
      runHordeCombatEventSequence(events, index + 1);
    });
  }, HORDE_ATTACK_ANIMATION_MS);
}

function finishAnimatedHordeCombat(): void {
  const previous = useGameStore.getState().game;
  const resolved = finishHordeCombat(previous, { deferTriggeredEvents: true });
  const next = advancePhase(resolved, "end");
  notifyDiscardEffects(previous, next);
  useGameStore.setState({
    game: next,
    hordeAttackAnimation: undefined,
    burnAnimation: undefined,
    burnImpactCardId: undefined,
    deathRevealCard: undefined,
    // Failsafe: an aura whose beat never got to play must not keep its buff hidden forever.
    pendingStaticAuras: [],
    heldStaticAuraBonuses: {},
    resolvingHordeCombat: false,
    hordeCombatVisualDamage: undefined,
    hordeCombatDeadCardIds: [],
    selectedHordeCreatureId: undefined,
    selectedPlayerCreatureId: undefined,
  });
  scheduleQueuedHordeTriggers();
}

function readStoredSeed(): string {
  if (typeof window === "undefined") return "hostfall-seed";
  const storedSeed = window.localStorage.getItem(SEED_STORAGE_KEY);
  return storedSeed?.trim().toLowerCase() === "developer" ? "hostfall-seed" : storedSeed ?? "hostfall-seed";
}

function persistSeed(seed: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEED_STORAGE_KEY, seed);
}

function combatResolutionInProgress(state: GameStore): boolean {
  return Boolean(state.playerAttackAnimation || state.hordeAttackAnimation || state.burnAnimation || state.resolvingHordeCombat || state.energyRecycleAnimation || discardPauseInProgress(state));
}

// Creature casts and land plays both bump the shared summoningAnimationCount, but each used to
// share one safety-clear timer var: rescheduling it from one call site canceled the other's
// fallback, and firing it hard-set the count to 0 instead of decrementing — so a land's flight
// still in flight when a creature was cast could get its own pending decrement wiped out (or
// vice versa). Give each its own timer and decrement by 1 so they never step on each other.
function scheduleSummoningAnimationSafetyClear(): void {
  if (summoningAnimationSafetyTimer) window.clearTimeout(summoningAnimationSafetyTimer);
  summoningAnimationSafetyTimer = window.setTimeout(() => {
    useGameStore.setState((state) => ({ summoningAnimationCount: Math.max(0, state.summoningAnimationCount - 1) }));
    summoningAnimationSafetyTimer = undefined;
  }, SUMMONING_ANIMATION_SAFETY_CLEAR_MS);
}

function scheduleLandPlaySummoningSafetyClear(): void {
  if (landPlaySummoningSafetyTimer) window.clearTimeout(landPlaySummoningSafetyTimer);
  landPlaySummoningSafetyTimer = window.setTimeout(() => {
    useGameStore.setState((state) => ({ summoningAnimationCount: Math.max(0, state.summoningAnimationCount - 1) }));
    landPlaySummoningSafetyTimer = undefined;
  }, SUMMONING_ANIMATION_SAFETY_CLEAR_MS);
}

function previewPlayerCombatMillCards(game: GameState, attackers: string[]): Array<{ attackerIndex: number; cardIndexInHit: number; card: CardInstance }> {
  const previews: Array<{ attackerIndex: number; cardIndexInHit: number; card: CardInstance }> = [];
  let totalDamage = 0;
  let previousMill = 0;

  attackers.forEach((attackerId, attackerIndex) => {
    const attacker = game.player.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker) return;
    totalDamage += getPowerToughness(game, attacker).power;
    const nextMill = Math.floor(totalDamage / game.hordeRules.damagePerMill);
    const newMill = nextMill - previousMill;
    previousMill = nextMill;
    for (let index = 0; index < newMill; index += 1) {
      const card = game.horde.library[previews.length];
      if (card) previews.push({ attackerIndex, cardIndexInHit: index, card });
    }
  });

  return previews;
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
  const inner = effect?.type === "SEQUENCE"
    ? ((effect.effects as EffectDefinition[] | undefined)?.find((item) => EFFECT_ANNOUNCEMENTS[String(item.type)] === "createsTokens") ?? effect)
    : effect;
  if (inner && EFFECT_ANNOUNCEMENTS[String(inner.type)] === "createsTokens") return uiText("toast.cardCreatesToken", { card: uiCardName(card) });
  return uiText("toast.cardTrigger", { card: uiCardName(card) });
}

const CARD_CAST_REACTION_RESOLVE_MS = 620;
const MANUAL_TRIGGER_AFTER_REACTION_MS = 420;

const MANUAL_TRIGGER_SUMMON_WAIT_POLL_MS = 60;

function scheduleManualTriggerOverlay(manualTriggeredCard: CardInstance, startDelayMs: number): void {
  window.setTimeout(() => fireManualTriggerOverlay(manualTriggeredCard), startDelayMs);
}

// `.effect-card-lifted`/`.effect-card-activating` (the pulse this triggers) animate the same
// `transform`/`filter` on the same card slot the summon "pop" animation (Battlefield.tsx) does.
// The fixed delay callers pass is usually enough clearance, but under main-thread jank the pulse
// can still start while the pop is mid-flight and cut it short. Wait for summoningAnimationCount
// to actually drop to 0 (with a bounded safety clear already in the store) instead of guessing.
function fireManualTriggerOverlay(manualTriggeredCard: CardInstance): void {
  const latest = useGameStore.getState().game;
  if (!findBattlefieldCard(latest, manualTriggeredCard.instanceId)) {
    useGameStore.setState((state) => ({
      pendingTriggeredEffectCount: Math.max(0, state.pendingTriggeredEffectCount - 1),
      pendingTriggeredEffectSourceId: undefined,
    }));
    return;
  }
  if (useGameStore.getState().summoningAnimationCount > 0) {
    window.setTimeout(() => fireManualTriggerOverlay(manualTriggeredCard), MANUAL_TRIGGER_SUMMON_WAIT_POLL_MS);
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
    title: uiText("toast.hordeEffect"),
    message: sources.length === 1 ? cardCastReactionMessage(sources[0]) : uiText("toast.hordeResolves"),
    tone: "horde",
  });
  window.setTimeout(() => {
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      drainEventQueue(next);
      const triggeredBuffCardIds = findTemporaryStatBuffedCardIds(previous, next);
      if (triggeredBuffCardIds.length > 0) useAudioStore.getState().playSfx("buff", { volume: 0.72 });
      const buffBeat = triggeredBuffCardIds.length > 0 ? startBuffBeat(triggeredBuffCardIds) : undefined;
      const newHordeCreatures = next.horde.battlefield.filter((card) => !previous.horde.battlefield.some((old) => old.instanceId === card.instanceId));
      if (newHordeCreatures.length > 0) useAudioStore.getState().playSfx(monsterSfx(newHordeCreatures[0]));
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hordeAutoTriggerCount: Math.max(0, state.hordeAutoTriggerCount - 1),
        hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
        ...(buffBeat ?? {}),
      };
    });
    if (manualTriggeredCard) scheduleManualTriggerOverlay(manualTriggeredCard, MANUAL_TRIGGER_AFTER_REACTION_MS);
  }, CARD_CAST_REACTION_RESOLVE_MS);
}

function buildCastCardPatch(state: GameStore, id: string, options?: CastOptions): Partial<GameStore> {
  const { game } = state;
  const card = game.player.hand.find((item) => item.instanceId === id);
  const sfx = card && card.cardTypes.includes("Creature") ? monsterSfx(card) : undefined;
  const untappedLandIds = new Set(game.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
  const reactionSources = card ? findCardCastReactionSources(game, card) : [];
  const next = castCard(game, id, { ...options, deferReactiveTriggers: reactionSources.length > 0 });
  const castSucceeded = next.lastActionResult?.ok === true;
  const triggeredBuffCardIds = findTemporaryStatBuffedCardIds(game, next);
  if (sfx && castSucceeded) useAudioStore.getState().playSfx(sfx);
  else if (card && !castSucceeded) showActionToast(next.lastActionResult?.reason);
  if (triggeredBuffCardIds.length > 0) useAudioStore.getState().playSfx("buff", { volume: 0.72 });
  const buffBeat = triggeredBuffCardIds.length > 0 ? startBuffBeat(triggeredBuffCardIds) : undefined;
  const autoPaidLandIds = castSucceeded
    ? next.player.battlefield.filter((item) => item.cardTypes.includes("Land") && item.tapped && untappedLandIds.has(item.instanceId)).map((item) => item.instanceId)
    : [];
  const autoPaidLandAnimation = flashAutoPaidLands(autoPaidLandIds);
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
    ...(buffBeat ?? {}),
    summoningAnimationCount: startsSummoningAnimation ? state.summoningAnimationCount + 1 : state.summoningAnimationCount,
    pendingTriggeredEffectCount: manualTriggeredCard ? state.pendingTriggeredEffectCount + 1 : state.pendingTriggeredEffectCount,
    pendingTriggeredEffectSourceId: manualTriggeredCard?.instanceId ?? state.pendingTriggeredEffectSourceId,
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
  const isFightSpell = Boolean(friendlyId && enemyId && hasEffectPresentation(card.effects, "fight"));
  const isSourceDamageSpell = Boolean(friendlyId && enemyId && hasEffectPresentation(card.effects, "sourceDamage"));
  const isDestroySpell = hasEffectPresentation(card.effects, "destroy");
  const destroyTargetIds = isDestroySpell ? Object.values(targets).flatMap((target) => (Array.isArray(target) ? target : [target])).map(String) : [];
  const resolveSpell = (latest: GameState) => {
    const untappedLandIds = new Set(latest.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
    const reactionSources = findCardCastReactionSources(latest, card);
    const next = castCard(latest, handId, { targets, deferReactiveTriggers: reactionSources.length > 0 });
    const castSucceeded = next.lastActionResult?.ok === true;
    if (!castSucceeded) showActionToast(next.lastActionResult?.reason);
    const triggeredBuffCardIds = findTemporaryStatBuffedCardIds(latest, next);
    if (triggeredBuffCardIds.length > 0) useAudioStore.getState().playSfx("buff", { volume: 0.72 });
    const buffBeat = triggeredBuffCardIds.length > 0 ? startBuffBeat(triggeredBuffCardIds) : undefined;
    const autoPaidLandIds = castSucceeded
      ? next.player.battlefield.filter((item) => item.cardTypes.includes("Land") && item.tapped && untappedLandIds.has(item.instanceId)).map((item) => item.instanceId)
      : [];
    const autoPaidLandAnimation = flashAutoPaidLands(autoPaidLandIds);
    if (castSucceeded && reactionSources.length > 0) scheduleCardCastReaction(reactionSources, undefined);
    return {
      game: next,
      spellFightAnimation: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
      hordeMillAnimationQueue: appendHordeMillAnimations(useGameStore.getState(), latest, next),
      autoPaidLandAnimation,
      ...(buffBeat ?? {}),
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

