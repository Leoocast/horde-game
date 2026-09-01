import type { GameState } from "../engine/GameTypes";
import type { TranslationKey } from "../i18n/translations";
import type {
  GuidedCalloutPlacement,
  GuidedGlossaryTermId,
  GuidedHighlightRole,
  GuidedSurfaceAnchor,
} from "./contracts";
import type { GameplaySignal, GameplaySignalDraft } from "./gameplaySignals";
import type { GameplayIntent } from "./interactionGate";

export const CONTEXTUAL_INTERVENTION_POLICIES = ["informative", "preventive", "reactive"] as const;
export type ContextualInterventionPolicy = (typeof CONTEXTUAL_INTERVENTION_POLICIES)[number];

export type ContextualHighlightRef =
  | Readonly<{
      kind: "card";
      instanceId: string;
      role?: GuidedHighlightRole;
      padding?: number;
      offsetX?: number;
      offsetY?: number;
      showHighlight?: boolean;
    }>
  | Readonly<{
      kind: "surface";
      anchor: GuidedSurfaceAnchor;
      role?: GuidedHighlightRole;
      padding?: number;
      offsetX?: number;
      offsetY?: number;
      showHighlight?: boolean;
    }>;

export type ContextualConceptCopy = Readonly<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  glossaryTerms?: readonly GuidedGlossaryTermId[];
}>;

/** Stable semantic facts available to authored concept matchers. */
export type ContextualRuntimeContext = Readonly<{
  game: GameState;
  gameSessionId: string;
  presentationReady: boolean;
  guidedActive: boolean;
  targetingActive: boolean;
  blockers: readonly string[];
}>;

export type ContextualConceptMatch = Readonly<{
  highlights?: readonly ContextualHighlightRef[];
  placement?: GuidedCalloutPlacement;
  /** Optional semantic anchor used only to position the callout, never to draw another ring. */
  placementAnchor?: ContextualHighlightRef;
  /** Optional authored discriminator retained for diagnostics; concepts still dedupe by ID. */
  occurrenceKey?: string;
}>;

export type ContextualConceptDefinition = Readonly<{
  id: string;
  revision: number;
  policy: ContextualInterventionPolicy;
  /** Some explanations describe a just-committed state and must temporarily own the whole board. */
  blocksGameplayWhileVisible?: boolean;
  /** Tutorial journeys normally isolate progress; transferable fundamentals may opt into acknowledgement. */
  persistWhenAcknowledgedInIsolated?: boolean;
  /** Larger values are presented first when several signals arrive in the same synchronous beat. */
  priority: number;
  copy: ContextualConceptCopy;
  signalKinds: readonly GameplaySignalDraft["kind"][];
  evaluate(signal: GameplaySignal, context: ContextualRuntimeContext): ContextualConceptMatch | undefined;
  /** A stale queued explanation is discarded instead of being shown out of context. */
  revalidate?(match: ContextualConceptMatch, context: ContextualRuntimeContext): boolean;
  /** Required by preventive concepts; returning a match intercepts only this intent. */
  prevent?(intent: GameplayIntent, context: ContextualRuntimeContext): ContextualConceptMatch | undefined;
}>;

export type ContextualQueuedConcept = Readonly<{
  definition: ContextualConceptDefinition;
  match: ContextualConceptMatch;
  triggerCursor: number;
  enqueuedOrder: number;
}>;

export type ContextualConceptPresentation = Readonly<{
  conceptId: string;
  revision: number;
  policy: ContextualInterventionPolicy;
  blocksGameplayWhileVisible?: boolean;
  copy: ContextualConceptCopy;
  highlights: readonly ContextualHighlightRef[];
  placement?: GuidedCalloutPlacement;
  placementAnchor?: ContextualHighlightRef;
  triggerCursor: number;
}>;
