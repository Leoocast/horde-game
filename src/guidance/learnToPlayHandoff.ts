import { importCanonMatchOrigin, type CanonMatchOrigin } from "../content/MatchOrigin";

/** Canon future approved by creator playtest for the first real match after Learn to Play. */
export const LEARN_TO_PLAY_FIRST_CANON_SEED = "HF1-ELA-GRV-082-QC5" as const;

export function createLearnToPlayFirstMatchOrigin(): CanonMatchOrigin {
  return importCanonMatchOrigin(LEARN_TO_PLAY_FIRST_CANON_SEED);
}
