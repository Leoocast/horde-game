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
  guidedJourneyCompleted,
  parseGuidedProgress,
  tutorialContextualJourney,
} from "../src/guidance/progress";
import { firstCanonVisionDirector } from "../src/guidance/firstCanonVision";
import { createLearnToPlayFirstMatchOrigin } from "../src/guidance/learnToPlayHandoff";
import { guidedProgressStore } from "../src/guidance/progress";
import { getHostDeck, getPlayerDeck } from "../src/data/decks";
import { acceptOpeningHand, createInitialGame, mulliganOpeningHand } from "../src/engine/GameState";

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

const BLOCKING_CONCEPT = Object.freeze({
  ...RESERVE_CONCEPT,
  id: "blocking-explanation",
  blocksGameplayWhileVisible: true,
});

const PLACEMENT_ANCHORED_CONCEPT = Object.freeze({
  ...RESERVE_CONCEPT,
  id: "placement-anchored",
  evaluate: () => ({
    placement: "top",
    placementAnchor: { kind: "surface", anchor: "phase.primaryAction", showHighlight: false },
  }),
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

test("the first Canon director enforces one real mulligan and resumes the retained awakening intent", () => {
  guidedProgressStore.resetForTests();
  firstCanonVisionDirector.resetForTests();
  const origin = createLearnToPlayFirstMatchOrigin();
  let game = createInitialGame(
    getPlayerDeck(origin.playerDeckId),
    getHostDeck(origin.hostDeckId),
    origin.rngSeed,
    origin.preparationTurns,
    origin.difficulty,
    origin.gameMode,
  );

  firstCanonVisionDirector.beginLaunch({ source: "learn-to-play-handoff", origin, sessionId: "game:first-canon" });
  assert.equal(firstCanonVisionDirector.snapshot().stage, "opening-settling");
  firstCanonVisionDirector.notifyOpeningCardsSettled(0);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "opening-intro");
  assert.equal(firstCanonVisionDirector.authorizeIntent({ kind: "opening.accept" }).allowed, false);
  firstCanonVisionDirector.acknowledge();
  assert.equal(firstCanonVisionDirector.authorizeIntent({ kind: "opening.mulligan" }).allowed, true);

  game = mulliganOpeningHand(game);
  firstCanonVisionDirector.refresh(game, []);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "mulligan-settling");
  assert.equal(firstCanonVisionDirector.authorizeIntent({ kind: "opening.mulligan" }).allowed, false);
  firstCanonVisionDirector.notifyOpeningCardsSettled(1);
  firstCanonVisionDirector.acknowledge();
  assert.equal(firstCanonVisionDirector.authorizeIntent({ kind: "opening.accept" }).allowed, true);

  game = acceptOpeningHand(game);
  firstCanonVisionDirector.refresh(game, []);
  firstCanonVisionDirector.refresh(game, ["phase.banner:setup-step-1-of-3"]);
  firstCanonVisionDirector.refresh(game, []);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "preparation-intro");
  firstCanonVisionDirector.acknowledge();
  firstCanonVisionDirector.acknowledge();
  assert.deepEqual(
    firstCanonVisionDirector.authorizeIntent({ kind: "phase.awakenHost" }),
    { allowed: false, conceptId: "first-canon-opening" },
  );
  assert.equal(firstCanonVisionDirector.snapshot().stage, "host-awakening-warning");
  assert.equal(firstCanonVisionDirector.acknowledge().awakenHost, false);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "host-awakening-commit");
  assert.deepEqual(
    firstCanonVisionDirector.authorizeIntent({ kind: "card.play", cardId: "echo:1" }),
    { allowed: false, conceptId: "first-canon-opening" },
    "the warning acknowledgement must not reopen other decisions",
  );
  assert.deepEqual(
    firstCanonVisionDirector.authorizeIntent({ kind: "phase.awakenHost" }),
    { allowed: true },
    "only the player's second click commits the retained transition",
  );
  assert.equal(firstCanonVisionDirector.snapshot().stage, "completed");

  firstCanonVisionDirector.beginLaunch({ source: "play", origin, sessionId: "game:import" });
  assert.equal(firstCanonVisionDirector.snapshot().stage, "replay-choice-settling");
  firstCanonVisionDirector.notifyOpeningCardsSettled(0);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "replay-choice");
  assert.equal(firstCanonVisionDirector.chooseReplayGuidance("independent"), true);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "inactive");
  assert.equal(firstCanonVisionDirector.snapshot().contextualHelpMode, "unseen");
  assert.equal(firstCanonVisionDirector.snapshot().orderedSequenceActive, false);
  firstCanonVisionDirector.resetForTests();
  guidedProgressStore.resetForTests();
});

test("the first Canon ignores the normal checkbox and asks how to guide later attempts", () => {
  guidedProgressStore.resetForTests();
  firstCanonVisionDirector.resetForTests();
  const origin = createLearnToPlayFirstMatchOrigin();

  guidedProgressStore.setHideSeenContextualHelp(false);
  firstCanonVisionDirector.beginLaunch({ source: "play", origin, sessionId: "game:first-import" });
  assert.equal(firstCanonVisionDirector.snapshot().stage, "opening-settling");
  assert.equal(firstCanonVisionDirector.snapshot().contextualHelpMode, "repeat");

  firstCanonVisionDirector.beginLaunch({ source: "rewrite", origin, sessionId: "game:retry" });
  firstCanonVisionDirector.notifyOpeningCardsSettled(0);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "replay-choice");
  assert.equal(firstCanonVisionDirector.chooseReplayGuidance("guided"), true);
  assert.equal(firstCanonVisionDirector.snapshot().stage, "opening-intro");
  assert.equal(firstCanonVisionDirector.snapshot().contextualHelpMode, "repeat");

  firstCanonVisionDirector.resetForTests();
  guidedProgressStore.resetForTests();
});

test("forced recaps and retained Marco Dorado have session-scoped ledgers", () => {
  const retained = Object.freeze({
    ...RESERVE_CONCEPT,
    id: "retained-cue",
    retainHighlightsAfterAcknowledge: true,
  });
  const fixture = createRuntime([retained]);
  let forcedAcknowledgements = 0;
  fixture.progress.markConceptSeen(retained.id, retained.revision, "2026-09-01T00:00:00.000Z");
  fixture.runtime.forceConceptsForSession([{
    conceptId: retained.id,
    onAcknowledge: () => { forcedAcknowledgements += 1; },
  }]);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, retained.id);
  fixture.runtime.acknowledgeActive();
  assert.equal(forcedAcknowledgements, 1);
  assert.deepEqual(fixture.runtime.snapshot().persistentHighlights, [{ kind: "surface", anchor: "player.reserve" }]);
  fixture.signals.beginSession("match:2");
  assert.deepEqual(fixture.runtime.snapshot().persistentHighlights, []);
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

test("contextual presentation preserves an authored placement-only anchor", () => {
  const fixture = createRuntime([PLACEMENT_ANCHORED_CONCEPT]);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();

  assert.equal(fixture.runtime.snapshot().active?.placement, "top");
  assert.deepEqual(fixture.runtime.snapshot().active?.placementAnchor, {
    kind: "surface",
    anchor: "phase.primaryAction",
    showHighlight: false,
  });
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

test("isolated tutorial sessions ignore global seen checks and record acknowledged learning", () => {
  const fixture = createRuntime([RESERVE_CONCEPT]);
  fixture.signals.beginSession("tutorial:1");
  fixture.runtime.beginSession("tutorial:1", "isolated");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");

  fixture.runtime.acknowledgeActive("2026-08-17T03:00:00.000Z");
  assert.equal(contextualConceptSeen(fixture.progress.snapshot(), RESERVE_CONCEPT), true);
  assert.equal(guidedJourneyCompleted(
    fixture.progress.snapshot(),
    tutorialContextualJourney(RESERVE_CONCEPT.id, RESERVE_CONCEPT.revision),
  ), true);
  assert.deepEqual(fixture.runtime.snapshot().provisionalConcepts, []);
  fixture.dispose();
});

test("Canon unseen and repeat modes remain independent from the normal repeat preference", () => {
  const fixture = createRuntime([RESERVE_CONCEPT]);
  fixture.progress.markConceptSeen("reserve-flow", 1, "2026-08-17T00:00:00.000Z");
  fixture.progress.setHideSeenContextualHelp(false);

  fixture.signals.beginSession("canon:unseen");
  fixture.runtime.beginSession("canon:unseen", "unseen");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "idle");

  fixture.signals.beginSession("canon:repeat");
  fixture.runtime.beginSession("canon:repeat", "repeat");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");
  fixture.dispose();
});

test("a strict journey can suppress duplicate contextual concepts for only its current match", () => {
  const fixture = createRuntime([RESERVE_CONCEPT]);
  fixture.runtime.beginSession("match:1", "isolated");
  fixture.runtime.suppressConceptsForSession(["reserve-flow"]);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().status, "idle");
  assert.deepEqual(fixture.runtime.snapshot().shownThisMatch, ["reserve-flow"]);
  assert.equal(fixture.progress.snapshot().concepts.length, 0);

  fixture.signals.beginSession("match:2");
  fixture.runtime.beginSession("match:2", "isolated");
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "reserve-flow");
  fixture.dispose();
});

test("preventive policy intercepts only its matching intent until the help is acknowledged", () => {
  const fixture = createRuntime([PREVENTIVE_CONCEPT]);
  const unrelated = fixture.runtime.authorizeIntent({ kind: "phase.endTurn" });
  assert.equal(unrelated.allowed, true);

  const blocked = fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" });
  assert.deepEqual(blocked, { allowed: false, conceptId: "source-action-limit" });
  assert.equal(fixture.runtime.snapshot().active?.policy, "preventive");
  assert.deepEqual(
    fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" }),
    { allowed: false, conceptId: "source-action-limit" },
    "the relevant intent remains blocked while its preventive explanation is open",
  );
  fixture.runtime.acknowledgeActive();
  assert.equal(fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" }).allowed, true);
  fixture.dispose();
});

test("a blocking contextual explanation rejects every gameplay intent while it is visible", () => {
  const fixture = createRuntime([BLOCKING_CONCEPT]);
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();

  assert.equal(fixture.runtime.snapshot().active?.blocksGameplayWhileVisible, true);
  assert.deepEqual(
    fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "echo:1" }),
    { allowed: false, conceptId: "blocking-explanation" },
  );
  assert.deepEqual(
    fixture.runtime.authorizeIntent({ kind: "phase.endTurn" }),
    { allowed: false, conceptId: "blocking-explanation" },
  );

  fixture.runtime.acknowledgeActive();
  assert.equal(fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "echo:1" }).allowed, true);
  fixture.dispose();
});

test("a queued blocking explanation rejects gameplay before presentation can show it", () => {
  let ready = false;
  const fixture = createRuntime([BLOCKING_CONCEPT], () => ({ presentationReady: ready }));
  fixture.signals.publish({ kind: "player.reserveReleased", amount: 1 });
  fixture.drain();

  assert.equal(fixture.runtime.snapshot().status, "waiting");
  assert.deepEqual(
    fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "echo:1" }),
    { allowed: false, conceptId: "blocking-explanation" },
  );

  ready = true;
  fixture.runtime.refresh();
  fixture.drain();
  assert.equal(fixture.runtime.snapshot().active?.conceptId, "blocking-explanation");
  fixture.dispose();
});

test("strict guided sessions remain authoritative over preventive contextual concepts", () => {
  const fixture = createRuntime([PREVENTIVE_CONCEPT], () => ({ guidedActive: true }));
  assert.equal(fixture.runtime.authorizeIntent({ kind: "card.play", cardId: "source:1" }).allowed, true);
  assert.equal(fixture.runtime.snapshot().status, "idle");
  fixture.dispose();
});

test("contextual callout supports authored modal blocking and stays mounted separately from strict guidance", async () => {
  const [component, board] = await Promise.all([
    readFile(new URL("../src/components/ContextualTutorialCallout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(component, /role="dialog"/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /data-blocks-gameplay=/u);
  assert.match(component, /aria-modal=\{active\.blocksGameplayWhileVisible \? "true" : "false"\}/u);
  assert.match(component, /active\.placementAnchor/u);
  assert.match(component, /placementOnly/u);
  assert.match(component, /placeGuidedCallout\([\s\S]*?calloutRects/su);
  assert.match(component, /event\.key !== "Escape"/u);
  assert.match(component, /contextualTutorialRuntime\.acknowledgeActive/u);
  assert.match(component, /tutorialCalloutWidth/u);
  assert.match(component, /<div className="contextual-tutorial-heading">\s*<h2 id=\{titleId\} style=\{\{ fontSize: titleFontSize \}\}>/su);
  assert.doesNotMatch(component, /tutorial-dialog-heading-ornament/u);
  assert.match(component, /highlight\.showHighlight !== false/u);
  assert.match(component, /resolved\[index\]\?\.showHighlight/u);
  assert.doesNotMatch(component, /addEventListener\("pointerdown"/u);
  assert.match(board, /<GuidedTutorialOverlay\s*\/>\s*<ContextualTutorialCallout\s*\/>/u);
});

test("first-Canon Evy narration overlays gameplay without moving the Hand", async () => {
  const [opening, firstCanon, firstCanonRuntime, contextual, cardPreview, learnDirector, styles] = await Promise.all([
    readFile(new URL("../src/components/OpeningHandOverlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/FirstCanonVisionCallout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/guidance/firstCanonVisionProductRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ContextualTutorialCallout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CardPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/guidance/learnToPlayDirector.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(opening, /<GuidedTutorialDialog[\s\S]*title=\{t\("guided\.learnToPlay\.intro\.evy"\)\}/u);
  assert.match(opening, /createPortal\(/u);
  assert.match(opening, /openingInteractionLocked/u);
  assert.match(opening, /event\.target !== event\.currentTarget/u);
  assert.match(opening, /event\.animationName !== "opening-hand-card-enter"/u);
  assert.match(opening, /openingCardsSettled \? "is-settled"/u);
  assert.match(opening, /chooseFirstCanonVisionGuidance\("guided"\)/u);
  assert.match(opening, /chooseFirstCanonVisionGuidance\("independent"\)/u);
  assert.match(firstCanonRuntime, /mode === "repeat" \? "repeat" : "unseen"/u);
  assert.match(firstCanonRuntime, /tutorialContextualJourney/u);
  assert.match(firstCanonRuntime, /suppressConceptsForSession/u);
  assert.match(firstCanon, /className="first-canon-narration first-canon-evy-dialog"/u);
  assert.match(firstCanon, /<mask id=\{FIRST_CANON_MASK_ID\}/u);
  assert.doesNotMatch(firstCanon, /onArrivalComplete|completeHostAwakening/u);
  assert.match(contextual, /const speaker = active\.copy\.speakerKey/u);
  assert.doesNotMatch(opening, /first-canon-narration-topic/u);
  assert.doesNotMatch(firstCanon, /first-canon-narration-topic/u);
  assert.doesNotMatch(contextual, /contextual-evy-topic/u);
  assert.match(styles, /\.guided-tutorial-callout\.opening-hand-narration\s*\{[^}]*position:\s*absolute;/su);
  assert.match(styles, /\.opening-hand-narration-layer\s*\{[^}]*position:\s*fixed;/su);
  assert.doesNotMatch(styles, /\.opening-hand-layout:has\(\.opening-hand-narration\)/u);
  assert.doesNotMatch(cardPreview, /card-preview-locked-close/u);
  assert.match(learnDirector, /activateContextualSessionPolicy/u);
  assert.match(learnDirector, /suppressConceptsForSession\(\["low-life-contemplate"\]\)/u);
  assert.match(styles, /\.opening-hand-card-entry\.is-settled\s*\{[^}]*animation:\s*none;/su);
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
