export type BurnRenderer = "procedural" | "classic";
export type BurnTrajectory = "straight" | "curved";

const CLASSIC_BURN_RENDERERS = new Set(["all_against_one"]);

/** Presentation registry for effects that intentionally retain the former DOM/CSS fireball. */
export function resolveBurnRenderer(sourceDefinitionId: string | undefined): BurnRenderer {
  return sourceDefinitionId && CLASSIC_BURN_RENDERERS.has(sourceDefinitionId)
    ? "classic"
    : "procedural";
}

/** The procedural renderer is straight by default. Vaelor's entry volley opts into the curve. */
export function burnPathCurvature(trajectory: BurnTrajectory | undefined): number {
  return trajectory === "curved" ? 1 : 0;
}
