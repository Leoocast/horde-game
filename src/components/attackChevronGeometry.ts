export type AttackChevronPoint = { x: number; y: number };

/**
 * Silueta "Hoja" del galón de ataque. La espina —el canto superior— cae como
 * `t^droop` desde el hombro hasta la punta, y el grosor crece como `t^taper`
 * partiendo de cero: por eso las puntas exteriores terminan afiladas en vez de
 * cortarse planas. `drop` y `thickness` se expresan como fracción de la altura,
 * de modo que `drop + thickness === 1` hace que la punta toque el borde inferior.
 */
export type AttackChevronShape = {
  droop: number;
  taper: number;
  thickness: number;
  drop: number;
};

export type AttackChevronGeometry = {
  /** Contorno cerrado de la hoja completa, hombro a hombro. */
  blade: string;
  /** Vértice superior de la punta: origen del degradado y del bloom. */
  tip: AttackChevronPoint;
  /** Vértice inferior de la punta: donde se apoya la chispa. */
  tipBottom: AttackChevronPoint;
};

export const ATTACK_CHEVRON_SHAPE: AttackChevronShape = {
  droop: 2.3,
  taper: 1,
  thickness: 0.2,
  drop: 0.8,
};

/**
 * La hoja se dibuja siempre en esta caja y la superficie la coloca sin
 * deformarla: la proporción es parte de la silueta authorada, no del slot.
 */
export const ATTACK_CHEVRON_VIEW = { width: 140, height: 27 };

const SAMPLES = 56;

export function attackChevronGeometry(
  width: number,
  height: number,
  shape: AttackChevronShape = ATTACK_CHEVRON_SHAPE,
): AttackChevronGeometry {
  const half = width / 2;
  const spineEnd = height * shape.drop;
  const thicknessEnd = height * shape.thickness;
  const top: AttackChevronPoint[] = [];
  const bottom: AttackChevronPoint[] = [];

  for (let index = 0; index <= SAMPLES; index += 1) {
    const t = index / SAMPLES;
    const spine = spineEnd * Math.pow(t, shape.droop);
    const thickness = thicknessEnd * Math.pow(t, shape.taper);
    top.push({ x: half * t, y: spine });
    bottom.push({ x: half * t, y: spine + thickness });
  }

  // Hombro izquierdo -> punta por el canto superior, punta -> hombro derecho
  // espejado, y la vuelta por el canto inferior. En el hombro ambos cantos
  // coinciden, así que la unión no deja un corte recto.
  const segments = [`M ${line(top[0])}`];
  for (let index = 1; index <= SAMPLES; index += 1) segments.push(`L ${line(top[index])}`);
  for (let index = SAMPLES - 1; index >= 0; index -= 1) segments.push(`L ${line(mirror(top[index], width))}`);
  for (let index = 1; index <= SAMPLES; index += 1) segments.push(`L ${line(mirror(bottom[index], width))}`);
  // El último canto se detiene antes del hombro: `Z` vuelve al punto inicial y
  // repetirlo dejaría un vértice doble justo donde la hoja tiene que ser filo.
  for (let index = SAMPLES - 1; index >= 1; index -= 1) segments.push(`L ${line(bottom[index])}`);

  return {
    blade: `${segments.join(" ")} Z`,
    tip: { x: half, y: spineEnd },
    tipBottom: { x: half, y: spineEnd + thicknessEnd },
  };
}

/** Ángulo interior de la punta, en grados: el criterio con que se eligió la silueta. */
export function attackChevronTipAngle(
  width: number,
  height: number,
  shape: AttackChevronShape = ATTACK_CHEVRON_SHAPE,
): number {
  const slope = (height * shape.drop * shape.droop + height * shape.thickness * shape.taper) / (width / 2);
  return 180 - (2 * Math.atan(slope) * 180) / Math.PI;
}

function mirror(point: AttackChevronPoint, width: number): AttackChevronPoint {
  return { x: width - point.x, y: point.y };
}

function line(point: AttackChevronPoint): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}
