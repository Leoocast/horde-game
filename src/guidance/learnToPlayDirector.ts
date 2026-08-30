import type { GameStore } from "../store/useGameStore";
import type { GuidedCardAlias } from "./contracts";
import { contextualTutorialRuntime } from "./contextualProductRuntime";
import type { GuidedInterventionOrchestrator } from "./interventionOrchestrator";
import { runGuidedSystemAction, type GameplayIntent } from "./interactionGate";
import { isGuidedPresentationSettled } from "./presentationSettled";
import { guidedPresentationActivity, guidedSessionStore } from "./runtime";
import { journeyIntentGate } from "./journeyIntentGate";
import { authoredHostTurnGate } from "./authoredHostTurn";
import { gameplaySignalStream } from "./gameplaySignals";
import { planLearnToPlayTerminalTurn } from "./learnToPlayTerminal";
import {
  LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION,
  LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION,
  LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION,
  LEARN_TO_PLAY_HARVESTER_INSPECTION,
  LEARN_TO_PLAY_OPENING_INTERVENTION,
  LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION,
  LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION,
} from "./learnToPlayPrologue";

export type LearnToPlayPrologueStage =
  | "inactive"
  | "opening"
  | "opening-combat-intro"
  | "opening-attack"
  | "opening-end"
  | "awaiting-defense"
  | "defense-intro"
  | "free-play"
  | "player-return-intro"
  | "inspection"
  | "awaiting-surge"
  | "surge"
  | "post-surge-turn"
  | "source-return"
  | "post-surge-free"
  | "terminal-awaiting-host"
  | "terminal"
  | "defeat";

export type LearnToPlayPrologueSnapshot = Readonly<{
  cursor: number;
  stage: LearnToPlayPrologueStage;
  gameSessionId?: string;
  suggestedAttackerId?: string;
  requiredSourceId?: string;
}>;

type DirectorHost = Readonly<{
  readStore(): GameStore;
}>;

export function learnToPlayHarvesterInspectionReady(
  game: GameStore["game"],
  bindings: Readonly<Record<GuidedCardAlias, string>>,
  completed: boolean,
): boolean {
  if (completed || game.hostTurnNumber >= game.hostRules.surgeTurn) return false;
  const vaelorEntered = game.player.field.some((card) => card.instanceId === bindings.vaelor);
  const harvesterPresent = game.host.field.some((card) => card.instanceId === bindings.harvester);
  const vaelorEffectPending = (game.eventQueue ?? []).some((event) => event.sourceId === bindings.vaelor);
  // The hidden observation at the start of the intervention owns the visual wait. Requiring a
  // particular set of other Echoes to have left the Field made the prompt depend on the exact
  // defense branch and could strand a replay. The authored effect itself is the stable semantic
  // boundary: its queued volley must have committed before presentation settling can open the cue.
  return vaelorEntered && harvesterPresent && !vaelorEffectPending;
}

export function learnToPlayFirstDefenseReady(
  game: GameStore["game"],
  started: boolean,
  completed: boolean,
): boolean {
  return !started
    && !completed
    && game.activeSide === "host"
    && game.hostTurnNumber <= 9
    && game.combat.hostAttackers.length > 0;
}

export function learnToPlayPlayerTurnActionCueReady(
  game: GameStore["game"],
  stage: LearnToPlayPrologueStage,
  contextualHelpPending: boolean,
): boolean {
  return !contextualHelpPending
    && stage === "free-play"
    && !game.winner
    && game.activeSide === "host"
    && game.hostTurnNumber === game.hostRules.surgeTurn - 1
    && game.combat.hostAttackers.length === 0;
}

export function learnToPlayReturnSourceRequired(
  game: GameStore["game"],
  bindings: Readonly<Record<GuidedCardAlias, string>>,
): boolean {
  const sourceId = bindings.post_surge_source;
  return game.hostTurnNumber === game.hostRules.surgeTurn
    && game.activeSide === "player"
    && !game.player.energyActionUsedThisTurn
    && game.player.hand.some((card) => card.instanceId === sourceId);
}

/** The empty-Hand explanation is informative globally, but this one tutorial gesture must wait. */
export function learnToPlaySourceRecycleBlockedByOpenHelp(
  intentKind: GameplayIntent["kind"],
  activeConceptId?: string,
): boolean {
  return intentKind === "source.recycle" && activeConceptId === "empty-hand-draw";
}

/** Coordinates authored milestones while every actual rule remains owned by GameStore/engine. */
export class LearnToPlayPrologueDirector {
  readonly #host: DirectorHost;
  readonly #interventions: GuidedInterventionOrchestrator;
  #bindings: Readonly<Record<GuidedCardAlias, string>> = Object.freeze({});
  #gameSessionId: string | undefined;
  #openingHostTurnNumber: number | undefined;
  #stage: LearnToPlayPrologueStage = "inactive";
  #cursor = 0;
  #snapshot: LearnToPlayPrologueSnapshot = Object.freeze({ cursor: 0, stage: "inactive" });
  #listeners = new Set<() => void>();
  #evaluationScheduled = false;
  #signalCursor = 0;
  #returnSourcePromptRequested = false;
  #firstDefenseStarted = false;
  #firstDefenseCompleted = false;
  #playerReturnPromptRequested = false;
  #playerReturnIntroStarted = false;
  #playerReturnIntroCompleted = false;
  #playerTurnTransitionStarted = false;
  #harvesterInspectionStarted = false;
  #harvesterInspectionCompleted = false;
  #returnSourceInterventionStarted = false;

  constructor(host: DirectorHost, interventions: GuidedInterventionOrchestrator) {
    this.#host = host;
    this.#interventions = interventions;
    guidedSessionStore.subscribe(() => this.refresh());
    guidedPresentationActivity.subscribe(() => this.refresh());
    contextualTutorialRuntime.subscribe(() => this.refresh());
    gameplaySignalStream.subscribe(() => this.refresh());
  }

  snapshot(): LearnToPlayPrologueSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(bindings: Readonly<Record<GuidedCardAlias, string>>, gameSessionId: string): void {
    this.stop();
    this.#bindings = Object.freeze({ ...bindings });
    this.#gameSessionId = gameSessionId;
    this.#openingHostTurnNumber = this.#host.readStore().game.hostTurnNumber;
    this.#signalCursor = gameplaySignalStream.snapshot().cursor;
    this.#returnSourcePromptRequested = false;
    this.#firstDefenseStarted = false;
    this.#firstDefenseCompleted = false;
    this.#playerReturnPromptRequested = false;
    this.#playerReturnIntroStarted = false;
    this.#playerReturnIntroCompleted = false;
    this.#playerTurnTransitionStarted = false;
    this.#harvesterInspectionStarted = false;
    this.#harvesterInspectionCompleted = false;
    this.#returnSourceInterventionStarted = false;
    journeyIntentGate.activate({
      journeyId: "learn-to-play",
      authorize: (intent) => {
        const game = this.#host.readStore().game;
        if (intent.kind === "source.recycle" && learnToPlaySourceRecycleBlockedByOpenHelp(
          intent.kind,
          contextualTutorialRuntime.snapshot().active?.conceptId,
        )) {
          return Object.freeze({
            allowed: false,
            guidanceId: "learn-to-play.empty-hand-help-open",
            relatedCardIds: Object.freeze([intent.cardId]),
          });
        }
        if (intent.kind === "phase.startPlayerTurn" && this.#playerReturnHandoffRequired(game)) {
          this.#requestPlayerReturnPrompt();
          return Object.freeze({
            allowed: false,
            guidanceId: "learn-to-play.player-turn-return",
          });
        }
        const vaelorId = this.#bindings.vaelor;
        const vaelorStillRequired = game.hostTurnNumber >= 9
          && game.activeSide === "player"
          && game.player.hand.some((card) => card.instanceId === vaelorId);
        if (vaelorStillRequired && (intent.kind === "phase.chooseAttackers" || intent.kind === "phase.endTurn")) {
          return Object.freeze({
            allowed: false,
            guidanceId: "learn-to-play.vaelor-required",
            relatedCardIds: Object.freeze([vaelorId]),
          });
        }
        if (this.#harvesterInspectionRequired(game)
          && (intent.kind === "phase.chooseAttackers" || intent.kind === "phase.endTurn")) {
          return Object.freeze({
            allowed: false,
            guidanceId: "learn-to-play.harvester-inspection-required",
            relatedCardIds: Object.freeze([this.#bindings.harvester]),
          });
        }
        const returnSourceId = this.#bindings.post_surge_source;
        const returnSourceRequired = learnToPlayReturnSourceRequired(game, this.#bindings);
        if (returnSourceRequired && (
          (intent.kind === "card.play" && intent.cardId === returnSourceId)
          || intent.kind === "phase.chooseAttackers"
          || intent.kind === "phase.passCombat"
          || intent.kind === "phase.endTurn"
        )) {
          this.#requestReturnSourcePrompt();
          return Object.freeze({
            allowed: false,
            guidanceId: "learn-to-play.return-source-required",
            relatedCardIds: Object.freeze([returnSourceId]),
          });
        }
        return Object.freeze({ allowed: true });
      },
    });
    authoredHostTurnGate.activate({
      journeyId: "learn-to-play",
      plan: (game) => {
        if (
          game.activeSide !== "host"
          || game.hostTurnNumber !== game.hostRules.surgeTurn
          || !game.player.energyActionUsedThisTurn
        ) return undefined;
        const terminal = planLearnToPlayTerminalTurn(game);
        return Object.freeze({
          revealCount: terminal.revealCount,
          reason: "learn-to-play.lost-future-collapse",
        });
      },
    });
    this.#setStage("opening");
    this.#interventions.start(LEARN_TO_PLAY_OPENING_INTERVENTION, this.#bindings, `${gameSessionId}:opening`);
  }

  stop(): void {
    journeyIntentGate.deactivate("learn-to-play");
    authoredHostTurnGate.deactivate("learn-to-play");
    this.#interventions.stop();
    this.#bindings = Object.freeze({});
    this.#gameSessionId = undefined;
    this.#openingHostTurnNumber = undefined;
    this.#signalCursor = gameplaySignalStream.snapshot().cursor;
    this.#returnSourcePromptRequested = false;
    this.#firstDefenseStarted = false;
    this.#firstDefenseCompleted = false;
    this.#playerReturnPromptRequested = false;
    this.#playerReturnIntroStarted = false;
    this.#playerReturnIntroCompleted = false;
    this.#playerTurnTransitionStarted = false;
    this.#harvesterInspectionStarted = false;
    this.#harvesterInspectionCompleted = false;
    this.#returnSourceInterventionStarted = false;
    this.#setStage("inactive");
  }

  refresh(): void {
    if (this.#evaluationScheduled || this.#stage === "inactive") return;
    this.#evaluationScheduled = true;
    queueMicrotask(() => {
      this.#evaluationScheduled = false;
      this.#evaluate();
    });
  }

  #evaluate(): void {
    if (this.#stage === "inactive") return;
    this.#consumeSignals();
    const store = this.#host.readStore();
    const session = guidedSessionStore.snapshot();
    if (this.#stage === "opening" && session.lessonId === LEARN_TO_PLAY_OPENING_INTERVENTION.id && session.status === "completed") {
      this.#setStage("opening-combat-intro");
    }
    if (this.#stage === "opening-combat-intro") {
      if (
        session.lessonId === LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION.id
        && session.status === "completed"
      ) {
        this.#setStage("opening-attack");
      } else if (
        session.status !== "running"
        && store.game.activeSide === "player"
        && store.game.phase === "combat"
        && isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())
      ) {
        contextualTutorialRuntime.suppressConceptsForSession([
          "attack-the-host-archive",
          "attack-exhausts-echo",
          "reserve-and-ready",
        ]);
        this.#interventions.start(
          LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION,
          this.#bindings,
          `${this.#gameSessionId}:first-battle`,
        );
      }
      if (this.#stage === "opening-combat-intro") return;
    }
    if (this.#stage === "opening-attack") {
      const openingTurnAlreadyPassed = store.game.activeSide === "host"
        || (this.#openingHostTurnNumber !== undefined
          && store.game.hostTurnNumber > this.#openingHostTurnNumber);
      if (openingTurnAlreadyPassed) {
        // The silent End Turn cue is presentation, not a rule checkpoint. A fast phase hand-off
        // can commit the real turn before the Director's queued evaluation installs that cue.
        // Recover from the committed GameState instead of stranding every later milestone.
        this.#setStage("awaiting-defense");
      } else if (
        store.game.activeSide === "player"
        && store.game.phase === "end"
        && session.status !== "running"
        && !contextualTutorialRuntime.snapshot().active
        && isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())
      ) {
        this.#setStage("opening-end");
        this.#interventions.start(
          LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION,
          this.#bindings,
          `${this.#gameSessionId}:end-opening-turn`,
        );
      }
      if (this.#stage === "opening-attack" || this.#stage === "opening-end") return;
    }
    if (
      this.#stage === "opening-end"
      && session.lessonId === LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION.id
      && session.status === "completed"
    ) {
      this.#setStage("awaiting-defense");
    }
    if (this.#stage === "opening-end") return;
    if (
      this.#firstDefenseStarted
      && !this.#firstDefenseCompleted
      && session.lessonId === LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.id
      && session.status === "completed"
    ) {
      this.#firstDefenseCompleted = true;
      this.#setStage("free-play");
    }
    if (
      learnToPlayFirstDefenseReady(store.game, this.#firstDefenseStarted, this.#firstDefenseCompleted)
      && session.status !== "running"
    ) {
      this.#firstDefenseStarted = true;
      this.#setStage("defense-intro");
      this.#interventions.start(
        LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION,
        this.#bindings,
        `${this.#gameSessionId}:first-defense`,
      );
      return;
    }
    if (this.#firstDefenseStarted && !this.#firstDefenseCompleted) return;
    if (
      this.#playerReturnIntroStarted
      && !this.#playerReturnIntroCompleted
      && session.lessonId === LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.id
      && session.status === "completed"
    ) {
      this.#playerReturnIntroCompleted = true;
      this.#setStage("free-play");
    }
    const playerReturnPromptReady = (
      this.#playerReturnPromptRequested
      && !this.#playerReturnIntroStarted
      && this.#firstDefenseCompleted
      && this.#stage === "free-play"
      && this.#playerReturnHandoffRequired(store.game)
    );
    if (playerReturnPromptReady) {
      if (session.status === "running") return;
      if (contextualTutorialRuntime.snapshot().active) {
        contextualTutorialRuntime.refresh();
        return;
      }
      if (!isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())) return;
      this.#playerReturnIntroStarted = true;
      this.#setStage("player-return-intro");
      this.#interventions.start(
        LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION,
        this.#bindings,
        `${this.#gameSessionId}:player-return`,
      );
      return;
    }
    if (
      this.#playerReturnIntroStarted
      && !this.#playerTurnTransitionStarted
      && session.lessonId === LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.id
      && session.status === "running"
      && session.currentStep?.id === "wait-for-energy-renewal"
    ) {
      this.#playerTurnTransitionStarted = true;
      runGuidedSystemAction(() => this.#host.readStore().finishHostTurn());
      return;
    }
    if (this.#playerReturnIntroStarted && !this.#playerReturnIntroCompleted) return;
    if (
      this.#harvesterInspectionStarted
      && !this.#harvesterInspectionCompleted
      && session.lessonId === LEARN_TO_PLAY_HARVESTER_INSPECTION.id
      && session.status === "completed"
    ) {
      this.#harvesterInspectionCompleted = true;
      this.#setStage("awaiting-surge");
    }
    if (
      learnToPlayHarvesterInspectionReady(store.game, this.#bindings, this.#harvesterInspectionCompleted)
      && !this.#harvesterInspectionStarted
      && session.status !== "running"
      && !contextualTutorialRuntime.snapshot().active
      && isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())
    ) {
      this.#harvesterInspectionStarted = true;
      this.#setStage("inspection");
      this.#interventions.start(
        LEARN_TO_PLAY_HARVESTER_INSPECTION,
        this.#bindings,
        `${this.#gameSessionId}:inspect-harvester`,
      );
      return;
    }
    if (this.#harvesterInspectionStarted && !this.#harvesterInspectionCompleted) return;
    if (
      (this.#stage === "free-play" || this.#stage === "awaiting-surge")
      && store.game.hostTurnNumber >= store.game.hostRules.surgeTurn
    ) {
      this.#setStage("surge");
    }
    if (this.#stage === "surge") {
      if (store.game.activeSide === "player" && store.game.hostTurnNumber === store.game.hostRules.surgeTurn) {
        this.#setStage("post-surge-turn");
      }
      return;
    }
    if (this.#stage === "post-surge-turn") {
      const sourceStillInHand = store.game.player.hand.some((card) => card.instanceId === this.#bindings.post_surge_source);
      if (!sourceStillInHand || store.game.player.energyActionUsedThisTurn) {
        this.#setStage("post-surge-free");
      } else if (this.#returnSourcePromptRequested) {
        this.#setStage("source-return");
        this.#startReturnSourceInterventionIfReady(store, session);
      }
      return;
    }
    if (this.#stage === "source-return") {
      const sourceStillInHand = store.game.player.hand.some((card) => card.instanceId === this.#bindings.post_surge_source);
      if (!sourceStillInHand || store.game.player.energyActionUsedThisTurn) {
        this.#setStage("post-surge-free");
        return;
      }
      this.#startReturnSourceInterventionIfReady(store, session);
      return;
    }
    if (this.#stage === "post-surge-free") {
      if (store.game.activeSide === "host") this.#setStage("terminal-awaiting-host");
      return;
    }
    if (this.#stage === "terminal-awaiting-host") {
      if (store.game.hostTurnNumber > store.game.hostRules.surgeTurn) this.#setStage("terminal");
      return;
    }
    if (this.#stage === "terminal") {
      if (store.game.winner === "host") this.#setStage("defeat");
      return;
    }
  }

  #harvesterInspectionRequired(game: GameStore["game"]): boolean {
    return learnToPlayHarvesterInspectionReady(game, this.#bindings, this.#harvesterInspectionCompleted);
  }

  #playerReturnHandoffRequired(game: GameStore["game"]): boolean {
    return this.#firstDefenseCompleted
      && !this.#playerReturnIntroCompleted
      && game.activeSide === "host"
      && this.#openingHostTurnNumber !== undefined
      && game.hostTurnNumber > this.#openingHostTurnNumber;
  }

  #consumeSignals(): void {
    const snapshot = gameplaySignalStream.snapshot();
    if (snapshot.cursor <= this.#signalCursor) return;
    for (const signal of gameplaySignalStream.signalsSince(this.#signalCursor, snapshot.sessionId)) {
      if (
        signal.kind === "intent.attempted"
        && signal.authorization === "journey-blocked"
        && signal.guidanceId === "learn-to-play.return-source-required"
      ) {
        this.#requestReturnSourcePrompt();
      }
    }
    this.#signalCursor = snapshot.cursor;
  }

  #startReturnSourceInterventionIfReady(
    store: GameStore,
    session: ReturnType<typeof guidedSessionStore.snapshot>,
  ): void {
    if (this.#returnSourceInterventionStarted) return;
    if (session.status === "running" || contextualTutorialRuntime.snapshot().active) return;
    if (!isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())) return;
    this.#returnSourceInterventionStarted = true;
    this.#interventions.start(
      LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION,
      this.#bindings,
      `${this.#gameSessionId}:return-source`,
    );
  }

  #requestReturnSourcePrompt(): void {
    if (this.#returnSourcePromptRequested) return;
    this.#returnSourcePromptRequested = true;
    this.refresh();
  }

  #requestPlayerReturnPrompt(): void {
    if (this.#playerReturnPromptRequested) return;
    this.#playerReturnPromptRequested = true;
    this.refresh();
  }

  #setStage(stage: LearnToPlayPrologueStage): void {
    if (this.#stage === stage) return;
    this.#stage = stage;
    this.#snapshot = Object.freeze({
      cursor: ++this.#cursor,
      stage,
      gameSessionId: this.#gameSessionId,
      ...(stage === "opening-attack" && this.#bindings.maela
        ? { suggestedAttackerId: this.#bindings.maela }
        : {}),
      ...(stage === "source-return" && this.#bindings.post_surge_source
        ? { requiredSourceId: this.#bindings.post_surge_source }
        : {}),
    });
    for (const listener of this.#listeners) listener();
  }
}
