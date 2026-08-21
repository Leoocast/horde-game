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
  previewPlayerCombatArchiveDiscards,
  refreshHostAttackEvent,
  resolvePendingHostCombatDamageVolleys,
  resolvePlayerAttackerDrain,
  resolvePlayerAttackerPoison,
  resolvePlayerCombat,
  sortPlayerAttackersLeftToRight,
  togglePlayerAttacker,
  type HostAttackEvent,
} from "../engine/CombatResolver";
import { beginHostMain, finishHostTurn, revealHostCardFromTop, revealHostMainAfterSurgeEntry, runHostMain as runHostMainPhase } from "../engine/HostController";
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
import {
  advanceTributeOfTheFourSorrowsSequence,
  finishTributeOfTheFourSorrowsAfterDefeat,
  runTributeOfTheFourSorrowsSequence,
} from "./tributeOfTheFourSorrowsSequence";
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
  resetPresentationEffectTimers,
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
  resolveCardBurnScale,
  resolvePersonalAttackAnimation,
  resolvePersonalCombatAnimation,
  resolvePersonalTargetedAttackAnimation,
  type BurnMaterialVariant,
  type PersonalAttackAnimationPlan,
  type PersonalCombatAnimationPlan,
} from "./combatAnimation";
import { resolveBurnRenderer, type BurnRenderer, type BurnTrajectory } from "./burnAnimation";
import {
  gameplayIntentAllowed,
  guidedInteractionGate,
  publishGameplayDenial,
  publishGameplayReceipt,
  runGuidedSystemAction,
  type GameplayBlockAssignment,
  type GameplayIntent,
} from "../guidance/interactionGate";
import {
  gameplaySignalStream,
  gameplaySignalsForTransition,
  playerDrawReasonForTransition,
} from "../guidance/gameplaySignals";
import {
  guidedPresentationActivity,
  guidedSessionStore,
  isGuidedPresentationSettled,
  scheduleGuidedCheckpointEvaluation,
} from "../guidance";
import { authoredHostTurnGate, type AuthoredHostTurnPlan } from "../guidance/authoredHostTurn";
import { DESTINY_DIAL_STEP, destinyDialDeathDelta } from "./destinyDial";

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
  surgeRevealPending: boolean;
  /**
   * Ángulo acumulado del disco de grados del fondo, en grados. Es presentación pura:
   * no entra en `GameState`, no se persiste y no decide nada. Mide cómo se mueve el
   * futuro impacto a impacto, no al cerrar la batalla.
   */
  destinyDial: number;
  /** Revisión monotónica del objetivo del disco. Distingue 0 → 7 → 0 de un 0 que nunca se movió. */
  destinyDialRevision: number;
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
  /** Plants an already-built GameState (Playground scenarios or a validated resume checkpoint).
   *  Same store cleanup as `reset`; no presentation state crosses the boundary. */
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
  continueSurgeAfterExplanation: () => void;
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
// Lead the defender's lethal-hit reaction slightly so the cue arrives with the incoming blow.
// Rules still commit near the end of the animation, independently from this presentation timing.
const HOST_ATTACK_CONTACT_MS = HOST_ATTACK_ANIMATION_MS * 0.25;
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
const publishedGuidedTransitionStates = new WeakSet<GameState>();
let hostCombatSequenceId = 0;
let playerCombatSequenceId = 0;
let defensePhaseBannerTimer: number | undefined;
let defensePhaseBannerActivity: ReturnType<typeof guidedPresentationActivity.begin> | undefined;
const DEFENSE_PHASE_BANNER_MS = 1320;

export type HostAttackAnimation = {
  attackerId: string;
  attackerDies: boolean;
  blockerId?: string;
  blockerDies: boolean;
  playerDamage: number;
  attackerDamageMarked?: number;
  blockerDamageMarked?: number;
  eventId: number;
  customAnimation?: PersonalCombatAnimationPlan | PersonalAttackAnimationPlan;
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
  projectileOrigin?: "split-horizontal";
  variant?: BurnMaterialVariant;
  scale?: number;
  sourceMoves?: boolean;
  projectileGapMs?: number;
  impactLabel?: string;
  renderer?: BurnRenderer;
  trajectory?: BurnTrajectory;
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
  customAnimation?: PersonalCombatAnimationPlan;
};

function personalCardAttackBurnAnimation(
  animation: PersonalCombatAnimationPlan,
  animationId: string,
): BurnAnimationState | undefined {
  const { effect } = animation;
  if (effect.type !== "fireball") return undefined;
  return {
    id: animationId,
    sourceId: animation.sourceId,
    targetId: animation.targetId,
    targetKind: "card",
    amount: effect.amount,
    variant: effect.variant,
    scale: effect.scale,
    sourceMoves: effect.sourceMoves,
    ...(effect.projectileCount === undefined ? {} : { projectileCount: effect.projectileCount }),
    ...(effect.projectileOrigin === undefined ? {} : { projectileOrigin: effect.projectileOrigin }),
    ...(effect.projectileGapMs === undefined ? {} : { projectileGapMs: effect.projectileGapMs }),
  };
}

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
    surgeRevealPending: false,
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
  surgeRevealPending: false,
  destinyDial: 0,
  destinyDialRevision: 0,
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
    gameplaySignalStream.beginSession(`game:${get().gameSessionId + 1}`);
    set((state) => {
      persistSeed(seed);
      useAudioStore.getState().setMusicVariant("battle");
      const next = createInitialGame(getPlayerDeck(playerDeckId), getHostDeck(hostDeckId), seed, setupTurns, difficulty, gameMode);
      return {
        ...createCleanUiState(),
        game: next,
        gameSessionId: state.gameSessionId + 1,
        destinyDial: 0,
        destinyDialRevision: 0,
        seed,
        playerDeckId,
        hostDeckId,
      };
    });
  },
  loadScenario: (game, deckIds) => {
    cancelScheduledPresentation();
    gameplaySignalStream.beginSession(`game:${get().gameSessionId + 1}`);
    set((state) => {
      useAudioStore.getState().setMusicVariant("battle");
      return {
        ...createCleanUiState(),
        game,
        gameSessionId: state.gameSessionId + 1,
        destinyDial: 0,
        destinyDialRevision: 0,
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
  acceptOpeningHand: () => {
    if (!gameplayIntentAllowed({ kind: "opening.accept" })) return;
    let transition: readonly [GameState, GameState] | undefined;
    set(({ game }) => {
      const next = acceptOpeningHand(game);
      transition = [game, next];
      return {
        game: next,
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
      };
    });
    if (transition) publishGuidedTransitionReceipts(...transition);
  },
  mulliganOpeningHand: () => {
    if (!gameplayIntentAllowed({ kind: "opening.mulligan" })) return;
    set(({ game }) => {
      const next = mulliganOpeningHand(game);
      if (next.mulligansTaken !== game.mulligansTaken) useAudioStore.getState().playSfx("draw");
      return {
        game: next,
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
      };
    });
  },
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
  lockCounterTarget: (targetId) => {
    if (!gameplayIntentAllowed({ kind: "target.choose", context: "trigger", targetId })) return;
    set(({ counterTargeting }) => {
      if (!counterTargeting) return {};
      useAudioStore.getState().playSfx("playLand");
      return { counterTargeting: { ...counterTargeting, targetId } };
    });
    if (get().counterTargeting?.targetId === targetId) {
      publishGameplayReceipt({ kind: "target.selected", targetId, reason: "trigger" });
    }
  },
  deselectCounterTarget: () => {
    if (!get().counterTargeting?.targetId) return;
    if (!gameplayIntentAllowed({ kind: "target.deselect", context: "trigger" })) return;
    set(({ counterTargeting }) => ({
      counterTargeting: counterTargeting ? { ...counterTargeting, targetId: undefined } : undefined,
    }));
    publishGameplayReceipt({ kind: "target.deselected", reason: "trigger" });
  },
  cancelCounterTargeting: () => {
    if (!get().counterTargeting) return;
    if (!gameplayIntentAllowed({ kind: "target.cancel", context: "trigger" })) return;
    set((state) => ({
      counterTargeting: undefined,
      pendingTriggeredEffectCount: state.counterTargeting ? Math.max(0, state.pendingTriggeredEffectCount - 1) : state.pendingTriggeredEffectCount,
      pendingTriggeredEffectSourceId: state.counterTargeting ? undefined : state.pendingTriggeredEffectSourceId,
    }));
    publishGameplayReceipt({ kind: "target.cancelled", reason: "trigger" });
  },
  confirmCounterTargeting: () => {
    const selectedTargetId = get().counterTargeting?.targetId;
    if (!selectedTargetId) return;
    if (!gameplayIntentAllowed({ kind: "target.confirm", context: "trigger", targetIds: [selectedTargetId] })) return;
    let confirmed = false;
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
      confirmed = true;
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
    });
    if (confirmed) publishGameplayReceipt({ kind: "target.confirmed", targetIds: [selectedTargetId], reason: "trigger" });
  },
  updateTributeOfTheFourSorrowsSelectionPointer: (x, y) =>
    set(({ tributeOfTheFourSorrowsSelection }) => ({
      tributeOfTheFourSorrowsSelection: tributeOfTheFourSorrowsSelection && !tributeOfTheFourSorrowsSelection.targetId ? { ...tributeOfTheFourSorrowsSelection, x, y } : tributeOfTheFourSorrowsSelection,
    })),
  lockTributeOfTheFourSorrowsSelectionTarget: (targetId) => {
    if (!gameplayIntentAllowed({ kind: "target.choose", context: "tribute", targetId })) return;
    set(({ tributeOfTheFourSorrowsSelection }) => {
      if (!tributeOfTheFourSorrowsSelection) return {};
      useAudioStore.getState().playSfx("playLand");
      return { tributeOfTheFourSorrowsSelection: { ...tributeOfTheFourSorrowsSelection, targetId } };
    });
    if (get().tributeOfTheFourSorrowsSelection?.targetId === targetId) {
      publishGameplayReceipt({ kind: "target.selected", targetId, reason: "tribute" });
    }
  },
  deselectTributeOfTheFourSorrowsSelectionTarget: () => {
    if (!get().tributeOfTheFourSorrowsSelection?.targetId) return;
    if (!gameplayIntentAllowed({ kind: "target.deselect", context: "tribute" })) return;
    set(({ tributeOfTheFourSorrowsSelection }) => ({
      tributeOfTheFourSorrowsSelection: tributeOfTheFourSorrowsSelection ? { ...tributeOfTheFourSorrowsSelection, targetId: undefined } : undefined,
    }));
    publishGameplayReceipt({ kind: "target.deselected", reason: "tribute" });
  },
  confirmTributeOfTheFourSorrowsSelection: () => {
    const { game, gameSessionId, tributeOfTheFourSorrowsSelection } = get();
    if (!tributeOfTheFourSorrowsSelection?.targetId) return;
    const { kind, targetId } = tributeOfTheFourSorrowsSelection;
    if (!gameplayIntentAllowed({ kind: "target.confirm", context: "tribute", targetIds: [targetId] })) return;
    if (kind === "discard") {
      const next = structuredClone(game) as GameState;
      discardChosenCard(next, targetId);
      notifyDiscardEffects(game, next);
      set({ game: next, tributeOfTheFourSorrowsSelection: undefined });
      publishGameplayReceipt({ kind: "target.confirmed", targetIds: [targetId], reason: "tribute" });
      resumeAfterDiscardPause(
        () => {
          const current = get();
          if (current.gameSessionId !== gameSessionId) return;
          if (current.game.winner) {
            finishTributeOfTheFourSorrowsAfterDefeat();
            return;
          }
          advanceTributeOfTheFourSorrowsSequence("after-discard");
        },
        () => get().gameSessionId === gameSessionId,
      );
      return;
    }
    set({ tributeOfTheFourSorrowsSelection: undefined, specialDeadCardIds: [targetId] });
    publishGameplayReceipt({ kind: "target.confirmed", targetIds: [targetId], reason: "tribute" });
    useAudioStore.getState().playSfx("attack");
    window.setTimeout(() => {
      if (get().gameSessionId !== gameSessionId) return;
      set((state) => {
        if (state.gameSessionId !== gameSessionId) return {};
        const resolved = structuredClone(state.game) as GameState;
        const target = resolved.player.field.find((card) => card.instanceId === targetId);
        if (target) destroyPermanent(resolved, target);
        return { game: resolved, specialDeadCardIds: [] };
      });
      window.setTimeout(() => {
        const current = get();
        if (current.gameSessionId !== gameSessionId) return;
        if (current.game.winner) {
          finishTributeOfTheFourSorrowsAfterDefeat();
          return;
        }
        advanceTributeOfTheFourSorrowsSequence(kind === "sacrifice-creature" ? "after-sacrifice-creature" : "after-sacrifice-land");
      }, 320);
    }, 260);
  },
  selectHandLimitDiscard: (id) => {
    if (id && !gameplayIntentAllowed({ kind: "discard.choose", context: "hand-limit", cardId: id })) return;
    const deselecting = !id && Boolean(get().handLimitSelectionId);
    if (deselecting && !gameplayIntentAllowed({ kind: "discard.deselect", context: "hand-limit" })) return;
    if (id) useAudioStore.getState().playSfx("playLand");
    set({ handLimitSelectionId: id, hoveredCardId: undefined, focusedCardId: undefined });
    if (id) publishGameplayReceipt({ kind: "discard.selected", cardId: id, reason: "hand-limit" });
    else if (deselecting) publishGameplayReceipt({ kind: "discard.deselected", reason: "hand-limit" });
  },
  confirmHandLimitDiscard: () => {
    const state = get();
    const { handLimitSelectionId, game } = state;
    if (!handLimitSelectionId || playerHandOverflow(game) <= 0) return;
    if (!gameplayIntentAllowed({ kind: "discard.confirm", context: "hand-limit", cardId: handLimitSelectionId })) return;
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
    publishGameplayReceipt({ kind: "discard.completed", cardId: handLimitSelectionId, reason: "hand-limit" });
  },
  startSpellTargeting: (handId, x, y) => {
    if (!gameplayIntentAllowed({ kind: "card.play", cardId: handId })) return;
    const previousTargeting = get().spellTargeting;
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
    );
    const started = get().spellTargeting !== previousTargeting && get().spellTargeting?.handId === handId;
    if (started) publishGameplayReceipt({ kind: "targeting.started", cardId: handId, reason: "spell" });
  },
  updateSpellTargetPointer: (x, y) =>
    set(({ spellTargeting }) => ({
      spellTargeting: spellTargeting ? { ...spellTargeting, x, y } : undefined,
    })),
  lockSpellTarget: (targetId) => {
    if (!gameplayIntentAllowed({ kind: "target.choose", context: "spell", targetId })) return;
    let selected = false;
    set(({ game, spellTargeting }) => {
      if (!spellTargeting) return {};
      const card = game.player.hand.find((item) => item.instanceId === spellTargeting.handId);
      const req = card?.requiresTargets[spellTargeting.stepIndex];
      if (!card || !req) return {};
      const valid = targetCandidates(game, "player", req).some((candidate) => candidate.instanceId === targetId);
      if (!valid) return {};
      const targets = { ...spellTargeting.targets, [req.id]: targetId };
      selected = true;
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
    });
    if (selected) publishGameplayReceipt({ kind: "target.selected", targetId, reason: "spell" });
  },
  deselectSpellTarget: () => {
    const activeTargeting = get().spellTargeting;
    if (!activeTargeting || Object.keys(activeTargeting.targets).length === 0) return;
    if (!gameplayIntentAllowed({ kind: "target.deselect", context: "spell" })) return;
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
    });
    publishGameplayReceipt({ kind: "target.deselected", reason: "spell" });
  },
  cancelSpellTargeting: () => {
    if (!get().spellTargeting) return;
    if (!gameplayIntentAllowed({ kind: "target.cancel", context: "spell" })) return;
    set({
      spellTargeting: undefined,
      selectedHandId: undefined,
      focusedCardId: undefined,
      buffAnimationCardIds: [],
      buffAnimationVariant: "default",
    });
    publishGameplayReceipt({ kind: "target.cancelled", reason: "spell" });
  },
  confirmSpellTargeting: () => {
    const targeting = get().spellTargeting;
    if (!targeting) return;
    const targetIds = orderedTargetIds(get().game, targeting.handId, targeting.targets);
    if (!gameplayIntentAllowed({ kind: "target.confirm", context: "spell", targetIds })) return;
    let confirmed = false;
    set((state) => {
      const patch = runConfirmSpellTargeting(state);
      confirmed = patch.game?.lastActionResult?.ok === true;
      return patch;
    });
    if (confirmed) {
      publishGameplayReceipt({ kind: "target.confirmed", targetIds, reason: "spell" });
      publishGameplayReceipt({ kind: "card.played", cardId: targeting.handId, targetIds });
    }
  },
  setHoveredCardId: (id) => set({ hoveredCardId: id }),
  setFocusedCardId: (id) => {
    if (id && !gameplayIntentAllowed({ kind: "card.inspect", cardId: id })) return;
    set({ focusedCardId: id });
    if (id) publishGameplayReceipt({ kind: "card.inspected", cardId: id });
  },
  advancePhase: (phase) => {
    const intent = phaseAdvanceIntent(get().game, phase);
    if (!gameplayIntentAllowed(intent)) return;
    let transition: readonly [GameState, GameState] | undefined;
    set((state) => {
      if (discardPauseInProgress(state) || state.energyRecycleAnimation || state.lifePaymentAnimation || state.bloodPactAnimation || state.drainEssenceAnimation || state.energyFlowAnimation || state.pendingSpellHandId || state.spellFightAnimation || state.playerAutoTriggerCount > 0) return {};
      const { game } = state;
      const next = advancePhase(game, phase);
      transition = [game, next];
      playDrawOneIfPlayerDrew(game, next);
      return {
        game: next,
        playerAttackDrag: undefined,
        // The hand limit is checked when the player explicitly ends the turn,
        // not merely when combat advances into the end phase.
        handLimitDiscardActive: false,
        handLimitSelectionId: undefined,
      };
    });
    if (transition) publishGuidedTransitionReceipts(...transition);
  },
  endPlayerTurn: (options) => {
    if (!gameplayIntentAllowed(endPlayerTurnIntent(get().game))) return;
    let transition: readonly [GameState, GameState] | undefined;
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
      transition = [game, next];
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, handLimitDiscardActive: false, handLimitSelectionId: undefined, hostMillAnimationQueue: appendHostMillAnimations(state, game, next) };
    });
    if (transition) publishGuidedTransitionReceipts(...transition);
  },
  playLand: (id) => {
    const intent = { kind: "card.play", cardId: id } as const;
    if (!gameplayIntentAllowed(intent)) return;
    let succeeded = false;
    let failure: GameState["lastActionResult"];
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
      succeeded = playSucceeded;
      if (!playSucceeded) failure = next.lastActionResult;
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
    });
    if (succeeded) {
      publishGameplayReceipt({ kind: "card.played", cardId: id });
      publishGameplayReceipt({ kind: "source.played", cardId: id });
    }
    else if (failure) publishGameplayDenial(intent, failure);
  },
  startEnergyRecycle: (id, origin) => {
    if (!gameplayIntentAllowed({ kind: "source.recycle", cardId: id })) return;
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
    });
  },
  completeEnergyRecycleAnimation: () => {
    let recycledCardId: string | undefined;
    let failedCardId: string | undefined;
    let failure: GameState["lastActionResult"];
    set((state) => {
      const active = state.energyRecycleAnimation;
      if (!active) return {};
      const next = recycleEnergy(state.game, active.card.instanceId);
      const succeeded = next.lastActionResult?.ok === true;
      if (succeeded) {
        useAudioStore.getState().playSfx("drawOne");
        recycledCardId = active.card.instanceId;
      }
      else {
        failedCardId = active.card.instanceId;
        failure = next.lastActionResult;
        showActionToast(next.lastActionResult?.reason);
      }
      return {
        game: next,
        energyRecycleAnimation: undefined,
        selectedHandId: undefined,
        hoveredCardId: undefined,
        focusedCardId: undefined,
      };
    });
    if (recycledCardId) publishGameplayReceipt({ kind: "source.recycled", cardId: recycledCardId });
    else if (failedCardId && failure) {
      publishGameplayDenial({ kind: "source.recycle", cardId: failedCardId }, failure);
    }
  },
  castCard: (id, options) => {
    const targetIds = orderedCastTargetIds(get().game, id, options?.targets);
    const intent: GameplayIntent = { kind: "card.play", cardId: id, ...(targetIds.length > 0 ? { targetIds } : {}) };
    if (!gameplayIntentAllowed(intent)) return;
    let afterCommit: (() => void) | undefined;
    let startedBloodPactAnimationId: string | undefined;
    let startedLifePaymentAnimationId: string | undefined;
    let succeeded = false;
    let failure: GameState["lastActionResult"];
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
      succeeded = result.patch.game?.lastActionResult?.ok === true;
      if (!succeeded) failure = result.patch.game?.lastActionResult;
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
    if (succeeded) publishGameplayReceipt({ kind: "card.played", cardId: id, targetIds });
    else if (failure) publishGameplayDenial(intent, failure);
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
          runGuidedSystemAction(() => latest.runHostMain());
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
    const targetIds = flattenTargetIds(options?.targets);
    const intent: GameplayIntent = {
      kind: "ability.activate",
      cardId: id,
      abilityId,
      ...(targetIds.length > 0 ? { targetIds } : {}),
    };
    if (!gameplayIntentAllowed(intent)) return;
    let shouldSchedulePlayerTriggers = false;
    let startedLifePaymentAnimationId: string | undefined;
    let startedEnergyFlowAnimationId: string | undefined;
    let succeeded = false;
    let failure: GameState["lastActionResult"];
    set((state) => {
      if (combatResolutionInProgress(state)) return {};
      const source = state.game.player.field.find((card) => card.instanceId === id);
      const next = activateEngineAbility(state.game, id, abilityId, {
        ...options,
        deferReactiveTriggers: true,
      });
      succeeded = next.lastActionResult?.ok === true;
      if (!succeeded) failure = next.lastActionResult;
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
    if (succeeded) publishGameplayReceipt({ kind: "ability.activated", cardId: id, abilityId, targetIds });
    else if (failure) publishGameplayDenial(intent, failure);
  },
  toggleAttacker: (id) => {
    const currentGame = get().game;
    const intendedSelected = !currentGame.combat.playerAttackers.includes(id);
    const intendedAttacker = currentGame.player.field.find((card) => card.instanceId === id);
    const intent = { kind: "combat.toggleAttacker", cardId: id, selected: intendedSelected } as const;
    if (!gameplayIntentAllowed(intent)) return;
    let selectionChanged = false;
    let selected = false;
    let failure: GameState["lastActionResult"];
    set(({ game }) => {
      const wasAttacking = game.combat.playerAttackers.includes(id);
      const next = togglePlayerAttacker(game, id);
      const isAttacking = next.combat.playerAttackers.includes(id);
      selectionChanged = wasAttacking !== isAttacking;
      selected = isAttacking;
      if (next.lastActionResult?.ok === false) {
        failure = next.lastActionResult;
        if (intendedSelected && next.lastActionResult.code === "STABILIZING" && intendedAttacker) {
          showActionToast(
            uiText("toast.stabilizingAttack", { card: uiCardName(intendedAttacker) }),
            "toast.attackUnavailable",
          );
        } else {
          showActionToast(next.lastActionResult.reason);
        }
      }
      if (!wasAttacking && isAttacking) {
        useAudioStore.getState().playSfx(AUDIO_FEATURE_FLAGS.selectAttacker ? "selectAttacker" : "playLand");
      } else if (wasAttacking && !isAttacking) {
        useAudioStore.getState().playSfx("playLand");
      }
      return { game: next };
    });
    if (selectionChanged) publishGameplayReceipt({ kind: "attacker.selected", cardId: id, reason: selected ? "selected" : "deselected" });
    else if (failure) publishGameplayDenial(intent, failure);
  },
  attackAll: () => {
    const targetIds = selectableAttackers(get().game);
    if (!gameplayIntentAllowed({ kind: "combat.selectAllAttackers", targetIds })) return;
    let selectedIds: string[] = [];
    let accepted = false;
    set(({ game }) => {
      if (game.activeSide !== "player" || game.phase !== "combat") return {};
      accepted = true;
      const next = structuredClone(game) as GameState;
      const selected = new Set(next.combat.playerAttackers);
      for (const card of next.player.field) {
        if (!card.kinds.includes("ECHO") || selected.has(card.instanceId)) continue;
        if (!canAttack(next, card)) continue;
        selected.add(card.instanceId);
        if (!hasTrait(next, card, "ALERT")) card.exhausted = true;
      }
      next.combat.playerAttackers = sortPlayerAttackersLeftToRight(next, [...selected]);
      selectedIds = [...next.combat.playerAttackers];
      next.log.unshift(`Player attacks with ${next.combat.playerAttackers.length} creature(s).`);
      if (next.combat.playerAttackers.length > game.combat.playerAttackers.length) useAudioStore.getState().playSfx("playLand");
      return { game: next };
    });
    if (accepted) publishGameplayReceipt({ kind: "attackers.selected", targetIds: selectedIds });
  },
  cancelPlayerAttackers: () => {
    const targetIds = [...get().game.combat.playerAttackers];
    if (!gameplayIntentAllowed({ kind: "combat.cancelAttackers", targetIds })) return;
    set(({ game }) => {
      const next = structuredClone(game) as GameState;
      const attackers = new Set(next.combat.playerAttackers);
      for (const card of next.player.field) {
        if (attackers.has(card.instanceId) && !hasTrait(next, card, "ALERT")) card.exhausted = false;
      }
      next.combat.playerAttackers = [];
      next.log.unshift("Player cancels attackers.");
      return { game: next, selectedPlayerCreatureId: undefined, playerAttackDrag: undefined };
    });
    publishGameplayReceipt({ kind: "attackers.cancelled", targetIds });
  },
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
    if (!gameplayIntentAllowed({ kind: "combat.confirmArchiveAttack", targetIds: attackers })) return;
    if (attackers.length === 0) {
      const resolved = resolvePlayerCombat(game);
      const next = advancePhase(resolved, "end");
      set((state) => ({ game: next, selectedPlayerCreatureId: undefined, hostMillAnimationQueue: appendHostMillAnimations(state, game, next) }));
      return;
    }
    const sequenceId = ++playerCombatSequenceId;

    const previewMillCards = previewPlayerCombatArchiveDiscards(game, attackers);
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
        if (sequenceId !== playerCombatSequenceId) return;
        if (!customAnimation || customAnimation.effect.type !== "fireball") {
          useAudioStore.getState().playSfx("attack");
        }
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
                ...(customAnimation.effect.projectileCount === undefined
                  ? {}
                  : { projectileCount: customAnimation.effect.projectileCount }),
                ...(customAnimation.effect.projectileOrigin === undefined
                  ? {}
                  : { projectileOrigin: customAnimation.effect.projectileOrigin }),
                ...(customAnimation.effect.projectileGapMs === undefined
                  ? {}
                  : { projectileGapMs: customAnimation.effect.projectileGapMs }),
              }
            : undefined,
        });
      }, startAt);
      if (customAnimation?.effect.type === "fireball") {
        window.setTimeout(() => {
          if (sequenceId !== playerCombatSequenceId) return;
          const active = useGameStore.getState().playerAttackAnimation;
          if (active?.attackerId !== attackerId || active.eventId !== index) return;
          useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
        }, startAt + customAnimation.castMs);
      }
      window.setTimeout(() => {
        if (sequenceId !== playerCombatSequenceId) return;
        const active = useGameStore.getState().playerAttackAnimation;
        if (
          customAnimation?.effect.type === "fireball" &&
          active?.attackerId === attackerId &&
          active.eventId === index
        ) {
          useAudioStore.getState().playSfx(fireballHitSfx);
        }
        // Cada atacante mueve el disco en su propio impacto, no al cerrar la batalla.
        useGameStore.setState((state) => {
          const striker = state.game.player.field.find((card) => card.instanceId === attackerId);
          const struck = striker ? getPowerEndurance(state.game, striker).power > 0 : false;
          return struck
            ? {
                destinyDial: state.destinyDial + DESTINY_DIAL_STEP,
                destinyDialRevision: state.destinyDialRevision + 1,
              }
            : {};
        });
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
          if (sequenceId !== playerCombatSequenceId) return;
          useGameStore.getState().queueHostMillPreview(preview.card);
        }, startAt + impactOffset + preview.cardIndexInHit * (HOST_MILL_ANIMATION_MS + PLAYER_ATTACK_MILL_GAP_MS));
      }
      if (burnAnimationId && customAnimation) {
        window.setTimeout(() => {
          if (sequenceId !== playerCombatSequenceId) return;
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
      if (sequenceId !== playerCombatSequenceId) return;
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
      // The action is committed at confirmation, but contextual guidance must not speak over the
      // attack, impact or Archive flights. Publish its semantic receipt only after that sequence
      // has handed the board to End; any remaining mill queue is still covered by the shared
      // presentation barrier.
      publishGameplayReceipt({ kind: "archiveAttack.confirmed", targetIds: attackers });
    }, elapsed + 40);
  },
  runHostMain: () => {
    const state = get();
    if (discardPauseInProgress(state) || state.surgeTransitionActive || state.surgeRevealPending) return;
    const { game } = state;
    if (!gameplayIntentAllowed(runHostIntent(game))) return;
    const authoredPlan = authoredHostTurnGate.plan(game);
    if (authoredPlan) {
      runAuthoredHostTurn(game, authoredPlan);
      return;
    }
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
    const main = runHostMainPhase(game, { deferInvokedTriggers: true });
    presentResolvedHostMain(game, main, state);
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
    const state = get();
    if (!state.surgeTransitionActive) return;
    const begun = beginHostMain(state.game);
    set({
      game: begun,
      surgeTransitionActive: false,
      surgeRevealPending: true,
    });
    // This transition is the exact narrative seam: Surge now exists, but the Host has not
    // revealed anything yet. Publish it directly so contextual help never depends on a strict
    // guided intervention still owning the interaction gate at this instant.
    publishGuidedTransitionReceipts(state.game, begun);
  },
  continueSurgeAfterExplanation: () => {
    const state = get();
    if (!state.surgeRevealPending) return;
    const main = revealHostMainAfterSurgeEntry(state.game, { deferInvokedTriggers: true });
    presentResolvedHostMain(state.game, main, state);
  },
  prepareHostAttackers: () => {
    if (discardPauseInProgress(get())) return;
    startHostCombatSequence();
  },
  declareBlocker: (blockerId, attackerId) => {
    const intendedSelected = !(get().game.combat.blockers[attackerId] ?? []).includes(blockerId);
    const intent = {
      kind: "combat.assignBlocker",
      cardId: blockerId,
      targetId: attackerId,
      selected: intendedSelected,
    } as const;
    if (!gameplayIntentAllowed(intent)) return;
    let selectionChanged = false;
    let selected = false;
    let failure: GameState["lastActionResult"];
    set(({ game }) => {
      const wasBlocking = Object.values(game.combat.blockers).some((ids) => ids.includes(blockerId));
      const wasBlockingTarget = game.combat.blockers[attackerId]?.includes(blockerId) ?? false;
      const next = declareBlocker(game, blockerId, attackerId);
      const isBlockingTarget = next.combat.blockers[attackerId]?.includes(blockerId) ?? false;
      selectionChanged = wasBlockingTarget !== isBlockingTarget;
      selected = isBlockingTarget;
      if (!wasBlocking && isBlockingTarget) useAudioStore.getState().playSfx("playLand");
      else if (next.lastActionResult?.ok === false) {
        failure = next.lastActionResult;
        showActionToast(next.lastActionResult.reason);
      }
      return { game: next, blockDrag: undefined };
    });
    if (selectionChanged) {
      publishGameplayReceipt({
        kind: selected ? "blocker.assigned" : "blocker.unassigned",
        cardId: blockerId,
        targetId: attackerId,
      });
    }
    else if (failure) publishGameplayDenial(intent, failure);
  },
  cancelBlocks: () => {
    const assignments = combatAssignments(get().game);
    if (!gameplayIntentAllowed({ kind: "combat.cancelBlocks", assignments })) return;
    set(({ game }) => {
      const next = structuredClone(game) as GameState;
      next.combat.blockers = {};
      return { game: next, selectedHostCreatureId: undefined, selectedPlayerCreatureId: undefined, blockDrag: undefined };
    });
    publishGameplayReceipt({ kind: "blocks.cancelled", assignments });
  },
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
          runGuidedSystemAction(() => latest.runHostMain());
        }
      }, 0);
    }
  },
  resolveHostCombat: () => {
    const state = get();
    if (discardPauseInProgress(state)) return;
    const { game, hostAttackAnimation, playerAttackAnimation, burnAnimation } = state;
    if (hostAttackAnimation || playerAttackAnimation || burnAnimation) return;
    if (game.activeSide !== "host" || game.combat.hostAttackers.length === 0) return;
    const assignments = combatAssignments(game);
    if (!gameplayIntentAllowed({ kind: "combat.confirmDefense", assignments })) return;
    publishGameplayReceipt({ kind: "defense.confirmed", assignments });

    const attackEvents = buildHostAttackEvents(game);
    const sequenceId = ++hostCombatSequenceId;
    if (attackEvents.length === 0) {
      runPendingHostCombatVolleyOrFinish(sequenceId);
      return;
    }
    set({ resolvingHostCombat: true, selectedHostCreatureId: undefined, selectedPlayerCreatureId: undefined });
    runHostCombatEventSequence(attackEvents, 0, sequenceId);
  },
  finishHostTurn: () => {
    if (!gameplayIntentAllowed({ kind: "phase.startPlayerTurn" })) return;
    let transition: readonly [GameState, GameState] | undefined;
    set((state) => {
      if (discardPauseInProgress(state)) return {};
      const { game } = state;
      const next = finishHostTurn(game);
      transition = [game, next];
      playDrawOneIfPlayerDrew(game, next);
      return { game: next, hostAutoTriggerCount: 0 };
    });
    if (transition) publishGuidedTransitionReceipts(...transition);
  },
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

function presentResolvedHostMain(previous: GameState, main: GameState, state: GameStore): void {
  const previousHostBattlefieldIds = new Set(previous.host.field.map((card) => card.instanceId));
  const enteredCards = main.host.field.filter((card) => !previousHostBattlefieldIds.has(card.instanceId));
  const triggerCards = enteredCards.filter(hasInvokedTrigger);
  const shared = {
    game: main,
    surgeRevealPending: false,
    selectedHostCreatureId: undefined,
    selectedPlayerCreatureId: undefined,
    hostAutoTriggerCount: triggerCards.length,
    summoningAnimationCount: state.summoningAnimationCount + enteredCards.length,
    hostMillAnimationQueue: appendHostMillAnimations(state, previous, main),
  } as const;

  if (main.host.pendingCard) {
    const pendingCard = main.host.pendingCard;
    useGameStore.setState(shared);
    publishGuidedTransitionReceipts(previous, main);
    publishGameplayReceipt({ kind: "host.resolved" });
    captureStaticAuraBeats();
    scheduleHostArrivalEffects(enteredCards, () => runTributeOfTheFourSorrowsSequence(pendingCard));
    return;
  }

  if (main.host.field.length > previous.host.field.length) useAudioStore.getState().playSfx("draw");
  useGameStore.setState(shared);
  publishGuidedTransitionReceipts(previous, main);
  publishGameplayReceipt({ kind: "host.resolved" });
  // Before any frame renders the new creatures: hold back the buffs they just gained so the
  // announcement beat still has something to reveal.
  captureStaticAuraBeats();
  scheduleHostArrivalEffects(enteredCards, () => startHostCombatSequence());
}

function runAuthoredHostTurn(game: GameState, plan: AuthoredHostTurnPlan): void {
  const begun = beginHostMain(game);
  useGameStore.setState({
    game: begun,
    selectedHostCreatureId: undefined,
    selectedPlayerCreatureId: undefined,
    hoveredCardId: undefined,
    focusedCardId: undefined,
  });
  revealAuthoredHostCards(plan.revealCount, () => {
    publishGameplayReceipt({ kind: "host.resolved" });
    startHostCombatSequence();
  });
}

/** Every authored arrival owns the ordinary reveal, summon and Invoked-trigger presentation. */
function revealAuthoredHostCards(remaining: number, onComplete: () => void): void {
  if (remaining <= 0) {
    onComplete();
    return;
  }
  const state = useGameStore.getState();
  if (state.game.winner || state.game.host.archive.length === 0) {
    onComplete();
    return;
  }
  const previous = state.game;
  const previousIds = new Set(previous.host.field.map((card) => card.instanceId));
  const next = revealHostCardFromTop(previous, { deferInvokedTriggers: true });
  const entered = next.host.field.filter((card) => !previousIds.has(card.instanceId));
  const triggerCards = entered.filter(hasInvokedTrigger);
  if (entered.length > 0) useAudioStore.getState().playSfx("draw");
  useGameStore.setState({
    game: next,
    selectedHostCreatureId: undefined,
    selectedPlayerCreatureId: undefined,
    hostAutoTriggerCount: triggerCards.length,
    summoningAnimationCount: state.summoningAnimationCount + entered.length,
    hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
  });
  captureStaticAuraBeats();
  scheduleHostArrivalEffects(entered, () => revealAuthoredHostCards(remaining - 1, onComplete));
}

// Project every committed GameState transition into the passive semantic stream. Unlike guided
// receipts, this remains active in normal matches and has no authority over the rules.
useGameStore.subscribe((state, previousState) => {
  if (
    state.game === previousState.game
    || state.gameSessionId !== previousState.gameSessionId
  ) return;
  const lifeLossSourceId = state.hostAttackAnimation?.attackerId
    ?? previousState.hostAttackAnimation?.attackerId;
  const defenseJustDeclared = state.game.activeSide === "host"
    && state.game.combat.hostAttackers.length > 0
    && (previousState.game.activeSide !== "host"
      || previousState.game.combat.hostAttackers.length === 0);
  if (defenseJustDeclared) {
    defensePhaseBannerActivity?.end();
    if (defensePhaseBannerTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(defensePhaseBannerTimer);
    }
    defensePhaseBannerActivity = guidedPresentationActivity.begin(
      "phase.banner",
      `host-defend-${state.game.turnNumber}`,
    );
    if (typeof window !== "undefined") {
      defensePhaseBannerTimer = window.setTimeout(() => {
        defensePhaseBannerActivity?.end();
        defensePhaseBannerActivity = undefined;
        defensePhaseBannerTimer = undefined;
      }, DEFENSE_PHASE_BANNER_MS);
    } else {
      defensePhaseBannerActivity.end();
      defensePhaseBannerActivity = undefined;
    }
  }
  for (const signal of gameplaySignalsForTransition(previousState.game, state.game, { lifeLossSourceId })) {
    gameplaySignalStream.publish(signal);
  }
});

// Read card losses from committed zone transitions, not from individual combat or effect paths.
// This remains presentation-only: it observes rules results and never changes them.
useGameStore.subscribe((state, previousState) => {
  if (
    state.game === previousState.game ||
    state.gameSessionId !== previousState.gameSessionId
  ) return;
  const delta = destinyDialDeathDelta(previousState.game, state.game);
  if (delta === 0) return;
  useGameStore.setState((current) => {
    if (
      current.game !== state.game ||
      current.gameSessionId !== state.gameSessionId
    ) return {};
    return {
      destinyDial: current.destinyDial + delta,
      destinyDialRevision: current.destinyDialRevision + 1,
    };
  });
});

// Observe committed domain transitions, including those produced by Host/player beat schedulers.
// This is intentionally receipt-only: it never authorizes or changes a rule resolution.
useGameStore.subscribe((state, previousState) => {
  if (state.game === previousState.game) return;
  const sessionId = guidedInteractionGate.snapshot().policy?.sessionId;
  if (!sessionId) return;
  const previousGame = previousState.game;
  const nextGame = state.game;
  queueMicrotask(() => {
    if (guidedInteractionGate.snapshot().policy?.sessionId !== sessionId) return;
    publishGuidedTransitionReceipts(previousGame, nextGame);
  });
});

function guidedCheckpointIsSettled(): boolean {
  return isGuidedPresentationSettled(useGameStore.getState(), guidedPresentationActivity.snapshot());
}

guidedSessionStore.configureCheckpointProbe(guidedCheckpointIsSettled, scheduleGuidedCheckpointEvaluation);
guidedPresentationActivity.subscribe(() => {
  guidedSessionStore.notifyCheckpointState(guidedCheckpointIsSettled());
});
useGameStore.subscribe((state) => {
  if (state.game.winner) {
    guidedSessionStore.notifyGameEnded();
    return;
  }
  guidedSessionStore.notifyCheckpointState(guidedCheckpointIsSettled());
});

function phaseAdvanceIntent(game: GameState, target?: Phase): GameplayIntent {
  if (game.activeSide === "player" && target === "combat") return { kind: "phase.chooseAttackers" };
  if (game.activeSide === "player" && game.phase === "combat" && target === "end") return { kind: "phase.passCombat" };
  return { kind: "phase.advance", phase: target };
}

function endPlayerTurnIntent(game: GameState): GameplayIntent {
  if (game.setupTurnsRemaining > 1) return { kind: "phase.continueSetup" };
  if (game.setupTurnsRemaining === 1) return { kind: "phase.awakenHost" };
  return { kind: "phase.endTurn" };
}

function runHostIntent(game: GameState): GameplayIntent {
  return game.hostTurnNumber === 0 || game.setupCompletePendingHost
    ? { kind: "phase.awakenHost" }
    : { kind: "phase.resolveHost" };
}

function orderedCastTargetIds(
  game: GameState,
  handId: string,
  targets?: Readonly<Record<string, string | string[]>>,
): string[] {
  const card = game.player.hand.find((candidate) => candidate.instanceId === handId);
  if (!card || !targets) return [];
  return card.requiresTargets.flatMap((requirement) => {
    const selected = targets[requirement.id];
    return Array.isArray(selected) ? selected.map(String) : selected ? [String(selected)] : [];
  });
}

function orderedTargetIds(
  game: GameState,
  handId: string,
  targets: Readonly<Record<string, string | string[]>>,
): string[] {
  return orderedCastTargetIds(game, handId, targets);
}

function flattenTargetIds(targets?: Readonly<Record<string, string | string[]>>): string[] {
  if (!targets) return [];
  return Object.values(targets).flatMap((selected) => Array.isArray(selected) ? selected.map(String) : [String(selected)]);
}

function selectableAttackers(game: GameState): string[] {
  const selected = new Set(game.combat.playerAttackers);
  for (const card of game.player.field) {
    if (card.kinds.includes("ECHO") && canAttack(game, card)) selected.add(card.instanceId);
  }
  return sortPlayerAttackersLeftToRight(game, [...selected]);
}

function combatAssignments(game: GameState): GameplayBlockAssignment[] {
  const attackerOrder = new Map(game.combat.hostAttackers.map((id, index) => [id, index]));
  return Object.entries(game.combat.blockers)
    .flatMap(([attackerId, blockerIds]) => blockerIds.map((blockerId) => ({ blockerId, attackerId })))
    .sort((left, right) =>
      (attackerOrder.get(left.attackerId) ?? Number.MAX_SAFE_INTEGER) -
        (attackerOrder.get(right.attackerId) ?? Number.MAX_SAFE_INTEGER) ||
      left.blockerId.localeCompare(right.blockerId),
    );
}

function publishGuidedTransitionReceipts(previous: GameState, next: GameState): void {
  if (publishedGuidedTransitionStates.has(next)) return;
  publishedGuidedTransitionStates.add(next);
  if (!previous.openingHandAccepted && next.openingHandAccepted) {
    publishGameplayReceipt({ kind: "opening.accepted" }, { observe: false });
  }
  if (previous.activeSide !== next.activeSide || previous.phase !== next.phase) {
    publishGameplayReceipt({ kind: "phase.changed", reason: `${next.activeSide}:${next.phase}` }, { observe: false });
  }
  if (next.setupTurnsRemaining < previous.setupTurnsRemaining) {
    publishGameplayReceipt({
      kind: "setup.stepEnded",
      amount: next.setupTurnsRemaining,
      reason: next.setupTurnsRemaining === 0 ? "complete" : "continue",
    }, { observe: false });
  }

  const nextHandIds = new Set(next.player.hand.map((card) => card.instanceId));
  const drawnCardIds = previous.player.archive
    .filter((card) => nextHandIds.has(card.instanceId))
    .map((card) => card.instanceId);
  if (drawnCardIds.length > 0) {
    publishGameplayReceipt({
      kind: "player.drew",
      targetIds: drawnCardIds,
      amount: drawnCardIds.length,
      reason: playerDrawReason(previous, next),
    }, { observe: false });
  }

  const nextPlayerMemoryIds = new Set(next.player.memory.map((card) => card.instanceId));
  const discardedPlayerCardIds = previous.player.hand
    .filter((card) => nextPlayerMemoryIds.has(card.instanceId))
    .map((card) => card.instanceId);
  if (discardedPlayerCardIds.length > 0) {
    publishGameplayReceipt({
      kind: "player.discarded",
      targetIds: discardedPlayerCardIds,
      amount: discardedPlayerCardIds.length,
      reason: "effect",
    }, { observe: false });
  }

  const releasedReserve = Math.max(0, next.player.energyPool.stored - previous.player.energyPool.stored);
  if (releasedReserve > 0 && previous.player.pendingStoredEnergy > next.player.pendingStoredEnergy) {
    publishGameplayReceipt({ kind: "reserve.released", amount: releasedReserve }, { observe: false });
  }

  const nextHostMemoryIds = new Set(next.host.memory.map((card) => card.instanceId));
  const discardedHostCardIds = previous.activeSide === "host" && previous.phase === "host"
    ? []
    : previous.host.archive
        .filter((card) => nextHostMemoryIds.has(card.instanceId))
        .map((card) => card.instanceId);
  if (discardedHostCardIds.length > 0) {
    publishGameplayReceipt({
      kind: "hostArchive.discarded",
      targetIds: discardedHostCardIds,
      amount: discardedHostCardIds.length,
    }, { observe: false });
  }
}

function playerDrawReason(previous: GameState, next: GameState): string {
  return playerDrawReasonForTransition(previous, next);
}

/** Libera solamente el beat de combate ya terminado. La limpieza global pertenece a Board y se
 * ejecuta después de que el resto de la presentación de derrota haya quedado estable. */
function releaseHostCombatPresentationAfterDefeat(): void {
  useGameStore.setState({
    hostAttackAnimation: undefined,
    burnAnimation: undefined,
    burnImpactCardId: undefined,
    burnImpactCardIds: [],
    resolvingHostCombat: false,
    hostAutoTriggerCount: 0,
    hostCombatVisualDamage: undefined,
    hostCombatDeadCardIds: [],
    selectedHostCreatureId: undefined,
    selectedPlayerCreatureId: undefined,
  });
}

function runHostCombatEventSequence(events: HostAttackEvent[], index: number, sequenceId: number): void {
  if (sequenceId !== hostCombatSequenceId) return;
  if (useGameStore.getState().game.winner) {
    releaseHostCombatPresentationAfterDefeat();
    return;
  }
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
  const customAnimation = attacker
    ? blocker
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
      : resolvePersonalAttackAnimation(attacker, event.playerDamage, "playerLife")
    : undefined;
  const impactMs = customAnimation?.impactMs ?? HOST_ATTACK_ANIMATION_MS - 35;
  const durationMs = customAnimation?.durationMs ?? HOST_ATTACK_ANIMATION_MS;
  if (blocker) playCardVoiceInteraction({ type: "BLOCKS", card: blocker });
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
          targetId: "targetId" in customAnimation ? customAnimation.targetId : undefined,
          targetKind: "targetKind" in customAnimation ? customAnimation.targetKind : "card",
          amount: customAnimation.effect.amount,
          variant: customAnimation.effect.variant,
          scale: customAnimation.effect.scale,
          sourceMoves: customAnimation.effect.sourceMoves,
          ...(customAnimation.effect.projectileCount === undefined
            ? {}
            : { projectileCount: customAnimation.effect.projectileCount }),
          ...(customAnimation.effect.projectileOrigin === undefined
            ? {}
            : { projectileOrigin: customAnimation.effect.projectileOrigin }),
          ...(customAnimation.effect.projectileGapMs === undefined
            ? {}
            : { projectileGapMs: customAnimation.effect.projectileGapMs }),
        }
      : undefined,
  });

  if (customAnimation?.effect.type === "fireball") {
    window.setTimeout(() => {
      if (sequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
      useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
    }, customAnimation.castMs);
  }

  if (event.blockerDies) {
    window.setTimeout(() => {
      if (sequenceId !== hostCombatSequenceId || useGameStore.getState().game.winner) return;
      useAudioStore.getState().playSfx("defend");
    }, customAnimation?.impactMs ?? HOST_ATTACK_CONTACT_MS);
  }

  window.setTimeout(() => {
    if (sequenceId !== hostCombatSequenceId) return;
    if (customAnimation?.effect.type === "fireball") {
      useAudioStore.getState().playSfx(fireballHitSfx);
    }
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = applyHostAttackEvent(previous, event);
      // La derrota ya es verdad en el impacto, pero la presentación del ataque conserva su beat
      // completo. El callback de `durationMs` limpia la animación sólo después de que el atacante
      // regresó a su slot; entonces `Board` puede montar el quiebre sin cortar el movimiento.
      checkWinLoss(next);
      const gainedLife = next.player.life > previous.player.life;
      if (gainedLife) useAudioStore.getState().playSfx("buff");
      notifyDiscardEffects(previous, next);
      // Field losses are observed centrally for combat and every effect path. Direct
      // damage still tips the Future here because no card changes zones for that hit.
      const dialTurn = event.playerDamage > 0 ? -DESTINY_DIAL_STEP : 0;
      return {
        game: next,
        ...(dialTurn === 0
          ? {}
          : {
              destinyDial: state.destinyDial + dialTurn,
              destinyDialRevision: state.destinyDialRevision + 1,
            }),
        hostCombatVisualDamage: nextVisualDamage(event),
        hostCombatDeadCardIds: nextDeadCardIds(event),
        ...(gainedLife ? startLifeBuffBeat() : {}),
      };
    });
  }, impactMs);

  window.setTimeout(() => {
    if (sequenceId !== hostCombatSequenceId) return;
    const gameEnded = Boolean(useGameStore.getState().game.winner);
    useGameStore.setState({
      hostAttackAnimation: undefined,
      burnAnimation: undefined,
      burnImpactCardId: undefined,
      burnImpactCardIds: [],
    });
    if (gameEnded) {
      // Board es la única autoridad que hace la limpieza global de una derrota. Aquí sólo se
      // libera el combate que ya terminó; así la reacción de Vida, el dial y cualquier VFX local
      // conservan sus propios finales antes de que se tome la captura.
      releaseHostCombatPresentationAfterDefeat();
      return;
    }
    scheduleQueuedCombatReactions(() => {
      if (sequenceId !== hostCombatSequenceId) return;
      if (useGameStore.getState().game.winner) {
        releaseHostCombatPresentationAfterDefeat();
        return;
      }
      useGameStore.setState({ hostCombatDeadCardIds: [] });
      runHostCombatEventSequence(events, index + 1, sequenceId);
    });
  }, durationMs);
}

function scheduleQueuedCombatReactions(onComplete: () => void): void {
  if (useGameStore.getState().game.winner) {
    onComplete();
    return;
  }
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
  if (combatSequenceId !== hostCombatSequenceId) return;
  if (useGameStore.getState().game.winner) {
    releaseHostCombatPresentationAfterDefeat();
    return;
  }
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
        scale: resolveCardBurnScale(source?.definitionId),
        renderer: resolveBurnRenderer(source?.definitionId),
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
        useGameStore.setState((current) => {
          const next = resolvePendingHostCombatDamageVolleys(current.game);
          return { game: next, lifeDamageAnimationId: Date.now() };
        });
      }, COMBAT_VOLLEY_IMPACT_MS + projectileDelay);
    }

    window.setTimeout(() => {
      if (sequenceId !== hostSequenceEpoch() || combatSequenceId !== hostCombatSequenceId) return;
      useGameStore.setState({ burnAnimation: undefined });
      if (useGameStore.getState().game.winner) {
        releaseHostCombatPresentationAfterDefeat();
        return;
      }
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
  playerCombatSequenceId += 1;
  resetHostSequence();
  resetPlayerTriggerSequence();
  resetPresentationEffectTimers();
  guidedSessionStore.invalidate("presentation-reset");
  guidedPresentationActivity.reset();

  if (defensePhaseBannerTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(defensePhaseBannerTimer);
  }
  defensePhaseBannerTimer = undefined;
  defensePhaseBannerActivity = undefined;

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

function hasDeferredPresentationEvents(game: GameState): boolean {
  return game.eventQueue.some((event) => event.payload?.deferForPresentation === true);
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
  const sessionId = useGameStore.getState().gameSessionId;
  window.setTimeout(() => fireManualTriggerOverlay(manualTriggeredCard, sessionId), startDelayMs);
}

// `.effect-card-lifted`/`.effect-card-activating` (the pulse this triggers) animate the same
// `transform`/`filter` on the same card slot as the field summon "pop" animation.
// The fixed delay callers pass is usually enough clearance, but under main-thread jank the pulse
// can still start while the pop is mid-flight and cut it short. Wait for summoningAnimationCount
// to actually drop to 0 (with a bounded safety clear already in the store) instead of guessing.
function fireManualTriggerOverlay(manualTriggeredCard: CardInstance, sessionId: number): void {
  const current = useGameStore.getState();
  if (current.gameSessionId !== sessionId) return;
  if (current.game.winner) {
    useGameStore.setState((state) => ({
      pendingTriggeredEffectCount: Math.max(0, state.pendingTriggeredEffectCount - 1),
      pendingTriggeredEffectSourceId: undefined,
    }));
    return;
  }
  const latest = current.game;
  if (!findBattlefieldCard(latest, manualTriggeredCard.instanceId)) {
    useGameStore.setState((state) => ({
      pendingTriggeredEffectCount: Math.max(0, state.pendingTriggeredEffectCount - 1),
      pendingTriggeredEffectSourceId: undefined,
    }));
    return;
  }
  if (current.summoningAnimationCount > 0) {
    window.setTimeout(
      () => fireManualTriggerOverlay(manualTriggeredCard, sessionId),
      MANUAL_TRIGGER_SUMMON_WAIT_POLL_MS,
    );
    return;
  }
  useAudioStore.getState().playSfx("activateEffect");
  useGameStore.getState().triggerEffectActivationPulse(manualTriggeredCard.instanceId);
  window.setTimeout(() => {
    const latestStore = useGameStore.getState();
    if (latestStore.gameSessionId !== sessionId || latestStore.game.winner) return;
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
  const initialState = useGameStore.getState();
  if (initialState.game.winner) return;
  const sessionId = initialState.gameSessionId;
  useGameStore.setState((state) => ({ hostAutoTriggerCount: state.hostAutoTriggerCount + 1 }));
  useAudioStore.getState().playSfx("activateEffect");
  for (const source of sources) useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
  useToastStore.getState().pushToast({
    title: uiText("toast.hostEffect"),
    message: sources.length === 1 ? cardPlayedReactionMessage(sources[0]) : uiText("toast.hostResolves"),
    tone: "host",
  });
  window.setTimeout(() => {
    const latestStore = useGameStore.getState();
    if (latestStore.gameSessionId !== sessionId) return;
    if (latestStore.game.winner) {
      useGameStore.setState((state) => ({
        hostAutoTriggerCount: Math.max(0, state.hostAutoTriggerCount - 1),
      }));
      return;
    }
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
    if (manualTriggeredCard && !useGameStore.getState().game.winner) {
      scheduleManualTriggerOverlay(manualTriggeredCard, MANUAL_TRIGGER_AFTER_REACTION_MS);
    }
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
    deferPresentationEvents: true,
  });
  const castSucceeded = next.lastActionResult?.ok === true;
  const previousHandIds = new Set(game.player.hand.map((item) => item.instanceId));
  const drawnCardIds = castSucceeded
    ? next.player.hand.filter((item) => !previousHandIds.has(item.instanceId)).map((item) => item.instanceId)
    : [];
  const playerTriggersQueued = castSucceeded && hasQueuedPlayerTriggers(next);
  const presentationEventsQueued = castSucceeded && hasDeferredPresentationEvents(next);
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
  const afterCommit = presentationEventsQueued
    ? () => scheduleQueuedHostTriggers(() => {
        if (manualTriggeredCard) scheduleManualTriggerOverlay(manualTriggeredCard, MANUAL_TRIGGER_AFTER_REACTION_MS);
      })
    : playerTriggersQueued
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
  const sourceDamageActor = isSourceDamageSpell
    ? [...game.player.field, ...game.host.field].find((candidate) => candidate.instanceId === friendlyId)
    : undefined;
  const sourceDamageTarget = isSourceDamageSpell
    ? [...game.player.field, ...game.host.field].find((candidate) => candidate.instanceId === enemyId)
    : undefined;
  const personalSourceDamageAnimation = sourceDamageActor && sourceDamageTarget
    ? resolvePersonalTargetedAttackAnimation(
        sourceDamageActor,
        sourceDamageTarget,
        getPowerEndurance(game, sourceDamageActor).power,
      )
    : undefined;
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
      deferSourceDamageResolution?: boolean;
    } = {},
  ) => {
    const readySourceIds = new Set(latest.player.field.filter((item) => item.kinds.includes("SOURCE") && !item.exhausted).map((item) => item.instanceId));
    const reactionSources = findCardPlayedReactionSources(latest, card);
    const next = castCard(latest, handId, {
      targets,
      deferPlayerTriggers: lifeCostAmount(card.additionalCost, latest.player.life) > 0 || isTargetDamageSpell || isDestroySpell,
      deferReactiveTriggers: reactionSources.length > 0 || isDestroySpell,
      deferFightResolution: presentation.deferFightResolution,
      deferSourceDamageResolution: presentation.deferSourceDamageResolution,
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
  if (isSourceDamageSpell && personalSourceDamageAnimation) {
    const staged = resolveSpell(game, { deferSourceDamageResolution: true });
    const stagedGame = staged.game;
    const castSucceeded = stagedGame?.lastActionResult?.ok === true;
    if (!castSucceeded || !stagedGame) {
      return {
        ...staged,
        spellTargeting: undefined,
        selectedHandId: undefined,
        focusedCardId: undefined,
      };
    }

    const animationEventId = Date.now();
    const animationId = `personal-source-damage-${handId}-${animationEventId}`;
    const gameSessionId = state.gameSessionId;
    const effect = personalSourceDamageAnimation.effect;
    const sourceDamageEffects = card.effects.filter((candidate) => hasEffectPresentation([candidate], "sourceDamage"));
    const burnAnimation = personalCardAttackBurnAnimation(personalSourceDamageAnimation, animationId);

    if (effect.type === "fireball") {
      window.setTimeout(() => {
        const current = useGameStore.getState();
        if (
          current.gameSessionId !== gameSessionId ||
          current.pendingSpellHandId !== handId ||
          current.spellFightAnimation?.eventId !== animationEventId
        ) return;
        useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
      }, personalSourceDamageAnimation.castMs);
    } else {
      useAudioStore.getState().playSfx("attack");
    }

    window.setTimeout(() => {
      const current = useGameStore.getState();
      if (
        current.gameSessionId !== gameSessionId ||
        current.pendingSpellHandId !== handId ||
        current.spellFightAnimation?.eventId !== animationEventId
      ) return;
      if (effect.type === "fireball") useAudioStore.getState().playSfx(fireballHitSfx);

      const next = structuredClone(current.game) as GameState;
      const spellSource = next.player.memory.find((candidate) => candidate.instanceId === handId) ?? card;
      resolveEffects(next, sourceDamageEffects, {
        source: spellSource,
        side: "player",
        targets,
      });
      useGameStore.setState({
        game: next,
        specialDeadCardIds: findMarkedCreatureIds(next),
      });
    }, personalSourceDamageAnimation.impactMs);

    window.setTimeout(() => {
      const current = useGameStore.getState();
      if (
        current.gameSessionId !== gameSessionId ||
        current.pendingSpellHandId !== handId ||
        current.spellFightAnimation?.eventId !== animationEventId
      ) return;
      const next = structuredClone(current.game) as GameState;
      destroyMarkedCreatures(next);
      useGameStore.setState({ game: next, specialDeadCardIds: [] });
      scheduleQueuedHostTriggers();
    }, personalSourceDamageAnimation.impactMs + 260);

    window.setTimeout(() => {
      useGameStore.setState((current) => {
        if (
          current.gameSessionId !== gameSessionId ||
          current.pendingSpellHandId !== handId ||
          current.spellFightAnimation?.eventId !== animationEventId
        ) return {};
        return {
          spellFightAnimation: undefined,
          pendingSpellHandId: undefined,
          burnAnimation: current.burnAnimation?.id === animationId ? undefined : current.burnAnimation,
        };
      });
    }, personalSourceDamageAnimation.durationMs);

    return {
      ...staged,
      spellTargeting: undefined,
      selectedHandId: undefined,
      focusedCardId: undefined,
      pendingSpellHandId: handId,
      spellFightAnimation: {
        friendlyId,
        enemyId,
        enemyMoves: false,
        eventId: animationEventId,
        customAnimation: personalSourceDamageAnimation,
      },
      burnAnimation,
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
  const stagedGame = staged.game;
  const castSucceeded = stagedGame?.lastActionResult?.ok === true;
  const personalFightActor = castSucceeded && stagedGame
    ? [...stagedGame.player.field, ...stagedGame.host.field].find((candidate) => candidate.instanceId === friendlyId)
    : undefined;
  const personalFightTarget = castSucceeded && stagedGame
    ? [...stagedGame.player.field, ...stagedGame.host.field].find((candidate) => candidate.instanceId === enemyId)
    : undefined;
  const personalFightAnimation = stagedGame && personalFightActor && personalFightTarget
    ? resolvePersonalTargetedAttackAnimation(
        personalFightActor,
        personalFightTarget,
        getPowerEndurance(stagedGame, personalFightActor).power,
      )
    : undefined;
  const gameSessionId = state.gameSessionId;
  if (castSucceeded) {
    window.setTimeout(() => {
      const current = useGameStore.getState();
      if (current.gameSessionId !== gameSessionId || current.pendingSpellHandId !== handId) return;

      if (personalFightAnimation) {
        const animationEventId = Date.now();
        const animationId = `personal-spell-fight-${handId}-${animationEventId}`;
        const effect = personalFightAnimation.effect;
        const burnAnimation = personalCardAttackBurnAnimation(personalFightAnimation, animationId);
        const fightEffects = card.effects.filter((candidate) => hasEffectPresentation([candidate], "fight"));

        useGameStore.setState({
          spellFightAnimation: {
            friendlyId,
            enemyId,
            enemyMoves: true,
            eventId: animationEventId,
            customAnimation: personalFightAnimation,
          },
          burnAnimation,
        });

        if (effect.type === "fireball") {
          window.setTimeout(() => {
            const castState = useGameStore.getState();
            if (
              castState.gameSessionId !== gameSessionId ||
              castState.pendingSpellHandId !== handId ||
              castState.spellFightAnimation?.eventId !== animationEventId
            ) return;
            useAudioStore.getState().playSfx(pickRandomSfx(fireballCastSfx));
          }, personalFightAnimation.castMs);
        } else {
          useAudioStore.getState().playSfx("attack");
        }

        window.setTimeout(() => {
          const impactState = useGameStore.getState();
          if (
            impactState.gameSessionId !== gameSessionId ||
            impactState.pendingSpellHandId !== handId ||
            impactState.spellFightAnimation?.eventId !== animationEventId
          ) return;
          if (effect.type === "fireball") useAudioStore.getState().playSfx(fireballHitSfx);

          const next = structuredClone(impactState.game) as GameState;
          const source = next.player.memory.find((candidate) => candidate.instanceId === handId) ?? card;
          resolveEffects(next, fightEffects, {
            source,
            side: "player",
            targets,
          });
          useGameStore.setState({
            game: next,
            specialDeadCardIds: findMarkedCreatureIds(next),
          });
        }, personalFightAnimation.impactMs);

        window.setTimeout(() => {
          const deathState = useGameStore.getState();
          if (
            deathState.gameSessionId !== gameSessionId ||
            deathState.pendingSpellHandId !== handId ||
            deathState.spellFightAnimation?.eventId !== animationEventId
          ) return;
          const next = structuredClone(deathState.game) as GameState;
          destroyMarkedCreatures(next);
          useGameStore.setState({ game: next, specialDeadCardIds: [] });
          scheduleQueuedHostTriggers();
        }, personalFightAnimation.impactMs + SPELL_FIGHT_DEATH_FADE_MS);

        window.setTimeout(() => {
          useGameStore.setState((completeState) => {
            if (
              completeState.gameSessionId !== gameSessionId ||
              completeState.pendingSpellHandId !== handId ||
              completeState.spellFightAnimation?.eventId !== animationEventId
            ) return {};
            return {
              spellFightAnimation: undefined,
              pendingSpellHandId: undefined,
              burnAnimation: completeState.burnAnimation?.id === animationId
                ? undefined
                : completeState.burnAnimation,
            };
          });
        }, personalFightAnimation.durationMs);
        return;
      }

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
