import { matchOriginCanonCode, type MatchOrigin } from "../content/MatchOrigin";
import type { GameState } from "../engine/GameTypes";
import type { TranslationKey } from "../i18n/translations";
import type { MatchLaunchSource } from "../history/matchLifecycle";
import type { GameplayIntent } from "./interactionGate";
import { guidedJourneyCompleted, guidedProgressStore } from "./progress";
import type { GuidedCalloutPlacement, GuidedSurfaceAnchor } from "./contracts";

export const FIRST_CANON_VISION_CODE = "HF1-ELA-GRV-082-QC5" as const;
export const FIRST_CANON_OPENING_JOURNEY = Object.freeze({ id: "first-canon-opening", revision: 1 });
export const FIRST_CANON_STARTED_JOURNEY = Object.freeze({ id: "first-canon-started", revision: 1 });

export type FirstCanonVisionStage =
  | "inactive"
  | "replay-choice-settling"
  | "replay-choice"
  | "opening-settling"
  | "opening-intro"
  | "await-mulligan"
  | "mulligan-settling"
  | "opening-confirmation"
  | "opening-accept"
  | "preparation-waiting"
  | "preparation-intro"
  | "preparation-energy"
  | "free-play"
  | "host-awakening-warning"
  | "host-awakening-commit"
  | "completed";

export type FirstCanonContextualHelpMode = "normal" | "pending" | "unseen" | "repeat";

export type FirstCanonNarration = Readonly<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  anchor?: GuidedSurfaceAnchor;
  placement?: GuidedCalloutPlacement;
  showFrameDuringNarration?: boolean;
}>;

export type FirstCanonVisionSnapshot = Readonly<{
  sessionId: string;
  stage: FirstCanonVisionStage;
  orderedSequenceActive: boolean;
  contextualHelpMode: FirstCanonContextualHelpMode;
  suppressOpeningCardInteraction: boolean;
  narration?: FirstCanonNarration;
}>;

const NARRATION_BY_STAGE: Partial<Record<FirstCanonVisionStage, FirstCanonNarration>> = {
  "replay-choice": {
    titleKey: "guided.firstCanon.replayChoiceTitle",
    bodyKey: "guided.firstCanon.replayChoiceBody",
  },
  "opening-intro": {
    titleKey: "guided.firstCanon.openingIntroTitle",
    bodyKey: "guided.firstCanon.openingIntroBody",
  },
  "opening-confirmation": {
    titleKey: "guided.firstCanon.openingConfirmationTitle",
    bodyKey: "guided.firstCanon.openingConfirmationBody",
  },
  "preparation-intro": {
    titleKey: "guided.firstCanon.preparationIntroTitle",
    bodyKey: "guided.firstCanon.preparationIntroBody",
    anchor: "setup.progress",
    placement: "right",
  },
  "preparation-energy": {
    titleKey: "guided.firstCanon.preparationEnergyTitle",
    bodyKey: "guided.firstCanon.preparationEnergyBody",
    anchor: "player.reserve",
    placement: "right",
  },
  "host-awakening-warning": {
    titleKey: "guided.firstCanon.hostAwakeningTitle",
    bodyKey: "guided.firstCanon.hostAwakeningBody",
    anchor: "phase.primaryAction",
    placement: "left",
    showFrameDuringNarration: false,
  },
};

export class FirstCanonVisionDirector {
  #stage: FirstCanonVisionStage = "inactive";
  #sessionId = "";
  #orderedSequenceActive = false;
  #contextualHelpMode: FirstCanonContextualHelpMode = "normal";
  #sawPreparationBanner = false;
  #listeners = new Set<() => void>();
  #snapshot = freezeSnapshot("", "inactive", false);

  snapshot(): FirstCanonVisionSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  beginLaunch(input: Readonly<{
    source: MatchLaunchSource;
    origin: MatchOrigin;
    sessionId: string;
  }>): void {
    const sameFuture = matchOriginCanonCode(input.origin) === FIRST_CANON_VISION_CODE;
    const progress = guidedProgressStore.snapshot();
    const previouslyStarted = guidedJourneyCompleted(progress, FIRST_CANON_STARTED_JOURNEY);
    if (sameFuture && !previouslyStarted) {
      guidedProgressStore.markJourneyCompleted(FIRST_CANON_STARTED_JOURNEY.id, FIRST_CANON_STARTED_JOURNEY.revision);
    }
    const replayChoiceRequired = sameFuture && previouslyStarted;

    this.#sessionId = input.sessionId;
    this.#orderedSequenceActive = sameFuture;
    this.#contextualHelpMode = sameFuture
      ? replayChoiceRequired ? "pending" : "repeat"
      : "normal";
    this.#stage = sameFuture
      ? replayChoiceRequired ? "replay-choice-settling" : "opening-settling"
      : "inactive";
    this.#sawPreparationBanner = false;
    this.#emit();
  }

  notifyOpeningCardsSettled(mulligansTaken: number): void {
    if (this.#stage === "replay-choice-settling" && mulligansTaken === 0) {
      this.#stage = "replay-choice";
      this.#emit();
    } else if (this.#stage === "opening-settling" && mulligansTaken === 0) {
      this.#stage = "opening-intro";
      this.#emit();
    } else if (this.#stage === "mulligan-settling" && mulligansTaken === 1) {
      this.#stage = "opening-confirmation";
      this.#emit();
    }
  }

  chooseReplayGuidance(choice: "guided" | "independent"): boolean {
    if (this.#stage !== "replay-choice") return false;
    this.#contextualHelpMode = choice === "guided" ? "repeat" : "unseen";
    this.#orderedSequenceActive = choice === "guided";
    this.#stage = choice === "guided" ? "opening-intro" : "inactive";
    this.#emit();
    return true;
  }

  refresh(game: GameState, blockers: readonly string[]): void {
    if (!this.#orderedSequenceActive) return;
    if (this.#stage === "await-mulligan" && game.mulligansTaken >= 1) {
      this.#stage = "mulligan-settling";
      this.#emit();
      return;
    }
    if (this.#stage === "opening-accept" && game.openingHandAccepted) {
      this.#stage = "preparation-waiting";
      this.#emit();
    }
    if (this.#stage !== "preparation-waiting") return;
    if (blockers.some((blocker) => blocker.startsWith("phase.banner"))) {
      this.#sawPreparationBanner = true;
      return;
    }
    if (this.#sawPreparationBanner && blockers.length === 0) {
      this.#stage = "preparation-intro";
      this.#emit();
    }
  }

  authorizeIntent(intent: GameplayIntent): Readonly<{ allowed: true } | { allowed: false; conceptId: string }> {
    if (!this.#orderedSequenceActive) return Object.freeze({ allowed: true });
    if (this.#stage === "await-mulligan") {
      if (intent.kind === "opening.mulligan") return Object.freeze({ allowed: true });
      if (intent.kind === "opening.accept") return this.#blocked();
      return Object.freeze({ allowed: true });
    }
    if (this.#stage === "opening-accept") {
      if (intent.kind === "opening.accept") return Object.freeze({ allowed: true });
      if (intent.kind === "opening.mulligan") return this.#blocked();
      return Object.freeze({ allowed: true });
    }
    if (this.#stage === "free-play" && intent.kind === "phase.awakenHost") {
      this.#stage = "host-awakening-warning";
      this.#emit();
      return this.#blocked();
    }
    if (this.#stage === "host-awakening-commit") {
      if (intent.kind !== "phase.awakenHost") return this.#blocked();
      this.#stage = "completed";
      guidedProgressStore.markJourneyCompleted(FIRST_CANON_OPENING_JOURNEY.id, FIRST_CANON_OPENING_JOURNEY.revision);
      this.#emit();
      return Object.freeze({ allowed: true });
    }
    if (
      this.#stage === "opening-settling"
      || this.#stage === "replay-choice-settling"
      || this.#stage === "replay-choice"
      || this.#stage === "opening-intro"
      || this.#stage === "mulligan-settling"
      || this.#stage === "opening-confirmation"
      || this.#stage === "preparation-waiting"
      || this.#stage === "preparation-intro"
      || this.#stage === "preparation-energy"
      || this.#stage === "host-awakening-warning"
    ) return this.#blocked();
    return Object.freeze({ allowed: true });
  }

  acknowledge(): Readonly<{ acknowledged: boolean; awakenHost: boolean }> {
    switch (this.#stage) {
      case "opening-intro": this.#stage = "await-mulligan"; break;
      case "opening-confirmation": this.#stage = "opening-accept"; break;
      case "preparation-intro": this.#stage = "preparation-energy"; break;
      case "preparation-energy": this.#stage = "free-play"; break;
      case "host-awakening-warning":
        this.#stage = "host-awakening-commit";
        break;
      default: return Object.freeze({ acknowledged: false, awakenHost: false });
    }
    this.#emit();
    return Object.freeze({ acknowledged: true, awakenHost: false });
  }

  resetForTests(): void {
    this.#stage = "inactive";
    this.#sessionId = "";
    this.#orderedSequenceActive = false;
    this.#contextualHelpMode = "normal";
    this.#sawPreparationBanner = false;
    this.#emit();
  }

  #blocked() {
    return Object.freeze({ allowed: false as const, conceptId: "first-canon-opening" });
  }

  #emit(): void {
    this.#snapshot = freezeSnapshot(
      this.#sessionId,
      this.#stage,
      this.#orderedSequenceActive,
      this.#contextualHelpMode,
    );
    for (const listener of this.#listeners) listener();
  }
}

function freezeSnapshot(
  sessionId: string,
  stage: FirstCanonVisionStage,
  orderedSequenceActive: boolean,
  contextualHelpMode: FirstCanonContextualHelpMode = "normal",
): FirstCanonVisionSnapshot {
  return Object.freeze({
    sessionId,
    stage,
    orderedSequenceActive,
    contextualHelpMode,
    suppressOpeningCardInteraction: stage === "replay-choice-settling"
      || stage === "replay-choice"
      || stage === "opening-settling"
      || stage === "opening-intro"
      || stage === "mulligan-settling"
      || stage === "opening-confirmation",
    narration: NARRATION_BY_STAGE[stage] ? Object.freeze({ ...NARRATION_BY_STAGE[stage] }) : undefined,
  });
}

export const firstCanonVisionDirector = new FirstCanonVisionDirector();
