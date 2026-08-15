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
