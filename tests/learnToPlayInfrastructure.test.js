import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  GUIDED_LESSON_BOARD_SESSION,
  LEARN_TO_PLAY_BOARD_SESSION,
  NORMAL_BOARD_SESSION,
} from "../src/components/boardSessionPolicies";
import { contentCatalog } from "../src/content/bootstrap";
import { GuidedBeatBarrier } from "../src/guidance/beatBarrier";
import { buildGuidedScenario } from "../src/guidance/buildGuidedScenario";
import { FIRST_SEED_LESSON } from "../src/guidance/firstSeedLesson";
import {
  HOW_TO_PLAY_CATALOG,
  LEARN_TO_PLAY_JOURNEY_ID,
  PREPARATION_LESSON_ID,
} from "../src/guidance/howToPlayCatalog";
import { GuidedInteractionGate } from "../src/guidance/interactionGate";
import { GuidedInterventionOrchestrator } from "../src/guidance/interventionOrchestrator";
import { GuidedJourneyLifecycle } from "../src/guidance/journeyLifecycle";
import { JourneyIntentGate } from "../src/guidance/journeyIntentGate";
import { PRODUCT_CONTEXTUAL_CONCEPTS } from "../src/guidance/contextualProductConcepts";
import { emptyGuidedProgress, nextRequiredGuidedLesson } from "../src/guidance/progress";
import { GuidedSessionStore } from "../src/guidance/sessionStore";

test("How to Play catalogs the main journey before optional Preparation", () => {
  assert.deepEqual(HOW_TO_PLAY_CATALOG.map(({ id }) => id), [
    LEARN_TO_PLAY_JOURNEY_ID,
    PREPARATION_LESSON_ID,
  ]);
  assert.equal(HOW_TO_PLAY_CATALOG[0].launcher.kind, "journey");
  assert.equal(HOW_TO_PLAY_CATALOG[1].launcher.kind, "guided-lesson");
  assert.equal(FIRST_SEED_LESSON.mode, "optional");
  assert.equal(nextRequiredGuidedLesson([FIRST_SEED_LESSON], emptyGuidedProgress()), undefined);
});

test("board session policies isolate persistence, outcomes, and guided controls", () => {
  assert.equal(NORMAL_BOARD_SESSION.autosave, true);
  assert.equal(NORMAL_BOARD_SESSION.showStandardOutcome, true);
  assert.equal(GUIDED_LESSON_BOARD_SESSION.autosave, false);
  assert.equal(GUIDED_LESSON_BOARD_SESSION.showPhaseBanner, false);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.autosave, false);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.showPhaseBanner, true);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.showStandardOutcome, false);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.hostStartDelayMs, 550);
  assert.equal(NORMAL_BOARD_SESSION.hostStartDelayMs, 0);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.leaveCopy, "journey");
});

test("journey attempts rebuild from the opening with isolated contextual progress", () => {
  const calls = [];
  let boardRevision = 0;
  const lifecycle = new GuidedJourneyLifecycle(
    { id: LEARN_TO_PLAY_JOURNEY_ID, revision: 1, setupTurns: 0 },
    {
      loadInitialBoard() {
        calls.push("load");
        boardRevision += 1;
        return `game-${boardRevision}`;
      },
      stopPresentation() {
        calls.push("stop-presentation");
      },
    },
    {
      beginSession(gameSessionId, mode) {
        calls.push(`begin:${gameSessionId}:${mode}`);
      },
      rollbackProvisional() {
        calls.push("rollback");
      },
      setProgressMode(mode) {
        calls.push(`mode:${mode}`);
      },
    },
    { stop: () => calls.push("stop-intervention") },
  );

  assert.equal(lifecycle.start(), true);
  assert.equal(lifecycle.snapshot().status, "running");
  assert.equal(lifecycle.snapshot().gameSessionId, "game-1");
  assert.equal(lifecycle.snapshot().attempt, 1);
  assert.equal(lifecycle.restart(), true);
  assert.equal(lifecycle.snapshot().gameSessionId, "game-2");
  assert.equal(lifecycle.snapshot().attempt, 2);
  lifecycle.stop();
  assert.equal(lifecycle.snapshot().status, "aborted");
  assert.equal(calls.filter((call) => call === "load").length, 2);
  assert.equal(calls.includes("mode:immediate"), true);
  assert.ok(calls.indexOf("mode:immediate") < calls.lastIndexOf("stop-presentation"));
  assert.equal(calls.includes("begin:game-1:isolated"), true);
  assert.equal(calls.includes("begin:game-2:isolated"), true);
});

test("a strict intervention attaches to the current board without rebuilding it", () => {
  const built = buildGuidedScenario(FIRST_SEED_LESSON, contentCatalog);
  const currentGame = built.game;
  const gate = new GuidedInteractionGate();
  const session = new GuidedSessionStore(gate, new GuidedBeatBarrier());
  let presentationStops = 0;
  const intervention = new GuidedInterventionOrchestrator(session, {
    readGame: () => currentGame,
    stopPresentation: () => { presentationStops += 1; },
  });
  const definition = {
    id: "learn-to-play.play-card",
    revision: 1,
    startStepId: "explain-card",
    steps: [{
      id: "explain-card",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.firstSourceTitle",
        bodyKey: "guided.firstSeed.firstSourceBody",
      },
      highlights: [{ kind: "card", alias: "first_source" }],
    }],
  };
  const bindings = { first_source: built.bindings.first_source.instanceId };

  const sessionId = intervention.start(definition, bindings, "attached-intervention");
  assert.equal(sessionId, "attached-intervention");
  assert.equal(session.snapshot().status, "running");
  assert.equal(session.snapshot().lessonId, definition.id);
  assert.equal(session.snapshot().currentStep.id, "explain-card");
  assert.strictEqual(currentGame, built.game);
  assert.equal(presentationStops, 0);

  intervention.stop();
  assert.equal(session.snapshot().status, "aborted");
  assert.equal(presentationStops, 1);
  assert.throws(
    () => intervention.start(definition, { first_source: "missing-instance" }),
    /is not on the current board/u,
  );
});

test("journey limits are ephemeral and product concepts cover every prologue explanation", () => {
  const gate = new JourneyIntentGate();
  gate.activate({
    journeyId: LEARN_TO_PLAY_JOURNEY_ID,
    authorize: (intent) => intent.kind === "phase.endTurn"
      ? { allowed: false, guidanceId: "fixture", relatedCardIds: ["vaelor"] }
      : { allowed: true },
  });
  assert.deepEqual(gate.authorize({ kind: "phase.endTurn" }), {
    allowed: false,
    guidanceId: "fixture",
    relatedCardIds: ["vaelor"],
  });
  assert.equal(gate.authorize({ kind: "phase.chooseAttackers" }).allowed, true);
  gate.deactivate(LEARN_TO_PLAY_JOURNEY_ID);
  assert.equal(gate.authorize({ kind: "phase.endTurn" }).allowed, true);

  assert.deepEqual(PRODUCT_CONTEXTUAL_CONCEPTS.map((concept) => concept.id), [
    "host-defense-order",
    "assign-defenders",
    "flying-defense-restriction",
    "chronicler-life",
    "reserve-and-ready",
    "stabilizing-restriction",
    "attack-the-host-archive",
    "attack-exhausts-echo",
    "host-surge",
    "learn-to-play-vaelor-required",
    "learn-to-play-harvester-inspection-required",
  ]);
});

test("the opening attack explanation is contextual and the defense prompt prefers the left side", () => {
  const attack = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "attack-the-host-archive");
  const defense = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "assign-defenders");
  const order = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "host-defense-order");
  assert.equal(attack.policy, "preventive");
  assert.deepEqual(
    attack.prevent({ kind: "combat.confirmArchiveAttack", targetIds: ["maela"] }, {}),
    {
      highlights: [{ kind: "surface", anchor: "host.archive" }],
    },
  );
  assert.deepEqual(defense.evaluate({ kind: "host.attackersDeclared" }, {}), {
    highlights: [{ kind: "surface", anchor: "player.field" }],
    placement: "left",
  });
  assert.deepEqual(order.signalKinds, []);
});

test("App exposes both launchers, disables Continue, and keys autosave from policy", async () => {
  const [app, menu, board] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /HOW_TO_PLAY_CATALOG\.map/u);
  assert.match(app, /onLaunch: launchLearnToPlayJourney/u);
  assert.match(app, /howToPlayEntries=\{howToPlayEntries\}/u);
  assert.match(app, /continueDisabled/u);
  assert.match(app, /if \(!boardSessionPolicy\.autosave \|\| screen !== "game"\) return;/u);
  assert.match(menu, /howToPlayEntries\.map/u);
  assert.match(menu, /disabled=\{continueDisabled \|\| !onContinue\}/u);
  assert.match(board, /sessionPolicy\.showStandardOutcome && defeatReady/u);
  assert.match(board, /!sessionPolicy\.showPhaseBanner/u);
});
