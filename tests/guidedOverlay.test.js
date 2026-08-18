import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  GuidedAnchorRegistry,
  guidedBoundsEqual,
  guidedCardAnchorKey,
  guidedConnectorPath,
  guidedDirectionalCueBounds,
  guidedDomTargetAllowed,
  guidedSurfaceAnchorKey,
  guidedUnionBounds,
  placeGuidedCallout,
  resolveGuidedAnchors,
  validateGuidedLesson,
} from "../src/guidance";
import { contentCatalog } from "../src/content/bootstrap";
import { createGuidedFrameLoop } from "../src/components/guidedFrameLoop";
import { tutorialCalloutWidth } from "../src/components/tutorialCalloutSizing";
import { GUIDANCE_LAB_LESSON } from "../src/playground/guidanceLabDefinition";

test("semantic anchors keep simultaneous presentation owners isolated", () => {
  const registry = new GuidedAnchorRegistry();
  const key = guidedCardAnchorKey("source-instance");
  const hand = fakeElement({ isConnected: false });
  const field = fakeElement({ isConnected: true });

  registry.set(key, "hand", hand);
  registry.set(key, "field", field);
  assert.equal(registry.preferred(key), field);

  // Removing the old Hand owner must not unregister the copy that has already reached the Field.
  registry.set(key, "hand", null);
  assert.equal(registry.preferred(key), field);
  assert.deepEqual(registry.snapshot().keys, [key]);

  registry.set(key, "field", null);
  assert.deepEqual(registry.snapshot().keys, []);
});

test("authored aliases and highlight roles resolve without card names or selectors", () => {
  const registry = new GuidedAnchorRegistry();
  const source = fakeElement({ isConnected: true });
  const field = fakeElement({ isConnected: true });
  registry.set(guidedCardAnchorKey("instance-7"), "hand", source);
  registry.set(guidedSurfaceAnchorKey("player.field"), "field", field);

  const resolved = resolveGuidedAnchors([
    { kind: "card", alias: "source", role: "origin" },
    { kind: "surface", anchor: "player.field", role: "destination" },
  ], { source: "instance-7" }, registry);

  assert.deepEqual(resolved.map(({ key, role }) => ({ key, role })), [
    { key: "card:instance-7", role: "origin" },
    { key: "surface:player.field", role: "destination" },
  ]);
  assert.equal(resolved[0].element, source);
  assert.equal(resolved[1].element, field);
});

test("callout placement remains on screen and avoids a normal spotlight", () => {
  const target = { key: "card:source", role: "focus", left: 320, top: 250, width: 130, height: 180 };
  const placed = placeGuidedCallout({ width: 900, height: 650 }, { width: 300, height: 170 }, [target]);
  assert.ok(placed.left >= 16);
  assert.ok(placed.top >= 16);
  assert.ok(placed.left + 300 <= 884);
  assert.ok(placed.top + 170 <= 634);
  assert.equal(overlapArea({ ...placed, width: 300, height: 170 }, target), 0);
});

test("authored placement keeps defense help left of the player field", () => {
  const target = { key: "surface:player.field", role: "focus", left: 500, top: 390, width: 320, height: 170 };
  const placed = placeGuidedCallout(
    { width: 1200, height: 760 },
    { width: 360, height: 180 },
    [target],
    "left",
  );
  assert.ok(placed.left + 360 < target.left);
});

test("directional cues rise inside their authored card", () => {
  const target = { key: "card:maela", role: "origin", left: 440, top: 320, width: 150, height: 210 };
  const cue = guidedDirectionalCueBounds(target);
  assert.ok(cue.left >= target.left);
  assert.ok(cue.left + cue.width <= target.left + target.width);
  assert.ok(cue.top >= target.top);
  assert.ok(cue.top + cue.height <= target.top + target.height);
});

test("guided geometry loops keep one frame owner and stop without orphan callbacks", () => {
  let nextFrame = 0;
  let measurements = 0;
  const pending = new Map();
  const loop = createGuidedFrameLoop(
    () => { measurements += 1; },
    {
      request(callback) {
        const frame = ++nextFrame;
        pending.set(frame, callback);
        return frame;
      },
      cancel(frame) {
        pending.delete(frame);
      },
    },
  );

  loop.start();
  assert.equal(measurements, 1);
  assert.equal(pending.size, 1);

  for (let notification = 0; notification < 20; notification += 1) loop.measureNow();
  assert.equal(pending.size, 1, "observer measurements must not create another frame chain");

  for (let tick = 0; tick < 100; tick += 1) {
    const [frame, callback] = pending.entries().next().value;
    pending.delete(frame);
    callback(tick * 16.67);
    assert.equal(pending.size, 1);
  }

  const staleCallback = pending.values().next().value;
  loop.stop();
  assert.equal(pending.size, 0);
  staleCallback(2_000);
  assert.equal(pending.size, 0, "a late cancelled callback must not resurrect the loop");

  loop.start();
  assert.equal(pending.size, 1);
  const measurementsAfterRestart = measurements;
  staleCallback(2_100);
  assert.equal(pending.size, 1, "a stale callback must not duplicate a restarted loop");
  assert.equal(measurements, measurementsAfterRestart, "a stale callback must not sample the new lifecycle");
  loop.stop();
});

test("identical journey cue bounds do not create repeated state identities", () => {
  let current;
  let changes = 0;
  const accept = (next) => {
    if (guidedBoundsEqual(current, next)) return;
    current = next;
    changes += 1;
  };

  for (let frame = 0; frame < 10_000; frame += 1) {
    accept({ left: 120, top: 80, width: 72, height: 140 });
  }
  assert.equal(changes, 1);
  accept({ left: 121, top: 80, width: 72, height: 140 });
  assert.equal(changes, 2);
});

test("origin and destination highlights produce a directional connector", () => {
  const path = guidedConnectorPath([
    { key: "card:source", role: "origin", left: 100, top: 420, width: 100, height: 140 },
    { key: "surface:field", role: "destination", left: 350, top: 160, width: 280, height: 150 },
  ]);
  assert.match(path, /^M .* C .*$/u);
  assert.equal(guidedConnectorPath([
    { key: "card:source", role: "focus", left: 100, top: 420, width: 100, height: 140 },
  ]), undefined);
});

test("a highlighted card can extend its spotlight to an overflow action", () => {
  assert.deepEqual(guidedUnionBounds([
    { left: 100, top: 200, width: 120, height: 160 },
    { left: 228, top: 246, width: 148, height: 52 },
  ]), { left: 100, top: 200, width: 276, height: 160 });
});

test("the DOM shield opens only authored Act anchors while overlay controls remain usable", () => {
  const card = guidedCardAnchorKey("source");
  const field = guidedSurfaceAnchorKey("player.field");
  assert.equal(guidedDomTargetAllowed("explain", [card], [card]), false);
  assert.equal(guidedDomTargetAllowed("observe", [card], [card]), false);
  assert.equal(guidedDomTargetAllowed("act", [field], [card]), false);
  assert.equal(guidedDomTargetAllowed("act", [field, card], [card]), true);
  assert.equal(guidedDomTargetAllowed("explain", [], [], true), true);
});

test("lesson validation rejects unknown highlight roles and Act steps without a target", () => {
  const invalidRole = structuredClone(GUIDANCE_LAB_LESSON);
  invalidRole.steps[0].highlights[0].role = "mystery";
  assert.ok(validateGuidedLesson(invalidRole, contentCatalog).some((problem) => /unknown highlight role/u.test(problem)));

  const emptyAct = structuredClone(GUIDANCE_LAB_LESSON);
  emptyAct.steps.find((step) => step.kind === "act").highlights = [];
  assert.ok(validateGuidedLesson(emptyAct, contentCatalog).some((problem) => /requires at least one highlight/u.test(problem)));

  const repeatedComparison = structuredClone(GUIDANCE_LAB_LESSON);
  repeatedComparison.steps[0].presentation = {
    kind: "cardComparison",
    cardAliases: ["source_to_play", "source_to_play"],
    emphasis: "energyCost",
  };
  assert.ok(validateGuidedLesson(repeatedComparison, contentCatalog).some((problem) => /comparison repeats alias/u.test(problem)));
});

test("the real Board mounts the overlay and its capture shield covers every input family", async () => {
  const [board, battlefield, overlay, contextual, journeyCues, comparison, card, styles] = await Promise.all([
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GuidedTutorialOverlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ContextualTutorialCallout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/LearnToPlayJourneyCues.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GuidedCardComparison.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(board, /<GuidedTutorialOverlay\s*\/>/u);
  for (const eventName of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu", "dragstart", "dragover", "drop", "keydown"]) {
    assert.match(overlay, new RegExp(`addEventListener\\("${eventName}"`, "u"));
  }
  assert.match(card, /tabIndex=\{selectionDisabled \? undefined : 0\}/u);
  assert.match(card, /onKeyboardActivate \?\? onSelect/u);
  assert.match(overlay, /data-guided-overlay-control="true"/u);
  assert.match(overlay, /guidedGlossarySegments/u);
  assert.match(overlay, /data-guided-glossary-term="true"/u);
  assert.match(overlay, /tooltipClassName="guided-glossary-tooltip"/u);
  assert.match(overlay, /highlight\.anchor === "card\.preview"/u);
  assert.match(overlay, /data-card-preview-visible=/u);
  assert.match(overlay, /<GuidedCardComparison\s+cards=\{comparisonCards\}/u);
  assert.match(comparison, /guided-card-comparison-cost-accessible/u);
  assert.match(comparison, /<CardStatsBadge stats=\{combatStats\}/u);
  assert.doesNotMatch(comparison, /<figcaption/u);
  assert.match(comparison, /import \{ CardCostBadge, CardStatsBadge \} from "\.\/Card";/u);
  assert.match(comparison, /<CardCostBadge card=\{card\} \/>/u);
  assert.doesNotMatch(comparison, /<Zap|guided-card-comparison-cost"/u);
  assert.match(battlefield, /"battlefield:player:sources-visual"/u);
  assert.match(battlefield, /className="guided-player-sources-anchor"/u);
  assert.match(battlefield, /data-guided-anchor-extension="true"/u);
  assert.doesNotMatch(overlay, /closest\("#guided-tutorial-overlay/u);
  assert.match(overlay, /showCallout && \(/u);
  assert.match(overlay, /\{showCallout && \(\s*<>\s*<svg className="guided-tutorial-mask"/su);
  assert.match(overlay, /showSilentSpotlight/u);
  assert.match(overlay, /presentation\?\.kind === "spotlight"\s*&& session\.presentationSettled/su);
  assert.match(overlay, /data-tone=\{showSilentSpotlight \? presentation\.tone : undefined\}/u);
  assert.match(overlay, /guided-tutorial-directional-cue/u);
  assert.match(overlay, /!isLearnToPlay &&/u);
  assert.match(overlay, /tutorial-dialog-heading/u);
  assert.match(overlay, /<div className="tutorial-dialog-heading">\s*<h2 id="guided-tutorial-title">\{title\}<\/h2>/su);
  assert.doesNotMatch(overlay, /tutorial-dialog-heading-ornament/u);
  assert.match(overlay, /guided\.contextual\.understood/u);
  assert.match(overlay, /\{showCallout && !missingAnchor && comparisonCards\.length > 0 && \(/u);
  assert.match(overlay, /allowedIntent\.kind === "phase\.continueSetup"/u);
  assert.match(overlay, /setDismissedActionCalloutStepId\(session\.currentStep\.id\)/u);
  assert.match(overlay, /guidedUnionBounds/u);
  assert.match(overlay, /tutorialCalloutWidth/u);
  assert.doesNotMatch(
    overlay,
    /requestAnimationFrame\(measure\)/u,
    "an observer measurement callback must not own a self-scheduling animation-frame chain",
  );
  assert.match(overlay, /createGuidedFrameLoop\(measure\)/u);
  assert.match(overlay, /new ResizeObserver\(\(\) => loop\.measureNow\(\)\)/u);
  assert.match(contextual, /const visible = Boolean\(active && guided\.status !== "running"\)/u);
  assert.match(contextual, /createGuidedFrameLoop\(measure\)/u);
  assert.match(journeyCues, /guidedBoundsEqual\(boundsRef\.current, next\)/u);
  assert.match(styles, /\.guided-tutorial-overlay\[data-mode="explain"\],[\s\S]*?pointer-events: auto;/u);
  assert.match(styles, /guided-tutorial-overlay:not\(\[data-card-preview-visible="true"\]\)/u);
  assert.match(styles, /\.guided-card-comparison\s*\{[^}]*top:\s*56%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\);/su);
  assert.match(styles, /\.guided-card-comparison-item\s*\{[^}]*width:\s*clamp\(260px, 26vw, 390px\);/su);
  assert.match(styles, /\.guided-card-comparison-frame > \.card-cost-badge\s*\{/u);
  assert.match(styles, /\.guided-card-comparison\.is-combatStats \.card-stat-attack\s*\{/u);
  assert.match(styles, /\.guided-card-comparison\.is-combatStats \.card-stat-life\s*\{/u);
  assert.match(styles, /\.guided-tutorial-directional-cue\[data-tone="attack"\]/u);
  assert.match(styles, /\.guided-tutorial-ring\[data-tone="gold"\]/u);
  assert.match(styles, /@keyframes guided-phase-frame-arrive/u);
  assert.match(styles, /0% \{ opacity: 0; transform: scale\(2\.8\); \}/u);
  assert.doesNotMatch(styles, /\.game-phase-button\.is-learn-to-play-attention/u);
  assert.doesNotMatch(styles, /tutorial-dialog-heading-ornament/u);
  assert.match(styles, /\.tutorial-dialog-heading,\s*\.contextual-tutorial-heading\s*\{[^}]*border-bottom:/su);
  assert.doesNotMatch(styles, /\.guided-card-comparison-frame::after\s*\{/u);
  assert.match(styles, /\.guided-tutorial-overlay\.has-card-comparison \.guided-tutorial-callout\s*\{[^}]*width:\s*min\(580px, calc\(100vw - 48px\)\);/su);
  const costFocus = styles.match(/@keyframes guided-card-cost-focus\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
  assert.match(costFocus, /drop-shadow/u);
  assert.doesNotMatch(costFocus, /opacity\s*:/u);
  assert.match(styles, /\.guided-tutorial-dimmer\s*\{\s*fill:\s*rgb\(2 4 4 \/ 0\.35\);\s*\}/u);
  assert.match(styles, /\.guided-tutorial-ring::after\s*\{[^}]*transform:\s*translateX\(-50%\) rotate\(45deg\);/su);
  assert.match(styles, /guided-tutorial-overlay:has\(\.guided-tutorial-ring\[data-anchor-key="surface:player\.sources"\]\)[\s\S]*?guided-tutorial-ring\[data-anchor-key="surface:player\.reserve"\]::after\s*\{\s*display:\s*none;/u);
  assert.match(styles, /\.guided-tutorial-ring\[data-anchor-key\^="card:"\]\s*\{\s*display:\s*none;\s*\}/u);
  assert.match(styles, /\.guided-tutorial-body p\s*\{[^}]*font-size:\s*16px;/su);
  assert.match(styles, /\.guided-tutorial-callout h2\s*\{[^}]*white-space:\s*nowrap;/su);
  assert.match(styles, /\.contextual-tutorial-callout h2\s*\{[^}]*white-space:\s*nowrap;/su);
  assert.match(styles, /\.guided-glossary-term\s*\{[^}]*color:\s*#d9bd70;[^}]*text-decoration-style:\s*dotted;/su);
  assert.match(styles, /\.guided-glossary-tooltip\s*\{[^}]*z-index:\s*20020;/su);
  assert.match(
    styles,
    /\.guided-tutorial-overlay\s*\{[^}]*font-family:\s*"Trebuchet MS", Verdana, Tahoma, ui-sans-serif, system-ui, sans-serif;/su,
  );
  assert.match(styles, /\.guided-tutorial-callout h2\s*\{[^}]*font-family:\s*inherit;[^}]*font-weight:\s*600;/su);
  assert.match(styles, /\.guided-tutorial-body p\s*\{[^}]*font-family:\s*inherit;/su);
  assert.match(styles, /\.guided-tutorial-continue\s*\{[^}]*font-family:\s*inherit;/su);
  assert.match(styles, /\.guided-player-sources-anchor\s*\{[^}]*width:\s*174px;[^}]*height:\s*85px;/su);
  assert.match(board, /sessionPolicy\.guidedSystemControls/u);
});

test("tutorial titles expand their dialog before wrapping", () => {
  const expanded = tutorialCalloutWidth("Invoca a Aelyra, Heredera de Elarion", 1280, {
    minimum: 430,
    maximum: 660,
    titleCharacterWidth: 12.5,
    chromeWidth: 108,
  });
  assert.ok(expanded > 430);
  assert.ok(expanded <= 660);
  assert.equal(tutorialCalloutWidth("A deliberately long tutorial title", 320, {
    minimum: 430,
    maximum: 660,
    titleCharacterWidth: 12.5,
    chromeWidth: 108,
  }), 288);
});

function fakeElement({ isConnected }) {
  return {
    isConnected,
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 140 }),
  };
}

function overlapArea(left, right) {
  const width = Math.max(0, Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top));
  return width * height;
}
