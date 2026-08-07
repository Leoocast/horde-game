export type BurnRenderer = "procedural" | "classic";
export type BurnTrajectory = "straight" | "curved";

/** All registered Burns use the procedural shader; the classic renderer remains legacy-only. */
export function resolveBurnRenderer(_sourceDefinitionId: string | undefined): BurnRenderer {
  return "procedural";
}

/** The procedural renderer is straight by default. Vaelor's entry volley opts into the curve. */
export function burnPathCurvature(trajectory: BurnTrajectory | undefined): number {
  return trajectory === "curved" ? 1 : 0;
}
