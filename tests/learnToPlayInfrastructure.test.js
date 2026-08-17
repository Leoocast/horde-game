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
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.leaveCopy, "journey");
});

test("journey attempts rebuild from the opening and roll provisional concepts back", () => {
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
  assert.equal(calls.includes("begin:game-1:provisional"), true);
  assert.equal(calls.includes("begin:game-2:provisional"), true);
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

test("App exposes both launchers, disables Continue, and keys autosave from policy", async () => {
  const [app, menu, board] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /HOW_TO_PLAY_CATALOG\.map/u);
  assert.match(app, /onLaunch: IS_DEV \? launchLearnToPlayJourney : undefined/u);
  assert.match(app, /howToPlayEntries=\{howToPlayEntries\}/u);
  assert.match(app, /continueDisabled/u);
  assert.match(app, /if \(!boardSessionPolicy\.autosave \|\| screen !== "game"\) return;/u);
  assert.match(menu, /howToPlayEntries\.map/u);
  assert.match(menu, /disabled=\{continueDisabled \|\| !onContinue\}/u);
  assert.match(board, /sessionPolicy\.showStandardOutcome && defeatReady/u);
  assert.match(board, /!sessionPolicy\.showPhaseBanner/u);
});
