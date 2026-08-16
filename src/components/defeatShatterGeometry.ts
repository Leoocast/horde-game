export type DefeatShatterPoint = {
  x: number;
  y: number;
};

export type DefeatShatterVector = {
  x: number;
  y: number;
  z: number;
};

export type DefeatShatterShard = {
  points: [DefeatShatterPoint, DefeatShatterPoint, DefeatShatterPoint];
  center: DefeatShatterPoint;
  depth: number;
  crackDelayMs: number;
  delayMs: number;
  durationMs: number;
  retained: boolean;
  tone: number;
  travel: DefeatShatterVector;
  spin: DefeatShatterVector;
  drop: number;
};

export type DefeatShatterPlan = {
  halfWidth: number;
  halfHeight: number;
  impact: DefeatShatterPoint;
  shards: DefeatShatterShard[];
};

const HORIZONTAL_SEGMENTS = 5;
const VERTICAL_SEGMENTS = 3;
const RING_FRACTIONS = [0.2, 0.54, 1] as const;
const HALF_HEIGHT = 3.8;

function fract(value: number): number {
  return value - Math.floor(value);
}

/** Random cosmético estable: el mismo Futuro siempre se rompe de la misma manera. */
function seededNoise(signature: number, index: number): number {
  return fract(Math.sin((index + 1) * 91.733 + signature * 2731.917) * 43758.5453123);
}

function boundaryPoints(halfWidth: number, halfHeight: number): DefeatShatterPoint[] {
  const points: DefeatShatterPoint[] = [];
  for (let index = 0; index < HORIZONTAL_SEGMENTS; index += 1) {
    points.push({
      x: -halfWidth + (index / HORIZONTAL_SEGMENTS) * halfWidth * 2,
      y: halfHeight,
    });
  }
  for (let index = 0; index < VERTICAL_SEGMENTS; index += 1) {
    points.push({
      x: halfWidth,
      y: halfHeight - (index / VERTICAL_SEGMENTS) * halfHeight * 2,
    });
  }
  for (let index = 0; index < HORIZONTAL_SEGMENTS; index += 1) {
    points.push({
      x: halfWidth - (index / HORIZONTAL_SEGMENTS) * halfWidth * 2,
      y: -halfHeight,
    });
  }
  for (let index = 0; index < VERTICAL_SEGMENTS; index += 1) {
    points.push({
      x: -halfWidth,
      y: -halfHeight + (index / VERTICAL_SEGMENTS) * halfHeight * 2,
    });
  }
  return points;
}

function triangleCenter(
  points: [DefeatShatterPoint, DefeatShatterPoint, DefeatShatterPoint],
): DefeatShatterPoint {
  return {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
}

function ringPoints(
  boundary: DefeatShatterPoint[],
  impact: DefeatShatterPoint,
  fraction: number,
  ringIndex: number,
  signature: number,
): DefeatShatterPoint[] {
  if (fraction === 1) return boundary;
  return boundary.map((edge, index) => {
    const dx = edge.x - impact.x;
    const dy = edge.y - impact.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const radialJitter = (seededNoise(signature, ringIndex * 101 + index) - 0.5) * 0.07;
    const tangentJitter = (seededNoise(signature, ringIndex * 173 + index + 47) - 0.5)
      * 0.22
      * (1 - fraction);
    const adjustedFraction = fraction + radialJitter;
    return {
      x: impact.x + dx * adjustedFraction + (-dy / length) * tangentJitter,
      y: impact.y + dy * adjustedFraction + (dx / length) * tangentJitter,
    };
  });
}

function makeShard(
  points: [DefeatShatterPoint, DefeatShatterPoint, DefeatShatterPoint],
  ringIndex: number,
  shardIndex: number,
  plan: Pick<DefeatShatterPlan, "halfWidth" | "halfHeight" | "impact">,
  signature: number,
): DefeatShatterShard {
  const center = triangleCenter(points);
  const dx = center.x - plan.impact.x;
  const dy = center.y - plan.impact.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const radius = Math.hypot(plan.halfWidth, plan.halfHeight);
  const distanceRatio = Math.min(1, distance / radius);
  const directionX = dx / distance;
  const directionY = dy / distance;
  const retainedRoll = seededNoise(signature, shardIndex * 19 + 5);
  const retained = ringIndex === RING_FRACTIONS.length - 1 && retainedRoll > 0.36;
  const force = retained
    ? 0.14 + seededNoise(signature, shardIndex * 23 + 7) * 0.28
    : 1.5 + seededNoise(signature, shardIndex * 29 + 11) * 2.2;
  const lift = retained
    ? 0.38 + seededNoise(signature, shardIndex * 31 + 13) * 0.58
    : 1.45 + seededNoise(signature, shardIndex * 37 + 17) * 2.45;
  const spinForce = retained ? 1.08 : 3.35;

  return {
    points,
    center,
    depth: 0.075 + seededNoise(signature, shardIndex * 41 + 19) * 0.085,
    crackDelayMs: 90 + distanceRatio * 470 + seededNoise(signature, shardIndex * 43 + 23) * 90,
    delayMs: 880 + distanceRatio * 75 + seededNoise(signature, shardIndex * 47 + 29) * 70,
    durationMs: (retained ? 720 : 820) + seededNoise(signature, shardIndex * 49 + 31) * 440,
    retained,
    tone: Math.min(2, Math.floor(seededNoise(signature, shardIndex * 53 + 33) * 3)),
    travel: {
      x: directionX * force,
      y: directionY * force * 0.82,
      z: lift,
    },
    spin: {
      x: (seededNoise(signature, shardIndex * 59 + 37) - 0.5) * spinForce,
      y: (seededNoise(signature, shardIndex * 61 + 41) - 0.5) * spinForce,
      z: (seededNoise(signature, shardIndex * 67 + 43) - 0.5) * spinForce * 0.78,
    },
    drop: retained ? 0.08 : 0.65 + seededNoise(signature, shardIndex * 71 + 47) * 1.65,
  };
}

/**
 * Teselado radial de una pantalla. Las piezas interiores se expulsan; una selección estable de las
 * exteriores queda suspendida para que la pantalla final siga leyéndose como vidrio roto en 3D.
 */
export function buildDefeatShatterPlan(aspect: number, signature: number): DefeatShatterPlan {
  const safeAspect = Math.min(3.2, Math.max(0.55, aspect));
  const halfWidth = HALF_HEIGHT * safeAspect;
  const impact = { x: halfWidth * 0.035, y: -HALF_HEIGHT * 0.03 };
  const plan = { halfWidth, halfHeight: HALF_HEIGHT, impact };
  const boundary = boundaryPoints(halfWidth, HALF_HEIGHT);
  const rings = RING_FRACTIONS.map((fraction, ringIndex) => (
    ringPoints(boundary, impact, fraction, ringIndex, signature)
  ));
  const triangles: Array<{
    points: [DefeatShatterPoint, DefeatShatterPoint, DefeatShatterPoint];
    ringIndex: number;
  }> = [];

  for (let index = 0; index < rings[0].length; index += 1) {
    const next = (index + 1) % rings[0].length;
    triangles.push({ points: [impact, rings[0][index], rings[0][next]], ringIndex: 0 });
  }

  for (let ringIndex = 1; ringIndex < rings.length; ringIndex += 1) {
    const inner = rings[ringIndex - 1];
    const outer = rings[ringIndex];
    for (let index = 0; index < outer.length; index += 1) {
      const next = (index + 1) % outer.length;
      const flip = seededNoise(signature, ringIndex * 211 + index) > 0.5;
      if (flip) {
        triangles.push({ points: [inner[index], outer[index], outer[next]], ringIndex });
        triangles.push({ points: [inner[index], outer[next], inner[next]], ringIndex });
      } else {
        triangles.push({ points: [inner[index], outer[index], inner[next]], ringIndex });
        triangles.push({ points: [inner[next], outer[index], outer[next]], ringIndex });
      }
    }
  }

  return {
    ...plan,
    shards: triangles.map((triangle, shardIndex) => (
      makeShard(triangle.points, triangle.ringIndex, shardIndex, plan, signature)
    )),
  };
}
