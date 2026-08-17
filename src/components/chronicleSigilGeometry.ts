/**
 * Geometría y reloj del signo del Futuro que abre el tablero.
 *
 * Es la misma rosa cardinal que sella la Victoria y, sobre todo, es la MISMA FIGURA que el
 * instrumento de grados de `TemporalBackdrop`: sus ocho marcas caen en 000°·N, 045°, 090°·E,
 * 135°, 180°·S, 225°, 270°·O y 315°, que son exactamente los ocho ángulos de las puntas, y su
 * aro tiene `r=196` sobre un viewBox de 562. Por eso aquí el tamaño del signo se DERIVA del
 * radio del aro y no al revés: con un número redondo el relevo queda desalineado por unos
 * píxeles y se lee como dos figuras parecidas en vez de una sola entregándose.
 *
 * Vive aparte del componente porque es lógica: radios, ángulos, orden de encendido y reloj.
 * La maqueta de decisión es `dev/mockups/vfx/board-overture.html`.
 */

/** viewBox del retículo en `TemporalBackdrop`. */
export const TEMPORAL_DIAL_VIEWBOX_WIDTH = 1000;
export const TEMPORAL_DIAL_VIEWBOX_HEIGHT = 562;
/** Aro punteado del instrumento. */
export const TEMPORAL_DIAL_RING_RADIUS = 196;
/** Centro de las marcas (van de 195 a 208): donde se sientan las puntas al terminar. */
export const TEMPORAL_DIAL_SEAT_RADIUS = 201.5;

/** Puntas y valles del contorno; el nodo 16 es el corazón. */
export const CHRONICLE_SIGIL_TIPS = 8;
export const CHRONICLE_SIGIL_NODES = 17;
export const CHRONICLE_SIGIL_EDGES = 16;

/* Reloj propio del signo, en segundos desde que empieza a trazarse. Arranca cuando las
   cortinas del encuentro dejan de estar cerradas, no cuando monta el tablero. */
export const CHRONICLE_SIGIL_HEART_LOCK = 0.1;
export const CHRONICLE_SIGIL_CONTOUR_START = 0.3;
export const CHRONICLE_SIGIL_CONTOUR_SPAN = 0.7;
export const CHRONICLE_SIGIL_SEAT_START = 0.98;
export const CHRONICLE_SIGIL_SEAT_END = 1.62;
export const CHRONICLE_SIGIL_SWEEP_START = 1.55;
export const CHRONICLE_SIGIL_SWEEP_END = 2.25;
/** El aro completo se desvanece; su cabeza nunca recorre el camino en sentido inverso. */
export const CHRONICLE_SIGIL_SWEEP_FADE_START = CHRONICLE_SIGIL_SWEEP_END;
export const CHRONICLE_SIGIL_SWEEP_FADE_END = 2.55;
export const CHRONICLE_SIGIL_FADE_START = 2.15;
export const CHRONICLE_SIGIL_FADE_END = 2.75;
/** Instante en que el instrumento del tablero ya puede encenderse debajo del signo. */
export const CHRONICLE_SIGIL_DIAL_AT = 1.78;
/** Duración total antes de devolver el control al tablero. */
export const CHRONICLE_SIGIL_DURATION_MS = 2950;

export type ChronicleSigilNode = {
  /** Desplazamiento respecto al centro del instrumento, en píxeles CSS. */
  x: number;
  y: number;
  /** Segundo en que el nodo queda fijo. */
  lockAt: number;
  /** Valor derivado de la semilla; sólo cambia el fraseo de las motas. */
  seed: number;
};

export type ChronicleSigilEdge = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** El hilo espera a que estén fijos SUS DOS extremos. */
  drawAt: number;
};

export type ChronicleSigilPlan = {
  /** Unidad de la figura: la punta larga mide `unit * 2.24`. */
  unit: number;
  ringRadius: number;
  nodes: ChronicleSigilNode[];
  edges: ChronicleSigilEdge[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/**
 * El retículo usa `preserveAspectRatio="xMidYMid slice"`, así que cubre el viewport y su
 * escala es el mayor de los dos factores. Usar sólo el alto desalinea el aro en pantallas
 * más estrechas que 1000×562.
 */
export function temporalDialScale(width: number, height: number): number {
  return Math.max(width / TEMPORAL_DIAL_VIEWBOX_WIDTH, height / TEMPORAL_DIAL_VIEWBOX_HEIGHT);
}

/** Radio del aro del instrumento en píxeles CSS, para un viewport dado. */
export function temporalDialRingRadius(width: number, height: number): number {
  return TEMPORAL_DIAL_RING_RADIUS * temporalDialScale(width, height);
}

/** Cuánto crece la figura al sentarse: de su aro al centro de las marcas. Un 2.8 %. */
export function chronicleSigilSeatScale(): number {
  return TEMPORAL_DIAL_SEAT_RADIUS / TEMPORAL_DIAL_RING_RADIUS;
}

/**
 * Rosa cardinal. Las puntas pares caen en N, E, S y O. La orientación es fija a propósito:
 * la semilla cambia el fraseo de las motas, nunca el giro, porque una estrella cardinal
 * girada deja de apuntar a ninguna parte.
 */
export function chronicleSigilPlan(ringRadius: number, signature: number): ChronicleSigilPlan {
  const unit = ringRadius / 2.24;
  const tipLong = unit * 2.24;
  const tipShort = unit * 1.74;
  const valley = unit * 0.94;

  const contour: { x: number; y: number }[] = [];
  for (let k = 0; k < CHRONICLE_SIGIL_TIPS; k += 1) {
    const tipAngle = (k * 360) / CHRONICLE_SIGIL_TIPS - 90;
    const tipRadius = k % 2 === 0 ? tipLong : tipShort;
    const valleyAngle = tipAngle + 360 / (CHRONICLE_SIGIL_TIPS * 2);
    contour.push(polar(tipAngle, tipRadius));
    contour.push(polar(valleyAngle, valley));
  }

  const nodes: ChronicleSigilNode[] = contour.map((point, index) => ({
    x: point.x,
    y: point.y,
    lockAt: CHRONICLE_SIGIL_CONTOUR_START + (index / 16) * CHRONICLE_SIGIL_CONTOUR_SPAN,
    seed: signature * 10 + index * 3.7,
  }));
  // El corazón se fija primero: es el origen de la luz.
  nodes.push({ x: 0, y: 0, lockAt: CHRONICLE_SIGIL_HEART_LOCK, seed: signature * 10 });

  const edges: ChronicleSigilEdge[] = [];
  for (let index = 0; index < 16; index += 1) {
    const next = (index + 1) % 16;
    edges.push({
      ax: nodes[index].x,
      ay: nodes[index].y,
      bx: nodes[next].x,
      by: nodes[next].y,
      // Tomar sólo el destino haría aparecer el hilo de cierre (15 → 0) al principio,
      // cuando su origen todavía no existe.
      drawAt: Math.max(nodes[index].lockAt, nodes[next].lockAt),
    });
  }

  return { unit, ringRadius, nodes, edges };
}

function polar(degrees: number, radius: number): { x: number; y: number } {
  const angle = (degrees * Math.PI) / 180;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Escala de la figura en un instante: 1 mientras se traza, hasta el asiento al terminar. */
export function chronicleSigilScaleAt(seconds: number): number {
  const seat = smooth(CHRONICLE_SIGIL_SEAT_START, CHRONICLE_SIGIL_SEAT_END, seconds);
  return 1 + (chronicleSigilSeatScale() - 1) * seat;
}

export function chronicleSigilSeatAt(seconds: number): number {
  return smooth(CHRONICLE_SIGIL_SEAT_START, CHRONICLE_SIGIL_SEAT_END, seconds);
}

/** El signo se apaga al entregar el aro; a partir de ahí sólo queda el instrumento. */
export function chronicleSigilPresenceAt(seconds: number): number {
  return 1 - smooth(CHRONICLE_SIGIL_FADE_START, CHRONICLE_SIGIL_FADE_END, seconds);
}

/** Recorrido de la luz por el aro, desde el Norte en sentido horario. */
export function chronicleSigilSweepAt(seconds: number): number {
  return smooth(CHRONICLE_SIGIL_SWEEP_START, CHRONICLE_SIGIL_SWEEP_END, seconds);
}

/**
 * Opacidad propia del aro. Mantenerla separada del avance evita que una vuelta ya cerrada
 * vuelva visualmente de 360° a 0° cuando llega el momento de retirarla.
 */
export function chronicleSigilSweepPresenceAt(seconds: number): number {
  return 1 - smooth(CHRONICLE_SIGIL_SWEEP_FADE_START, CHRONICLE_SIGIL_SWEEP_FADE_END, seconds);
}

export function chronicleSigilMotesAt(seconds: number): number {
  return 1 - smooth(1.06, 1.3, seconds);
}

export function chronicleSigilChargeAt(seconds: number): number {
  return smooth(0.96, 1.42, seconds) * (1 - smooth(1.42, 1.7, seconds));
}
