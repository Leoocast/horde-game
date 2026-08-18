/**
 * Teselación de la derrota: pura, estable por semilla y sin dependencias de Three.
 *
 * Emite directamente los atributos por vértice de un único `BufferGeometry`. Cada
 * triángulo del plan es un **prisma extruido** —cara frontal, trasera y tres muros con
 * normal propia—, y toda la animación vive después en el vertex shader a partir de
 * estos atributos. La versión anterior construía una malla por trozo con caras planas;
 * sin espesor no hay canto, y sin canto el vidrio no se lee como vidrio.
 */

export type DefeatShatterPoint = {
  x: number;
  y: number;
};

export type DefeatShatterPlan = {
  halfWidth: number;
  halfHeight: number;
  /** Impacto en coordenadas de mundo. */
  impact: DefeatShatterPoint;
  /** Impacto en coordenadas de la captura, para la refracción del frente de choque. */
  impactUv: DefeatShatterPoint;
  vertexCount: number;
  positions: Float32Array;
  centroids: Float32Array;
  uvs: Float32Array;
  normals: Float32Array;
  axes: Float32Array;
  /** Vector de lanzamiento (xyz) y retardo propio (w). */
  motions: Float32Array;
  /** Giro, constante del golpe y volteo del segundo eje. */
  dynamics: Float32Array;
  /** Semilla, cara (0 frontal, 1 trasera, 2 muro), retenido y distancia normalizada. */
  infos: Float32Array;
};

const HALF_HEIGHT = 3.8;
/** Alto del plano en unidades de mundo. Las magnitudes del diseño se dieron sobre 1. */
const PLANE = HALF_HEIGHT * 2;
const RINGS = [0.16, 0.4, 0.68, 1] as const;
const IMPACT_UV = { x: 0.52, y: 0.46 };
/** Coronas retenidas y cuántos sectores angulares conserva cada una. */
const RETAINED_PLAN = [
  { ringFromOuter: 0, sectors: 16 },
  { ringFromOuter: 1, sectors: 10 },
] as const;

type Triangle = {
  points: [DefeatShatterPoint, DefeatShatterPoint, DefeatShatterPoint];
  ring: number;
};

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise(signature: number, index: number): number {
  return fract(Math.sin((index + 1) * 91.733 + signature * 2731.917) * 43758.5453123);
}

function boundaryPoints(): DefeatShatterPoint[] {
  const points: DefeatShatterPoint[] = [];
  for (let i = 0; i < 6; i++) points.push({ x: i / 6, y: 0 });
  for (let i = 0; i < 4; i++) points.push({ x: 1, y: i / 4 });
  for (let i = 0; i < 6; i++) points.push({ x: 1 - i / 6, y: 1 });
  for (let i = 0; i < 4; i++) points.push({ x: 0, y: 1 - i / 4 });
  return points;
}

function ringPoints(
  boundary: DefeatShatterPoint[],
  fraction: number,
  ringIndex: number,
  signature: number,
): DefeatShatterPoint[] {
  if (fraction === 1) return boundary;
  return boundary.map((edge, index) => {
    const dx = edge.x - IMPACT_UV.x;
    const dy = edge.y - IMPACT_UV.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const radial = (noise(signature, ringIndex * 101 + index) - 0.5) * 0.055;
    const tangent = (noise(signature, ringIndex * 173 + index + 47) - 0.5) * 0.085 * (1 - fraction);
    const adjusted = fraction + radial;
    return {
      x: IMPACT_UV.x + dx * adjusted + (-dy / length) * tangent,
      y: IMPACT_UV.y + dy * adjusted + (dx / length) * tangent,
    };
  });
}

function buildTriangles(signature: number): Triangle[] {
  const boundary = boundaryPoints();
  const rings = RINGS.map((fraction, index) => ringPoints(boundary, fraction, index, signature));
  const triangles: Triangle[] = [];
  const count = boundary.length;

  for (let i = 0; i < count; i++) {
    triangles.push({ points: [IMPACT_UV, rings[0][i], rings[0][(i + 1) % count]], ring: 0 });
  }
  for (let ring = 1; ring < rings.length; ring++) {
    const inner = rings[ring - 1];
    const outer = rings[ring];
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      if (noise(signature, ring * 211 + i) > 0.5) {
        triangles.push({ points: [inner[i], outer[i], outer[next]], ring });
        triangles.push({ points: [inner[i], outer[next], inner[next]], ring });
      } else {
        triangles.push({ points: [inner[i], outer[i], inner[next]], ring });
        triangles.push({ points: [inner[next], outer[i], outer[next]], ring });
      }
    }
  }
  return triangles;
}

function centroidOf(points: Triangle["points"]): DefeatShatterPoint {
  return {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
}

/** Área en unidades de mundo. Hace de masa: la esquirla vuela, la placa apenas se mueve. */
function areaOf(points: Triangle["points"], aspect: number): number {
  const ux = (points[1].x - points[0].x) * aspect;
  const uy = points[0].y - points[1].y;
  const vx = (points[2].x - points[0].x) * aspect;
  const vy = points[0].y - points[2].y;
  return Math.abs(ux * vy - vx * uy) / 2;
}

/**
 * Los trozos que se quedan se eligen por sector angular, nunca al azar: sorteados por
 * índice se apelotonan en una zona y el cuadro queda descompensado.
 */
function pickRetained(triangles: Triangle[], signature: number, aspect: number): Set<number> {
  const lastRing = RINGS.length - 1;
  const retained = new Set<number>();

  RETAINED_PLAN.forEach((step, planIndex) => {
    const ring = lastRing - step.ringFromOuter;
    const best: Array<{ index: number; score: number } | null> = new Array(step.sectors).fill(null);
    triangles.forEach((triangle, index) => {
      if (triangle.ring !== ring) return;
      const center = centroidOf(triangle.points);
      const angle = Math.atan2(center.y - IMPACT_UV.y, (center.x - IMPACT_UV.x) * aspect);
      const sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * step.sectors) % step.sectors;
      const score = noise(signature, index * 19 + 5 + planIndex * 401);
      const current = best[sector];
      if (!current || score > current.score) best[sector] = { index, score };
    });
    for (const entry of best) if (entry) retained.add(entry.index);
  });

  return retained;
}

export function buildDefeatShatterPlan(aspect: number, signature: number): DefeatShatterPlan {
  const triangles = buildTriangles(signature);
  const retainedSet = pickRetained(triangles, signature, aspect);
  const lastRing = RINGS.length - 1;
  const halfWidth = HALF_HEIGHT * aspect;

  const toWorld = (point: DefeatShatterPoint): DefeatShatterPoint => ({
    x: (point.x - 0.5) * aspect * PLANE,
    y: (0.5 - point.y) * PLANE,
  });

  const impact = toWorld(IMPACT_UV);

  // El frente de grieta necesita la distancia normalizada: sin normalizar, las
  // esquinas no llegan nunca a cuartearse del todo.
  let maxSpan = 0.0001;
  let areaTotal = 0;
  for (const triangle of triangles) {
    const center = toWorld(centroidOf(triangle.points));
    maxSpan = Math.max(maxSpan, Math.hypot(center.x - impact.x, center.y - impact.y));
    areaTotal += areaOf(triangle.points, aspect);
  }
  const meanArea = Math.max(1e-6, areaTotal / Math.max(1, triangles.length));

  const positions: number[] = [];
  const centroids: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const axes: number[] = [];
  const motions: number[] = [];
  const dynamics: number[] = [];
  const infos: number[] = [];

  triangles.forEach((triangle, index) => {
    const p = triangle.points.map(toWorld);
    const uv = triangle.points;
    const cx = (p[0].x + p[1].x + p[2].x) / 3;
    const cy = (p[0].y + p[1].y + p[2].y) / 3;
    const half = (0.0022 + noise(signature, index * 13 + 3) * 0.0026) * PLANE;

    const dx = cx - impact.x;
    const dy = cy - impact.y;
    const span = Math.min(1, Math.hypot(dx, dy) / maxSpan);
    const retained = retainedSet.has(index) ? 1 : 0;
    const ringT = triangle.ring / lastRing;

    const area = Math.max(1e-6, areaOf(triangle.points, aspect));
    const mass = Math.max(0.62, Math.min(1.85, Math.pow(meanArea / area, 0.34)));

    const outSpeed = (retained
      ? 0.03 + noise(signature, index * 23 + 7) * 0.055
      : (0.3 + noise(signature, index * 29 + 11) * 0.46) * (1.15 - 0.3 * ringT) * mass) * PLANE;
    const zSpeed = (retained
      ? 0.02 + noise(signature, index * 41 + 19) * 0.055
      : (0.4 + noise(signature, index * 43 + 23) * 0.92) * mass) * PLANE;

    // Nada de rayos perfectamente radiales: son lo que hace que la explosión
    // parezca un barrido geométrico en vez de vidrio rompiéndose.
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const dirX = dx / length;
    const dirY = dy / length;
    const sideways = (noise(signature, index * 31 + 13) - 0.5) * (retained ? 0.5 : 0.85);
    const launchX = (dirX - dirY * sideways) * outSpeed;
    const launchY = (dirY + dirX * sideways) * outSpeed;

    let spin = retained
      ? 0.3 + noise(signature, index * 47 + 29) * 0.6
      : (1.9 + noise(signature, index * 47 + 29) * 4.2) * mass;
    if (noise(signature, index * 53 + 33) > 0.5) spin = -spin;
    // Volteo, no giro de moneda: un segundo eje mucho más lento.
    const tumble = (noise(signature, index * 83 + 63) - 0.5) * (retained ? 0.5 : 2.1);
    const tau = 0.17 + noise(signature, index * 89 + 67) * 0.2;
    // Sueltan todos con el golpe, cada uno con su propio margen.
    const delay = noise(signature, index * 97 + 71) * 0.09;

    let ax = noise(signature, index * 61 + 41) - 0.5;
    let ay = noise(signature, index * 67 + 43) - 0.5;
    let az = (noise(signature, index * 71 + 47) - 0.5) * 0.5;
    const axisLength = Math.max(0.0001, Math.hypot(ax, ay, az));
    ax /= axisLength;
    ay /= axisLength;
    az /= axisLength;

    const shardSeed = noise(signature, index * 73 + 53);

    const push = (
      x: number, y: number, z: number,
      nx: number, ny: number, nz: number,
      u: number, v: number, kind: number,
    ) => {
      positions.push(x - cx, y - cy, z);
      centroids.push(cx, cy, 0);
      uvs.push(u, v);
      normals.push(nx, ny, nz);
      axes.push(ax, ay, az);
      motions.push(launchX, launchY, zSpeed, delay);
      dynamics.push(spin, tau, tumble);
      infos.push(shardSeed, kind, retained, span);
    };

    for (let i = 0; i < 3; i++) push(p[i].x, p[i].y, half, 0, 0, 1, uv[i].x, uv[i].y, 0);
    for (let j = 2; j >= 0; j--) push(p[j].x, p[j].y, -half, 0, 0, -1, uv[j].x, uv[j].y, 1);

    for (let e = 0; e < 3; e++) {
      const a = p[e];
      const b = p[(e + 1) % 3];
      const ua = uv[e];
      const ub = uv[(e + 1) % 3];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const edgeLength = Math.max(0.0001, Math.hypot(ex, ey));
      let nx = ey / edgeLength;
      let ny = -ex / edgeLength;
      const midX = (a.x + b.x) / 2 - cx;
      const midY = (a.y + b.y) / 2 - cy;
      if (nx * midX + ny * midY < 0) {
        nx = -nx;
        ny = -ny;
      }
      push(a.x, a.y, half, nx, ny, 0, ua.x, ua.y, 2);
      push(b.x, b.y, half, nx, ny, 0, ub.x, ub.y, 2);
      push(b.x, b.y, -half, nx, ny, 0, ub.x, ub.y, 2);
      push(a.x, a.y, half, nx, ny, 0, ua.x, ua.y, 2);
      push(b.x, b.y, -half, nx, ny, 0, ub.x, ub.y, 2);
      push(a.x, a.y, -half, nx, ny, 0, ua.x, ua.y, 2);
    }
  });

  return {
    halfWidth,
    halfHeight: HALF_HEIGHT,
    impact,
    impactUv: IMPACT_UV,
    vertexCount: positions.length / 3,
    positions: new Float32Array(positions),
    centroids: new Float32Array(centroids),
    uvs: new Float32Array(uvs),
    normals: new Float32Array(normals),
    axes: new Float32Array(axes),
    motions: new Float32Array(motions),
    dynamics: new Float32Array(dynamics),
    infos: new Float32Array(infos),
  };
}
