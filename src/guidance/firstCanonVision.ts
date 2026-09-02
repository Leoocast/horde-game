import { matchOriginCanonCode, type MatchOrigin } from "../content/MatchOrigin";
import type { GameState } from "../engine/GameTypes";
import type { TranslationKey } from "../i18n/translations";
import type { MatchLaunchSource } from "../history/matchLifecycle";
import type { GameplayIntent } from "./interactionGate";
import { guidedJourneyCompleted, guidedProgressStore } from "./progress";

export const FIRST_CANON_VISION_CODE = "HF1-ELA-GRV-082-QC5" as const;
export const FIRST_CANON_OPENING_JOURNEY = Object.freeze({ id: "first-canon-opening", revision: 1 });
export const FIRST_CANON_STARTED_JOURNEY = Object.freeze({ id: "first-canon-started", revision: 1 });

export const FIRST_CANON_RECAPS = Object.freeze([
  Object.freeze({ conceptId: "empty-hand-draw", journeyId: "first-canon-recap.empty-hand-draw", revision: 1 }),
  Object.freeze({ conceptId: "return-source", journeyId: "first-canon-recap.return-source", revision: 1 }),
  Object.freeze({ conceptId: "flying-defense-restriction", journeyId: "first-canon-recap.flying", revision: 1 }),
  Object.freeze({ conceptId: "host-surge", journeyId: "first-canon-recap.surge", revision: 1 }),
]);

export type FirstCanonVisionStage =
  | "inactive"
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
  | "completed";

export type FirstCanonNarration = Readonly<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  anchor?: "setup.progress" | "phase.primaryAction";
}>;

export type FirstCanonVisionSnapshot = Readonly<{
  sessionId: string;
  stage: FirstCanonVisionStage;
  orderedSequenceActive: boolean;
  suppressOpeningCardInteraction: boolean;
  narration?: FirstCanonNarration;
}>;

const NARRATION_BY_STAGE: Partial<Record<FirstCanonVisionStage, FirstCanonNarration>> = {
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
  },
  "preparation-energy": {
    titleKey: "guided.firstCanon.preparationEnergyTitle",
    bodyKey: "guided.firstCanon.preparationEnergyBody",
    anchor: "setup.progress",
  },
  "host-awakening-warning": {
    titleKey: "guided.firstCanon.hostAwakeningTitle",
    bodyKey: "guided.firstCanon.hostAwakeningBody",
    anchor: "phase.primaryAction",
  },
};

export class FirstCanonVisionDirector {
  #stage: FirstCanonVisionStage = "inactive";
  #sessionId = "";
  #orderedSequenceActive = false;
  #sawPreparationBanner = false;
  #pendingHostAdvance = false;
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
    const completed = guidedJourneyCompleted(progress, FIRST_CANON_OPENING_JOURNEY);
    const previouslyStarted = guidedJourneyCompleted(progress, FIRST_CANON_STARTED_JOURNEY);
    if (sameFuture && input.source === "learn-to-play-handoff" && !previouslyStarted) {
      guidedProgressStore.markJourneyCompleted(FIRST_CANON_STARTED_JOURNEY.id, FIRST_CANON_STARTED_JOURNEY.revision);
    }
    const belongsToHandoffLineage = previouslyStarted || input.source === "learn-to-play-handoff";
    const eligibleSource = input.source === "learn-to-play-handoff"
      || input.source === "rewrite"
      || input.source === "history-replay";
    const orderedSequenceActive = sameFuture
      && eligibleSource
      && belongsToHandoffLineage
      && (!completed || !progress.preferences.hideSeenContextualHelp);

    this.#sessionId = input.sessionId;
    this.#orderedSequenceActive = orderedSequenceActive;
    this.#stage = orderedSequenceActive ? "opening-settling" : "inactive";
    this.#sawPreparationBanner = false;
    this.#pendingHostAdvance = false;
    this.#emit();
  }

  notifyOpeningCardsSettled(mulligansTaken: number): void {
    if (this.#stage === "opening-settling" && mulligansTaken === 0) {
      this.#stage = "opening-intro";
      this.#emit();
    } else if (this.#stage === "mulligan-settling" && mulligansTaken === 1) {
      this.#stage = "opening-confirmation";
      this.#emit();
    }
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
    if (
      this.#stage === "opening-settling"
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
    let awakenHost = false;
    switch (this.#stage) {
      case "opening-intro": this.#stage = "await-mulligan"; break;
      case "opening-confirmation": this.#stage = "opening-accept"; break;
      case "preparation-intro": this.#stage = "preparation-energy"; break;
      case "preparation-energy": this.#stage = "free-play"; break;
      case "host-awakening-warning":
        this.#stage = "completed";
        this.#pendingHostAdvance = true;
        awakenHost = true;
        guidedProgressStore.markJourneyCompleted(FIRST_CANON_OPENING_JOURNEY.id, FIRST_CANON_OPENING_JOURNEY.revision);
        break;
      default: return Object.freeze({ acknowledged: false, awakenHost: false });
    }
    this.#emit();
    return Object.freeze({ acknowledged: true, awakenHost });
  }

  consumePendingHostAdvance(game: GameState, presentationReady: boolean): boolean {
    if (!this.#pendingHostAdvance || !presentationReady) return false;
    if (game.activeSide !== "host" || game.phase !== "host") return false;
    this.#pendingHostAdvance = false;
    return true;
  }

  resetForTests(): void {
    this.#stage = "inactive";
    this.#sessionId = "";
    this.#orderedSequenceActive = false;
    this.#sawPreparationBanner = false;
    this.#pendingHostAdvance = false;
    this.#emit();
  }

  #blocked() {
    return Object.freeze({ allowed: false as const, conceptId: "first-canon-opening" });
  }

  #emit(): void {
    this.#snapshot = freezeSnapshot(this.#sessionId, this.#stage, this.#orderedSequenceActive);
    for (const listener of this.#listeners) listener();
  }
}

function freezeSnapshot(
  sessionId: string,
  stage: FirstCanonVisionStage,
  orderedSequenceActive: boolean,
): FirstCanonVisionSnapshot {
  return Object.freeze({
    sessionId,
    stage,
    orderedSequenceActive,
    suppressOpeningCardInteraction: stage === "opening-settling"
      || stage === "opening-intro"
      || stage === "mulligan-settling"
      || stage === "opening-confirmation",
    narration: NARRATION_BY_STAGE[stage] ? Object.freeze({ ...NARRATION_BY_STAGE[stage] }) : undefined,
  });
}

export const firstCanonVisionDirector = new FirstCanonVisionDirector();
