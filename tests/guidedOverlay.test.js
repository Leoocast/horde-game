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
  paddedGuidedRect,
  guidedSurfaceAnchorKey,
  guidedUnionBounds,
  placeGuidedCallout,
  resolveGuidedAnchors,
  statBadgeAnchor,
  statLabelEdgePoint,
  statLabelLeaders,
  statLabelLeadersEqual,
  validateGuidedLesson,
} from "../src/guidance";
import { contentCatalog } from "../src/content/bootstrap";
import { createGuidedFrameLoop } from "../src/components/guidedFrameLoop";
import { energyRecycleDropZoneContains } from "../src/components/energyRecycleDropTarget";
import { tutorialCalloutTitleFontSize, tutorialCalloutWidth } from "../src/components/tutorialCalloutSizing";
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

test("a sideways Flying attacker can receive a larger highlight shifted to its visual center", () => {
  assert.deepEqual(
    paddedGuidedRect("card:flying", "focus", { left: 500, top: 260, width: 210, height: 145 }, 18, 16, 0),
    { key: "card:flying", role: "focus", left: 498, top: 242, width: 246, height: 181 },
  );
});

test("the Source return keeps the broad rightward gesture and extends down over the printed Archive", () => {
  const viewport = { width: 1280, height: 720 };
  const archive = { left: 1120, top: 590, width: 96, height: 72 };
  assert.equal(energyRecycleDropZoneContains({ x: 1168, y: 450 }, viewport, archive), true);
  assert.equal(energyRecycleDropZoneContains({ x: 1168, y: 700 }, viewport, archive), true);
  assert.equal(energyRecycleDropZoneContains({ x: 990, y: 700 }, viewport, archive), false);
  assert.equal(energyRecycleDropZoneContains({ x: 990, y: 450 }, viewport, archive), false);
});

test("directional cues rise from their authored card and clear its top edge", () => {
  const target = { key: "card:maela", role: "origin", left: 440, top: 320, width: 150, height: 210 };
  const cue = guidedDirectionalCueBounds(target);
  assert.ok(cue.left >= target.left);
  assert.ok(cue.left + cue.width <= target.left + target.width);
  assert.ok(cue.top < target.top, "the tip must leave the card toward the field");
  assert.ok(
    cue.top + cue.height > target.top + target.height * 0.4,
    "the base must still rest on the card so the cue names it",
  );
  assert.ok(cue.top + cue.height < target.top + target.height, "the cue must not reach the card's lower edge");
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
  const [board, battlefield, hand, overlay, dialog, contextual, journeyCues, comparison, card, styles] = await Promise.all([
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Hand.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GuidedTutorialOverlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GuidedTutorialDialog.tsx", import.meta.url), "utf8"),
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
  assert.match(hand, /currentStep\?\.id === "invoke-aelyra"/u);
  assert.match(hand, /emphasizeCost=\{guidedCostCardId === card\.instanceId\}/u);
  assert.match(card, /CardCostBadge card=\{card\} emphasized=\{emphasizeCost\}/u);
  assert.match(card, /data-guided-anchor-extension="true"/u);
  assert.match(card, /card-cost-emphasis-frame/u);
  assert.match(overlay, /<GuidedTutorialDialog/u);
  assert.match(dialog, /data-guided-overlay-control="true"/u);
  assert.equal((overlay.match(/if \(!isControl\(event\.target\)\) dismissActionCallout\(\);/gu) ?? []).length, 2);
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
  assert.match(overlay, /const showDimmer = showCallout && session\.currentStep\?\.dimmer !== "hidden";/u);
  assert.match(overlay, /\{showDimmer && \(\s*<rect className="guided-tutorial-dimmer"/su);
  assert.match(overlay, /showSilentSpotlight/u);
  assert.match(overlay, /presentation\?\.kind === "spotlight"\s*&& session\.presentationSettled/su);
  assert.match(overlay, /data-tone=\{showSilentSpotlight \? presentation\.tone : undefined\}/u);
  assert.match(overlay, /guided-tutorial-directional-cue/u);
  assert.match(dialog, /!isLearnToPlay &&/u);
  assert.match(dialog, /tutorial-dialog-heading/u);
  assert.match(dialog, /<div className="tutorial-dialog-heading">\s*<h2 id=\{titleId\} style=\{\{ fontSize: titleFontSize \}\}>\{title\}<\/h2>/su);
  assert.doesNotMatch(dialog, /tutorial-dialog-heading-ornament/u);
  assert.match(overlay, /guided\.contextual\.understood/u);
  assert.match(overlay, /\{showCallout && !missingAnchor && comparisonCards\.length > 0 && \(/u);
  assert.match(overlay, /allowedIntent\.kind === "phase\.continueSetup"/u);
  assert.match(overlay, /setDismissedActionCalloutScope\(stepScope\)/u);
  assert.match(overlay, /guidedUnionBounds/u);
  assert.match(overlay, /tutorialCalloutWidth/u);
  assert.doesNotMatch(
    overlay,
    /requestAnimationFrame\(measure\)/u,
    "an observer measurement callback must not own a self-scheduling animation-frame chain",
  );
  assert.match(overlay, /createGuidedFrameLoop\(measure\)/u);
  assert.match(overlay, /new ResizeObserver\(\(\) => loop\.measureNow\(\)\)/u);
  assert.doesNotMatch(overlay, /setFeedback\(undefined\)/u);
  assert.match(overlay, /feedbackState\?\.scope === stepScope/u);
  assert.match(overlay, /session\.currentStep\?\.id === "inspect-harvester"[\s\S]*setFocusedCardId\(harvesterId\)/u);
  assert.doesNotMatch(overlay, /feedback \? "is-rejected"/u);
  assert.doesNotMatch(styles, /\.guided-tutorial-ring\.is-rejected/u);
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
  assert.match(styles, /\.guided-tutorial-dimmer\s*\{\s*fill:\s*rgb\(2 4 4 \/ 0\.42\);\s*\}/u);
  assert.match(styles, /@keyframes guided-tutorial-ready\s*\{[^}]*scale\(0\.985\)[\s\S]*?scale\(1\.045\)/u);
  assert.match(styles, /\.card-cost-badge\.is-guided-emphasis\s*\{/u);
  assert.match(styles, /\.card-cost-badge\.is-guided-emphasis > \.card-cost-emphasis-frame\s*\{/u);
  assert.match(styles, /\.guided-tutorial-ring::after\s*\{[^}]*transform:\s*translateX\(-50%\) rotate\(45deg\);/su);
  assert.match(styles, /guided-tutorial-overlay:has\(\.guided-tutorial-ring\[data-anchor-key="surface:player\.sources"\]\)[\s\S]*?guided-tutorial-ring\[data-anchor-key="surface:player\.reserve"\]::after\s*\{\s*display:\s*none;/u);
  assert.match(styles, /\.guided-tutorial-ring\[data-anchor-key\^="card:"\]\s*\{\s*display:\s*none;\s*\}/u);
  assert.match(styles, /\.guided-tutorial-body p\s*\{[^}]*font-size:\s*16px;/su);
  assert.match(
    styles,
    /\.guided-tutorial-callout h2\s*\{[^}]*overflow-wrap:\s*normal;[^}]*white-space:\s*nowrap;/su,
  );
  assert.match(
    styles,
    /\.contextual-tutorial-callout h2\s*\{[^}]*overflow-wrap:\s*normal;[^}]*white-space:\s*nowrap;/su,
  );
  assert.match(
    styles,
    /\.tutorial-dialog-heading,\s*\.contextual-tutorial-heading\s*\{[^}]*align-items:\s*flex-start;[^}]*gap:\s*16px;/su,
  );
  assert.match(
    styles,
    /\.tutorial-dialog-close,\s*\.contextual-tutorial-close\s*\{[^}]*flex:\s*0 0 28px;/su,
  );
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

test("tutorial titles expand their dialog and shrink only when the viewport caps one row", () => {
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

  const profile = {
    minimum: 430,
    maximum: 760,
    titleCharacterWidth: 15.5,
    chromeWidth: 108,
  };
  const invokeTitle = "Use your Energy to Invoke new Echoes.";
  const desktopWidth = tutorialCalloutWidth(invokeTitle, 1280, profile);
  assert.equal(tutorialCalloutTitleFontSize(invokeTitle, desktopWidth, profile, 10, 25), 25);
  const constrainedWidth = tutorialCalloutWidth(invokeTitle, 520, profile);
  const constrainedFont = tutorialCalloutTitleFontSize(invokeTitle, constrainedWidth, profile, 10, 25);
  assert.ok(constrainedFont < 25);
  assert.ok(invokeTitle.length * profile.titleCharacterWidth * (constrainedFont / 25) <= constrainedWidth - profile.chromeWidth + 0.1);

  const contextualProfile = {
    minimum: 410,
    maximum: 760,
    titleCharacterWidth: 13,
    chromeWidth: 92,
  };
  const emptyHandTitle = "An empty Hand changes your draw";
  const contextualWidth = tutorialCalloutWidth(emptyHandTitle, 1024, contextualProfile);
  assert.equal(tutorialCalloutTitleFontSize(emptyHandTitle, contextualWidth, contextualProfile, 10, 21), 21);
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

test("stat label leaders land on each half of the badge whatever its width", () => {
  // Marcador de un dígito y el mismo con dos: sólo crece hacia la izquierda.
  const narrow = { left: 300, top: 400, width: 80, height: 46 };
  const wide = { left: 276, top: 400, width: 104, height: 46 };
  const labels = {
    power: { left: 90, top: 300, width: 150, height: 52 },
    endurance: { left: 210, top: 500, width: 150, height: 52 },
  };

  for (const badge of [narrow, wide]) {
    const leaders = statLabelLeaders(badge, labels);
    assert.deepEqual(leaders.map((leader) => leader.half), ["power", "endurance"]);
    const power = statBadgeAnchor(badge, "power");
    const endurance = statBadgeAnchor(badge, "endurance");
    // Cada guía apunta dentro de su mitad, nunca al centro ni a la mitad contraria.
    assert.ok(power.x > badge.left && power.x < badge.left + badge.width / 2);
    assert.ok(endurance.x > badge.left + badge.width / 2 && endurance.x < badge.left + badge.width);
    assert.equal(power.y, badge.top + badge.height / 2);
    assert.equal(endurance.y, badge.top + badge.height / 2);
    for (const leader of leaders) {
      const target = leader.half === "power" ? power : endurance;
      assert.ok(leader.path.endsWith(`${Math.round(target.x * 10) / 10} ${Math.round(target.y * 10) / 10}`));
      assert.ok(leader.radius >= 1.4);
    }
  }

  // El ancho del marcador mueve el destino: la guía no puede quedarse fija.
  assert.notEqual(statBadgeAnchor(narrow, "power").x, statBadgeAnchor(wide, "power").x);
});

test("stat label leaders leave through the edge that faces the badge", () => {
  const badge = { left: 300, top: 400, width: 80, height: 46 };
  const above = { left: 90, top: 300, width: 150, height: 52 };
  const below = { left: 210, top: 500, width: 150, height: 52 };

  // La cartela de arriba está a la izquierda y por encima: sale por abajo o por la
  // derecha, nunca por el lado contrario al marcador.
  const fromAbove = statLabelEdgePoint(above, statBadgeAnchor(badge, "power"));
  assert.ok(onBoundary(above, fromAbove));
  assert.ok(fromAbove.x === above.left + above.width || fromAbove.y === above.top + above.height);
  assert.notEqual(fromAbove.x, above.left);
  assert.notEqual(fromAbove.y, above.top);

  // La de abajo queda a la derecha y por debajo: sale por arriba o por la derecha.
  const fromBelow = statLabelEdgePoint(below, statBadgeAnchor(badge, "endurance"));
  assert.ok(onBoundary(below, fromBelow));
  assert.ok(fromBelow.y === below.top || fromBelow.x === below.left + below.width);
  assert.notEqual(fromBelow.y, below.top + below.height);

  // Un marcador que queda al otro lado mueve la salida a la mitad opuesta del canto.
  const mirrored = statLabelEdgePoint(below, statBadgeAnchor({ ...badge, left: 20 }, "power"));
  assert.ok(onBoundary(below, mirrored));
  assert.ok(mirrored.x < below.left + below.width / 2);
  assert.ok(fromBelow.x > below.left + below.width / 2);
});

test("stat label leaders stay stable so the observer cannot loop", () => {
  const badge = { left: 300, top: 400, width: 80, height: 46 };
  const labels = {
    power: { left: 90, top: 300, width: 150, height: 52 },
    endurance: { left: 210, top: 500, width: 150, height: 52 },
  };
  assert.ok(statLabelLeadersEqual(statLabelLeaders(badge, labels), statLabelLeaders(badge, labels)));
  const moved = { ...badge, left: badge.left + 12 };
  assert.equal(statLabelLeadersEqual(statLabelLeaders(badge, labels), statLabelLeaders(moved, labels)), false);
  // Una cartela todavía sin medir no dibuja guía a medias.
  assert.equal(statLabelLeaders(badge, { ...labels, power: { left: 0, top: 0, width: 0, height: 0 } }).length, 1);
  assert.equal(statLabelLeaders({ ...badge, width: 0 }, labels).length, 0);
});

function onBoundary(box, point) {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const onVerticalEdge = (point.x === box.left || point.x === right) &&
    point.y >= box.top && point.y <= bottom;
  const onHorizontalEdge = (point.y === box.top || point.y === bottom) &&
    point.x >= box.left && point.x <= right;
  return onVerticalEdge || onHorizontalEdge;
}
