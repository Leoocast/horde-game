import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ATTACK_CHEVRON_SHAPE,
  ATTACK_CHEVRON_VIEW,
  attackChevronGeometry,
  attackChevronTipAngle,
} from "../src/components/attackChevronGeometry";

const { width, height } = ATTACK_CHEVRON_VIEW;

function points(path) {
  return path
    .replace(/[MLZ]/g, " ")
    .trim()
    .split(/\s+/)
    .map(Number)
    .reduce((all, value, index, source) => {
      if (index % 2 === 0) all.push({ x: value, y: source[index + 1] });
      return all;
    }, []);
}

test("the blade is a single closed outline without holes", () => {
  const { blade } = attackChevronGeometry(width, height);

  assert.ok(blade.startsWith("M "), "the chevron is a filled outline, not a stroked line");
  assert.ok(blade.endsWith(" Z"), "the outline closes on itself");
  assert.equal(blade.match(/M /g).length, 1, "one subpath only: two would leave a seam under the bloom");
  assert.ok(!/NaN/.test(blade));
});

test("the outer shoulders end in a point instead of a flat cut", () => {
  const edges = new Map();
  for (const point of points(attackChevronGeometry(width, height).blade)) {
    edges.set(point.x, [...(edges.get(point.x) ?? []), point.y]);
  }
  const thicknessAt = (x) => Math.max(...edges.get(x)) - Math.min(...edges.get(x));

  // Que ambos cantos se toquen en el hombro es lo que separa esta hoja de la
  // silueta anterior, que llegaba al borde con un corte recto.
  assert.deepEqual(edges.get(0), [0], "the left shoulder is one vertex, not two");
  assert.deepEqual(edges.get(width), [0], "the right shoulder is one vertex, not two");

  const tip = thicknessAt(width / 2);
  assert.ok(Math.abs(tip - height * ATTACK_CHEVRON_SHAPE.thickness) < 0.011, "the tip carries the full thickness");

  const nearShoulder = [...edges.keys()].filter((x) => x > 0 && x < width / 2).sort((a, b) => a - b)[4];
  assert.ok(thicknessAt(nearShoulder) < tip * 0.12, "near the shoulder the blade is still an edge");
});

test("the tip lands on the bottom edge and the halves mirror each other", () => {
  const { tip, tipBottom } = attackChevronGeometry(width, height);

  assert.deepEqual(tip, { x: width / 2, y: height * ATTACK_CHEVRON_SHAPE.drop });
  assert.deepEqual(tipBottom, { x: width / 2, y: height }, "drop + thickness fill the box exactly");

  const drawn = points(attackChevronGeometry(width, height).blade);
  for (const point of drawn) {
    const mirrored = drawn.some(
      (other) => Math.abs(other.x - (width - point.x)) < 0.011 && Math.abs(other.y - point.y) < 0.011,
    );
    assert.ok(mirrored, `(${point.x}, ${point.y}) has no mirror across the tip`);
  }
});

test("the spine only ever falls, so the blade never doubles back on itself", () => {
  const drawn = points(attackChevronGeometry(width, height).blade);
  const half = drawn.filter((point) => point.x <= width / 2);

  for (const point of half) {
    assert.ok(point.y >= 0 && point.y <= height, `(${point.x}, ${point.y}) stays inside the authored box`);
  }

  const spine = half.slice(0, 57);
  for (let index = 1; index < spine.length; index += 1) {
    assert.ok(spine[index].y >= spine[index - 1].y, "the upper edge never rises back toward the shoulder");
    assert.ok(spine[index].x > spine[index - 1].x, "the upper edge advances toward the tip");
  }
});

test("the authored shape keeps the chosen tip angle", () => {
  assert.equal(Math.round(attackChevronTipAngle(width, height)), 104);

  // La proporción es parte de la silueta: estirar la hoja a la caja del slot
  // (195×27) la abriría más de quince grados.
  assert.ok(attackChevronTipAngle(195, height) - attackChevronTipAngle(width, height) > 15);
});
