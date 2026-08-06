/** Reloj maestro del Burn. El shader, el destello y el número de daño se derivan de estos tres
 * valores; `--burn-duration` en CSS debe seguir valiendo lo mismo. */
export const BURN_DURATION_MS = 1100;
export const BURN_IMPACT_AT_MS = 638;
export const BURN_FLIGHT_START_MS = 220;

export type BurnProjectileParticleTiming = {
  projectileIndex: number;
  flightStartMs: number;
  impactMs: number;
};

export type BurnProjectileOriginLayout = "center" | "split-horizontal";

export type BurnProjectileOriginRatio = {
  x: number;
  y: number;
};

/** Places a split cast near the source's left and right edges. The vertical ratio follows the
 * hand/flame line in Varka's battlefield art; other volleys retain their centered origin. */
export function burnProjectileOriginRatios(
  projectileCount: number,
  layout: BurnProjectileOriginLayout = "center",
): BurnProjectileOriginRatio[] {
  const count = Math.max(0, Math.floor(projectileCount));
  if (layout !== "split-horizontal" || count < 2) {
    return Array.from({ length: count }, () => ({ x: 0.5, y: 0.5 }));
  }
  return Array.from({ length: count }, (_, index) => ({
    x: index === 0 ? 0.08 : index === count - 1 ? 0.92 : 0.08 + (0.84 * index) / (count - 1),
    y: 0.52,
  }));
}

/** The classic renderer still emits DOM particles on each route's original clock. */
export function burnProjectileParticleTimings(
  projectileCount: number,
  projectileGapMs: number,
): BurnProjectileParticleTiming[] {
  const count = Math.max(0, Math.floor(projectileCount));
  const gap = Math.max(0, projectileGapMs);
  return Array.from({ length: count }, (_, projectileIndex) => ({
    projectileIndex,
    flightStartMs: BURN_FLIGHT_START_MS + projectileIndex * gap,
    impactMs: BURN_IMPACT_AT_MS + projectileIndex * gap,
  }));
}

