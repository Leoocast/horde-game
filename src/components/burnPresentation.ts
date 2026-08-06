export const BURN_IMPACT_AT_MS = 638;
export const BURN_FLIGHT_START_MS = 220;

export type BurnProjectileParticleTiming = {
  projectileIndex: number;
  flightStartMs: number;
  impactMs: number;
};

/** Gives every rendered route its own particle clock. A zero gap keeps a multi-target volley
 * simultaneous without collapsing its trails and impact embers onto the final projectile. */
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
