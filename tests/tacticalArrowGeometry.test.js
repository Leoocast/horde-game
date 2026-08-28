import assert from "node:assert/strict";
import { test } from "node:test";

import {
  combatArrowCurve,
  pointOnCurve,
  tacticalArrowCurvesMatch,
  tacticalArrowPalette,
  tacticalArrowShape,
  tangentOnCurve,
  targetArrowCurve,
} from "../src/components/tacticalArrowGeometry";

test("the blade keeps the authored anchors: the head tip lands exactly on the target", () => {
  const start = { x: 120, y: 620 };
  const end = { x: 640, y: 210 };

  for (const curve of [combatArrowCurve(start, end), targetArrowCurve(start, end)]) {
    assert.deepEqual(curve.start, start, "the arrow still leaves the authored origin");
    assert.deepEqual(curve.end, end, "the arrow still locks onto the authored target");

    const shape = tacticalArrowShape(curve);
    assert.ok(shape.outline.includes(`L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`), "the head vertex sits on the lock position");
    assert.ok(shape.outline.startsWith("M "), "the blade is a filled outline, not a stroked line");
    assert.ok(shape.outline.endsWith(" Z"), "the blade outline closes on itself");
    assert.ok(!/NaN/.test(shape.outline));
  }
});

test("the blade and arrowhead form one continuous silhouette without an internal seam", () => {
  const curve = combatArrowCurve({ x: 40, y: 180 }, { x: 360, y: 60 });
  const shape = tacticalArrowShape(curve);

  assert.equal(typeof shape.outline, "string");
  assert.equal((shape.outline.match(/\bM\b/g) ?? []).length, 1, "the silhouette has a single contour");
  assert.equal((shape.outline.match(/\bZ\b/g) ?? []).length, 1, "the silhouette closes only once");
  assert.ok(!/NaN/.test(shape.outline));
});

test("the quadratic targeting arc survives the lift to a cubic curve", () => {
  const start = { x: 80, y: 500 };
  const end = { x: 520, y: 180 };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const bow = Math.min(64, Math.max(24, length * 0.16));
  const control = {
    x: (start.x + end.x) / 2 + (-(end.y - start.y) / length) * bow,
    y: (start.y + end.y) / 2 + ((end.x - start.x) / length) * bow,
  };

  const curve = targetArrowCurve(start, end);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const u = 1 - t;
    const expected = {
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
    };
    const actual = pointOnCurve(curve, t);
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9, `t=${t} stays on the authored arc`);
  }
});

test("a degenerate arrow reports a direction instead of NaN", () => {
  const point = { x: 300, y: 300 };
  const curve = combatArrowCurve(point, point);
  const tangent = tangentOnCurve(curve, 1);

  assert.ok(Number.isFinite(tangent.x) && Number.isFinite(tangent.y));
  assert.ok(!/NaN/.test(tacticalArrowShape(curve).outline));
});

test("each surface colour derives its own deep, hot and glint tones", () => {
  const defense = tacticalArrowPalette("#66d8ff");

  assert.equal(defense.mid, "#66d8ff", "the authored colour is kept as the body tone");
  assert.equal(defense.deep, "#2e6173");
  assert.equal(defense.hot, "#91e3ff");
  assert.equal(defense.core, "#baedff");

  // El tono de punta y el del destello deben seguir leyéndose como el color de
  // la superficie: si se blanquean, ataque y defensa dejan de distinguirse.
  for (const color of ["#66d8ff", "#f28a35", "#4ade80", "#f04438"]) {
    const palette = tacticalArrowPalette(color);
    for (const tone of [palette.hot, palette.core]) {
      const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(tone.slice(index, index + 2), 16));
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) >= 60, `${tone} keeps a visible hue for ${color}`);
    }
  }

  const unparsed = tacticalArrowPalette("currentColor");
  assert.equal(unparsed.core, "currentColor", "an unknown colour never produces a broken tone");
});

test("arrows only re-render when a control point actually moved", () => {
  const a = combatArrowCurve({ x: 0, y: 0 }, { x: 200, y: 120 });
  const b = combatArrowCurve({ x: 0, y: 0 }, { x: 200, y: 120 });
  const c = combatArrowCurve({ x: 0, y: 0 }, { x: 201, y: 120 });

  assert.equal(tacticalArrowCurvesMatch(a, b), true);
  assert.equal(tacticalArrowCurvesMatch(a, c), false);
});
