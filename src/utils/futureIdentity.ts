import { hashSeed } from "../engine/RNG";

const FUTURE_CODE_SPACE = 999_999;

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
