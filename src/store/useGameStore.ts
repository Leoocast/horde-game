import { create } from "zustand";
import { acceptOpeningHand, createInitialGame, mulliganOpeningHand } from "../engine/GameState";
import type { AbilityOptions, CardInstance, CastOptions, DifficultyMode, EffectDefinition, EventItem, GameMode, GameState, Phase } from "../engine/GameTypes";
import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID, getHordeDeck, getPlayerDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { activateAbility as activateEngineAbility, castCard, playLand, recycleEnergy } from "../engine/GameActions";
import { lifeCostAmount } from "../engine/ActionCosts";
import {
  applyHordeAttackEvent,
  beginHordeCombat,
  buildHordeAttackEvents,
  checkWinLoss,
  declareBlocker,
  declareHordeAttackers,
  finishHordeCombat,
  isHordeAttackEventCurrent,
  pendingHordeCombatDamageVolley,
  refreshHordeAttackEvent,
  resolvePendingHordeCombatDamageVolleys,
  resolvePlayerAttackerLifesteal,
  resolvePlayerAttackerPoison,
  resolvePlayerCombat,
  sortPlayerAttackersLeftToRight,
  togglePlayerAttacker,
  type HordeAttackEvent,
} from "../engine/CombatResolver";
import { finishHordeTurn, revealHordeCardFromTop, runHordeMain as runHordeMainPhase } from "../engine/HordeController";
import { canAttack, hasKeyword } from "../engine/Keywords";
import { getPowerToughness, hordeInSurge } from "../engine/StaticEffects";
import { EFFECT_ANNOUNCEMENTS, destroyMarkedCreatures, destroyPermanent, discardChosenCard, effectNeedsManualTarget, findManualEnterTargetTrigger, hasEffectPresentation, resolveEffect, resolveEffects, triggerConditionMet } from "../engine/EffectResolver";
import { type StaticAura } from "../engine/StaticAuras";
import { drainEventQueue } from "../engine/EventQueue";
import { targetCandidates, targetRequirementIsBuff } from "../engine/Targeting";
import type { TutorialStepId } from "../engine/Tutorial";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { canPlayerRecycleEnergy, playerHandOverflow } from "../engine/GameRules";
import {
  captureStaticAuraBeats,
  hasEnterBattlefieldTrigger,
  hordeSequenceEpoch,
  resetHordeSequence,
  scheduleHordeArrivalEffects,
  scheduleQueuedHordeTriggers,
  startHordeCombatSequence,
} from "./hordeBeats";
import { fireballCastSfx, fireballHitSfx, type SfxId } from "../audio/soundManifest";
import { advanceSmallpoxSequence, runSmallpoxSequence } from "./smallpoxSequence";
import {
  hasQueuedPlayerTriggers,
  resetPlayerTriggerSequence,
  scheduleQueuedPlayerTriggers,
} from "./playerBeats";
import {
  appendHordeMillAnimations,
  discardPauseInProgress,
  findBattlefieldCard,
  findTemporaryBuffedCardIds,
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
import {
  resolveCardVoiceCue,
  resolveCardVoiceCueBatch,
  type CardVoiceCue,
  type CardVoiceEvent,
} from "./cardVoiceInteractions";
import {
  buffAnimationVariantForCard,
  type BuffAnimationVariant,
} from "./buffAnimation";
import { playerBuffSfxForDeck } from "./playerAudioPolicy";

export type GameStore = {
  game: GameState;
  gameSessionId: number;
  hordeAttackAnimation?: HordeAttackAnimation;
  burnAnimation?: BurnAnimationState;
  burnImpactCardId?: string;
  burnImpactCardIds: string[];
  burnImpactEventId?: number;
  lifeDamageAnimationId?: number;
  lifePaymentAnimation?: LifePaymentAnimationState;
  lifestealAttackAnimations: LifestealAttackAnimationState[];
  poisonAttackAnimation?: PoisonAttackAnimationState;
  poisonConsumeAnimation?: PoisonConsumeAnimationState;
  bloodPactAnimation?: BloodPactAnimationState;
  drainEssenceAnimation?: DrainEssenceAnimationState;
  finalBanquetAnimation?: FinalBanquetAnimationState;
  deathRevealCard?: CardInstance;
  hordeSpellCard?: CardInstance;
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
  playerAutoTriggerCount: number;
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
  brokenWingsAnimation?: BrokenWingsAnimationState;
  pendingSpellHandId?: string;
  buffAnimationCardIds: string[];
  buffAnimationEventId?: number;
  buffAnimationVariant: BuffAnimationVariant;
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
  /** Plants an already-built GameState (Playground scenarios). Same store cleanup as `reset`. */
  loadScenario: (game: GameState, deckIds: { playerDeckId: string; hordeDeckId: string }) => void;
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
  endPlayerTurn: (options?: { runHordeAfter?: boolean }) => void;
  playLand: (id: string) => void;
  startEnergyRecycle: (id: string, origin: { x: number; y: number }) => void;
  setEnergyRecycleDragActive: (active: boolean) => void;
  completeEnergyRecycleAnimation: () => void;
  castCard: (id: string, options?: CastOptions) => void;
  setBloodPactAnimationPhase: (id: string, phase: BloodPactAnimationState["phase"]) => void;
  completeBloodPactAnimation: (id: string) => void;
  completeLifePaymentAnimation: (id: string) => void;
  completeLifestealAttackAnimation: (id: string) => void;
  completePoisonAttackAnimation: (id: string) => void;
  completePoisonConsumeAnimation: (id: string) => void;
  resolveDrainEssenceAnimation: (id: string) => void;
  completeDrainEssenceAnimation: (id: string) => void;
  beginFinalBanquetStrike: (id: string) => void;
  beginFinalBanquetImpact: (id: string) => void;
  completeFinalBanquetAnimation: (id: string) => void;
  activateAbility: (id: string, abilityId: string, options?: AbilityOptions) => void;
  toggleAttacker: (id: string) => void;
  attackAll: () => void;
  cancelPlayerAttackers: () => void;
  beginSummoningAnimation: () => void;
  endSummoningAnimation: () => void;
  resolvePlayerCombat: () => void;
  finishPlayerCombat: () => void;
  runHordeMain: () => void;
  /** Playground only: one Horde card enters from the top of its library, with its beats, without
   *  running a Horde turn. */
  resolveHordeCardFromTop: () => void;
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
const COMBAT_VOLLEY_LEAD_IN_MS = 360;
const COMBAT_VOLLEY_PROJECTILE_LAUNCH_MS = 220;
const COMBAT_VOLLEY_IMPACT_MS = 638;
const COMBAT_VOLLEY_ANIMATION_MS = 1220;
const COMBAT_VOLLEY_PROJECTILE_GAP_MS = 90;
const COMBAT_VOLLEY_MAX_PROJECTILES = 6;
const PLAYER_ATTACK_ANIMATION_MS = 500;
const HORDE_MILL_ANIMATION_MS = 720;
const PLAYER_ATTACK_MILL_START_MS = 90;
const PLAYER_ATTACK_MILL_GAP_MS = 35;
const PLAYER_ATTACK_NEXT_AFTER_MILL_MS = 470;
const SUMMONING_ANIMATION_SAFETY_CLEAR_MS = 900;
const BLOOD_PACT_ANIMATION_SAFETY_CLEAR_MS = 2200;
const LIFE_PAYMENT_ANIMATION_SAFETY_CLEAR_MS = 1100;
const LIFESTEAL_ATTACK_ANIMATION_SAFETY_CLEAR_MS = 1100;
const POISON_ATTACK_ANIMATION_SAFETY_CLEAR_MS = 900;
const POISON_CONSUME_ANIMATION_SAFETY_CLEAR_MS = 1200;
const DRAIN_ESSENCE_ANIMATION_SAFETY_CLEAR_MS = 3200;
const FINAL_BANQUET_ANIMATION_SAFETY_CLEAR_MS = 2600;
const SPELL_FIGHT_BUFF_LEAD_IN_MS = 1040;
const SPELL_FIGHT_IMPACT_MS = 520;
const SPELL_FIGHT_DEATH_FADE_MS = 260;
const BROKEN_WINGS_IMPACT_MS = 420;
const BROKEN_WINGS_DEATH_FADE_MS = 260;
let activeEffectCloseTimer: number | undefined;
let effectActivationPulseTimer: number | undefined;
let summoningAnimationSafetyTimer: number | undefined;
let landPlaySummoningSafetyTimer: number | undefined;
let bloodPactAnimationSafetyTimer: number | undefined;
let bloodPactAfterCommit: (() => void) | undefined;
let lifePaymentAnimationSafetyTimer: number | undefined;
let lifePaymentAfterCommit: (() => void) | undefined;
const lifestealAttackAnimationSafetyTimers = new Map<string, number>();
let lifestealAttackAnimationEventId = 0;
let poisonAttackAnimationSafetyTimer: number | undefined;
let poisonAttackAnimationEventId = 0;
let poisonConsumeAnimationSafetyTimer: number | undefined;
let poisonConsumeRunHordeAfterMill = false;
let drainEssenceAnimationSafetyTimer: number | undefined;
let drainEssenceCommit: (() => Partial<GameStore>) | undefined;
let drainEssenceAfterCommit: (() => void) | undefined;
let finalBanquetAnimationSafetyTimer: number | undefined;
let finalBanquetCommit: (() => Partial<GameStore>) | undefined;

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

export type LifestealAttackAnimationState = {
  id: string;
  attackerId: string;
  amount: number;
};

export type PoisonAttackAnimationState = {
  id: string;
  attackerId: string;
  amount: number;
};

export type PoisonConsumeAnimationState = {
  id: string;
  amount: number;
  millCount: number;
  runHordeAfter: boolean;
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

export type BloodPactAnimationState = {
  id: string;
  card: CardInstance;
  origin?: { left: number; top: number; width: number; height: number };
  drawnCardIds: string[];
  lifeBefore: number;
  lifeAfter: number;
  amount: number;
  phase: "casting" | "impact" | "settling" | "consumed";
};

export type LifePaymentAnimationState = {
  id: string;
  amount: number;
};

export type DrainEssenceAnimationState = {
  id: string;
  card: CardInstance;
  targetId: string;
  origin?: { left: number; top: number; width: number; height: number };
  phase: "extracting" | "resolved";
};

export type FinalBanquetAnimationState = {
  id: string;
  card: CardInstance;
  targetId: string;
  amount: number;
  origin?: { left: number; top: number; width: number; height: number };
  phase: "siphon" | "strike" | "impact";
};

export type BurnAnimationState = {
  id: string;
  sourceId?: string;
  targetId?: string;
  targetKind?: "card" | "playerLife";
  targets?: BurnAnimationTarget[];
  amount: number;
  projectileCount?: number;
  variant?: "fire" | "oil";
};

export type BurnAnimationTarget = {
  targetId?: string;
  targetKind: "card" | "playerLife";
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

export type BrokenWingsAnimationState = {
  id: string;
  targetId: string;
};

/** Every piece of presentation state that must NOT survive into a new game. It lives outside
 *  `GameState` (animation queues, targeting, selections), so anything that swaps the game in has to
 *  clear it here — otherwise callbacks and beats from the previous match land on the new board. */
function createCleanUiState(): Partial<GameStore> {
  return {
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
    burnImpactCardIds: [],
    burnImpactEventId: undefined,
    lifeDamageAnimationId: undefined,
    lifePaymentAnimation: undefined,
    lifestealAttackAnimations: [],
    poisonAttackAnimation: undefined,
    poisonConsumeAnimation: undefined,
    bloodPactAnimation: undefined,
    drainEssenceAnimation: undefined,
    finalBanquetAnimation: undefined,
    deathRevealCard: undefined,
    hordeSpellCard: undefined,
    pendingStaticAuras: [],
    heldStaticAuraBonuses: {},
    playerAttackAnimation: undefined,
    resolvingHordeCombat: false,
    summoningAnimationCount: 0,
    pendingTriggeredEffectCount: 0,
    pendingTriggeredEffectSourceId: undefined,
    hordeAutoTriggerCount: 0,
    playerAutoTriggerCount: 0,
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
    brokenWingsAnimation: undefined,
    pendingSpellHandId: undefined,
    buffAnimationCardIds: [],
    buffAnimationEventId: undefined,
    buffAnimationVariant: "default",
    lifeBuffAnimationId: undefined,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(getPlayerDeck(DEFAULT_PLAYER_DECK_ID), getHordeDeck(DEFAULT_HORDE_DECK_ID), defaultSeed, 3),
  gameSessionId: 0,
  hordeAttackAnimation: undefined,
  burnAnimation: undefined,
  burnImpactCardId: undefined,
  burnImpactCardIds: [],
  burnImpactEventId: undefined,
  lifeDamageAnimationId: undefined,
  lifePaymentAnimation: undefined,
  lifestealAttackAnimations: [],
  poisonAttackAnimation: undefined,
  poisonConsumeAnimation: undefined,
  bloodPactAnimation: undefined,
  drainEssenceAnimation: undefined,
  finalBanquetAnimation: undefined,
  deathRevealCard: undefined,
  hordeSpellCard: undefined,
  pendingStaticAuras: [],
  heldStaticAuraBonuses: {},
  playerAttackAnimation: undefined,
  resolvingHordeCombat: false,
  summoningAnimationCount: 0,
  pendingTriggeredEffectCount: 0,
  pendingTriggeredEffectSourceId: undefined,
  hordeAutoTriggerCount: 0,
  playerAutoTriggerCount: 0,
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
  brokenWingsAnimation: undefined,
  pendingSpellHandId: undefined,
  buffAnimationCardIds: [],
  buffAnimationEventId: undefined,
  buffAnimationVariant: "default",
  lifeBuffAnimationId: undefined,
  tutorialAcknowledgedStepId: undefined,
  seed: defaultSeed,
  playerDeckId: DEFAULT_PLAYER_DECK_ID,
  hordeDeckId: DEFAULT_HORDE_DECK_ID,
  reset: (seed = get().seed, setupTurns = 3, playerDeckId = get().playerDeckId, hordeDeckId = get().hordeDeckId, difficulty = get().game.difficulty, gameMode = get().game.gameMode) => {
    clearBloodPactPresentation();
    clearLifePaymentPresentation();
    clearLifestealAttackPresentation();
    clearPoisonAttackPresentation();
    clearPoisonConsumePresentation();
    clearDrainEssencePresentation();
    clearFinalBanquetPresentation();
    set((state) => {
      resetHordeSequence();
      resetPlayerTriggerSequence();
      persistSeed(seed);
      useAudioStore.getState().setMusicVariant("battle");
      const next = createInitialGame(getPlayerDeck(playerDeckId), getHordeDeck(hordeDeckId), seed, setupTurns, difficulty, gameMode);
      return {
        ...createCleanUiState(),
        game: next,
        gameSessionId: state.gameSessionId + 1,
        seed,
        playerDeckId,
        hordeDeckId,
      };
    });
  },
  loadScenario: (game, deckIds) => {
    clearBloodPactPresentation();
    clearLifePaymentPresentation();
    clearLifestealAttackPresentation();
    clearPoisonAttackPresentation();
    clearPoisonConsumePresentation();
    clearDrainEssencePresentation();
    clearFinalBanquetPresentation();
    set((state) => {
      resetHordeSequence();
      resetPlayerTriggerSequence();
      useAudioStore.getState().setMusicVariant("battle");
      return {
        ...createCleanUiState(),
        game,
        gameSessionId: state.gameSessionId + 1,
        seed: game.seed,
        playerDeckId: deckIds.playerDeckId,
        hordeDeckId: deckIds.hordeDeckId,
      };
    });
  },
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
      useAudioStore.getState().playSfx(playerBuffSfxForDeck(get().playerDeckId), { volume: 0.82 });
      const lifeBeat = startLifeBuffBeat();
      return {
        game: next,
        counterTargeting: undefined,
        pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1),
        pendingTriggeredEffectSourceId: undefined,
        ...startBuffBeat(
          [target.instanceId],
          buffAnimationVariantForCard(source.definitionId),
        ),
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
      useAudioStore.getState().playSfx("playLand", { volume: 0.68 });
      const targetIsBuff = targetRequirementIsBuff(card, req);
      const previewVariant = buffAnimationVariantForCard(card.definitionId, true);
      const buffBeat = targetIsBuff && previewVariant !== "growth-preview"
        ? startBuffBeat(
            [targetId],
            previewVariant,
          )
        : undefined;
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
      const removedTargetWasBuff = Boolean(req && targetRequirementIsBuff(card, req));
      const targets = { ...spellTargeting.targets };
      if (req) delete targets[req.id];
      return {
        spellTargeting: { ...spellTargeting, stepIndex: targetReqIndex, targets },
        buffAnimationCardIds: removedTargetWasBuff ? [] : get().buffAnimationCardIds,
        buffAnimationVariant: removedTargetWasBuff ? "default" : get().buffAnimationVariant,
      };
    }),
  cancelSpellTargeting: () => set({
    spellTargeting: undefined,
    selectedHandId: undefined,
    focusedCardId: undefined,
    buffAnimationCardIds: [],
    buffAnimationVariant: "default",
  }),
  confirmSpellTargeting: () => set((state) => runConfirmSpellTargeting(state)),
  setHoveredCardId: (id) => set({ hoveredCardId: id }),
  setFocusedCardId: (id) => set({ focusedCardId: id }),
  advancePhase: (phase) =>
    set((state) => {
      if (discardPauseInProgress(state) || state.energyRecycleAnimation || state.lifePaymentAnimation || state.bloodPactAnimation || state.drainEssenceAnimation || state.pendingSpellHandId || state.spellFightAnimation || state.playerAutoTriggerCount > 0) return {};
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
  endPlayerTurn: (options) =>
    set((state) => {
      if (discardPauseInProgress(state) || state.energyRecycleAnimation || state.lifePaymentAnimation || state.bloodPactAnimation || state.drainEssenceAnimation || state.pendingSpellHandId || state.spellFightAnimation || state.poisonConsumeAnimation || state.playerAutoTriggerCount > 0) return {};
      const { game } = state;
      const overflow = playerHandOverflow(game);
      if (overflow > 0) {
        return { handLimitDiscardActive: true, handLimitSelectionId: undefined };
      }
      const poisonPerMill = game.hordeRules.poisonPerMill;
      const poisonMills = Math.floor(game.horde.poisonCounters / poisonPerMill);
      if (poisonMills > 0) {
        const animation: PoisonConsumeAnimationState = {
          id: `poison-consume-${Date.now()}`,
          amount: poisonMills * poisonPerMill,
          millCount: poisonMills,
          runHordeAfter: options?.runHordeAfter === true,
        };
        schedulePoisonConsumeAnimationSafetyClear(animation.id);
        useAudioStore.getState().playSfx("activateEffect", { volume: 0.48 });
        return {
          poisonConsumeAnimation: animation,
          handLimitDiscardActive: false,
          handLimitSelectionId: undefined,
        };
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
  castCard: (id, options) => {
    let afterCommit: (() => void) | undefined;
    let startedBloodPactAnimationId: string | undefined;
    let startedLifePaymentAnimationId: string | undefined;
    set((state) => {
      if (combatResolutionInProgress(state)) return {};
      if (state.pendingTriggeredEffectCount > 0) {
        showActionToast("Resolve the triggered effect before playing another card.");
        return {};
      }
      const handCardRect = typeof document === "undefined"
        ? undefined
        : document.querySelector<HTMLElement>(`[data-hand-card-id="${id}"]`)?.getBoundingClientRect();
      const animationOrigin = handCardRect
        ? { left: handCardRect.left, top: handCardRect.top, width: handCardRect.width, height: handCardRect.height }
        : undefined;
      const result = buildCastCardPatch(state, id, options, animationOrigin);
      const bloodPactAnimation = result.patch.bloodPactAnimation;
      if (bloodPactAnimation) {
        bloodPactAfterCommit = result.afterCommit;
        startedBloodPactAnimationId = bloodPactAnimation.id;
      } else if (result.patch.lifePaymentAnimation) {
        lifePaymentAfterCommit = result.afterCommit;
        startedLifePaymentAnimationId = result.patch.lifePaymentAnimation.id;
      } else {
        afterCommit = result.afterCommit;
      }
      return result.patch;
    });
    afterCommit?.();
    if (startedBloodPactAnimationId) scheduleBloodPactAnimationSafetyClear(startedBloodPactAnimationId);
    if (startedLifePaymentAnimationId) scheduleLifePaymentAnimationSafetyClear(startedLifePaymentAnimationId);
  },
  setBloodPactAnimationPhase: (id, phase) => {
    let revealDraw = false;
    set((state) => {
      const animation = state.bloodPactAnimation;
      if (animation?.id !== id) return {};
      revealDraw = phase === "consumed" && animation.phase !== "consumed" && animation.drawnCardIds.length > 0;
      return { bloodPactAnimation: { ...animation, phase } };
    });
    if (revealDraw) useAudioStore.getState().playSfx("drawOne");
  },
  completeBloodPactAnimation: (id) => {
    let afterCommit: (() => void) | undefined;
    let revealDraw = false;
    set((state) => {
      if (state.bloodPactAnimation?.id !== id) return {};
      if (bloodPactAnimationSafetyTimer) {
        window.clearTimeout(bloodPactAnimationSafetyTimer);
        bloodPactAnimationSafetyTimer = undefined;
      }
      revealDraw =
        state.bloodPactAnimation.phase !== "consumed" &&
        state.bloodPactAnimation.drawnCardIds.length > 0;
      afterCommit = bloodPactAfterCommit;
      bloodPactAfterCommit = undefined;
      return { bloodPactAnimation: undefined };
    });
    if (revealDraw) useAudioStore.getState().playSfx("drawOne");
    afterCommit?.();
  },
  completeLifePaymentAnimation: (id) => {
    let afterCommit: (() => void) | undefined;
    set((state) => {
      if (state.lifePaymentAnimation?.id !== id) return {};
      if (lifePaymentAnimationSafetyTimer) {
        window.clearTimeout(lifePaymentAnimationSafetyTimer);
        lifePaymentAnimationSafetyTimer = undefined;
      }
      afterCommit = lifePaymentAfterCommit;
      lifePaymentAfterCommit = undefined;
      return { lifePaymentAnimation: undefined };
    });
    afterCommit?.();
  },
  completeLifestealAttackAnimation: (id) => {
    set((state) => {
      const timer = lifestealAttackAnimationSafetyTimers.get(id);
      if (timer !== undefined && typeof window !== "undefined") window.clearTimeout(timer);
      lifestealAttackAnimationSafetyTimers.delete(id);
      if (!state.lifestealAttackAnimations.some((animation) => animation.id === id)) return {};
      return {
        lifestealAttackAnimations: state.lifestealAttackAnimations.filter((animation) => animation.id !== id),
      };
    });
  },
  completePoisonAttackAnimation: (id) => {
    set((state) => {
      if (state.poisonAttackAnimation?.id !== id) return {};
      if (poisonAttackAnimationSafetyTimer !== undefined && typeof window !== "undefined") {
        window.clearTimeout(poisonAttackAnimationSafetyTimer);
      }
      poisonAttackAnimationSafetyTimer = undefined;
      return { poisonAttackAnimation: undefined };
    });
  },
  completePoisonConsumeAnimation: (id) => {
    const active = get().poisonConsumeAnimation;
    if (active?.id !== id) return;
    if (poisonConsumeAnimationSafetyTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(poisonConsumeAnimationSafetyTimer);
    }
    poisonConsumeAnimationSafetyTimer = undefined;
    const previous = get().game;
    const next = endPlayerTurn(previous);
    playDrawOneIfPlayerDrew(previous, next);
    let millAnimationQueued = false;
    set((state) => {
      const hordeMillAnimationQueue = appendHordeMillAnimations(state, previous, next);
      millAnimationQueued = hordeMillAnimationQueue.length > 0;
      return {
        game: next,
        poisonConsumeAnimation: undefined,
        handLimitDiscardActive: false,
        handLimitSelectionId: undefined,
        hordeMillAnimationQueue,
      };
    });
    if (active.runHordeAfter && millAnimationQueued) {
      poisonConsumeRunHordeAfterMill = true;
    } else if (active.runHordeAfter && typeof window !== "undefined") {
      window.setTimeout(() => {
        const latest = useGameStore.getState();
        if (latest.game.activeSide === "horde" && latest.game.phase === "horde") {
          latest.runHordeMain();
        }
      }, 0);
    }
  },
  resolveDrainEssenceAnimation: (id) => {
    const active = get().drainEssenceAnimation;
    if (active?.id !== id || active.phase === "resolved") return;
    const commit = drainEssenceCommit;
    drainEssenceCommit = undefined;
    if (!commit) {
      set({ drainEssenceAnimation: undefined, pendingSpellHandId: undefined });
      return;
    }
    const patch = commit();
    const committedGame = patch.game ?? get().game;
    set({
      ...patch,
      drainEssenceAnimation: { ...active, phase: "resolved" },
      pendingSpellHandId: active.card.instanceId,
      specialDeadCardIds: findMarkedCreatureIds(committedGame),
    });
  },
  completeDrainEssenceAnimation: (id) => {
    if (get().drainEssenceAnimation?.id !== id) return;
    if (get().drainEssenceAnimation?.phase !== "resolved") {
      get().resolveDrainEssenceAnimation(id);
    }
    const state = get();
    if (state.drainEssenceAnimation?.id !== id) return;
    if (drainEssenceAnimationSafetyTimer) {
      window.clearTimeout(drainEssenceAnimationSafetyTimer);
      drainEssenceAnimationSafetyTimer = undefined;
    }
    const deadCardIds = state.specialDeadCardIds;
    let nextGame = state.game;
    if (deadCardIds.length > 0) {
      nextGame = structuredClone(state.game) as GameState;
      destroyMarkedCreatures(nextGame);
    }
    const afterCommit = drainEssenceAfterCommit;
    drainEssenceAfterCommit = undefined;
    drainEssenceCommit = undefined;
    set({
      game: nextGame,
      drainEssenceAnimation: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
    });
    if (deadCardIds.length > 0) {
      scheduleQueuedCombatReactions(afterCommit ?? (() => undefined));
    } else {
      afterCommit?.();
    }
  },
  beginFinalBanquetStrike: (id) =>
    set((state) => {
      if (state.finalBanquetAnimation?.id !== id || state.finalBanquetAnimation.phase === "strike") return {};
      return {
        finalBanquetAnimation: {
          ...state.finalBanquetAnimation,
          phase: "strike",
        },
      };
    }),
  beginFinalBanquetImpact: (id) =>
    set((state) => {
      const active = state.finalBanquetAnimation;
      if (active?.id !== id || active.phase === "impact") return {};
      return {
        finalBanquetAnimation: {
          ...active,
          phase: "impact",
        },
        specialDeadCardIds: state.specialDeadCardIds.includes(active.targetId)
          ? state.specialDeadCardIds
          : [...state.specialDeadCardIds, active.targetId],
      };
    }),
  completeFinalBanquetAnimation: (id) => {
    const active = get().finalBanquetAnimation;
    if (active?.id !== id) return;
    if (finalBanquetAnimationSafetyTimer && typeof window !== "undefined") {
      window.clearTimeout(finalBanquetAnimationSafetyTimer);
      finalBanquetAnimationSafetyTimer = undefined;
    }
    const commit = finalBanquetCommit;
    finalBanquetCommit = undefined;
    const patch = commit?.() ?? {};
    set({
      ...patch,
      finalBanquetAnimation: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
    });
  },
  activateAbility: (id, abilityId, options) => {
    let shouldSchedulePlayerTriggers = false;
    let startedLifePaymentAnimationId: string | undefined;
    set((state) => {
      if (combatResolutionInProgress(state)) return {};
      const next = activateEngineAbility(state.game, id, abilityId, {
        ...options,
        deferReactiveTriggers: true,
      });
      const paidLife = next.lastActionResult?.ok === true
        ? Math.max(0, next.player.lifePaidThisTurn - state.game.player.lifePaidThisTurn)
        : 0;
      if (next.lastActionResult?.ok === false) showActionToast(next.lastActionResult.reason);
      shouldSchedulePlayerTriggers =
        next.lastActionResult?.ok === true && hasQueuedPlayerTriggers(next);
      if (paidLife > 0) {
        const animationId = `life-payment-${Date.now()}`;
        startedLifePaymentAnimationId = animationId;
        lifePaymentAfterCommit = shouldSchedulePlayerTriggers
          ? () => scheduleQueuedPlayerTriggers()
          : undefined;
      }
      return {
        game: next,
        activeEffectCardId: undefined,
        lifePaymentAnimation: paidLife > 0
          ? { id: startedLifePaymentAnimationId!, amount: paidLife }
          : undefined,
        playerAutoTriggerCount: shouldSchedulePlayerTriggers ? 1 : 0,
      };
    });
    if (startedLifePaymentAnimationId) {
      scheduleLifePaymentAnimationSafetyClear(startedLifePaymentAnimationId);
    } else if (shouldSchedulePlayerTriggers) {
      scheduleQueuedPlayerTriggers();
    }
  },
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
    const gainedLife = next.player.life > state.game.player.life;
    if (gainedLife) useAudioStore.getState().playSfx(playerBuffSfxForDeck(state.playerDeckId), { volume: 0.72 });
    return {
      game: next,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, state.game, next),
      ...(gainedLife ? startLifeBuffBeat() : {}),
    };
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
    const attackVoiceCues = new Map(
      resolveCardVoiceCueBatch(
        attackers.flatMap((attackerId) => {
          const card = game.player.battlefield.find((candidate) => candidate.instanceId === attackerId);
          return card
            ? [{
                type: "ATTACKS" as const,
                card,
                attackNumber: (card.attacksMade ?? 0) + 1,
              }]
            : [];
        }),
      ).map(({ cardId, cue }) => [cardId, cue]),
    );
    let elapsed = 0;
    attackers.forEach((attackerId, index) => {
      const attackerMillCards = previewMillCards.filter((item) => item.attackerIndex === index);
      const startAt = elapsed;
      window.setTimeout(() => {
        useAudioStore.getState().playSfx("attack", { volume: 0.75 });
        const voiceCue = attackVoiceCues.get(attackerId);
        if (voiceCue) playCardVoiceCue(voiceCue);
        set({ playerAttackAnimation: { attackerId, eventId: index } });
      }, startAt);
      window.setTimeout(() => {
        useGameStore.setState((state) => {
          const afterLifesteal = resolvePlayerAttackerLifesteal(state.game, attackerId);
          const lifeGain = afterLifesteal.player.life - state.game.player.life;
          const next = resolvePlayerAttackerPoison(afterLifesteal, attackerId);
          const poisonGain = next.horde.poisonCounters - state.game.horde.poisonCounters;
          let lifestealAnimation: LifestealAttackAnimationState | undefined;
          let poisonAnimation: PoisonAttackAnimationState | undefined;
          if (lifeGain > 0) {
            lifestealAttackAnimationEventId += 1;
            lifestealAnimation = {
              id: `lifesteal-attack-${lifestealAttackAnimationEventId}`,
              attackerId,
              amount: lifeGain,
            };
            scheduleLifestealAttackAnimationSafetyClear(lifestealAnimation.id);
            useAudioStore.getState().playSfx(playerBuffSfxForDeck(state.playerDeckId), { volume: 0.72 });
          }
          if (poisonGain > 0) {
            poisonAttackAnimationEventId += 1;
            poisonAnimation = {
              id: `poison-attack-${poisonAttackAnimationEventId}`,
              attackerId,
              amount: poisonGain,
            };
            schedulePoisonAttackAnimationSafetyClear(poisonAnimation.id);
          }
          if (!lifestealAnimation && !poisonAnimation) return {};
          return {
            game: next,
            ...(lifeGain > 0 ? startLifeBuffBeat() : {}),
            lifestealAttackAnimations: lifestealAnimation
              ? [...state.lifestealAttackAnimations, lifestealAnimation]
              : state.lifestealAttackAnimations,
            poisonAttackAnimation: poisonAnimation ?? state.poisonAttackAnimation,
          };
        });
      }, startAt + PLAYER_ATTACK_MILL_START_MS);
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
      const resolved = resolvePlayerCombat(latest, { skipLifesteal: true, skipPoison: true });
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
        summoningAnimationCount: state.summoningAnimationCount + enteredCards.length,
        hordeMillAnimationQueue: appendHordeMillAnimations(state, game, main),
      });
      captureStaticAuraBeats();
      scheduleHordeArrivalEffects(triggerCards, () => runSmallpoxSequence(pendingCard));
      return;
    }
    if (main.horde.battlefield.length > game.horde.battlefield.length) useAudioStore.getState().playSfx("draw");
    set({
      game: main,
      selectedHordeCreatureId: undefined,
      selectedPlayerCreatureId: undefined,
      hordeAutoTriggerCount: triggerCards.length,
      summoningAnimationCount: state.summoningAnimationCount + enteredCards.length,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, game, main),
    });
    // Before any frame renders the new creatures: hold back the buffs they just gained so the
    // announcement beat still has something to reveal.
    captureStaticAuraBeats();
    scheduleHordeArrivalEffects(triggerCards, () => startHordeCombatSequence());
  },
  /**
   * Playground only. Same beats as `runHordeMain` — enter triggers, static aura capture, mill
   * animations, the Smallpox hand-off — but for exactly one card and without starting combat.
   * Playing a single Goblin token in the lab used to run a whole Zombie Horde turn, which is not
   * what "play this card" means anywhere.
   */
  resolveHordeCardFromTop: () => {
    const state = get();
    const { game } = state;
    const previousIds = new Set(game.horde.battlefield.map((card) => card.instanceId));
    const next = revealHordeCardFromTop(game, { deferEnterBattlefieldTriggers: true });
    if (next.lastActionResult?.ok === false) {
      set({ game: next });
      return;
    }
    const entered = next.horde.battlefield.filter((card) => !previousIds.has(card.instanceId));
    const triggerCards = entered.filter(hasEnterBattlefieldTrigger);
    const pendingCard = next.horde.pendingCard;

    if (entered.length > 0) useAudioStore.getState().playSfx("draw");
    set({
      game: next,
      selectedHordeCreatureId: undefined,
      selectedPlayerCreatureId: undefined,
      hordeAutoTriggerCount: triggerCards.length,
      summoningAnimationCount: state.summoningAnimationCount + entered.length,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, game, next),
    });
    // Before any frame renders the new permanent: hold back the buffs it just granted so the
    // announcement beat still has something to reveal.
    captureStaticAuraBeats();
    if (pendingCard) {
      scheduleHordeArrivalEffects(triggerCards, () => runSmallpoxSequence(pendingCard));
      return;
    }
    scheduleHordeArrivalEffects(triggerCards, () => scheduleQueuedHordeTriggers());
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
  completeHordeMillAnimation: (id) => {
    let shouldRunHorde = false;
    set((state) => {
      const hordeMillAnimationQueue = state.hordeMillAnimationQueue.filter((item) => item.id !== id);
      if (hordeMillAnimationQueue.length === 0 && poisonConsumeRunHordeAfterMill) {
        poisonConsumeRunHordeAfterMill = false;
        shouldRunHorde = true;
      }
      return { hordeMillAnimationQueue };
    });
    if (shouldRunHorde && typeof window !== "undefined") {
      window.setTimeout(() => {
        const latest = useGameStore.getState();
        if (latest.game.activeSide === "horde" && latest.game.phase === "horde") {
          latest.runHordeMain();
        }
      }, 0);
    }
  },
  resolveHordeCombat: () => {
    const state = get();
    if (discardPauseInProgress(state)) return;
    const { game, hordeAttackAnimation, playerAttackAnimation, burnAnimation } = state;
    if (hordeAttackAnimation || playerAttackAnimation || burnAnimation) return;

    const attackEvents = buildHordeAttackEvents(game);
    if (attackEvents.length === 0) {
      runPendingHordeCombatVolleyOrFinish();
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
  const plannedEvent = events[index];
  if (!plannedEvent) {
    runPendingHordeCombatVolleyOrFinish();
    return;
  }
  const currentGame = useGameStore.getState().game;
  if (!isHordeAttackEventCurrent(currentGame, plannedEvent)) {
    runHordeCombatEventSequence(events, index + 1);
    return;
  }
  const event = refreshHordeAttackEvent(currentGame, plannedEvent);
  if (!event) {
    runHordeCombatEventSequence(events, index + 1);
    return;
  }
  useAudioStore.getState().playSfx("attack", { volume: 0.75 });
  const blocker = event.blockerId
    ? currentGame.player.battlefield.find((card) => card.instanceId === event.blockerId)
    : undefined;
  if (blocker) playCardVoiceInteraction({ type: "BLOCKS", card: blocker });
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
      const gainedLife = next.player.life > previous.player.life;
      if (gainedLife) useAudioStore.getState().playSfx(playerBuffSfxForDeck(state.playerDeckId), { volume: 0.72 });
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hordeCombatDeadCardIds: nextDeadCardIds(event),
        ...(gainedLife ? startLifeBuffBeat() : {}),
      };
    });
  }, HORDE_ATTACK_ANIMATION_MS - 35);

  window.setTimeout(() => {
    useGameStore.setState({ hordeAttackAnimation: undefined });
    scheduleQueuedCombatReactions(() => {
      useGameStore.setState({ hordeCombatDeadCardIds: [] });
      runHordeCombatEventSequence(events, index + 1);
    });
  }, HORDE_ATTACK_ANIMATION_MS);
}

function scheduleQueuedCombatReactions(onComplete: () => void): void {
  if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
    scheduleQueuedPlayerTriggers(() => scheduleQueuedCombatReactions(onComplete));
    return;
  }
  scheduleQueuedHordeTriggers(() => {
    if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
      scheduleQueuedCombatReactions(onComplete);
      return;
    }
    onComplete();
  });
}

function runPendingHordeCombatVolleyOrFinish(): void {
  const state = useGameStore.getState();
  const volley = pendingHordeCombatDamageVolley(state.game);
  if (!volley || volley.damage <= 0) {
    finishAnimatedHordeCombat();
    return;
  }

  const sequenceId = hordeSequenceEpoch();
  const source = volley.sourceId
    ? state.game.horde.battlefield.find((card) => card.instanceId === volley.sourceId)
    : undefined;
  const projectileCount = Math.max(1, Math.min(COMBAT_VOLLEY_MAX_PROJECTILES, volley.attackerCount));
  const volleyDelay = (projectileCount - 1) * COMBAT_VOLLEY_PROJECTILE_GAP_MS;

  useGameStore.setState({ hordeAutoTriggerCount: 1 });
  if (source) {
    useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
    useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
    useToastStore.getState().pushToast({
      title: uiText("toast.hordeEffect"),
      message: uiText("toast.cardTrigger", { card: uiCardName(source) }),
      tone: "horde",
    });
  }

  window.setTimeout(() => {
    if (sequenceId !== hordeSequenceEpoch()) return;
    useGameStore.setState({
      burnAnimation: {
        id: `combat-volley-${Date.now()}`,
        sourceId: volley.sourceId,
        targetKind: "playerLife",
        amount: volley.damage,
        projectileCount,
      },
    });
    for (let projectileIndex = 0; projectileIndex < projectileCount; projectileIndex += 1) {
      const projectileDelay = projectileIndex * COMBAT_VOLLEY_PROJECTILE_GAP_MS;
      window.setTimeout(() => {
        if (sequenceId !== hordeSequenceEpoch()) return;
        useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx), { volume: 0.64 });
      }, COMBAT_VOLLEY_PROJECTILE_LAUNCH_MS + projectileDelay);

      window.setTimeout(() => {
        if (sequenceId !== hordeSequenceEpoch()) return;
        useAudioStore.getState().playSfx(fireballHitSfx, { volume: 0.72 });
        if (projectileIndex !== projectileCount - 1) return;
        useGameStore.setState((current) => ({
          game: resolvePendingHordeCombatDamageVolleys(current.game),
          lifeDamageAnimationId: Date.now(),
        }));
      }, COMBAT_VOLLEY_IMPACT_MS + projectileDelay);
    }

    window.setTimeout(() => {
      if (sequenceId !== hordeSequenceEpoch()) return;
      useGameStore.setState({ burnAnimation: undefined });
      finishAnimatedHordeCombat();
    }, COMBAT_VOLLEY_ANIMATION_MS + volleyDelay);
  }, COMBAT_VOLLEY_LEAD_IN_MS);
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
    burnImpactCardIds: [],
    deathRevealCard: undefined,
    hordeSpellCard: undefined,
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

function pickRandomSfx(ids: SfxId[]): SfxId {
  return ids[Math.floor(Math.random() * ids.length)];
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

function clearBloodPactPresentation(): void {
  if (bloodPactAnimationSafetyTimer && typeof window !== "undefined") {
    window.clearTimeout(bloodPactAnimationSafetyTimer);
  }
  bloodPactAnimationSafetyTimer = undefined;
  bloodPactAfterCommit = undefined;
}

function clearLifePaymentPresentation(): void {
  if (lifePaymentAnimationSafetyTimer && typeof window !== "undefined") {
    window.clearTimeout(lifePaymentAnimationSafetyTimer);
  }
  lifePaymentAnimationSafetyTimer = undefined;
  lifePaymentAfterCommit = undefined;
}

function clearLifestealAttackPresentation(): void {
  if (typeof window !== "undefined") {
    for (const timer of lifestealAttackAnimationSafetyTimers.values()) window.clearTimeout(timer);
  }
  lifestealAttackAnimationSafetyTimers.clear();
}

function clearPoisonAttackPresentation(): void {
  if (poisonAttackAnimationSafetyTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(poisonAttackAnimationSafetyTimer);
  }
  poisonAttackAnimationSafetyTimer = undefined;
}

function clearPoisonConsumePresentation(): void {
  if (poisonConsumeAnimationSafetyTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(poisonConsumeAnimationSafetyTimer);
  }
  poisonConsumeAnimationSafetyTimer = undefined;
  poisonConsumeRunHordeAfterMill = false;
}

function clearDrainEssencePresentation(): void {
  if (drainEssenceAnimationSafetyTimer && typeof window !== "undefined") {
    window.clearTimeout(drainEssenceAnimationSafetyTimer);
  }
  drainEssenceAnimationSafetyTimer = undefined;
  drainEssenceCommit = undefined;
  drainEssenceAfterCommit = undefined;
}

function clearFinalBanquetPresentation(): void {
  if (finalBanquetAnimationSafetyTimer && typeof window !== "undefined") {
    window.clearTimeout(finalBanquetAnimationSafetyTimer);
  }
  finalBanquetAnimationSafetyTimer = undefined;
  finalBanquetCommit = undefined;
}

function scheduleBloodPactAnimationSafetyClear(id: string): void {
  if (bloodPactAnimationSafetyTimer) window.clearTimeout(bloodPactAnimationSafetyTimer);
  bloodPactAnimationSafetyTimer = window.setTimeout(() => {
    useGameStore.getState().completeBloodPactAnimation(id);
  }, BLOOD_PACT_ANIMATION_SAFETY_CLEAR_MS);
}

function scheduleLifePaymentAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  if (lifePaymentAnimationSafetyTimer) window.clearTimeout(lifePaymentAnimationSafetyTimer);
  lifePaymentAnimationSafetyTimer = window.setTimeout(() => {
    useGameStore.getState().completeLifePaymentAnimation(id);
  }, LIFE_PAYMENT_ANIMATION_SAFETY_CLEAR_MS);
}

function scheduleLifestealAttackAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  const previousTimer = lifestealAttackAnimationSafetyTimers.get(id);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  const timer = window.setTimeout(() => {
    useGameStore.getState().completeLifestealAttackAnimation(id);
  }, LIFESTEAL_ATTACK_ANIMATION_SAFETY_CLEAR_MS);
  lifestealAttackAnimationSafetyTimers.set(id, timer);
}

function schedulePoisonAttackAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  if (poisonAttackAnimationSafetyTimer !== undefined) {
    window.clearTimeout(poisonAttackAnimationSafetyTimer);
  }
  poisonAttackAnimationSafetyTimer = window.setTimeout(() => {
    useGameStore.getState().completePoisonAttackAnimation(id);
  }, POISON_ATTACK_ANIMATION_SAFETY_CLEAR_MS);
}

function schedulePoisonConsumeAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  if (poisonConsumeAnimationSafetyTimer !== undefined) {
    window.clearTimeout(poisonConsumeAnimationSafetyTimer);
  }
  poisonConsumeAnimationSafetyTimer = window.setTimeout(() => {
    useGameStore.getState().completePoisonConsumeAnimation(id);
  }, POISON_CONSUME_ANIMATION_SAFETY_CLEAR_MS);
}

function scheduleDrainEssenceAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  if (drainEssenceAnimationSafetyTimer) window.clearTimeout(drainEssenceAnimationSafetyTimer);
  drainEssenceAnimationSafetyTimer = window.setTimeout(() => {
    const store = useGameStore.getState();
    if (store.drainEssenceAnimation?.id !== id) return;
    store.resolveDrainEssenceAnimation(id);
    useGameStore.getState().completeDrainEssenceAnimation(id);
  }, DRAIN_ESSENCE_ANIMATION_SAFETY_CLEAR_MS);
}

function scheduleFinalBanquetAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  if (finalBanquetAnimationSafetyTimer) window.clearTimeout(finalBanquetAnimationSafetyTimer);
  finalBanquetAnimationSafetyTimer = window.setTimeout(() => {
    const store = useGameStore.getState();
    if (store.finalBanquetAnimation?.id !== id) return;
    store.completeFinalBanquetAnimation(id);
  }, FINAL_BANQUET_ANIMATION_SAFETY_CLEAR_MS);
}

function combatResolutionInProgress(state: GameStore): boolean {
  return Boolean(
    state.playerAttackAnimation ||
      state.hordeAttackAnimation ||
      state.burnAnimation ||
      state.lifePaymentAnimation ||
      state.lifestealAttackAnimations.length > 0 ||
      state.poisonConsumeAnimation ||
      state.bloodPactAnimation ||
      state.drainEssenceAnimation ||
      state.finalBanquetAnimation ||
      state.pendingSpellHandId ||
      state.spellFightAnimation ||
      state.resolvingHordeCombat ||
      state.playerAutoTriggerCount > 0 ||
      state.energyRecycleAnimation ||
      discardPauseInProgress(state),
  );
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

function effectsUseAnimation(effects: EffectDefinition[] | undefined, animation: string): boolean {
  return (effects ?? []).some((effect) => {
    if (effect.animation === animation) return true;
    if (effect.type === "SEQUENCE") {
      return effectsUseAnimation(effect.effects as EffectDefinition[] | undefined, animation);
    }
    if (effect.type === "CHOOSE") {
      return ((effect.options as Array<{ effects?: EffectDefinition[] }> | undefined) ?? [])
        .some((option) => effectsUseAnimation(option.effects, animation));
    }
    return false;
  });
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
      hoveredCardId: undefined,
      focusedCardId: undefined,
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
      const triggeredBuffCardIds = findTemporaryBuffedCardIds(previous, next);
      if (triggeredBuffCardIds.length > 0) useAudioStore.getState().playSfx("buff", { volume: 0.72 });
      const buffBeat = triggeredBuffCardIds.length > 0 ? startBuffBeat(triggeredBuffCardIds) : undefined;
      const newHordeCreatures = next.horde.battlefield.filter((card) => !previous.horde.battlefield.some((old) => old.instanceId === card.instanceId));
      if (newHordeCreatures.length > 0) useAudioStore.getState().playSfx(monsterSfx(newHordeCreatures[0]));
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hordeAutoTriggerCount: Math.max(0, state.hordeAutoTriggerCount - 1),
        summoningAnimationCount: state.summoningAnimationCount + newHordeCreatures.length,
        hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
        ...(buffBeat ?? {}),
      };
    });
    if (manualTriggeredCard) scheduleManualTriggerOverlay(manualTriggeredCard, MANUAL_TRIGGER_AFTER_REACTION_MS);
  }, CARD_CAST_REACTION_RESOLVE_MS);
}

function buildCastCardPatch(
  state: GameStore,
  id: string,
  options?: CastOptions,
  animationOrigin?: BloodPactAnimationState["origin"],
): { patch: Partial<GameStore>; afterCommit?: () => void } {
  const { game } = state;
  const card = game.player.hand.find((item) => item.instanceId === id);
  const usesBloodPactAnimation = Boolean(card && effectsUseAnimation(card.effects, "BLOOD_PACT"));
  const sfx = card && card.cardTypes.includes("Creature") ? monsterSfx(card) : undefined;
  const untappedLandIds = new Set(game.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
  const reactionSources = card ? findCardCastReactionSources(game, card) : [];
  const next = castCard(game, id, {
    ...options,
    deferPlayerTriggers: Boolean(card && lifeCostAmount(card.additionalCost, game.player.life) > 0),
    deferReactiveTriggers: reactionSources.length > 0,
  });
  const castSucceeded = next.lastActionResult?.ok === true;
  const previousHandIds = new Set(game.player.hand.map((item) => item.instanceId));
  const drawnCardIds = castSucceeded
    ? next.player.hand.filter((item) => !previousHandIds.has(item.instanceId)).map((item) => item.instanceId)
    : [];
  const playerTriggersQueued = castSucceeded && hasQueuedPlayerTriggers(next);
  const lostLife = castSucceeded && next.player.life < game.player.life;
  const lifeLost = Math.max(0, game.player.life - next.player.life);
  const paidLife = castSucceeded
    ? Math.max(0, next.player.lifePaidThisTurn - game.player.lifePaidThisTurn)
    : 0;
  const triggeredBuffCardIds = findTemporaryBuffedCardIds(game, next);
  const triggeredBuffVariant =
    triggeredBuffCardIds
      .map((cardId) => findBattlefieldCard(next, cardId))
      .map((buffedCard) => buffAnimationVariantForCard(buffedCard?.definitionId))
      .find((variant) => variant !== "default") ??
    "default";
  if (sfx && castSucceeded) useAudioStore.getState().playSfx(sfx);
  else if (card && !castSucceeded) showActionToast(next.lastActionResult?.reason);
  if (castSucceeded && card) playBattlefieldEntryVoiceInteraction(game, next, card.instanceId);
  if (lostLife && paidLife === 0 && !usesBloodPactAnimation) useAudioStore.getState().playSfx("defend", { volume: 0.62 });
  if (castSucceeded && !usesBloodPactAnimation) playDrawOneIfPlayerDrew(game, next);
  if (triggeredBuffCardIds.length > 0) {
    useAudioStore.getState().playSfx(playerBuffSfxForDeck(state.playerDeckId), { volume: 0.72 });
  }
  const buffBeat = triggeredBuffCardIds.length > 0
    ? startBuffBeat(triggeredBuffCardIds, triggeredBuffVariant)
    : undefined;
  const autoPaidLandIds = castSucceeded
    ? next.player.battlefield.filter((item) => item.cardTypes.includes("Land") && item.tapped && untappedLandIds.has(item.instanceId)).map((item) => item.instanceId)
    : [];
  const autoPaidLandAnimation = flashAutoPaidLands(autoPaidLandIds);
  const manualTriggeredCard = hasManualEnterTargetTrigger(card) && castSucceeded ? card : undefined;
  const startsSummoningAnimation = Boolean(castSucceeded && card && !card.cardTypes.includes("Instant") && !card.cardTypes.includes("Sorcery"));
  if (startsSummoningAnimation) scheduleSummoningAnimationSafetyClear();
  const continueAfterPlayerTriggers = () => {
    if (reactionSources.length > 0) {
      scheduleCardCastReaction(reactionSources, manualTriggeredCard);
    } else if (manualTriggeredCard) {
      scheduleManualTriggerOverlay(manualTriggeredCard, 420);
    }
  };
  const afterCommit = playerTriggersQueued
    ? () => scheduleQueuedPlayerTriggers(continueAfterPlayerTriggers)
    : continueAfterPlayerTriggers;
  const bloodPactAnimation = castSucceeded && usesBloodPactAnimation && card
    ? {
        id: `blood-pact-${card.instanceId}-${Date.now()}`,
        card,
        origin: animationOrigin,
        drawnCardIds,
        lifeBefore: game.player.life,
        lifeAfter: next.player.life,
        amount: lifeLost,
        phase: "casting" as const,
      }
    : undefined;
  const lifePaymentAnimation = paidLife > 0 && !bloodPactAnimation
    ? { id: `life-payment-${card?.instanceId ?? "cast"}-${Date.now()}`, amount: paidLife }
    : undefined;
  return {
    patch: {
      game: next,
      selectedHandId: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
      activeEffectCardId: undefined,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, game, next),
      lifeDamageAnimationId: lostLife && paidLife === 0 && !bloodPactAnimation ? Date.now() : state.lifeDamageAnimationId,
      lifePaymentAnimation,
      bloodPactAnimation,
      autoPaidLandAnimation,
      ...(buffBeat ?? {}),
      summoningAnimationCount: startsSummoningAnimation ? state.summoningAnimationCount + 1 : state.summoningAnimationCount,
      pendingTriggeredEffectCount: manualTriggeredCard ? state.pendingTriggeredEffectCount + 1 : state.pendingTriggeredEffectCount,
      pendingTriggeredEffectSourceId: manualTriggeredCard?.instanceId ?? state.pendingTriggeredEffectSourceId,
      playerAutoTriggerCount: playerTriggersQueued ? 1 : state.playerAutoTriggerCount,
    },
    afterCommit,
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
  const isTargetDamageSpell = hasEffectPresentation(card.effects, "targetDamage");
  const isDestroySpell = hasEffectPresentation(card.effects, "destroy");
  const usesDrainEssenceAnimation = effectsUseAnimation(card.effects, "DRAIN_ESSENCE");
  const usesFinalBanquetAnimation = effectsUseAnimation(card.effects, "FINAL_BANQUET");
  const usesBrokenWingsAnimation = card.definitionId === "broken_wings";
  const destroyTargetIds = isDestroySpell ? Object.values(targets).flatMap((target) => (Array.isArray(target) ? target : [target])).map(String) : [];
  const resolveSpell = (
    latest: GameState,
    presentation: {
      deferContinuation?: boolean;
      suppressLifeLossPresentation?: boolean;
      deferFightResolution?: boolean;
    } = {},
  ) => {
    const untappedLandIds = new Set(latest.player.battlefield.filter((item) => item.cardTypes.includes("Land") && !item.tapped).map((item) => item.instanceId));
    const reactionSources = findCardCastReactionSources(latest, card);
    const next = castCard(latest, handId, {
      targets,
      deferPlayerTriggers: lifeCostAmount(card.additionalCost, latest.player.life) > 0 || isTargetDamageSpell || isDestroySpell,
      deferReactiveTriggers: reactionSources.length > 0 || isDestroySpell,
      deferFightResolution: presentation.deferFightResolution,
    });
    const castSucceeded = next.lastActionResult?.ok === true;
    const lostLife = castSucceeded && next.player.life < latest.player.life;
    const paidLife = castSucceeded
      ? Math.max(0, next.player.lifePaidThisTurn - latest.player.lifePaidThisTurn)
      : 0;
    const gainedLife = castSucceeded && next.player.life > latest.player.life;
    const playerTriggersQueued = castSucceeded && hasQueuedPlayerTriggers(next);
    if (!castSucceeded) showActionToast(next.lastActionResult?.reason);
    if (castSucceeded) playBattlefieldEntryVoiceInteraction(latest, next, card.instanceId);
    if (lostLife && paidLife === 0 && !presentation.suppressLifeLossPresentation) {
      useAudioStore.getState().playSfx("defend", { volume: 0.62 });
    }
    if (gainedLife) useAudioStore.getState().playSfx(playerBuffSfxForDeck(state.playerDeckId), { volume: 0.72 });
    const triggeredBuffCardIds = findTemporaryBuffedCardIds(latest, next);
    if (triggeredBuffCardIds.length > 0) {
      useAudioStore.getState().playSfx(playerBuffSfxForDeck(state.playerDeckId), { volume: 0.72 });
    }
    const buffBeat = triggeredBuffCardIds.length > 0
      ? startBuffBeat(
          triggeredBuffCardIds,
          buffAnimationVariantForCard(card.definitionId),
        )
      : undefined;
    const autoPaidLandIds = castSucceeded
      ? next.player.battlefield.filter((item) => item.cardTypes.includes("Land") && item.tapped && untappedLandIds.has(item.instanceId)).map((item) => item.instanceId)
      : [];
    const autoPaidLandAnimation = flashAutoPaidLands(autoPaidLandIds);
    const lifeBuffBeat = gainedLife ? startLifeBuffBeat() : undefined;
    const continueAfterPlayerTriggers = () => {
      if (reactionSources.length > 0) scheduleCardCastReaction(reactionSources, undefined);
    };
    const continueAfterPayment = () => {
      if (isDestroySpell && castSucceeded) {
        // Destruction can queue opposing death reactions before a LIFE_LOST reaction. Let the
        // shared runner preserve that queue order, then continue with reactions to the cast itself.
        window.setTimeout(() => scheduleQueuedHordeTriggers(continueAfterPlayerTriggers), 0);
      } else if (playerTriggersQueued) {
        // `resolveSpell` runs inside a Zustand state update. Start the player beat on the next task
        // so it reads the just-committed LIFE_LOST event instead of the previous store snapshot.
        window.setTimeout(() => scheduleQueuedPlayerTriggers(continueAfterPlayerTriggers), 0);
      } else if (castSucceeded) {
        continueAfterPlayerTriggers();
      }
    };
    const lifePaymentAnimation = paidLife > 0
      ? { id: `life-payment-${card.instanceId}-${Date.now()}`, amount: paidLife }
      : undefined;
    if (lifePaymentAnimation) {
      lifePaymentAfterCommit = continueAfterPayment;
      scheduleLifePaymentAnimationSafetyClear(lifePaymentAnimation.id);
    } else if (presentation.deferContinuation) {
      drainEssenceAfterCommit = continueAfterPayment;
    } else {
      continueAfterPayment();
    }
    return {
      game: next,
      spellFightAnimation: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
      hordeMillAnimationQueue: appendHordeMillAnimations(useGameStore.getState(), latest, next),
      lifeDamageAnimationId: lostLife && paidLife === 0 && !presentation.suppressLifeLossPresentation
        ? Date.now()
        : useGameStore.getState().lifeDamageAnimationId,
      lifePaymentAnimation,
      playerAutoTriggerCount: playerTriggersQueued ? 1 : useGameStore.getState().playerAutoTriggerCount,
      autoPaidLandAnimation,
      ...(buffBeat ?? {}),
      ...(lifeBuffBeat ?? {}),
    };
  };
  if (usesDrainEssenceAnimation) {
    const targetId = String(targets.targetCreature ?? targets.damageTarget ?? "");
    if (!targetId) return {};
    const sourceRect = typeof document === "undefined"
      ? undefined
      : (
          document.querySelector<HTMLElement>(`[data-spell-source-card-id="${handId}"]`) ??
          document.querySelector<HTMLElement>(`[data-hand-card-id="${handId}"]`)
        )?.getBoundingClientRect();
    const animationId = `drain-essence-${card.instanceId}-${Date.now()}`;
    drainEssenceCommit = () =>
      resolveSpell(useGameStore.getState().game, { deferContinuation: true });
    drainEssenceAfterCommit = undefined;
    scheduleDrainEssenceAnimationSafetyClear(animationId);
    return {
      drainEssenceAnimation: {
        id: animationId,
        card,
        targetId,
        origin: sourceRect
          ? { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height }
          : undefined,
        phase: "extracting",
      },
      spellTargeting: undefined,
      spellFightAnimation: undefined,
      pendingSpellHandId: handId,
      selectedHandId: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
    };
  }
  if (usesFinalBanquetAnimation) {
    const targetId = String(targets.targetCreature ?? "");
    const target = game.horde.battlefield.find((candidate) => candidate.instanceId === targetId);
    if (!target) return {};
    const sourceRect = typeof document === "undefined"
      ? undefined
      : (
          document.querySelector<HTMLElement>(`[data-spell-source-card-id="${handId}"]`) ??
          document.querySelector<HTMLElement>(`[data-hand-card-id="${handId}"]`)
        )?.getBoundingClientRect();
    const animationId = `final-banquet-${card.instanceId}-${Date.now()}`;
    finalBanquetCommit = () =>
      resolveSpell(useGameStore.getState().game, { suppressLifeLossPresentation: true });
    scheduleFinalBanquetAnimationSafetyClear(animationId);
    return {
      finalBanquetAnimation: {
        id: animationId,
        card,
        targetId,
        amount: Math.max(0, getPowerToughness(game, target).power),
        origin: sourceRect
          ? { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height }
          : undefined,
        phase: "siphon",
      },
      spellTargeting: undefined,
      spellFightAnimation: undefined,
      pendingSpellHandId: handId,
      selectedHandId: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
    };
  }
  if (!isFightSpell) {
    if (isDestroySpell && destroyTargetIds.length > 0) {
      if (usesBrokenWingsAnimation) {
        const animationId = `broken-wings-${card.instanceId}-${Date.now()}`;
        const gameSessionId = state.gameSessionId;
        window.setTimeout(() => {
          const current = useGameStore.getState();
          if (
            current.gameSessionId !== gameSessionId ||
            current.pendingSpellHandId !== handId ||
            current.brokenWingsAnimation?.id !== animationId
          ) return;
          useAudioStore.getState().playSfx("attack", { volume: 0.72 });
          useGameStore.setState({ specialDeadCardIds: destroyTargetIds });

          window.setTimeout(() => {
            const latest = useGameStore.getState();
            if (
              latest.gameSessionId !== gameSessionId ||
              latest.pendingSpellHandId !== handId ||
              latest.brokenWingsAnimation?.id !== animationId
            ) return;
            useGameStore.setState({
              ...resolveSpell(latest.game),
              brokenWingsAnimation: undefined,
              specialDeadCardIds: [],
              pendingSpellHandId: undefined,
            });
          }, BROKEN_WINGS_DEATH_FADE_MS);
        }, BROKEN_WINGS_IMPACT_MS);
        return {
          spellTargeting: undefined,
          selectedHandId: undefined,
          focusedCardId: undefined,
          pendingSpellHandId: handId,
          brokenWingsAnimation: {
            id: animationId,
            targetId: destroyTargetIds[0],
          },
          specialDeadCardIds: [],
        };
      }
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
    if (isTargetDamageSpell) {
      useAudioStore.getState().playSfx("attack", { volume: 0.76 });
      const resolved = resolveSpell(game);
      const deadCardIds = findMarkedCreatureIds(resolved.game);
      if (deadCardIds.length > 0) {
        window.setTimeout(() => {
          useGameStore.setState(({ game }) => {
            const next = structuredClone(game) as GameState;
            destroyMarkedCreatures(next);
            return { game: next, specialDeadCardIds: [] };
          });
          scheduleQueuedCombatReactions(() => undefined);
        }, 260);
      }
      return {
        ...resolved,
        spellTargeting: undefined,
        selectedHandId: undefined,
        focusedCardId: undefined,
        specialDeadCardIds: deadCardIds,
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
  const staged = resolveSpell(game, { deferFightResolution: true });
  const castSucceeded = staged.game?.lastActionResult?.ok === true;
  if (castSucceeded) {
    window.setTimeout(() => {
      const current = useGameStore.getState();
      if (current.pendingSpellHandId !== handId) return;
      useAudioStore.getState().playSfx("attack", { volume: 0.76 });
      useGameStore.setState({
        spellFightAnimation: { friendlyId, enemyId, enemyMoves: true, eventId: Date.now() },
      });

      window.setTimeout(() => {
        const impactState = useGameStore.getState();
        if (impactState.pendingSpellHandId !== handId) return;
        const next = structuredClone(impactState.game) as GameState;
        const source =
          next.player.graveyard.find((candidate) => candidate.instanceId === handId) ??
          card;
        const fightEffects = card.effects.filter((effect) => hasEffectPresentation([effect], "fight"));
        resolveEffects(next, fightEffects, {
          source,
          side: "player",
          targets,
        });
        const deadCardIds = findMarkedCreatureIds(next);
        useGameStore.setState({
          game: next,
          spellFightAnimation: undefined,
          pendingSpellHandId: undefined,
          specialDeadCardIds: deadCardIds,
        });
        if (deadCardIds.length > 0) {
          window.setTimeout(() => {
            useGameStore.setState(({ game: latest }) => {
              const resolvedDeaths = structuredClone(latest) as GameState;
              destroyMarkedCreatures(resolvedDeaths);
              return { game: resolvedDeaths, specialDeadCardIds: [] };
            });
            scheduleQueuedHordeTriggers();
          }, SPELL_FIGHT_DEATH_FADE_MS);
        }
      }, SPELL_FIGHT_IMPACT_MS);
    }, SPELL_FIGHT_BUFF_LEAD_IN_MS);
  }
  return {
    ...staged,
    spellTargeting: undefined,
    selectedHandId: undefined,
    focusedCardId: undefined,
    pendingSpellHandId: castSucceeded ? handId : undefined,
    spellFightAnimation: undefined,
  };
}

function playBattlefieldEntryVoiceInteraction(
  previousGame: GameState,
  nextGame: GameState,
  cardId: string,
): void {
  if (previousGame.player.battlefield.some((card) => card.instanceId === cardId)) return;
  const enteredCard = nextGame.player.battlefield.find((card) => card.instanceId === cardId);
  if (!enteredCard) return;
  playCardVoiceInteraction({
    type: "ENTERS_BATTLEFIELD",
    card: enteredCard,
    previousGame,
  });
}

function playCardVoiceInteraction(event: CardVoiceEvent): void {
  const cue = resolveCardVoiceCue(event);
  if (cue) playCardVoiceCue(cue);
}

function playCardVoiceCue(cue: CardVoiceCue): void {
  useAudioStore.getState().playSfx(cue.sfx, { volume: cue.volume });
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
