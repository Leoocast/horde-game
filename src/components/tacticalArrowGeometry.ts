export type ArrowPoint = { x: number; y: number };

/**
 * Toda flecha táctica se describe como una cúbica. Las superficies de targeting
 * authorean una cuadrática; se convierte sin deformarla, de modo que el trazo
 * dibujado y sus puntos de anclaje siguen siendo exactamente los mismos.
 */
export type TacticalArrowCurve = {
  start: ArrowPoint;
  controlA: ArrowPoint;
  controlB: ArrowPoint;
  end: ArrowPoint;
};

export type TacticalArrowShape = {
  /** Contorno único de hoja y cabeza; evita costuras internas en relleno y destello. */
  outline: string;
  /** Distancia recta origen-punta: gobierna recorte de hoja y barrido. */
  chordLength: number;
};

export type TacticalArrowPalette = {
  deep: string;
  mid: string;
  hot: string;
  core: string;
};

// Perfil "Estilete": hoja delgada que nace en cero y una punta algo alargada.
const HEAD_LENGTH = 32.5;
const HEAD_WING = 10.625;
const HEAD_SWEEP = 0.52;
const BLADE_ROOT_HALF_WIDTH = 0.1;
const BLADE_TIP_HALF_WIDTH = 2.8;
const BLADE_TAPER = 0.85;
const BLADE_SAMPLES = 44;

/** Fracción del largo que ocupa la banda del destello. */
export const GLINT_BAND_RATIO = 0.22;
export const GLINT_BAND_MIN_PX = 34;

/** Ataque del Cronista y defensa: curva suave con dos controles. */
export function combatArrowCurve(start: ArrowPoint, end: ArrowPoint): TacticalArrowCurve {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;
  const curve = Math.min(38, Math.max(10, length * 0.11));
  const direction = dx >= 0 ? -1 : 1;
  return {
    start,
    controlA: { x: start.x + dx * 0.36 + px * curve * direction, y: start.y + dy * 0.36 + py * curve * direction },
    controlB: { x: start.x + dx * 0.72 + px * curve * direction * 0.42, y: start.y + dy * 0.72 + py * curve * direction * 0.42 },
    end,
  };
}

/** Hechizos, Contadores y Tributo: arco cuadrático más pronunciado. */
export function targetArrowCurve(start: ArrowPoint, end: ArrowPoint): TacticalArrowCurve {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;
  const curve = Math.min(64, Math.max(24, length * 0.16));
  const control = { x: (start.x + end.x) / 2 + px * curve, y: (start.y + end.y) / 2 + py * curve };
  return { start, ...quadraticControls(start, control, end), end };
}

/** Elevación exacta de cuadrática a cúbica: la curva resultante es la misma. */
function quadraticControls(start: ArrowPoint, control: ArrowPoint, end: ArrowPoint): { controlA: ArrowPoint; controlB: ArrowPoint } {
  return {
    controlA: { x: start.x + (2 / 3) * (control.x - start.x), y: start.y + (2 / 3) * (control.y - start.y) },
    controlB: { x: end.x + (2 / 3) * (control.x - end.x), y: end.y + (2 / 3) * (control.y - end.y) },
  };
}

export function pointOnCurve(curve: TacticalArrowCurve, t: number): ArrowPoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * curve.start.x + b * curve.controlA.x + c * curve.controlB.x + d * curve.end.x,
    y: a * curve.start.y + b * curve.controlA.y + c * curve.controlB.y + d * curve.end.y,
  };
}

export function tangentOnCurve(curve: TacticalArrowCurve, t: number): ArrowPoint {
  const u = 1 - t;
  const x = 3 * u * u * (curve.controlA.x - curve.start.x) + 6 * u * t * (curve.controlB.x - curve.controlA.x) + 3 * t * t * (curve.end.x - curve.controlB.x);
  const y = 3 * u * u * (curve.controlA.y - curve.start.y) + 6 * u * t * (curve.controlB.y - curve.controlA.y) + 3 * t * t * (curve.end.y - curve.controlB.y);
  const length = Math.hypot(x, y);
  if (length === 0) {
    // Curva degenerada (origen y destino coinciden): la dirección deja de estar
    // definida, así que se toma la cuerda para no emitir NaN.
    const chordX = curve.end.x - curve.start.x;
    const chordY = curve.end.y - curve.start.y;
    const chord = Math.hypot(chordX, chordY) || 1;
    return { x: chordX / chord, y: chordY / chord };
  }
  return { x: x / length, y: y / length };
}

export function tacticalArrowShape(curve: TacticalArrowCurve): TacticalArrowShape {
  const chordLength = Math.hypot(curve.end.x - curve.start.x, curve.end.y - curve.start.y) || 1;
  // La hoja termina en el cuello cóncavo de la cabeza. Dibujar ambas partes como
  // paths superpuestos dejaba una costura diagonal y partía el destello al cruzarla.
  const bladeEnd = Math.max(0.05, 1 - (HEAD_LENGTH * HEAD_SWEEP) / chordLength);
  return { outline: arrowOutlinePath(curve, bladeEnd), chordLength };
}

function bladeHalfWidth(k: number): number {
  return BLADE_ROOT_HALF_WIDTH + BLADE_TIP_HALF_WIDTH * Math.pow(k, BLADE_TAPER);
}

/** Recorre hoja, alas y punta como un único contorno sin bordes internos. */
function arrowOutlinePath(curve: TacticalArrowCurve, bladeEnd: number): string {
  const left: ArrowPoint[] = [];
  const right: ArrowPoint[] = [];
  for (let index = 0; index <= BLADE_SAMPLES; index += 1) {
    const k = index / BLADE_SAMPLES;
    const point = pointOnCurve(curve, k * bladeEnd);
    const tangent = tangentOnCurve(curve, k * bladeEnd);
    const halfWidth = bladeHalfWidth(k);
    left.push({ x: point.x - tangent.y * halfWidth, y: point.y + tangent.x * halfWidth });
    right.push({ x: point.x + tangent.y * halfWidth, y: point.y - tangent.x * halfWidth });
  }
  const { tip, wingA, wingB } = arrowHeadGeometry(curve);
  const segments = [`M ${format(left[0].x)} ${format(left[0].y)}`];
  for (let index = 1; index < left.length; index += 1) segments.push(`L ${format(left[index].x)} ${format(left[index].y)}`);
  segments.push(`L ${format(wingA.x)} ${format(wingA.y)}`);
  segments.push(`L ${format(tip.x)} ${format(tip.y)}`);
  segments.push(`L ${format(wingB.x)} ${format(wingB.y)}`);
  for (let index = right.length - 1; index >= 0; index -= 1) segments.push(`L ${format(right[index].x)} ${format(right[index].y)}`);
  return `${segments.join(" ")} Z`;
}

function arrowHeadGeometry(curve: TacticalArrowCurve): { tip: ArrowPoint; wingA: ArrowPoint; wingB: ArrowPoint } {
  const tip = curve.end;
  const tangent = tangentOnCurve(curve, 1);
  const normalX = -tangent.y;
  const normalY = tangent.x;
  const back = { x: tip.x - tangent.x * HEAD_LENGTH, y: tip.y - tangent.y * HEAD_LENGTH };
  const wingA = { x: back.x + normalX * HEAD_WING, y: back.y + normalY * HEAD_WING };
  const wingB = { x: back.x - normalX * HEAD_WING, y: back.y - normalY * HEAD_WING };
  return { tip, wingA, wingB };
}

function format(value: number): string {
  return value.toFixed(2);
}

// La punta y el destello sólo se aclaran lo justo para leerse como luz: pasado
// este punto la flecha pierde su color de contexto y todas se ven iguales.
const DEEP_SHADE = 0.55;
const HOT_TINT = 0.28;
const CORE_TINT = 0.55;

/**
 * El color de cada superficie sigue siendo el authorado; los tonos profundo,
 * caliente y de destello se derivan de él para que una flecha nueva no tenga
 * que declarar una paleta propia.
 */
export function tacticalArrowPalette(color: string): TacticalArrowPalette {
  const rgb = parseHexColor(color);
  if (!rgb) return { deep: color, mid: color, hot: color, core: color };
  return {
    deep: mix(rgb, { r: 0, g: 0, b: 0 }, DEEP_SHADE),
    mid: color,
    hot: mix(rgb, { r: 255, g: 255, b: 255 }, HOT_TINT),
    core: mix(rgb, { r: 255, g: 255, b: 255 }, CORE_TINT),
  };
}

type Rgb = { r: number; g: number; b: number };

function parseHexColor(color: string): Rgb | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function mix(from: Rgb, to: Rgb, amount: number): string {
  const channel = (a: number, b: number) => Math.round(a + (b - a) * amount).toString(16).padStart(2, "0");
  return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

export function tacticalArrowCurvesMatch(a: TacticalArrowCurve, b: TacticalArrowCurve): boolean {
  return (
    a.start.x === b.start.x &&
    a.start.y === b.start.y &&
    a.controlA.x === b.controlA.x &&
    a.controlA.y === b.controlA.y &&
    a.controlB.x === b.controlB.x &&
    a.controlB.y === b.controlB.y &&
    a.end.x === b.end.x &&
    a.end.y === b.end.y
  );
}
