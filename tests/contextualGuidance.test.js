import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ContextualConceptRegistry } from "../src/guidance/ContextualConceptRegistry";
import { ContextualTutorialRuntime } from "../src/guidance/contextualRuntime";
import { GameplaySignalStream } from "../src/guidance/gameplaySignals";
import {
  GuidedProgressStore,
  contextualConceptSeen,
  emptyGuidedProgress,
  parseGuidedProgress,
} from "../src/guidance/progress";

const RESERVE_CONCEPT = Object.freeze({
  id: "reserve-flow",
  revision: 1,
  policy: "informative",
  priority: 20,
  copy: {
    titleKey: "guided.contextual.lab.reserveTitle",
    bodyKey: "guided.contextual.lab.reserveBody",
  },
  signalKinds: ["player.reserveReleased"],
  evaluate: () => ({ highlights: [{ kind: "surface", anchor: "player.reserve" }] }),
});

const REACTIVE_CONCEPT = Object.freeze({
  id: "stabilizing-attempt",
  revision: 1,
  policy: "reactive",
  priority: 80,
  copy: {
    titleKey: "guided.contextual.lab.stabilizingTitle",
    bodyKey: "guided.contextual.lab.stabilizingBody",
  },
  signalKinds: ["action.denied"],
  evaluate: (signal) => signal.kind === "action.denied" && signal.code === "STABILIZING" ? {} : undefined,
});

const PREVENTIVE_CONCEPT = Object.freeze({
  id: "source-action-limit",
  revision: 1,
  policy: "preventive",
  priority: 100,
  copy: {
    titleKey: "guided.contextual.lab.sourceLimitTitle",
    bodyKey: "guided.contextual.lab.sourceLimitBody",
  },
  signalKinds: ["intent.attempted"],
  evaluate: () => undefined,
  prevent: (intent) => intent.kind === "card.play" ? {} : undefined,
});

test("guided progress v1 migrates to v2 without losing lesson completion", () => {
  const migrated = parseGuidedProgress({
    kind: "hostfall-guided-progress",
    formatVersion: 1,
    completions: [{ lessonId: "first-seed", completedRevision: 1, completedAt: "2026-08-11T00:00:00.000Z" }],
  });
  assert.equal(migrated?.formatVersion, 2);
  assert.equal(migrated?.completions[0].lessonId, "first-seed");
  assert.deepEqual(migrated?.journeys, []);
  assert.deepEqual(migrated?.concepts, []);
  assert.equal(migrated?.preferences.hideSeenContextualHelp, true);
  assert.equal(parseGuidedProgress({ ...migrated, formatVersion: 3 }), undefined);
});

test("contextual concepts persist on acknowledgement and obey global repeat preference once per match", () => {
  const fixture = createRuntime([RESERVE_CONCEPT]);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 2 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");
  assert.equal(fixture.progress.snapshot().concepts.length, 0);

  fixture.runtime.acknowledgeActive("2026-08-17T00:00:00.000Z");
  assert.equal(contextualConceptSeen(fixture.progress.snapshot(), RESERVE_CONCEPT), true);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "idle", "a concept appears at most once in one match");

  fixture.signals.beginSession("match:2");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "idle", "seen help is hidden by default");

  fixture.progress.setHideSeenContextualHelp(false);
  fixture.signals.beginSession("match:3");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");
  fixture.dispose();
});

test("simultaneous triggers queue by priority and revalidate after presentation settles", () => {
  let ready = false;
  let relevant = true;
  const staleAware = { ...RESERVE_CONCEPT, revalidate: () => relevant };
  const fixture = createRuntime([staleAware, REACTIVE_CONCEPT], () => ({ presentationReady: ready }));
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 3 });
  fixture.signals.publish({
    kind: "action.denied",
    intent: { kind: "combat.toggleAttacker", cardId: "echo:1", selected: true },
    code: "STABILIZING",
    reason: "test",
  });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "waiting");
  assert.deepEqual(fixture.runtime.snapshot().queue, ["stabilizing-attempt", "reserve-flow"]);

  ready = true;
  fixture.runtime.refresh();
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "stabilizing-attempt");
  fixture.runtime.acknowledgeActive();
  relevant = false;
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "idle", "stale queued help is discarded");
  fixture.dispose();
});

test("an active contextual reminder closes when its authored condition is fulfilled", () => {
  let relevant = true;
  const fixture = createRuntime([{ ...RESERVE_CONCEPT, revalidate: () => relevant }]);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");

  relevant = false;
  fixture.runtime.refresh();
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "idle");
  assert.equal(fixture.runtime.snapshot().active, undefined);
  fixture.dispose();
});

test("provisional acknowledgement commits atomically or rolls back completely", () => {
  const fixture = createRuntime([RESERVE_CONCEPT]);
  fixture.runtime.beginSession("match:1", "provisional");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  fixture.runtime.acknowledgeActive("2026-08-17T01:00:00.000Z");
  assert.deepEqual(fixture.runtime.snapshot().provisionalConcepts, ["reserve-flow"]);
  assert.equal(fixture.progress.snapshot().concepts.length, 0);

  fixture.runtime.rollbackProvisional();
  assert.equal(fixture.progress.snapshot().concepts.length, 0);
  assert.deepEqual(fixture.runtime.snapshot().shownThisMatch, []);

  fixture.runtime.beginSession("match:1", "provisional");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  fixture.runtime.acknowledgeActive("2026-08-17T02:00:00.000Z");
  assert.equal(fixture.runtime.commitProvisional(), true);
  assert.equal(fixture.progress.snapshot().concepts[0].conceptId, "reserve-flow");
  fixture.dispose();
});

test("isolated tutorial sessions ignore global seen checks and never write global progress", () => {
  const fixture = createRuntime([RESERVE_CONCEPT]);
  fixture.progress.markConceptSeen("reserve-flow", 1, "2026-08-17T00:00:00.000Z");
  fixture.signals.beginSession("tutorial:1");
  fixture.runtime.beginSession("tutorial:1", "isolated");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");

  const progressBefore = fixture.progress.snapshot();
  fixture.runtime.acknowledgeActive("2026-08-17T03:00:00.000Z");
  assert.strictEqual(fixture.progress.snapshot(), progressBefore);
  assert.deepEqual(fixture.runtime.snapshot().provisionalConcepts, []);
  fixture.dispose();
});

test("preventive policy intercepts only its matching intent until the help is acknowledged", () => {
  const fixture = createRuntime([PREVENTIVE_CONCEPT]);
  const unrelated = fixture.runtime.authorizeIntent({ kind: "phase.endTurn" });
  assert.equal(unrelated.allowed, true);

  const blocked = fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" });
  assert.deepEqual(blocked, { allowed: false, conceptId: "source-action-limit" });
  assert.equal(fixture.runtime.snapshot().active?.policy, "preventive");
  fixture.runtime.acknowledgeActive();
  assert.equal(fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" }).allowed, true);
  fixture.dispose();
});

test("strict guided sessions remain authoritative over preventive contextual concepts", () => {
  const fixture = createRuntime([PREVENTIVE_CONCEPT], () => ({ guidedActive: true }));
  assert.equal(fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" }).allowed, true);
  assert.equal(fixture.runtime.snapshot().status, "idle");
  fixture.dispose();
});

test("contextual callout is non-modal, keyboard dismissible and mounted separately from strict guidance", async () => {
  const [component, board] = await Promise.all([
    readFile(new URL("../src/components/ContextualTutorialCallout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(component, /role="dialog"/u);
  assert.match(component, /aria-modal="false"/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /event\.key !== "Escape"/u);
  assert.match(component, /contextualTutorialRuntime\.acknowledgeActive/u);
  assert.match(component, /tutorialCalloutWidth/u);
  assert.match(component, /<div className="contextual-tutorial-heading">\s*<h2 id=\{titleId\}>/su);
  assert.doesNotMatch(component, /tutorial-dialog-heading-ornament/u);
  assert.match(component, /highlight\.showHighlight !== false/u);
  assert.match(component, /resolved\[index\]\?\.showHighlight/u);
  assert.doesNotMatch(component, /addEventListener\("pointerdown"/u);
  assert.match(board, /<GuidedTutorialOverlay\s*\/>\s*<ContextualTutorialCallout\s*\/>/u);
});

function createRuntime(concepts, overrideContext = () => ({})) {
  const signals = new GameplaySignalStream("match:1");
  const progress = new GuidedProgressStore();
  const tasks = [];
  const baseContext = {
    game: {},
    gameSessionId: "match:1",
    presentationReady: true,
    guidedActive: false,
    targetingActive: false,
    blockers: [],
  };
  const runtime = new ContextualTutorialRuntime(
    new ContextualConceptRegistry(concepts),
    signals,
    progress,
    () => Object.freeze({ ...baseContext, ...overrideContext() }),
    (task) => tasks.push(task),
  );
  return {
    signals,
    progress,
    runtime,
    drain() {
      while (tasks.length > 0) tasks.shift()();
    },
    dispose() {
      runtime.dispose();
    },
  };
}
