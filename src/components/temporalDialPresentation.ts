export type TemporalDialLabelPoint = {
  x: number;
  y: number;
};

function compactDegrees(degrees: number): string {
  return Number(degrees.toFixed(2)).toString();
}

export function temporalDialTransform(degrees: number): string {
  return `translate(500 281) rotate(${compactDegrees(degrees)})`;
}

/**
 * Ángulo con 000°·N otra vez arriba, por el camino más corto.
 *
 * El disco acumula grados durante la Visión, así que al terminar sus marcas están giradas. La
 * constelación de la Victoria es cardinal y fija: sus puntas caen siempre en N, E, S y O, de modo
 * que si el instrumento no vuelve a su Norte las puntas se clavan al lado de las marcas en vez de
 * encima. Se devuelve el múltiplo de 360 más cercano, no el cero absoluto: girar cuatro vueltas
 * de vuelta se leería como que el aparato se reinicia, no como que el futuro queda fijado.
 */
export function northUprightDialDegrees(degrees: number): number {
  const turns = Math.round(degrees / 360);
  // Sin este caso, un giro pequeño hacia la izquierda devuelve -0 y el objetivo del disco deja de
  // ser comparable con el 0 que usa el resto del código.
  return turns === 0 ? 0 : turns * 360;
}

/** Counter-rotates one orbiting label around its own anchor so its baseline stays horizontal. */
export function uprightTemporalDialLabelTransform(
  degrees: number,
  point: TemporalDialLabelPoint,
): string {
  return `rotate(${compactDegrees(-degrees)} ${point.x} ${point.y})`;
}
