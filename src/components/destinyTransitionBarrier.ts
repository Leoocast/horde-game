export type DestinyTransitionPhase = "absorbing" | "covered" | "revealing" | "complete";
export type DestinyTransitionEvent = "cover" | "release" | "complete";

/** Pure hold/release contract shared by full animation and reduced-motion presentation. */
export function nextDestinyTransitionPhase(
  phase: DestinyTransitionPhase,
  event: DestinyTransitionEvent,
): DestinyTransitionPhase {
  if (phase === "absorbing" && event === "cover") return "covered";
  if (phase === "covered" && event === "release") return "revealing";
  if (phase === "revealing" && event === "complete") return "complete";
  return phase;
}
