import type { BuffAnimationVariant } from "../store/buffAnimation";
import { NatureRootAnimator } from "./GrowthBuffAnimator";

type GrowthBuffVariant = Exclude<BuffAnimationVariant, "default" | "storm-strong">;

/**
 * Preserved natural-shield VFX. It is intentionally not wired to the current El Pacto de Elarion buffs:
 * keep it available for a future endurance, protection, hexproof, or indestructible effect.
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
