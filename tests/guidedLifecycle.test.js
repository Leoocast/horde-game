import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GuidedProductLifecycle } from "../src/guidance/lifecycle";
import {
  GuidedProgressStore,
  emptyGuidedProgress,
  guidedLessonCompleted,
  nextRequiredGuidedLesson,
  parseGuidedProgress,
} from "../src/guidance/progress";

const REQUIRED_LESSON = Object.freeze({ id: "first-seed", revision: 1, mode: "required" });
const OPTIONAL_LESSON = Object.freeze({ id: "reserve-practice", revision: 1, mode: "optional" });

test("guided progress persists completion only and never an active session", () => {
  const store = new GuidedProgressStore();
  assert.equal(store.markCompleted("first-seed", 1, "2026-08-11T00:00:00.000Z"), true);
  assert.equal(store.markCompleted("first-seed", 1, "2026-08-12T00:00:00.000Z"), false);

  const snapshot = store.snapshot();
  assert.deepEqual(Object.keys(snapshot), ["kind", "formatVersion", "completions"]);
  assert.deepEqual(Object.keys(snapshot.completions[0]), ["lessonId", "completedRevision", "completedAt"]);
  assert.equal("stepId" in snapshot, false);
  assert.equal("game" in snapshot, false);
  assert.deepEqual(parseGuidedProgress(JSON.parse(JSON.stringify(snapshot))), snapshot);
  assert.equal(parseGuidedProgress({ ...snapshot, formatVersion: 2 }), undefined);
});

test("required entry is revision-aware while optional lessons never gate Play", () => {
  const progress = emptyGuidedProgress();
  assert.equal(nextRequiredGuidedLesson([OPTIONAL_LESSON, REQUIRED_LESSON], progress)?.id, "first-seed");

  const store = new GuidedProgressStore();
  store.markCompleted("first-seed", 1, "2026-08-11T00:00:00.000Z");
  assert.equal(guidedLessonCompleted(store.snapshot(), REQUIRED_LESSON), true);
  assert.equal(nextRequiredGuidedLesson([OPTIONAL_LESSON, REQUIRED_LESSON], store.snapshot()), undefined);
  assert.equal(nextRequiredGuidedLesson([{ ...REQUIRED_LESSON, revision: 2 }], store.snapshot())?.id, "first-seed");
});

test("product lifecycle marks only completion; stop and restart remain ephemeral", () => {
  const progress = new GuidedProgressStore();
  const session = new FakeSession();
  let starts = 0;
  let restarts = 0;
  let stops = 0;
  const runner = {
    start(lessonId) {
      starts += 1;
      const sessionId = `${lessonId}-${starts}`;
      session.emit({ status: "running", lessonId, lessonRevision: 1, sessionId });
      return sessionId;
    },
    restart() {
      restarts += 1;
      const sessionId = `first-seed-restart-${restarts}`;
      session.emit({ status: "running", lessonId: "first-seed", lessonRevision: 1, sessionId });
      return sessionId;
    },
    stop() {
      stops += 1;
      session.emit({ status: "aborted", lessonId: "first-seed", lessonRevision: 1, endReason: "stopped" });
    },
  };
  const registry = {
    lessons: [REQUIRED_LESSON],
    require(id) {
      if (id !== REQUIRED_LESSON.id) throw new Error("missing lesson");
      return REQUIRED_LESSON;
    },
  };
  const lifecycle = new GuidedProductLifecycle(registry, runner, session, progress);

  assert.equal(lifecycle.start("first-seed"), true);
  assert.equal(lifecycle.snapshot().status, "running");
  assert.equal(lifecycle.restart(), true);
  assert.equal(restarts, 1);
  lifecycle.stop();
  assert.equal(stops, 1);
  assert.equal(lifecycle.snapshot().status, "aborted");
  assert.equal(progress.snapshot().completions.length, 0);

  lifecycle.start("first-seed");
  session.emit({ status: "completed", lessonId: "first-seed", lessonRevision: 1, sessionId: "first-seed-2" });
  assert.equal(lifecycle.snapshot().status, "completed");
  assert.equal(progress.snapshot().completions.length, 1);
  assert.equal(lifecycle.nextRequiredLesson(), undefined);
});

test("App isolates tutorial sessions from resume and Settings hides scenario mutation", async () => {
  const [app, settings] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/SettingsMenu.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /if \(screen !== "game"\) return;/u);
  assert.match(app, /const requiredLesson = IS_DEV \? undefined : guidedProductLifecycle\.nextRequiredLesson\(\);/u);
  assert.match(app, /if \(!requiredLesson\) return;/u);
  assert.match(app, /resumeStatus=\{requiredLesson \? "none" : desktopResume\.status\}/u);

  const launch = app.slice(app.indexOf("function launchGuidedLesson"), app.indexOf("function restartGuidedLesson"));
  const leave = app.slice(app.indexOf("function leaveGuidedLesson"), app.indexOf("if (loading || !preferencesReady)"));
  assert.doesNotMatch(launch, /deleteDesktopResume/u);
  assert.doesNotMatch(leave, /deleteDesktopResume/u);

  assert.match(settings, /!tutorial && <ZoneDrawer/u);
  assert.match(settings, /!tutorial && isDeveloperMode/u);
  assert.match(settings, /data-guided-system-control/u);
});

class FakeSession {
  listeners = new Set();
  current = { status: "inactive" };

  snapshot() {
    return this.current;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(snapshot) {
    this.current = Object.freeze(snapshot);
    for (const listener of this.listeners) listener(this.current);
  }
}
