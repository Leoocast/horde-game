import { create } from "zustand";
import { acceptOpeningHand, createInitialGame, mulliganOpeningHand } from "../engine/GameState";
import type { AbilityOptions, CardInstance, CastOptions, DifficultyMode, EffectDefinition, EventItem, GameMode, GameState, Phase } from "../engine/GameTypes";
import { DEFAULT_HOST_DECK_ID, DEFAULT_PLAYER_DECK_ID, getHostDeck, getPlayerDeck } from "../data/decks";
import { AUDIO_FEATURE_FLAGS } from "../config/featureFlags";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { activateAbility as activateEngineAbility, castCard, playLand, recycleEnergy } from "../engine/GameActions";
import { lifeCostAmount } from "../engine/ActionCosts";
import {
  applyHostAttackEvent,
  beginHostCombat,
  buildHostAttackEvents,
  checkWinLoss,
  declareBlocker,
  declareHostAttackers,
  finishHostCombat,
  isHostAttackEventCurrent,
  pendingHostCombatDamageVolley,
  refreshHostAttackEvent,
  resolvePendingHostCombatDamageVolleys,
  resolvePlayerAttackerDrain,
  resolvePlayerAttackerPoison,
  resolvePlayerCombat,
  sortPlayerAttackersLeftToRight,
  togglePlayerAttacker,
  type HostAttackEvent,
} from "../engine/CombatResolver";
import { finishHostTurn, revealHostCardFromTop, runHostMain as runHostMainPhase } from "../engine/HostController";
import { canAttack, hasTrait } from "../engine/Traits";
import { getPowerEndurance, hostInSurge } from "../engine/StaticEffects";
import { EFFECT_ANNOUNCEMENTS, destroyMarkedCreatures, destroyPermanent, discardChosenCard, effectNeedsManualTarget, findManualInvokedTargetTrigger, hasEffectPresentation, manualInvokedTargetRequirement, resolveEffect, resolveEffects, triggerConditionMet } from "../engine/EffectResolver";
import { type StaticAura } from "../engine/StaticAuras";
import { drainEventQueue } from "../engine/EventQueue";
import { targetCandidates, targetRequirementIsBuff } from "../engine/Targeting";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { canPlayerRecycleEnergy, playerHandOverflow } from "../engine/GameRules";
import {
  captureStaticAuraBeats,
  hasInvokedTrigger,
  hostSequenceEpoch,
  resetHostSequence,
  scheduleHostArrivalEffects,
  scheduleQueuedHostTriggers,
  startHostCombatSequence,
} from "./hostBeats";
import { fireballCastSfx, fireballHitSfx, type SfxId } from "../audio/soundManifest";
import { advanceTributeOfTheFourSorrowsSequence, runTributeOfTheFourSorrowsSequence } from "./tributeOfTheFourSorrowsSequence";
import {
  hasQueuedPlayerTriggers,
  resetPlayerTriggerSequence,
  scheduleQueuedPlayerTriggers,
} from "./playerBeats";
import {
  appendHostMillAnimations,
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
import { playerBuffSfxForAnimation } from "./playerAudioPolicy";
import {
  resolvePersonalAttackAnimation,
  resolvePersonalCombatAnimation,
  type PersonalAttackAnimationPlan,
  type PersonalCombatAnimationPlan,
} from "./combatAnimation";

export type GameStore = {
  game: GameState;
  gameSessionId: number;
  hostAttackAnimation?: HostAttackAnimation;
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
  energyFlowAnimation?: EnergyFlowAnimationState;
  deathRevealCard?: CardInstance;
  hostSpellCard?: CardInstance;
  /** Host static auras whose announcement beat has not played yet. */
  pendingStaticAuras: StaticAura[];
  /** Stat bonus withheld from each card until its aura's beat plays. Presentation only. */
  heldStaticAuraBonuses: Record<string, { power: number; endurance: number }>;
  playerAttackAnimation?: PlayerAttackAnimation;
  resolvingHostCombat: boolean;
  summoningAnimationCount: number;
  pendingTriggeredEffectCount: number;
  pendingTriggeredEffectSourceId?: string;
  hostAutoTriggerCount: number;
  playerAutoTriggerCount: number;
  surgeTransitionActive: boolean;
  surgeTransitionShown: boolean;
  hostCombatVisualDamage?: Record<string, number>;
  hostCombatDeadCardIds: string[];
  specialDeadCardIds: string[];
  hostMillAnimationQueue: HostMillAnimationItem[];
  hostMillPreviewCards: CardInstance[];
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
  tributeOfTheFourSorrowsCard?: CardInstance;
  tributeOfTheFourSorrowsSelection?: TributeOfTheFourSorrowsSelectionState;
  spellTargeting?: SpellTargetingState;
  spellFightAnimation?: SpellFightAnimationState;
  rootsTouchedSkyAnimation?: RootsTouchedSkyAnimationState;
  pendingSpellHandId?: string;
  buffAnimationCardIds: string[];
  buffAnimationEventId?: number;
  buffAnimationVariant: BuffAnimationVariant;
  lifeBuffAnimationId?: number;
  selectedHandId?: string;
  selectedPlayerCreatureId?: string;
  selectedHostCreatureId?: string;
  activeEffectCardId?: string;
  closingEffectCardId?: string;
  activatingEffectCardId?: string;
  hoveredCardId?: string;
  focusedCardId?: string;
  seed: string;
  playerDeckId: string;
  hostDeckId: string;
  reset: (seed?: string, setupTurns?: number, playerDeckId?: string, hostDeckId?: string, difficulty?: DifficultyMode, gameMode?: GameMode) => void;
  /** Plants an already-built GameState (Playground scenarios). Same store cleanup as `reset`. */
  loadScenario: (game: GameState, deckIds: { playerDeckId: string; hostDeckId: string }) => void;
  setSeed: (seed: string) => void;
  acceptOpeningHand: () => void;
  mulliganOpeningHand: () => void;
  selectHand: (id?: string) => void;
  selectPlayerCreature: (id?: string) => void;
  selectHostCreature: (id?: string) => void;
  selectActiveEffectCard: (id?: string) => void;
  triggerEffectActivationPulse: (id: string) => void;
  updateCounterTargetPointer: (x: number, y: number) => void;
  lockCounterTarget: (targetId: string) => void;
  deselectCounterTarget: () => void;
  cancelCounterTargeting: () => void;
  confirmCounterTargeting: () => void;
  updateTributeOfTheFourSorrowsSelectionPointer: (x: number, y: number) => void;
  lockTributeOfTheFourSorrowsSelectionTarget: (targetId: string) => void;
  deselectTributeOfTheFourSorrowsSelectionTarget: () => void;
  confirmTributeOfTheFourSorrowsSelection: () => void;
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
  endPlayerTurn: (options?: { runHostAfter?: boolean }) => void;
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
  resolveEnergyFlowAnimation: (id: string) => void;
  completeEnergyFlowAnimation: (id: string) => void;
  activateAbility: (id: string, abilityId: string, options?: AbilityOptions) => void;
  toggleAttacker: (id: string) => void;
  attackAll: () => void;
  cancelPlayerAttackers: () => void;
  beginSummoningAnimation: () => void;
  endSummoningAnimation: () => void;
  resolvePlayerCombat: () => void;
  finishPlayerCombat: () => void;
  runHostMain: () => void;
  /** Playground only: one Host card enters from the top of its Archive, with its beats, without
   *  running a Host turn. */
  resolveHostCardFromTop: () => void;
  completeSurgeTransition: () => void;
  prepareHostAttackers: () => void;
  declareBlocker: (blockerId: string, attackerId: string) => void;
  cancelBlocks: () => void;
  startBlockDrag: (blockerId: string, x: number, y: number) => void;
  updateBlockDrag: (x: number, y: number) => void;
  cancelBlockDrag: () => void;
  startPlayerAttackDrag: (attackerId: string, x: number, y: number) => void;
  updatePlayerAttackDrag: (x: number, y: number) => void;
  cancelPlayerAttackDrag: () => void;
  queueHostMillPreview: (card: CardInstance) => void;
  openCardContextMenu: (cardId: string, x: number, y: number) => void;
  closeCardContextMenu: () => void;
  completePlayerDiscardAnimation: (id: string) => void;
  materializeLandPlayAnimation: (id: string) => void;
  completeLandPlayAnimation: (id: string) => void;
  resolveHostCombat: () => void;
  finishHostTurn: () => void;
  completeHostMillAnimation: (id: string) => void;
  triggerEndGame: (winner: "player" | "host") => void;
  stopGamePresentation: () => void;
};

const SEED_STORAGE_KEY = "hostfall-seed:v2";
const defaultSeed = readStoredSeed();
const HOST_ATTACK_ANIMATION_MS = 500;
const COMBAT_VOLLEY_LEAD_IN_MS = 360;
const COMBAT_VOLLEY_PROJECTILE_LAUNCH_MS = 220;
const COMBAT_VOLLEY_IMPACT_MS = 638;
const COMBAT_VOLLEY_ANIMATION_MS = 1220;
const COMBAT_VOLLEY_PROJECTILE_GAP_MS = 90;
const COMBAT_VOLLEY_MAX_PROJECTILES = 6;
const PLAYER_ATTACK_ANIMATION_MS = 500;
const HOST_MILL_ANIMATION_MS = 720;
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
const ENERGY_FLOW_ANIMATION_SAFETY_CLEAR_MS = 1500;
const SPELL_FIGHT_BUFF_LEAD_IN_MS = 1040;
const SPELL_FIGHT_IMPACT_MS = 520;
const SPELL_FIGHT_DEATH_FADE_MS = 260;
const ROOTS_TOUCHED_SKY_IMPACT_MS = 420;
const ROOTS_TOUCHED_SKY_DEATH_FADE_MS = 260;
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
let poisonConsumeRunHostAfterMill = false;
let drainEssenceAnimationSafetyTimer: number | undefined;
let drainEssenceCommit: (() => Partial<GameStore>) | undefined;
let drainEssenceAfterCommit: (() => void) | undefined;
let finalBanquetAnimationSafetyTimer: number | undefined;
let finalBanquetCommit: (() => Partial<GameStore>) | undefined;
let energyFlowAnimationSafetyTimer: number | undefined;
let energyFlowCommit: (() => Partial<GameStore>) | undefined;
let energyFlowAfterCommit: (() => void) | undefined;
let hostCombatSequenceId = 0;

type HostAttackAnimation = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  attackerDamageMarked?: number;
  blockerDamageMarked?: number;
  eventId: number;
  customAnimation?: PersonalCombatAnimationPlan;
};

type PlayerAttackAnimation = {
  attackerId: string;
  eventId: number;
  customAnimation?: PersonalAttackAnimationPlan;
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
  runHostAfter: boolean;
};

type AutoPaidLandAnimation = {
  ids: string[];
  eventId: number;
};

export type HostMillAnimationItem = {
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
  variant: "bite" | "smoke";
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

export type EnergyFlowAnimationState = {
  id: string;
  sourceId: string;
  amount: number;
  phase: "travel" | "impact";
};

export type BurnAnimationState = {
  id: string;
  sourceId?: string;
  targetId?: string;
  targetKind?: "card" | "playerLife" | "hostLife";
  targets?: BurnAnimationTarget[];
  amount: number;
  projectileCount?: number;
  variant?: "fire" | "oil" | "emerald";
  scale?: number;
  sourceMoves?: boolean;
};

export type BurnAnimationTarget = {
  targetId?: string;
  targetKind: "card" | "playerLife" | "hostLife";
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

export type TributeOfTheFourSorrowsSelectionState = {
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

export type RootsTouchedSkyAnimationState = {
  id: string;
  targetId: string;
};

/** Every piece of presentation state that must NOT survive into a new game. It lives outside
 *  `GameState` (animation queues, targeting, selections), so anything that swaps the game in has to
 *  clear it here — otherwise callbacks and beats from the previous match land on the new board. */
function createCleanUiState(): Partial<GameStore> {
  return {
    selectedHandId: undefined,
    selectedPlayerCreatureId: undefined,
    selectedHostCreatureId: undefined,
    activeEffectCardId: undefined,
    closingEffectCardId: undefined,
    activatingEffectCardId: undefined,
    hoveredCardId: undefined,
    focusedCardId: undefined,
    hostAttackAnimation: undefined,
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
    energyFlowAnimation: undefined,
    deathRevealCard: undefined,
    hostSpellCard: undefined,
    pendingStaticAuras: [],
    heldStaticAuraBonuses: {},
    playerAttackAnimation: undefined,
    resolvingHostCombat: false,
    summoningAnimationCount: 0,
    pendingTriggeredEffectCount: 0,
    pendingTriggeredEffectSourceId: undefined,
    hostAutoTriggerCount: 0,
    playerAutoTriggerCount: 0,
    surgeTransitionActive: false,
    surgeTransitionShown: false,
    hostCombatVisualDamage: undefined,
    hostCombatDeadCardIds: [],
    specialDeadCardIds: [],
    hostMillAnimationQueue: [],
    hostMillPreviewCards: [],
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
    tributeOfTheFourSorrowsCard: undefined,
    tributeOfTheFourSorrowsSelection: undefined,
    spellTargeting: undefined,
    spellFightAnimation: undefined,
    rootsTouchedSkyAnimation: undefined,
    pendingSpellHandId: undefined,
    buffAnimationCardIds: [],
    buffAnimationEventId: undefined,
    buffAnimationVariant: "default",
    lifeBuffAnimationId: undefined,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(getPlayerDeck(DEFAULT_PLAYER_DECK_ID), getHostDeck(DEFAULT_HOST_DECK_ID), defaultSeed, 3),
  gameSessionId: 0,
  hostAttackAnimation: undefined,
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
  energyFlowAnimation: undefined,
  deathRevealCard: undefined,
  hostSpellCard: undefined,
  pendingStaticAuras: [],
  heldStaticAuraBonuses: {},
  playerAttackAnimation: undefined,
  resolvingHostCombat: false,
  summoningAnimationCount: 0,
  pendingTriggeredEffectCount: 0,
  pendingTriggeredEffectSourceId: undefined,
  hostAutoTriggerCount: 0,
  playerAutoTriggerCount: 0,
  surgeTransitionActive: false,
  surgeTransitionShown: false,
  hostCombatVisualDamage: undefined,
  hostCombatDeadCardIds: [],
  specialDeadCardIds: [],
  hostMillAnimationQueue: [],
  hostMillPreviewCards: [],
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
  tributeOfTheFourSorrowsCard: undefined,
  tributeOfTheFourSorrowsSelection: undefined,
  spellTargeting: undefined,
  spellFightAnimation: undefined,
  rootsTouchedSkyAnimation: undefined,
  pendingSpellHandId: undefined,
  buffAnimationCardIds: [],
  buffAnimationEventId: undefined,
  buffAnimationVariant: "default",
  lifeBuffAnimationId: undefined,
  seed: defaultSeed,
  playerDeckId: DEFAULT_PLAYER_DECK_ID,
  hostDeckId: DEFAULT_HOST_DECK_ID,
  reset: (seed = get().seed, setupTurns = 3, playerDeckId = get().playerDeckId, hostDeckId = get().hostDeckId, difficulty = get().game.difficulty, gameMode = get().game.gameMode) => {
    cancelScheduledPresentation();
    set((state) => {
      persistSeed(seed);
      useAudioStore.getState().setMusicVariant("battle");
      const next = createInitialGame(getPlayerDeck(playerDeckId), getHostDeck(hostDeckId), seed, setupTurns, difficulty, gameMode);
      return {
        ...createCleanUiState(),
        game: next,
        gameSessionId: state.gameSessionId + 1,
        seed,
        playerDeckId,
        hostDeckId,
      };
    });
  },
  loadScenario: (game, deckIds) => {
    cancelScheduledPresentation();
    set((state) => {
      useAudioStore.getState().setMusicVariant("battle");
      return {
        ...createCleanUiState(),
        game,
        gameSessionId: state.gameSessionId + 1,
        seed: game.seed,
        playerDeckId: deckIds.playerDeckId,
        hostDeckId: deckIds.hostDeckId,
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
  selectHand: (id) => set({ selectedHandId: id }),
  selectPlayerCreature: (id) => set({ selectedPlayerCreatureId: id }),
  selectHostCreature: (id) => set({ selectedHostCreatureId: id }),
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
      useAudioStore.getState().playSfx("playLand");
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
      const requirement = manualInvokedTargetRequirement(source);
      const targetIsValid = Boolean(
        source &&
        target &&
        requirement &&
        targetCandidates(next, source.controller, requirement)
          .some((candidate) => candidate.instanceId === target.instanceId)
      );
      if (!source || !target || !targetIsValid) {
        return {
          counterTargeting: undefined,
          pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1),
          pendingTriggeredEffectSourceId: undefined,
        };
      }
      const previousLife = next.player.life;
      const manualTrigger = findManualInvokedTargetTrigger(source);
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
      const buffVariant = buffAnimationVariantForCard(source.definitionId);
      useAudioStore.getState().playSfx(playerBuffSfxForAnimation(buffVariant));
      const lifeBeat = startLifeBuffBeat();
      return {
        game: next,
        counterTargeting: undefined,
        pendingTriggeredEffectCount: Math.max(0, get().pendingTriggeredEffectCount - 1),
        pendingTriggeredEffectSourceId: undefined,
        ...startBuffBeat(
          [target.instanceId],
          buffVariant,
        ),
        lifeBuffAnimationId: next.player.life > previousLife ? lifeBeat.lifeBuffAnimationId : get().lifeBuffAnimationId,
      };
    }),
  updateTributeOfTheFourSorrowsSelectionPointer: (x, y) =>
    set(({ tributeOfTheFourSorrowsSelection }) => ({
      tributeOfTheFourSorrowsSelection: tributeOfTheFourSorrowsSelection && !tributeOfTheFourSorrowsSelection.targetId ? { ...tributeOfTheFourSorrowsSelection, x, y } : tributeOfTheFourSorrowsSelection,
    })),
  lockTributeOfTheFourSorrowsSelectionTarget: (targetId) =>
    set(({ tributeOfTheFourSorrowsSelection }) => {
      if (!tributeOfTheFourSorrowsSelection) return {};
      useAudioStore.getState().playSfx("playLand");
      return { tributeOfTheFourSorrowsSelection: { ...tributeOfTheFourSorrowsSelection, targetId } };
    }),
  deselectTributeOfTheFourSorrowsSelectionTarget: () =>
    set(({ tributeOfTheFourSorrowsSelection }) => ({
      tributeOfTheFourSorrowsSelection: tributeOfTheFourSorrowsSelection ? { ...tributeOfTheFourSorrowsSelection, targetId: undefined } : undefined,
    })),
  confirmTributeOfTheFourSorrowsSelection: () => {
    const { game, tributeOfTheFourSorrowsSelection } = get();
    if (!tributeOfTheFourSorrowsSelection?.targetId) return;
    const { kind, targetId } = tributeOfTheFourSorrowsSelection;
    if (kind === "discard") {
      const next = structuredClone(game) as GameState;
      discardChosenCard(next, targetId);
      notifyDiscardEffects(game, next);
      set({ game: next, tributeOfTheFourSorrowsSelection: undefined });
      resumeAfterDiscardPause(() => advanceTributeOfTheFourSorrowsSequence("after-discard"));
      return;
    }
    set({ tributeOfTheFourSorrowsSelection: undefined, specialDeadCardIds: [targetId] });
    useAudioStore.getState().playSfx("attack");
    window.setTimeout(() => {
      set((state) => {
        const resolved = structuredClone(state.game) as GameState;
        const target = resolved.player.field.find((card) => card.instanceId === targetId);
        if (target) destroyPermanent(resolved, target);
        return { game: resolved, specialDeadCardIds: [] };
      });
      window.setTimeout(() => advanceTributeOfTheFourSorrowsSequence(kind === "sacrifice-creature" ? "after-sacrifice-creature" : "after-sacrifice-land"), 320);
    }, 260);
  },
  selectHandLimitDiscard: (id) => {
    if (id) useAudioStore.getState().playSfx("playLand");
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
      useAudioStore.getState().playSfx("playLand");
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
      if (discardPauseInProgress(state) || state.energyRecycleAnimation || state.lifePaymentAnimation || state.bloodPactAnimation || state.drainEssenceAnimation || state.energyFlowAnimation || state.pendingSpellHandId || state.spellFightAnimation || state.playerAutoTriggerCount > 0) return {};
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
      if (discardPauseInProgress(state) || state.energyRecycleAnimation || state.lifePaymentAnimation || state.bloodPactAnimation || state.drainEssenceAnimation || state.energyFlowAnimation || state.pendingSpellHandId || state.spellFightAnimation || state.poisonConsumeAnimation || state.playerAutoTriggerCount > 0) return {};
      const { game } = state;
      const overflow = playerHandOverflow(game);
      if (overflow > 0) {
        return { handLimitDiscardActive: true, handLimitSelectionId: undefined };
      }
      const poisonPerArchiveDiscard = game.hostRules.poisonPerArchiveDiscard;
      const poisonMills = Math.floor(game.host.poisonCounters / poisonPerArchiveDiscard);
      if (poisonMills > 0) {
        const animation: PoisonConsumeAnimationState = {
          id: `poison-consume-${Date.now()}`,
          amount: poisonMills * poisonPerArchiveDiscard,
          millCount: poisonMills,
          runHostAfter: options?.runHostAfter === true,
        };
        schedulePoisonConsumeAnimationSafetyClear(animation.id);
        useAudioStore.getState().playSfx("activateEffect");
        return {
          poisonConsumeAnimation: animation,
          handLimitDiscardActive: false,
          handLimitSelectionId: undefined,
        };
      }
      const next = endPlayerTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, handLimitDiscardActive: false, handLimitSelectionId: undefined, hostMillAnimationQueue: appendHostMillAnimations(state, game, next) };
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
      if (!card?.kinds.includes("SOURCE")) return {};
      if (!canPlayerRecycleEnergy(state.game)) {
        showActionToast(
          state.game.setupTurnsRemaining > 0
            ? "Energy cannot be recycled during setup."
            : "You already used your Energy action this turn.",
        );
        return {};
      }
      useAudioStore.getState().playSfx("playLand");
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
      if (succeeded) useAudioStore.getState().playSfx("drawOne");
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
      const hostMillAnimationQueue = appendHostMillAnimations(state, previous, next);
      millAnimationQueued = hostMillAnimationQueue.length > 0;
      return {
        game: next,
        poisonConsumeAnimation: undefined,
        handLimitDiscardActive: false,
        handLimitSelectionId: undefined,
        hostMillAnimationQueue,
      };
    });
    if (active.runHostAfter && millAnimationQueued) {
      poisonConsumeRunHostAfterMill = true;
    } else if (active.runHostAfter && typeof window !== "undefined") {
      window.setTimeout(() => {
        const latest = useGameStore.getState();
        if (latest.game.activeSide === "host" && latest.game.phase === "host") {
          latest.runHostMain();
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
  resolveEnergyFlowAnimation: (id) => {
    const active = get().energyFlowAnimation;
    if (active?.id !== id || active.phase === "impact") return;
    const commit = energyFlowCommit;
    const afterCommit = energyFlowAfterCommit;
    energyFlowCommit = undefined;
    energyFlowAfterCommit = undefined;
    set({
      ...(commit?.() ?? {}),
      energyFlowAnimation: {
        ...active,
        phase: "impact",
      },
    });
    afterCommit?.();
  },
  completeEnergyFlowAnimation: (id) => {
    const active = get().energyFlowAnimation;
    if (active?.id !== id) return;
    if (active.phase === "travel") get().resolveEnergyFlowAnimation(id);
    if (energyFlowAnimationSafetyTimer && typeof window !== "undefined") {
      window.clearTimeout(energyFlowAnimationSafetyTimer);
      energyFlowAnimationSafetyTimer = undefined;
    }
    set({ energyFlowAnimation: undefined });
  },
  activateAbility: (id, abilityId, options) => {
    let shouldSchedulePlayerTriggers = false;
    let startedLifePaymentAnimationId: string | undefined;
    let startedEnergyFlowAnimationId: string | undefined;
    set((state) => {
      if (combatResolutionInProgress(state)) return {};
      const source = state.game.player.field.find((card) => card.instanceId === id);
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
      const storedEnergyGained = next.lastActionResult?.ok === true
        ? Math.max(0, next.player.energyPool.stored - state.game.player.energyPool.stored)
        : 0;
      const usesEnergyFlowAnimation = Boolean(
        storedEnergyGained > 0 &&
        source &&
        (
          source.definitionId === "veiled_dawn_flower" ||
          source.definitionId === "liora_keeper_of_the_grove" ||
          source.definitionId === "midnight_collector"
        ),
      );
      if (usesEnergyFlowAnimation) {
        const animationId = `energy-flow-${source!.instanceId}-${Date.now()}`;
        const staged = structuredClone(next) as GameState;
        staged.player.energyPool = { ...state.game.player.energyPool };
        startedEnergyFlowAnimationId = animationId;
        energyFlowCommit = () => {
          const committed = structuredClone(useGameStore.getState().game) as GameState;
          committed.player.energyPool.stored += storedEnergyGained;
          return {
            game: committed,
            playerAutoTriggerCount: shouldSchedulePlayerTriggers ? 1 : 0,
          };
        };
        energyFlowAfterCommit = shouldSchedulePlayerTriggers && paidLife === 0
          ? () => scheduleQueuedPlayerTriggers()
          : undefined;
        return {
          game: staged,
          activeEffectCardId: undefined,
          lifePaymentAnimation: paidLife > 0
            ? { id: startedLifePaymentAnimationId!, amount: paidLife }
            : undefined,
          energyFlowAnimation: {
            id: animationId,
            sourceId: source!.instanceId,
            amount: storedEnergyGained,
            phase: "travel",
          },
          playerAutoTriggerCount: 0,
        };
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
    if (startedEnergyFlowAnimationId) {
      scheduleEnergyFlowAnimationSafetyClear(startedEnergyFlowAnimationId);
    }
    if (startedLifePaymentAnimationId) {
      scheduleLifePaymentAnimationSafetyClear(startedLifePaymentAnimationId);
    } else if (!startedEnergyFlowAnimationId && shouldSchedulePlayerTriggers) {
      scheduleQueuedPlayerTriggers();
    }
  },
  toggleAttacker: (id) =>
    set(({ game }) => {
      const wasAttacking = game.combat.playerAttackers.includes(id);
      const next = togglePlayerAttacker(game, id);
      const isAttacking = next.combat.playerAttackers.includes(id);
      if (!wasAttacking && isAttacking) {
        useAudioStore.getState().playSfx(AUDIO_FEATURE_FLAGS.selectAttacker ? "selectAttacker" : "playLand");
      } else if (wasAttacking && !isAttacking) {
        useAudioStore.getState().playSfx("playLand");
      }
      return { game: next };
    }),
  attackAll: () =>
    set(({ game }) => {
      if (game.activeSide !== "player" || game.phase !== "combat") return {};
      const next = structuredClone(game) as GameState;
      const selected = new Set(next.combat.playerAttackers);
      for (const card of next.player.field) {
        if (!card.kinds.includes("ECHO") || selected.has(card.instanceId)) continue;
        if (!canAttack(next, card)) continue;
        selected.add(card.instanceId);
        if (!hasTrait(next, card, "ALERT")) card.exhausted = true;
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
      for (const card of next.player.field) {
        if (attackers.has(card.instanceId) && !hasTrait(next, card, "ALERT")) card.exhausted = false;
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
    if (gainedLife) useAudioStore.getState().playSfx("buff");
    return {
      game: next,
      hostMillAnimationQueue: appendHostMillAnimations(state, state.game, next),
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
      set((state) => ({ game: next, selectedPlayerCreatureId: undefined, hostMillAnimationQueue: appendHostMillAnimations(state, game, next) }));
      return;
    }

    const previewMillCards = previewPlayerCombatMillCards(game, attackers);
    const personalAttackAnimations = new Map<string, PersonalAttackAnimationPlan>(
      attackers.flatMap((attackerId) => {
        const attacker = game.player.field.find((candidate) => candidate.instanceId === attackerId);
        if (!attacker) return [];
        const animation = resolvePersonalAttackAnimation(
          attacker,
          getPowerEndurance(game, attacker).power,
        );
        return animation ? [[attackerId, animation] as const] : [];
      }),
    );
    const attackVoiceCues = new Map(
      resolveCardVoiceCueBatch(
        attackers.flatMap((attackerId) => {
          const card = game.player.field.find((candidate) => candidate.instanceId === attackerId);
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
      const customAnimation = personalAttackAnimations.get(attackerId);
      const impactOffset = customAnimation?.impactMs ?? PLAYER_ATTACK_MILL_START_MS;
      const animationDuration = customAnimation?.durationMs ?? PLAYER_ATTACK_ANIMATION_MS;
      const burnAnimationId = customAnimation
        ? `personal-player-attack-${attackerId}-${index}`
        : undefined;
      const startAt = elapsed;
      window.setTimeout(() => {
        if (!customAnimation) useAudioStore.getState().playSfx("attack");
        const voiceCue = attackVoiceCues.get(attackerId);
        if (voiceCue) playCardVoiceCue(voiceCue);
        set({
          playerAttackAnimation: { attackerId, eventId: index, customAnimation },
          burnAnimation: customAnimation?.effect.type === "fireball"
            ? {
                id: burnAnimationId!,
                sourceId: customAnimation.sourceId,
                targetKind: customAnimation.targetKind,
                amount: customAnimation.effect.amount,
                variant: customAnimation.effect.variant,
                scale: customAnimation.effect.scale,
                sourceMoves: customAnimation.effect.sourceMoves,
              }
            : undefined,
        });
      }, startAt);
      if (customAnimation?.effect.type === "fireball") {
        window.setTimeout(() => {
          const active = useGameStore.getState().playerAttackAnimation;
          if (active?.attackerId !== attackerId || active.eventId !== index) return;
          useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
        }, startAt + customAnimation.castMs);
      }
      window.setTimeout(() => {
        const active = useGameStore.getState().playerAttackAnimation;
        if (
          customAnimation?.effect.type === "fireball" &&
          active?.attackerId === attackerId &&
          active.eventId === index
        ) {
          useAudioStore.getState().playSfx(fireballHitSfx);
        }
        useGameStore.setState((state) => {
          const afterLifesteal = resolvePlayerAttackerDrain(state.game, attackerId);
          const lifeGain = afterLifesteal.player.life - state.game.player.life;
          const next = resolvePlayerAttackerPoison(afterLifesteal, attackerId);
          const poisonGain = next.host.poisonCounters - state.game.host.poisonCounters;
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
            useAudioStore.getState().playSfx("buff");
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
      }, startAt + impactOffset);
      for (const preview of attackerMillCards) {
        window.setTimeout(() => {
          useGameStore.getState().queueHostMillPreview(preview.card);
        }, startAt + impactOffset + preview.cardIndexInHit * (HOST_MILL_ANIMATION_MS + PLAYER_ATTACK_MILL_GAP_MS));
      }
      if (burnAnimationId && customAnimation) {
        window.setTimeout(() => {
          useGameStore.setState((state) =>
            state.burnAnimation?.id === burnAnimationId
              ? { burnAnimation: undefined }
              : {},
          );
        }, startAt + customAnimation.durationMs);
      }
      const millDuration = attackerMillCards.length > 0
        ? impactOffset + (attackerMillCards.length - 1) * (HOST_MILL_ANIMATION_MS + PLAYER_ATTACK_MILL_GAP_MS) + PLAYER_ATTACK_NEXT_AFTER_MILL_MS
        : 0;
      elapsed += Math.max(animationDuration, millDuration);
    });

    window.setTimeout(() => {
      const latest = get().game;
      const resolved = resolvePlayerCombat(latest, { skipDrain: true, skipPoison: true });
      const next = advancePhase(resolved, "end");
      set((state) => ({
        game: next,
        handLimitDiscardActive: false,
        handLimitSelectionId: undefined,
        playerAttackAnimation: undefined,
        burnAnimation: undefined,
        selectedPlayerCreatureId: undefined,
        hostMillPreviewCards: [],
        hostMillAnimationQueue: previewMillCards.length > 0 ? state.hostMillAnimationQueue : appendHostMillAnimations(state, latest, next),
      }));
    }, elapsed + 40);
  },
  runHostMain: () => {
    const state = get();
    if (discardPauseInProgress(state) || state.surgeTransitionActive) return;
    const { game } = state;
    if (!state.surgeTransitionShown) {
      const preview = runHostMainPhase(game, { deferInvokedTriggers: true });
      if (hostInSurge(preview)) {
        set({
          surgeTransitionActive: true,
          surgeTransitionShown: true,
          selectedHostCreatureId: undefined,
          selectedPlayerCreatureId: undefined,
          hoveredCardId: undefined,
          focusedCardId: undefined,
        });
        return;
      }
    }
    const previousHostBattlefieldIds = new Set(game.host.field.map((card) => card.instanceId));
    const main = runHostMainPhase(game, { deferInvokedTriggers: true });
    const enteredCards = main.host.field.filter((card) => !previousHostBattlefieldIds.has(card.instanceId));
    const triggerCards = enteredCards.filter(hasInvokedTrigger);
    if (main.host.pendingCard) {
      const pendingCard = main.host.pendingCard;
      set({
        game: main,
        selectedHostCreatureId: undefined,
        selectedPlayerCreatureId: undefined,
        hostAutoTriggerCount: triggerCards.length,
        summoningAnimationCount: state.summoningAnimationCount + enteredCards.length,
        hostMillAnimationQueue: appendHostMillAnimations(state, game, main),
      });
      captureStaticAuraBeats();
      scheduleHostArrivalEffects(enteredCards, () => runTributeOfTheFourSorrowsSequence(pendingCard));
      return;
    }
    if (main.host.field.length > game.host.field.length) useAudioStore.getState().playSfx("draw");
    set({
      game: main,
      selectedHostCreatureId: undefined,
      selectedPlayerCreatureId: undefined,
      hostAutoTriggerCount: triggerCards.length,
      summoningAnimationCount: state.summoningAnimationCount + enteredCards.length,
      hostMillAnimationQueue: appendHostMillAnimations(state, game, main),
    });
    // Before any frame renders the new creatures: hold back the buffs they just gained so the
    // announcement beat still has something to reveal.
    captureStaticAuraBeats();
    scheduleHostArrivalEffects(enteredCards, () => startHostCombatSequence());
  },
  /**
   * Playground only. Same beats as `runHostMain` — enter triggers, static aura capture, mill
   * animations, the Tribute of the Four Sorrows hand-off — but for exactly one card and without starting combat.
   * Playing a single Goblin token in the lab used to run a whole Zombie Host turn, which is not
   * what "play this card" means anywhere.
   */
  resolveHostCardFromTop: () => {
    const state = get();
    const { game } = state;
    const previousIds = new Set(game.host.field.map((card) => card.instanceId));
    const next = revealHostCardFromTop(game, { deferInvokedTriggers: true });
    if (next.lastActionResult?.ok === false) {
      set({ game: next });
      return;
    }
    const entered = next.host.field.filter((card) => !previousIds.has(card.instanceId));
    const triggerCards = entered.filter(hasInvokedTrigger);
    const pendingCard = next.host.pendingCard;

    if (entered.length > 0) useAudioStore.getState().playSfx("draw");
    set({
      game: next,
      selectedHostCreatureId: undefined,
      selectedPlayerCreatureId: undefined,
      hostAutoTriggerCount: triggerCards.length,
      summoningAnimationCount: state.summoningAnimationCount + entered.length,
      hostMillAnimationQueue: appendHostMillAnimations(state, game, next),
    });
    // Before any frame renders the new permanent: hold back the buffs it just granted so the
    // announcement beat still has something to reveal.
    captureStaticAuraBeats();
    if (pendingCard) {
      scheduleHostArrivalEffects(entered, () => runTributeOfTheFourSorrowsSequence(pendingCard));
      return;
    }
    scheduleHostArrivalEffects(entered, () => scheduleQueuedHostTriggers());
  },
  completeSurgeTransition: () => {
    if (!get().surgeTransitionActive) return;
    set({ surgeTransitionActive: false });
    get().runHostMain();
  },
  prepareHostAttackers: () => {
    if (discardPauseInProgress(get())) return;
    startHostCombatSequence();
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
      return { game: next, selectedHostCreatureId: undefined, selectedPlayerCreatureId: undefined, blockDrag: undefined };
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
  queueHostMillPreview: (card) =>
    set((state) => ({
      hostMillAnimationQueue: [
        ...state.hostMillAnimationQueue,
        {
          id: `host-mill-preview-${card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          card,
          preview: true,
        },
      ],
      hostMillPreviewCards: state.hostMillPreviewCards.some((item) => item.instanceId === card.instanceId)
        ? state.hostMillPreviewCards
        : [...state.hostMillPreviewCards, card],
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
  completeHostMillAnimation: (id) => {
    let shouldRunHost = false;
    set((state) => {
      const hostMillAnimationQueue = state.hostMillAnimationQueue.filter((item) => item.id !== id);
      if (hostMillAnimationQueue.length === 0 && poisonConsumeRunHostAfterMill) {
        poisonConsumeRunHostAfterMill = false;
        shouldRunHost = true;
      }
      return { hostMillAnimationQueue };
    });
    if (shouldRunHost && typeof window !== "undefined") {
      window.setTimeout(() => {
        const latest = useGameStore.getState();
        if (latest.game.activeSide === "host" && latest.game.phase === "host") {
          latest.runHostMain();
        }
      }, 0);
    }
  },
  resolveHostCombat: () => {
    const state = get();
    if (discardPauseInProgress(state)) return;
    const { game, hostAttackAnimation, playerAttackAnimation, burnAnimation } = state;
    if (hostAttackAnimation || playerAttackAnimation || burnAnimation) return;

    const attackEvents = buildHostAttackEvents(game);
    const sequenceId = ++hostCombatSequenceId;
    if (attackEvents.length === 0) {
      runPendingHostCombatVolleyOrFinish(sequenceId);
      return;
    }
    set({ resolvingHostCombat: true, selectedHostCreatureId: undefined, selectedPlayerCreatureId: undefined });
    runHostCombatEventSequence(attackEvents, 0, sequenceId);
  },
  finishHostTurn: () =>
    set((state) => {
      if (discardPauseInProgress(state)) return {};
      const { game } = state;
      const next = finishHostTurn(game);
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, hostAutoTriggerCount: 0 };
    }),
  triggerEndGame: (winner) => {
    set((state) => {
      const next = structuredClone(state.game) as GameState;
      next.winner = winner;
      return { ...createCleanUiState(), game: next };
    });
    get().stopGamePresentation();
  },
  stopGamePresentation: () => {
    cancelScheduledPresentation();
    useAudioStore.getState().stopAllSfx();
    set(createCleanUiState());
  },
}));

function runHostCombatEventSequence(events: HostAttackEvent[], index: number, sequenceId: number): void {
  if (sequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
  const plannedEvent = events[index];
  if (!plannedEvent) {
    runPendingHostCombatVolleyOrFinish(sequenceId);
    return;
  }
  const currentGame = useGameStore.getState().game;
  if (!isHostAttackEventCurrent(currentGame, plannedEvent)) {
    runHostCombatEventSequence(events, index + 1, sequenceId);
    return;
  }
  const event = refreshHostAttackEvent(currentGame, plannedEvent);
  if (!event) {
    runHostCombatEventSequence(events, index + 1, sequenceId);
    return;
  }
  useAudioStore.getState().playSfx("attack");
  const attacker = currentGame.host.field.find((card) => card.instanceId === event.attackerId);
  const blocker = event.blockerId
    ? currentGame.player.field.find((card) => card.instanceId === event.blockerId)
    : undefined;
  const customAnimation = attacker && blocker
    ? resolvePersonalCombatAnimation({
        attacker,
        defender: blocker,
        attackerDies: event.attackerDies,
        defenderDies: event.blockerDies,
        damageToAttacker: event.attackerDamageMarked === undefined
          ? 0
          : event.attackerDamageMarked - attacker.damageMarked,
        damageToDefender: event.blockerDamageMarked === undefined
          ? 0
          : event.blockerDamageMarked - blocker.damageMarked,
      })
    : undefined;
  const impactMs = customAnimation?.impactMs ?? HOST_ATTACK_ANIMATION_MS - 35;
  const durationMs = customAnimation?.durationMs ?? HOST_ATTACK_ANIMATION_MS;
  if (blocker) playCardVoiceInteraction({ type: "BLOCKS", card: blocker });
  if (event.blockerDies) useAudioStore.getState().playSfx("defend");
  useGameStore.setState({
    hostCombatVisualDamage: customAnimation
      ? useGameStore.getState().hostCombatVisualDamage
      : nextVisualDamage(event),
    hostAttackAnimation: {
      attackerId: event.attackerId,
      attackerDies: event.attackerDies,
      blockerId: event.blockerId,
      blockerDies: event.blockerDies,
      playerDamage: event.playerDamage,
      attackerDamageMarked: event.attackerDamageMarked,
      blockerDamageMarked: event.blockerDamageMarked,
      eventId: index,
      customAnimation,
    },
    burnAnimation: customAnimation?.effect.type === "fireball"
      ? {
          id: `personal-combat-${sequenceId}-${index}`,
          sourceId: customAnimation.sourceId,
          targetId: customAnimation.targetId,
          targetKind: "card",
          amount: customAnimation.effect.amount,
          variant: customAnimation.effect.variant,
          scale: customAnimation.effect.scale,
          sourceMoves: customAnimation.effect.sourceMoves,
        }
      : undefined,
  });

  if (customAnimation?.effect.type === "fireball") {
    window.setTimeout(() => {
      if (sequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
      useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
    }, customAnimation.castMs);
  }

  window.setTimeout(() => {
    if (sequenceId !== hostCombatSequenceId) return;
    if (customAnimation?.effect.type === "fireball") {
      useAudioStore.getState().playSfx(fireballHitSfx);
    }
    let gameEnded = false;
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = applyHostAttackEvent(previous, event);
      // Combat is presented one impact at a time. Declare a lethal impact immediately instead of
      // waiting for finishHostCombat after every remaining attacker has played its animation.
      checkWinLoss(next);
      gameEnded = Boolean(next.winner);
      const gainedLife = next.player.life > previous.player.life;
      if (gainedLife) useAudioStore.getState().playSfx("buff");
      notifyDiscardEffects(previous, next);
      if (gameEnded) return { ...createCleanUiState(), game: next };
      return {
        game: next,
        hostCombatVisualDamage: nextVisualDamage(event),
        hostCombatDeadCardIds: nextDeadCardIds(event),
        ...(gainedLife ? startLifeBuffBeat() : {}),
      };
    });
    if (gameEnded) useGameStore.getState().stopGamePresentation();
  }, impactMs);

  window.setTimeout(() => {
    if (sequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
    useGameStore.setState({
      hostAttackAnimation: undefined,
      burnAnimation: undefined,
      burnImpactCardId: undefined,
      burnImpactCardIds: [],
    });
    scheduleQueuedCombatReactions(() => {
      if (sequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
      useGameStore.setState({ hostCombatDeadCardIds: [] });
      runHostCombatEventSequence(events, index + 1, sequenceId);
    });
  }, durationMs);
}

function scheduleQueuedCombatReactions(onComplete: () => void): void {
  if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
    scheduleQueuedPlayerTriggers(() => scheduleQueuedCombatReactions(onComplete));
    return;
  }
  scheduleQueuedHostTriggers(() => {
    if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
      scheduleQueuedCombatReactions(onComplete);
      return;
    }
    onComplete();
  });
}

function runPendingHostCombatVolleyOrFinish(combatSequenceId: number): void {
  if (combatSequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
  const state = useGameStore.getState();
  const volley = pendingHostCombatDamageVolley(state.game);
  if (!volley || volley.damage <= 0) {
    finishAnimatedHostCombat();
    return;
  }

  const sequenceId = hostSequenceEpoch();
  const source = volley.sourceId
    ? state.game.host.field.find((card) => card.instanceId === volley.sourceId)
    : undefined;
  const projectileCount = Math.max(1, Math.min(COMBAT_VOLLEY_MAX_PROJECTILES, volley.attackerCount));
  const volleyDelay = (projectileCount - 1) * COMBAT_VOLLEY_PROJECTILE_GAP_MS;

  useGameStore.setState({ hostAutoTriggerCount: 1 });
  if (source) {
    useAudioStore.getState().playSfx("activateEffect");
    useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
    useToastStore.getState().pushToast({
      title: uiText("toast.hostEffect"),
      message: uiText("toast.cardTrigger", { card: uiCardName(source) }),
      tone: "host",
    });
  }

  window.setTimeout(() => {
    if (sequenceId !== hostSequenceEpoch() || combatSequenceId !== hostCombatSequenceId) return;
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
        if (sequenceId !== hostSequenceEpoch() || combatSequenceId !== hostCombatSequenceId) return;
        useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
      }, COMBAT_VOLLEY_PROJECTILE_LAUNCH_MS + projectileDelay);

      window.setTimeout(() => {
        if (sequenceId !== hostSequenceEpoch() || combatSequenceId !== hostCombatSequenceId) return;
        useAudioStore.getState().playSfx(fireballHitSfx);
        if (projectileIndex !== projectileCount - 1) return;
        let gameEnded = false;
        useGameStore.setState((current) => {
          const next = resolvePendingHostCombatDamageVolleys(current.game);
          gameEnded = Boolean(next.winner);
          return gameEnded
            ? { ...createCleanUiState(), game: next }
            : { game: next, lifeDamageAnimationId: Date.now() };
        });
        if (gameEnded) useGameStore.getState().stopGamePresentation();
      }, COMBAT_VOLLEY_IMPACT_MS + projectileDelay);
    }

    window.setTimeout(() => {
      if (sequenceId !== hostSequenceEpoch() || combatSequenceId !== hostCombatSequenceId) return;
      useGameStore.setState({ burnAnimation: undefined });
      finishAnimatedHostCombat();
    }, COMBAT_VOLLEY_ANIMATION_MS + volleyDelay);
  }, COMBAT_VOLLEY_LEAD_IN_MS);
}

function finishAnimatedHostCombat(): void {
  const previous = useGameStore.getState().game;
  const resolved = finishHostCombat(previous, { deferTriggeredEvents: true });
  const next = advancePhase(resolved, "end");
  notifyDiscardEffects(previous, next);
  useGameStore.setState({
    game: next,
    hostAttackAnimation: undefined,
    burnAnimation: undefined,
    burnImpactCardId: undefined,
    burnImpactCardIds: [],
    deathRevealCard: undefined,
    hostSpellCard: undefined,
    // Failsafe: an aura whose beat never got to play must not keep its buff hidden forever.
    pendingStaticAuras: [],
    heldStaticAuraBonuses: {},
    resolvingHostCombat: false,
    hostCombatVisualDamage: undefined,
    hostCombatDeadCardIds: [],
    selectedHostCreatureId: undefined,
    selectedPlayerCreatureId: undefined,
  });
  scheduleQueuedHostTriggers();
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
  poisonConsumeRunHostAfterMill = false;
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

function clearEnergyFlowPresentation(): void {
  if (energyFlowAnimationSafetyTimer && typeof window !== "undefined") {
    window.clearTimeout(energyFlowAnimationSafetyTimer);
  }
  energyFlowAnimationSafetyTimer = undefined;
  energyFlowCommit = undefined;
  energyFlowAfterCommit = undefined;
}

function cancelScheduledPresentation(): void {
  hostCombatSequenceId += 1;
  resetHostSequence();
  resetPlayerTriggerSequence();

  if (typeof window !== "undefined") {
    if (activeEffectCloseTimer !== undefined) window.clearTimeout(activeEffectCloseTimer);
    if (effectActivationPulseTimer !== undefined) window.clearTimeout(effectActivationPulseTimer);
    if (summoningAnimationSafetyTimer !== undefined) window.clearTimeout(summoningAnimationSafetyTimer);
    if (landPlaySummoningSafetyTimer !== undefined) window.clearTimeout(landPlaySummoningSafetyTimer);
  }
  activeEffectCloseTimer = undefined;
  effectActivationPulseTimer = undefined;
  summoningAnimationSafetyTimer = undefined;
  landPlaySummoningSafetyTimer = undefined;

  clearBloodPactPresentation();
  clearLifePaymentPresentation();
  clearLifestealAttackPresentation();
  clearPoisonAttackPresentation();
  clearPoisonConsumePresentation();
  clearDrainEssencePresentation();
  clearFinalBanquetPresentation();
  clearEnergyFlowPresentation();
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

function scheduleEnergyFlowAnimationSafetyClear(id: string): void {
  if (typeof window === "undefined") return;
  if (energyFlowAnimationSafetyTimer) window.clearTimeout(energyFlowAnimationSafetyTimer);
  energyFlowAnimationSafetyTimer = window.setTimeout(() => {
    const store = useGameStore.getState();
    if (store.energyFlowAnimation?.id !== id) return;
    store.completeEnergyFlowAnimation(id);
  }, ENERGY_FLOW_ANIMATION_SAFETY_CLEAR_MS);
}

function combatResolutionInProgress(state: GameStore): boolean {
  return Boolean(
    state.playerAttackAnimation ||
      state.hostAttackAnimation ||
      state.burnAnimation ||
      state.lifePaymentAnimation ||
      state.lifestealAttackAnimations.length > 0 ||
      state.poisonConsumeAnimation ||
      state.bloodPactAnimation ||
      state.drainEssenceAnimation ||
      state.finalBanquetAnimation ||
      state.energyFlowAnimation ||
      state.pendingSpellHandId ||
      state.spellFightAnimation ||
      state.resolvingHostCombat ||
      state.playerAutoTriggerCount > 0 ||
      state.energyRecycleAnimation ||
      discardPauseInProgress(state),
  );
}

// Echo invocations and Source plays both bump the shared summoningAnimationCount, but each used to
// share one safety-clear timer var: rescheduling it from one call site canceled the other's
// fallback, and firing it hard-set the count to 0 instead of decrementing — so a Source's flight
// still in flight when an Echo was invoked could get its own pending decrement wiped out (or
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
    const attacker = game.player.field.find((card) => card.instanceId === attackerId);
    if (!attacker) return;
    totalDamage += getPowerEndurance(game, attacker).power;
    const nextMill = Math.floor(totalDamage / game.hostRules.damagePerArchiveDiscard);
    const newMill = nextMill - previousMill;
    previousMill = nextMill;
    for (let index = 0; index < newMill; index += 1) {
      const card = game.host.archive[previews.length];
      if (card) previews.push({ attackerIndex, cardIndexInHit: index, card });
    }
  });

  return previews;
}

function findMarkedCreatureIds(game: GameState): string[] {
  return [...game.player.field, ...game.host.field]
    .filter((card) => {
      if (!card.kinds.includes("ECHO")) return false;
      const { endurance } = getPowerEndurance(game, card);
      return card.damageMarked >= endurance || card.lethalDamage;
    })
    .map((card) => card.instanceId);
}

function hasManualInvokedTargetTrigger(card?: GameState["player"]["hand"][number]): boolean {
  return Boolean(card && findManualInvokedTargetTrigger(card));
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

function findCardPlayedReactionSources(game: GameState, card: CardInstance): CardInstance[] {
  const previewEvent: EventItem = { id: "preview-card-played", type: "CARD_PLAYED", sourceId: card.instanceId, payload: { nonToken: !card.isToken } };
  return game.host.field.filter((source) =>
    source.effects.some(
      (effect) =>
        effect.type === "TRIGGERED_ABILITY" &&
        effect.trigger === "CARD_PLAYED" &&
        !effectNeedsManualTarget(effect.effect) &&
        triggerConditionMet(game, effect.condition as Record<string, unknown> | undefined, source, previewEvent),
    ),
  );
}

function cardPlayedReactionMessage(card: CardInstance): string {
  const trigger = card.effects.find((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "CARD_PLAYED");
  const effect = trigger?.effect as EffectDefinition | undefined;
  const inner = effect?.type === "SEQUENCE"
    ? ((effect.effects as EffectDefinition[] | undefined)?.find((item) => EFFECT_ANNOUNCEMENTS[String(item.type)] === "createsTokens") ?? effect)
    : effect;
  if (inner && EFFECT_ANNOUNCEMENTS[String(inner.type)] === "createsTokens") return uiText("toast.cardCreatesToken", { card: uiCardName(card) });
  return uiText("toast.cardTrigger", { card: uiCardName(card) });
}

const CARD_PLAYED_REACTION_RESOLVE_MS = 620;
const MANUAL_TRIGGER_AFTER_REACTION_MS = 420;

const MANUAL_TRIGGER_SUMMON_WAIT_POLL_MS = 60;

function scheduleManualTriggerOverlay(manualTriggeredCard: CardInstance, startDelayMs: number): void {
  window.setTimeout(() => fireManualTriggerOverlay(manualTriggeredCard), startDelayMs);
}

// `.effect-card-lifted`/`.effect-card-activating` (the pulse this triggers) animate the same
// `transform`/`filter` on the same card slot as the field summon "pop" animation.
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
  useAudioStore.getState().playSfx("activateEffect");
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
// resolves the Host's reaction to that cast (e.g. Inexhaustible Ossuary), so it can glow and finish
// *after* the card is already visible, without delaying the cast itself. Host resolves before
// any manual trigger on the just-cast card (APNAP: non-active player's trigger goes on top of the stack).
function scheduleCardPlayedReaction(sources: CardInstance[], manualTriggeredCard: CardInstance | undefined): void {
  useGameStore.setState((state) => ({ hostAutoTriggerCount: state.hostAutoTriggerCount + 1 }));
  useAudioStore.getState().playSfx("activateEffect");
  for (const source of sources) useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
  useToastStore.getState().pushToast({
    title: uiText("toast.hostEffect"),
    message: sources.length === 1 ? cardPlayedReactionMessage(sources[0]) : uiText("toast.hostResolves"),
    tone: "host",
  });
  window.setTimeout(() => {
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      drainEventQueue(next);
      const triggeredBuffCardIds = findTemporaryBuffedCardIds(previous, next);
      if (triggeredBuffCardIds.length > 0) useAudioStore.getState().playSfx("buff");
      const buffBeat = triggeredBuffCardIds.length > 0 ? startBuffBeat(triggeredBuffCardIds) : undefined;
      const newHostCreatures = next.host.field.filter((card) => !previous.host.field.some((old) => old.instanceId === card.instanceId));
      if (newHostCreatures.length > 0) useAudioStore.getState().playSfx(monsterSfx(newHostCreatures[0]));
      notifyDiscardEffects(previous, next);
      return {
        game: next,
        hostAutoTriggerCount: Math.max(0, state.hostAutoTriggerCount - 1),
        summoningAnimationCount: state.summoningAnimationCount + newHostCreatures.length,
        hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
        ...(buffBeat ?? {}),
      };
    });
    if (manualTriggeredCard) scheduleManualTriggerOverlay(manualTriggeredCard, MANUAL_TRIGGER_AFTER_REACTION_MS);
  }, CARD_PLAYED_REACTION_RESOLVE_MS);
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
  const sfx = card && card.kinds.includes("ECHO") ? monsterSfx(card) : undefined;
  const readySourceIds = new Set(game.player.field.filter((item) => item.kinds.includes("SOURCE") && !item.exhausted).map((item) => item.instanceId));
  const reactionSources = card ? findCardPlayedReactionSources(game, card) : [];
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
  if (castSucceeded && card) playInvokedVoiceInteraction(game, next, card.instanceId);
  if (lostLife && paidLife === 0 && !usesBloodPactAnimation) useAudioStore.getState().playSfx("defend");
  if (castSucceeded && !usesBloodPactAnimation) playDrawOneIfPlayerDrew(game, next);
  if (triggeredBuffCardIds.length > 0) {
    useAudioStore.getState().playSfx(playerBuffSfxForAnimation(triggeredBuffVariant));
  }
  const buffBeat = triggeredBuffCardIds.length > 0
    ? startBuffBeat(triggeredBuffCardIds, triggeredBuffVariant)
    : undefined;
  const autoPaidLandIds = castSucceeded
    ? next.player.field.filter((item) => item.kinds.includes("SOURCE") && item.exhausted && readySourceIds.has(item.instanceId)).map((item) => item.instanceId)
    : [];
  const autoPaidLandAnimation = flashAutoPaidLands(autoPaidLandIds);
  const manualTriggeredCard = hasManualInvokedTargetTrigger(card) && castSucceeded ? card : undefined;
  const startsSummoningAnimation = Boolean(castSucceeded && card && !card.kinds.includes("SPELL") && !card.kinds.includes("SPELL"));
  if (startsSummoningAnimation) scheduleSummoningAnimationSafetyClear();
  const continueAfterPlayerTriggers = () => {
    if (reactionSources.length > 0) {
      scheduleCardPlayedReaction(reactionSources, manualTriggeredCard);
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
      hostMillAnimationQueue: appendHostMillAnimations(state, game, next),
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
  const usesDrainEssenceBiteAnimation = effectsUseAnimation(card.effects, "DRAIN_ESSENCE");
  const usesEssenceSmokeAnimation = effectsUseAnimation(card.effects, "ESSENCE_SMOKE");
  const usesDrainEssenceAnimation = usesDrainEssenceBiteAnimation || usesEssenceSmokeAnimation;
  const usesFinalBanquetAnimation = effectsUseAnimation(card.effects, "FINAL_BANQUET");
  const usesRootsTouchedSkyAnimation = card.definitionId === "the_judgment_of_elarion";
  const destroyTargetIds = isDestroySpell ? Object.values(targets).flatMap((target) => (Array.isArray(target) ? target : [target])).map(String) : [];
  const resolveSpell = (
    latest: GameState,
    presentation: {
      deferContinuation?: boolean;
      suppressLifeLossPresentation?: boolean;
      deferFightResolution?: boolean;
    } = {},
  ) => {
    const readySourceIds = new Set(latest.player.field.filter((item) => item.kinds.includes("SOURCE") && !item.exhausted).map((item) => item.instanceId));
    const reactionSources = findCardPlayedReactionSources(latest, card);
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
    if (castSucceeded) playInvokedVoiceInteraction(latest, next, card.instanceId);
    if (lostLife && paidLife === 0 && !presentation.suppressLifeLossPresentation) {
      useAudioStore.getState().playSfx("defend");
    }
    if (gainedLife) useAudioStore.getState().playSfx("buff");
    const triggeredBuffCardIds = findTemporaryBuffedCardIds(latest, next);
    const triggeredBuffVariant = buffAnimationVariantForCard(card.definitionId);
    if (triggeredBuffCardIds.length > 0) {
      useAudioStore.getState().playSfx(playerBuffSfxForAnimation(triggeredBuffVariant));
    }
    const buffBeat = triggeredBuffCardIds.length > 0
      ? startBuffBeat(
          triggeredBuffCardIds,
          triggeredBuffVariant,
        )
      : undefined;
    const autoPaidLandIds = castSucceeded
      ? next.player.field.filter((item) => item.kinds.includes("SOURCE") && item.exhausted && readySourceIds.has(item.instanceId)).map((item) => item.instanceId)
      : [];
    const autoPaidLandAnimation = flashAutoPaidLands(autoPaidLandIds);
    const lifeBuffBeat = gainedLife ? startLifeBuffBeat() : undefined;
    const continueAfterPlayerTriggers = () => {
      if (reactionSources.length > 0) scheduleCardPlayedReaction(reactionSources, undefined);
    };
    const continueAfterPayment = () => {
      if (isDestroySpell && castSucceeded) {
        // Destruction can queue opposing death reactions before a LIFE_LOST reaction. Let the
        // shared runner preserve that queue order, then continue with reactions to the cast itself.
        window.setTimeout(() => scheduleQueuedHostTriggers(continueAfterPlayerTriggers), 0);
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
      hostMillAnimationQueue: appendHostMillAnimations(useGameStore.getState(), latest, next),
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
        variant: usesEssenceSmokeAnimation ? "smoke" : "bite",
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
    const target = game.host.field.find((candidate) => candidate.instanceId === targetId);
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
        amount: Math.max(0, getPowerEndurance(game, target).power),
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
      if (usesRootsTouchedSkyAnimation) {
        const animationId = `roots-touched-sky-${card.instanceId}-${Date.now()}`;
        const gameSessionId = state.gameSessionId;
        window.setTimeout(() => {
          const current = useGameStore.getState();
          if (
            current.gameSessionId !== gameSessionId ||
            current.pendingSpellHandId !== handId ||
            current.rootsTouchedSkyAnimation?.id !== animationId
          ) return;
          useAudioStore.getState().playSfx("attack");
          useGameStore.setState({ specialDeadCardIds: destroyTargetIds });

          window.setTimeout(() => {
            const latest = useGameStore.getState();
            if (
              latest.gameSessionId !== gameSessionId ||
              latest.pendingSpellHandId !== handId ||
              latest.rootsTouchedSkyAnimation?.id !== animationId
            ) return;
            useGameStore.setState({
              ...resolveSpell(latest.game),
              rootsTouchedSkyAnimation: undefined,
              specialDeadCardIds: [],
              pendingSpellHandId: undefined,
            });
          }, ROOTS_TOUCHED_SKY_DEATH_FADE_MS);
        }, ROOTS_TOUCHED_SKY_IMPACT_MS);
        return {
          spellTargeting: undefined,
          selectedHandId: undefined,
          focusedCardId: undefined,
          pendingSpellHandId: handId,
          rootsTouchedSkyAnimation: {
            id: animationId,
            targetId: destroyTargetIds[0],
          },
          specialDeadCardIds: [],
        };
      }
      useAudioStore.getState().playSfx("attack");
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
      useAudioStore.getState().playSfx("attack");
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
      useAudioStore.getState().playSfx("attack");
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
          scheduleQueuedHostTriggers();
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
      useAudioStore.getState().playSfx("attack");
      useGameStore.setState({
        spellFightAnimation: { friendlyId, enemyId, enemyMoves: true, eventId: Date.now() },
      });

      window.setTimeout(() => {
        const impactState = useGameStore.getState();
        if (impactState.pendingSpellHandId !== handId) return;
        const next = structuredClone(impactState.game) as GameState;
        const source =
          next.player.memory.find((candidate) => candidate.instanceId === handId) ??
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
            scheduleQueuedHostTriggers();
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

function playInvokedVoiceInteraction(
  previousGame: GameState,
  nextGame: GameState,
  cardId: string,
): void {
  if (previousGame.player.field.some((card) => card.instanceId === cardId)) return;
  const enteredCard = nextGame.player.field.find((card) => card.instanceId === cardId);
  if (!enteredCard) return;
  playCardVoiceInteraction({
    type: "INVOKED",
    card: enteredCard,
    previousGame,
  });
}

function playCardVoiceInteraction(event: CardVoiceEvent): void {
  const cue = resolveCardVoiceCue(event);
  if (cue) playCardVoiceCue(cue);
}

function playCardVoiceCue(cue: CardVoiceCue): void {
  useAudioStore.getState().playSfx(cue.sfx);
  for (const sfx of cue.additionalSfx ?? []) useAudioStore.getState().playSfx(sfx);
}

function nextVisualDamage(event: HostAttackEvent): Record<string, number> {
  const current = useGameStore.getState().hostCombatVisualDamage ?? {};
  const next = { ...current };
  if (event.attackerDamageMarked !== undefined) next[event.attackerId] = event.attackerDamageMarked;
  if (event.blockerId && event.blockerDamageMarked !== undefined) next[event.blockerId] = event.blockerDamageMarked;
  return next;
}

function nextDeadCardIds(event: HostAttackEvent): string[] {
  const next = new Set(useGameStore.getState().hostCombatDeadCardIds);
  if (event.attackerDies) next.add(event.attackerId);
  if (event.blockerDies && event.blockerId) next.add(event.blockerId);
  return [...next];
}
