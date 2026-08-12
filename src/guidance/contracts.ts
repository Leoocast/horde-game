import type { DifficultyMode, Phase, Side } from "../engine/GameTypes";
import type { TranslationKey } from "../i18n/translations";

export const GUIDED_LESSON_SCHEMA_VERSION = 1 as const;

export type GuidedLessonMode = "required" | "optional";
export type GuidedCardAlias = string;

export type GuidedCardState = Readonly<{
  exhausted?: boolean;
  stabilizing?: boolean;
  activatedThisTurn?: boolean;
  enteredThisTurn?: boolean;
  damageMarked?: number;
  attacksMade?: number;
  counters?: Readonly<Record<string, number>>;
}>;

export type GuidedCardSpec = Readonly<{
  cardKey: string;
  state?: GuidedCardState;
}>;

/**
 * Every list is authored in its final runtime order. `openingDeal` becomes the Hand and preserves
 * its appearance order. Both Archive arrays are top-to-bottom: index zero is consumed next.
 */
export type GuidedScenarioZones = Readonly<{
  openingDeal: readonly GuidedCardAlias[];
  playerArchiveTopToBottom: readonly GuidedCardAlias[];
  playerField: readonly GuidedCardAlias[];
  playerMemory: readonly GuidedCardAlias[];
  playerOblivion: readonly GuidedCardAlias[];
  hostArchiveTopToBottom: readonly GuidedCardAlias[];
  hostField: readonly GuidedCardAlias[];
  hostMemory: readonly GuidedCardAlias[];
  hostOblivion: readonly GuidedCardAlias[];
}>;

export type GuidedScenarioCombat = Readonly<{
  playerAttackers: readonly GuidedCardAlias[];
  hostAttackers: readonly GuidedCardAlias[];
  blockers: Readonly<Record<GuidedCardAlias, readonly GuidedCardAlias[]>>;
}>;

export type GuidedScenarioRecipe = Readonly<{
  seed: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
  activeSide: Side;
  phase: Phase;
  turnNumber: number;
  hostTurnNumber: number;
  /** Original Preparation length used by the persistent progress UI. */
  setupTurnsTotal: number;
  setupTurnsRemaining: number;
  setupCompletePendingHost: boolean;
  openingHandAccepted: boolean;
  mulligansTaken: number;
  player: Readonly<{
    life: number;
    availableEnergy: number;
    storedEnergy: number;
    pendingStoredEnergy: number;
    energyActionUsedThisTurn: boolean;
    lifePaidThisTurn: number;
    lifeLostThisTurn: number;
  }>;
  host: Readonly<{
    poisonCounters: number;
  }>;
  zones: GuidedScenarioZones;
  combat: GuidedScenarioCombat;
}>;

export const GUIDED_SURFACE_ANCHORS = [
  "opening.hand",
  "opening.primaryAction",
  "selection.primaryAction",
  "selection.cancelAction",
  "setup.progress",
  "phase.primaryAction",
  "phase.selectAllAction",
  "phase.cancelAction",
  "player.hand",
  "player.field",
  "player.archive",
  "player.memory",
  "player.sources",
  "player.reserve",
  "player.life",
  "host.field",
  "host.archive",
  "host.memory",
  "card.preview",
] as const;

export type GuidedSurfaceAnchor = (typeof GUIDED_SURFACE_ANCHORS)[number];

export const GUIDED_HIGHLIGHT_ROLES = ["focus", "origin", "destination"] as const;
export type GuidedHighlightRole = (typeof GUIDED_HIGHLIGHT_ROLES)[number];

export type GuidedHighlightRef =
  | Readonly<{ kind: "card"; alias: GuidedCardAlias; role?: GuidedHighlightRole }>
  | Readonly<{ kind: "surface"; anchor: GuidedSurfaceAnchor; role?: GuidedHighlightRole }>;

/**
 * Authored action names. Phase 2 maps these to the store's real GameplayIntent union. Mulligan is
 * intentionally not authorable until a later schema can prescribe every replacement Hand exactly.
 */
export const GUIDED_INTENT_KINDS = [
  "opening.accept",
  "card.inspect",
  "card.play",
  "source.recycle",
  "ability.activate",
  "target.choose",
  "target.deselect",
  "target.cancel",
  "target.confirm",
  "discard.choose",
  "discard.deselect",
  "discard.confirm",
  "phase.continueSetup",
  "phase.awakenHost",
  "phase.resolveHost",
  "phase.startPlayerTurn",
  "phase.chooseAttackers",
  "phase.passCombat",
  "phase.endTurn",
  "combat.toggleAttacker",
  "combat.selectAllAttackers",
  "combat.cancelAttackers",
  "combat.confirmArchiveAttack",
  "combat.assignBlocker",
  "combat.cancelBlocks",
  "combat.confirmDefense",
] as const;

export type GuidedIntentKind = (typeof GUIDED_INTENT_KINDS)[number];

export const GUIDED_INTENT_CONTEXTS = [
  "spell",
  "trigger",
  "tribute",
  "hand-limit",
] as const;

export type GuidedIntentContext = (typeof GUIDED_INTENT_CONTEXTS)[number];

export type GuidedBlockAssignment = Readonly<{
  blockerAlias: GuidedCardAlias;
  attackerAlias: GuidedCardAlias;
}>;

export type GuidedIntentSpec = Readonly<{
  kind: GuidedIntentKind;
  context?: GuidedIntentContext;
  cardAlias?: GuidedCardAlias;
  targetAlias?: GuidedCardAlias;
  targetAliases?: readonly GuidedCardAlias[];
  assignments?: readonly GuidedBlockAssignment[];
  abilityId?: string;
  selected?: boolean;
}>;

/** Authored outcomes. Phase 2 provides the ephemeral receipts that satisfy these matchers. */
export const GUIDED_RECEIPT_KINDS = [
  "opening.accepted",
  "card.inspected",
  "card.played",
  "source.played",
  "source.recycled",
  "ability.activated",
  "targeting.started",
  "target.selected",
  "target.deselected",
  "target.cancelled",
  "target.confirmed",
  "discard.selected",
  "discard.deselected",
  "discard.completed",
  "setup.stepEnded",
  "phase.changed",
  "player.drew",
  "player.discarded",
  "reserve.released",
  "host.resolved",
  "attacker.selected",
  "attackers.selected",
  "attackers.cancelled",
  "archiveAttack.confirmed",
  "blocker.assigned",
  "blocker.unassigned",
  "blocks.cancelled",
  "defense.confirmed",
  "hostArchive.discarded",
] as const;

export type GuidedReceiptKind = (typeof GUIDED_RECEIPT_KINDS)[number];

export type GuidedReceiptSpec = Readonly<{
  kind: GuidedReceiptKind;
  cardAlias?: GuidedCardAlias;
  targetAlias?: GuidedCardAlias;
  targetAliases?: readonly GuidedCardAlias[];
  assignments?: readonly GuidedBlockAssignment[];
  amount?: number;
  reason?: string;
}>;

export const GUIDED_PRECONDITION_KINDS = [
  "card.inZone",
  "phase.is",
  "side.isActive",
  "setup.remaining",
  "energy.available",
  "energy.stored",
] as const;

export type GuidedPrecondition =
  | Readonly<{ kind: "card.inZone"; cardAlias: GuidedCardAlias; side: Side; zone: "archive" | "hand" | "field" | "memory" | "oblivion" }>
  | Readonly<{ kind: "phase.is"; phase: Phase }>
  | Readonly<{ kind: "side.isActive"; side: Side }>
  | Readonly<{ kind: "setup.remaining"; amount: number }>
  | Readonly<{ kind: "energy.available"; amount: number }>
  | Readonly<{ kind: "energy.stored"; amount: number }>;

export type GuidedStepCopy = Readonly<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}>;

export const GUIDED_CALLOUT_VISIBILITIES = ["visible", "hidden"] as const;
export type GuidedCalloutVisibility = (typeof GUIDED_CALLOUT_VISIBILITIES)[number];

/** Optional authored teaching aid. It renders resolved card copies without changing game state. */
export type GuidedCardComparison = Readonly<{
  kind: "cardComparison";
  cardAliases: readonly GuidedCardAlias[];
  emphasis: "energyCost";
}>;

type GuidedStepBase = Readonly<{
  id: string;
  copy: GuidedStepCopy;
  highlights: readonly GuidedHighlightRef[];
  callout?: GuidedCalloutVisibility;
  presentation?: GuidedCardComparison;
  preconditions?: readonly GuidedPrecondition[];
  nextStepId?: string;
}>;

export type GuidedExplainStep = GuidedStepBase & Readonly<{
  kind: "explain";
}>;

export type GuidedActStep = GuidedStepBase & Readonly<{
  kind: "act";
  allowedIntent: GuidedIntentSpec;
}>;

export type GuidedObserveStep = GuidedStepBase & Readonly<{
  kind: "observe";
  expectedReceipt?: GuidedReceiptSpec;
}>;

export type GuidedStep = GuidedExplainStep | GuidedActStep | GuidedObserveStep;

export type GuidedLessonDefinition = Readonly<{
  schemaVersion: typeof GUIDED_LESSON_SCHEMA_VERSION;
  id: string;
  revision: number;
  mode: GuidedLessonMode;
  startStepId: string;
  scenario: GuidedScenarioRecipe;
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>;
  steps: readonly GuidedStep[];
}>;
