import { hashSeed } from "../engine/RNG";

const FUTURE_CODE_SPACE = 999_999;
const HASH_RANGE = 4_294_967_296;

/**
 * Narrative, cosmetic identity for a deterministic seed.
 *
 * This is intentionally not reversible and is not a replacement for the real seed: the compact
 * number may collide, while copying a Future always copies the complete seed.
 */
export function futureCodeFromSeed(seed: string): string {
  const value = (hashSeed(seed) % FUTURE_CODE_SPACE) + 1;
  const digits = value.toString().padStart(6, "0");
  return `${digits.slice(0, 3)}·${digits.slice(3)}`;
}

/** Firma normalizada que permite que el mismo Futuro conserve también su identidad visual. */
export function futureVisualSignature(seed: string): number {
  return hashSeed(`${seed}:destiny-vortex`) / HASH_RANGE;
}
