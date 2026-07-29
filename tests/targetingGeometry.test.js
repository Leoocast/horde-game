import assert from "node:assert/strict";
import { test } from "node:test";

import { rectanglesOverlap, shouldRevealOverlappedTargets } from "../src/components/targetingGeometry";

test("targeting source fades only when it covers a target by visible area", () => {
  const source = { left: 700, right: 980, top: 180, bottom: 570 };

  assert.equal(
    rectanglesOverlap(source, { left: 650, right: 760, top: 420, bottom: 610 }),
    true,
  );
  assert.equal(
    rectanglesOverlap(source, { left: 580, right: 700, top: 220, bottom: 410 }),
    false,
    "touching an edge is not visual overlap",
  );
  assert.equal(
    rectanglesOverlap(source, { left: 420, right: 640, top: 200, bottom: 500 }),
    false,
  );

  const coveredTarget = { left: 650, right: 760, top: 420, bottom: 610 };
  assert.equal(
    shouldRevealOverlappedTargets(source, [coveredTarget], { x: 820, y: 320 }),
    true,
    "hovering the source reveals a target covered elsewhere by that source",
  );
  assert.equal(
    shouldRevealOverlappedTargets(source, [coveredTarget], { x: 640, y: 320 }),
    false,
    "the source remains opaque while the pointer is outside it",
  );
});
