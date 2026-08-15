import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  GuidedAnchorRegistry,
  guidedCardAnchorKey,
  guidedConnectorPath,
  guidedDomTargetAllowed,
  guidedSurfaceAnchorKey,
  guidedUnionBounds,
  placeGuidedCallout,
  resolveGuidedAnchors,
  validateGuidedLesson,
} from "../src/guidance";
import { contentCatalog } from "../src/content/bootstrap";
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
  const [board, battlefield, overlay, comparison, card, styles] = await Promise.all([
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GuidedTutorialOverlay.tsx", import.meta.url), "utf8"),
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
  assert.match(overlay, /<GuidedCardComparison cards=\{comparisonCards\}/u);
  assert.match(comparison, /guided-card-comparison-cost-accessible/u);
  assert.doesNotMatch(comparison, /<figcaption/u);
  assert.match(comparison, /import \{ CardCostBadge \} from "\.\/Card";/u);
  assert.match(comparison, /<CardCostBadge card=\{card\} \/>/u);
  assert.doesNotMatch(comparison, /<Zap|guided-card-comparison-cost"/u);
  assert.match(battlefield, /"battlefield:player:sources-visual"/u);
  assert.match(battlefield, /className="guided-player-sources-anchor"/u);
  assert.match(battlefield, /data-guided-anchor-extension="true"/u);
  assert.doesNotMatch(overlay, /closest\("#guided-tutorial-overlay/u);
  assert.match(overlay, /showCallout && \(/u);
  assert.match(overlay, /\{showCallout && \(\s*<>\s*<svg className="guided-tutorial-mask"/su);
  assert.match(overlay, /\{showCallout && !missingAnchor && comparisonCards\.length > 0 && \(/u);
  assert.match(overlay, /allowedIntent\.kind === "phase\.continueSetup"/u);
  assert.match(overlay, /setDismissedActionCalloutStepId\(session\.currentStep\.id\)/u);
  assert.match(overlay, /guidedUnionBounds/u);
  assert.match(styles, /\.guided-tutorial-overlay\[data-mode="explain"\],[\s\S]*?pointer-events: auto;/u);
  assert.match(styles, /guided-tutorial-overlay:not\(\[data-card-preview-visible="true"\]\)/u);
  assert.match(styles, /\.guided-card-comparison\s*\{[^}]*top:\s*58%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\);/su);
  assert.match(styles, /\.guided-card-comparison-item\s*\{[^}]*width:\s*clamp\(240px, 24\.8vw, 360px\);/su);
  assert.match(styles, /\.guided-card-comparison-frame > \.card-cost-badge\s*\{/u);
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
  assert.match(board, /sessionKind === "tutorial"/u);
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
