/**
 * Geometría y reloj de la constelación que sella la Victoria.
 *
 * No inventa una figura nueva: es la MISMA rosa cardinal que abre el tablero
 * (`chronicleSigilGeometry`) y que ya está dibujada como instrumento de grados en
 * `TemporalBackdrop`. Por eso el plan se deriva del radio del aro del instrumento: las motas
 * convergen sobre el aparato que el Cronista lleva toda la Visión mirando, y al encenderse
 * la figura cae exactamente encima. Con un tamaño propio se leería como otra estrella pegada
 * sobre el tablero.
 *
 * Lo único que se añade aquí es el reloj: cuándo queda fijo cada nodo y cuándo puede trazarse
 * cada hilo del contorno. El signo de la obertura nace completo; la constelación se construye
 * a la vista.
 *
 * La maqueta de decisión es `dev/mockups/vfx/destiny-constellation.html`.
 */

import {
  CHRONICLE_SIGIL_EDGES,
  CHRONICLE_SIGIL_NODES,
  chronicleSigilPlan,
  type ChronicleSigilEdge,
  type ChronicleSigilNode,
} from "./chronicleSigilGeometry";

export const DESTINY_CONSTELLATION_NODES = CHRONICLE_SIGIL_NODES;
export const DESTINY_CONSTELLATION_EDGES = CHRONICLE_SIGIL_EDGES;

/** Reloj completo de la construcción, en milisegundos. */
export const DESTINY_CONSTELLATION_TOTAL_MS = 4400;

/** El corazón queda fijo primero: es el origen del que sale el resto de la luz. */
export const DESTINY_CONSTELLATION_HEART_LOCK = 0.12;
/** El contorno se fija desde el Norte en sentido horario. */
export const DESTINY_CONSTELLATION_CONTOUR_LOCK_START = 0.2;
export const DESTINY_CONSTELLATION_CONTOUR_LOCK_SPAN = 0.5;

/** Al cerrarse, el corazón detona una única onda circular que cruza el instrumento. La
 * floración ocupa exactamente lo que queda del reloj: escribir el tramo a mano dejaba la onda
 * sin completar su último paso por error de coma flotante. */
export const DESTINY_CONSTELLATION_BLOOM_AT = 0.78;
export const DESTINY_CONSTELLATION_BLOOM_SPAN = 1 - DESTINY_CONSTELLATION_BLOOM_AT;

/** El desenlace se nombra con la figura ya cerrada y la onda en marcha. */
export const DESTINY_CONSTELLATION_VERDICT_AT = 0.8;

export type DestinyConstellationNode = ChronicleSigilNode;

export type DestinyConstellationEdge = ChronicleSigilEdge & {
  /** Instante en que el hilo puede empezar a trazarse. */
  lockAt: number;
};

export type DestinyConstellationPlan = {
  unit: number;
  ringRadius: number;
  nodes: DestinyConstellationNode[];
  edges: DestinyConstellationEdge[];
};

/** Índice del corazón dentro del plan. */
export function destinyConstellationHeartIndex(): number {
  return DESTINY_CONSTELLATION_NODES - 1;
}

/**
 * La rosa cardinal con su reloj de construcción. Posiciones y orientación son las del signo:
 * la semilla cambia el fraseo de las motas, nunca el giro.
 */
export function destinyConstellationPlan(
  ringRadius: number,
  signature: number,
): DestinyConstellationPlan {
  const base = chronicleSigilPlan(ringRadius, signature);
  const heart = destinyConstellationHeartIndex();
  const contourCount = heart;

  const nodes: DestinyConstellationNode[] = base.nodes.map((node, index) => ({
    ...node,
    lockAt: index === heart
      ? DESTINY_CONSTELLATION_HEART_LOCK
      : DESTINY_CONSTELLATION_CONTOUR_LOCK_START
        + (index / contourCount) * DESTINY_CONSTELLATION_CONTOUR_LOCK_SPAN,
  }));

  // El hilo espera a que estén fijos SUS DOS extremos. Tomar sólo el destino hacía que el hilo
  // de cierre (15 → 0) apareciera al principio, cuando su origen todavía no existía.
  const edges: DestinyConstellationEdge[] = base.edges.map((edge, index) => ({
    ...edge,
    lockAt: Math.max(nodes[index].lockAt, nodes[(index + 1) % contourCount].lockAt),
  }));

  return { unit: base.unit, ringRadius: base.ringRadius, nodes, edges };
}

/** Avance de la floración final: 0 mientras la figura todavía se construye. */
export function destinyConstellationBloomAt(t: number): number {
  const bloom = (t - DESTINY_CONSTELLATION_BLOOM_AT) / DESTINY_CONSTELLATION_BLOOM_SPAN;
  return Math.min(1, Math.max(0, bloom));
}

/** Instante, en milisegundos desde el primer fotograma, en que puede nombrarse el desenlace. */
export function destinyConstellationVerdictDelayMs(): number {
  return DESTINY_CONSTELLATION_VERDICT_AT * DESTINY_CONSTELLATION_TOTAL_MS;
}
