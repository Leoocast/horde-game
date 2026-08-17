import type { GameStore } from "../store/useGameStore";
import type { GuidedCardAlias } from "./contracts";
import { contextualTutorialRuntime } from "./contextualProductRuntime";
import type { GuidedInterventionOrchestrator } from "./interventionOrchestrator";
import { isGuidedPresentationSettled } from "./presentationSettled";
import { guidedPresentationActivity, guidedSessionStore } from "./runtime";
import { journeyIntentGate } from "./journeyIntentGate";
import {
  LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION,
  LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION,
  LEARN_TO_PLAY_HARVESTER_INSPECTION,
  LEARN_TO_PLAY_OPENING_INTERVENTION,
} from "./learnToPlayPrologue";

export type LearnToPlayPrologueStage =
  | "inactive"
  | "opening"
  | "opening-attack"
  | "opening-end"
  | "awaiting-defense"
  | "defense-intro"
  | "free-play"
  | "inspection"
  | "awaiting-surge"
  | "surge";

export type LearnToPlayPrologueSnapshot = Readonly<{
  cursor: number;
  stage: LearnToPlayPrologueStage;
  gameSessionId?: string;
  suggestedAttackerId?: string;
}>;

type DirectorHost = Readonly<{
  readStore(): GameStore;
}>;

/** Coordinates authored milestones while every actual rule remains owned by GameStore/engine. */
export class LearnToPlayPrologueDirector {
  readonly #host: DirectorHost;
  readonly #interventions: GuidedInterventionOrchestrator;
  #bindings: Readonly<Record<GuidedCardAlias, string>> = Object.freeze({});
  #gameSessionId: string | undefined;
  #stage: LearnToPlayPrologueStage = "inactive";
  #cursor = 0;
  #snapshot: LearnToPlayPrologueSnapshot = Object.freeze({ cursor: 0, stage: "inactive" });
  #listeners = new Set<() => void>();
  #evaluationScheduled = false;

  constructor(host: DirectorHost, interventions: GuidedInterventionOrchestrator) {
    this.#host = host;
    this.#interventions = interventions;
    guidedSessionStore.subscribe(() => this.refresh());
    guidedPresentationActivity.subscribe(() => this.refresh());
    contextualTutorialRuntime.subscribe(() => this.refresh());
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
    journeyIntentGate.activate({
      journeyId: "learn-to-play",
      authorize: (intent) => {
        const game = this.#host.readStore().game;
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
        return Object.freeze({ allowed: true });
      },
    });
    this.#setStage("opening");
    this.#interventions.start(LEARN_TO_PLAY_OPENING_INTERVENTION, this.#bindings, `${gameSessionId}:opening`);
  }

  stop(): void {
    journeyIntentGate.deactivate("learn-to-play");
    this.#interventions.stop();
    this.#bindings = Object.freeze({});
    this.#gameSessionId = undefined;
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
    const store = this.#host.readStore();
    const session = guidedSessionStore.snapshot();
    if (this.#stage === "opening" && session.lessonId === LEARN_TO_PLAY_OPENING_INTERVENTION.id && session.status === "completed") {
      this.#setStage("opening-attack");
    }
    if (this.#stage === "opening-attack") {
      if (
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
      return;
    }
    if (
      this.#stage === "opening-end"
      && session.lessonId === LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION.id
      && session.status === "completed"
    ) {
      this.#setStage("awaiting-defense");
    }
    if (this.#stage === "opening-end") return;
    if (this.#stage === "awaiting-defense") {
      if (
        store.game.activeSide === "host"
        && store.game.combat.hostAttackers.length > 0
        && session.status !== "running"
        && isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())
      ) {
        this.#setStage("defense-intro");
        this.#interventions.start(
          LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION,
          this.#bindings,
          `${this.#gameSessionId}:first-defense`,
        );
      }
      return;
    }
    if (
      this.#stage === "defense-intro"
      && session.lessonId === LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION.id
      && session.status === "completed"
    ) {
      this.#setStage("free-play");
    }
    if (this.#stage === "defense-intro") return;
    if (this.#stage === "inspection" && session.lessonId === LEARN_TO_PLAY_HARVESTER_INSPECTION.id && session.status === "completed") {
      this.#setStage("awaiting-surge");
    }
    if (store.game.hostTurnNumber >= store.game.hostRules.surgeTurn) {
      this.#setStage("surge");
      return;
    }
    if (this.#stage !== "free-play" && this.#stage !== "awaiting-surge") return;
    if (this.#stage === "awaiting-surge") return;
    const vaelorEntered = store.game.player.field.some((card) => card.instanceId === this.#bindings.vaelor);
    const harvesterPresent = store.game.host.field.some((card) => card.instanceId === this.#bindings.harvester);
    const victimsGone = [
      "return_to_memory",
      "first_winged_stalker",
      "second_winged_stalker",
      "stitched_wing_spawn",
    ].every((alias) => !store.game.host.field.some((card) => card.instanceId === this.#bindings[alias]));
    if (!vaelorEntered || !harvesterPresent || !victimsGone) return;
    if (guidedSessionStore.snapshot().status === "running") return;
    if (contextualTutorialRuntime.snapshot().active) return;
    if (!isGuidedPresentationSettled(store, guidedPresentationActivity.snapshot())) return;
    this.#setStage("inspection");
    this.#interventions.start(
      LEARN_TO_PLAY_HARVESTER_INSPECTION,
      this.#bindings,
      `${this.#gameSessionId}:inspect-harvester`,
    );
  }

  #harvesterInspectionRequired(game: GameStore["game"]): boolean {
    if (this.#stage === "awaiting-surge" || this.#stage === "surge") return false;
    const vaelorEntered = game.player.field.some((card) => card.instanceId === this.#bindings.vaelor);
    const harvesterPresent = game.host.field.some((card) => card.instanceId === this.#bindings.harvester);
    const victimsGone = [
      "return_to_memory",
      "first_winged_stalker",
      "second_winged_stalker",
      "stitched_wing_spawn",
    ].every((alias) => !game.host.field.some((card) => card.instanceId === this.#bindings[alias]));
    return vaelorEntered && harvesterPresent && victimsGone;
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
    });
    for (const listener of this.#listeners) listener();
  }
}
