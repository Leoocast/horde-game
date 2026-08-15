/**
 * Succión de la escena hacia el horizonte.
 *
 * El navegador no puede deformar píxel a píxel un árbol DOM vivo, así que la escena no se traga
 * como un bloque rígido: cada pieza visible del tablero cae por su cuenta hacia el centro, se
 * estira en su propio eje radial y llega tarde según lo lejos que estuviera. Lo cercano al vórtice
 * desaparece primero y los bordes se alargan detrás, que es lo que hace leer el conjunto como una
 * masa tragada en vez de una pantalla encogiéndose.
 *
 * Aquí vive sólo la geometría pura; el recorrido del DOM y las animaciones pertenecen a
 * `DestinyRewriteTransition`.
 */

export type ShardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ShardViewport = {
  width: number;
  height: number;
};

export type ShardSuction = {
  /** Desplazamiento hasta el centro del vórtice, en px. */
  dx: number;
  dy: number;
  /** Desvío perpendicular: la pieza entra curvándose, no en línea recta. */
  swirlX: number;
  swirlY: number;
  /** 0 pegada al centro, 1 en la esquina más lejana. */
  reach: number;
  /** Dirección hacia el centro, en grados: es el eje en el que la pieza se estira. */
  angleDeg: number;
};

export type ShardTiming = {
  delayMs: number;
  durationMs: number;
};

export type ShardStep = {
  /** Momento dentro de la animación de la pieza, 0..1. */
  offset: number;
  /** Avance sobre la trayectoria; negativo mientras la pieza se resiste. */
  progress: number;
  x: number;
  y: number;
  /** Escala en el eje que apunta al horizonte y en su perpendicular. */
  along: number;
  across: number;
  opacity: number;
};

/** Cuánto del recorrido total se reparte como retraso entre el centro y la esquina. */
const STAGGER_SHARE = 0.34;
/** Curvatura de la caída, en fracción de la distancia al centro. */
const SWIRL_SHARE = 0.26;

export function shardSuction(rect: ShardRect, viewport: ShardViewport): ShardSuction {
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const dx = centerX - (rect.left + rect.width / 2);
  const dy = centerY - (rect.top + rect.height / 2);
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
  return {
    dx,
    dy,
    swirlX: -dy * SWIRL_SHARE,
    swirlY: dx * SWIRL_SHARE,
    reach: Math.min(1, Math.hypot(dx, dy) / maxDistance),
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** Todas las piezas terminan a la vez: lo que cambia es cuándo las alcanza la succión. */
export function shardTiming(reach: number, totalMs: number): ShardTiming {
  const delayMs = totalMs * STAGGER_SHARE * Math.min(1, Math.max(0, reach));
  return { delayMs, durationMs: Math.max(120, totalMs - delayMs) };
}

/** Exponente de la aceleración hacia el horizonte. */
const PULL_POWER = 2.7;
/** Cuánto retrocede la pieza antes del tirón, y con qué rapidez se agota esa resistencia. */
const BRACE_DEPTH = 0.5;
const BRACE_FALLOFF = 2.6;
/** Muestras de la trayectoria. Entre ellas se interpola recto, así que sobran para que la curva
 * se lea continua sin llenar de keyframes cada pieza. */
const PATH_SAMPLES = 18;

/**
 * Avance sobre la trayectoria en función del tiempo.
 *
 * Es un único polinomio suave: empieza retrocediendo —la pieza se resiste— y a partir de ahí
 * acelera sin parar hasta el horizonte. Tiene que seguir siendo **una sola función continua**.
 * Repartir la caída en tramos con curvas propias hace que uno termine a toda velocidad y el
 * siguiente arranque desde cero, y eso se ve como un frenazo a mitad de la succión.
 */
export function shardProgress(time: number): number {
  const t = Math.min(1, Math.max(0, time));
  return Math.pow(t, PULL_POWER) - BRACE_DEPTH * t * Math.pow(1 - t, BRACE_FALLOFF);
}

function shardDeform(progress: number): { along: number; across: number } {
  const pulled = Math.max(0, progress);
  const shrink = 1 - 0.9 * Math.pow(pulled, 1.8);
  const stretch = 1 + 1.9 * Math.pow(pulled, 1.4);
  // Mientras retrocede se comprime contra el tirón en vez de estirarse.
  const brace = progress < 0 ? Math.max(0.2, 1 + progress * 1.1) : 1;
  return {
    along: shrink * stretch * brace,
    across: (shrink / Math.pow(stretch, 0.8)) / brace,
  };
}

function shardOpacity(progress: number): number {
  if (progress <= 0.72) return 1;
  return Math.max(0, 1 - Math.pow((progress - 0.72) / 0.28, 1.4));
}

/**
 * Trayectoria completa de una pieza, ya muestreada. La curva es una Bézier cuadrática desde su
 * sitio hasta el horizonte con el punto de control desviado, de modo que la pieza entra girando;
 * fuera del rango la fórmula extrapola hacia atrás, que es justo el gesto de resistirse.
 */
export function shardPath(suction: ShardSuction, sampleCount: number = PATH_SAMPLES): ShardStep[] {
  const endX = suction.dx * 0.99;
  const endY = suction.dy * 0.99;
  const controlX = endX * 0.5 + suction.swirlX;
  const controlY = endY * 0.5 + suction.swirlY;
  const samples = Math.max(2, Math.floor(sampleCount));

  return Array.from({ length: samples }, (_, index) => {
    const offset = index / (samples - 1);
    const progress = shardProgress(offset);
    const inverse = 1 - progress;
    return {
      offset,
      progress,
      x: 2 * inverse * progress * controlX + progress * progress * endX,
      y: 2 * inverse * progress * controlY + progress * progress * endY,
      ...shardDeform(progress),
      opacity: shardOpacity(progress),
    };
  });
}
