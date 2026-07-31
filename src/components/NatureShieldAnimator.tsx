import type { BuffAnimationVariant } from "../store/buffAnimation";
import { NatureRootAnimator } from "./GrowthBuffAnimator";

type GrowthBuffVariant = Exclude<BuffAnimationVariant, "default">;

/**
 * Preserved natural-shield VFX. It is intentionally not wired to the current mono-green buffs:
 * keep it available for a future toughness, protection, hexproof, or indestructible effect.
 */
export function NatureShieldAnimator({
  eventId,
  variant = "growth-strong",
}: {
  eventId: number;
  variant?: GrowthBuffVariant;
}) {
  return <NatureRootAnimator eventId={eventId} variant={variant} pattern="shield" />;
}
