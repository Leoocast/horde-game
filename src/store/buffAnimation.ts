export type BuffAnimationVariant =
  | "default"
  | "growth-preview"
  | "growth-soft"
  | "growth-strong"
  | "growth-feral";

const GROWTH_VARIANTS: Record<string, Exclude<BuffAnimationVariant, "default" | "growth-preview">> = {
  iria_voice_last_rain: "growth-strong",
  arven_first_pack: "growth-strong",
  first_tree_sap: "growth-strong",
  oath_clearing: "growth-strong",
};

/** Presentation mapping only. Rules remain generic; this chooses how an already-confirmed buff
 *  should read visually for the card that caused it. */
export function buffAnimationVariantForCard(
  definitionId?: string,
  preview = false,
): BuffAnimationVariant {
  const variant = definitionId ? GROWTH_VARIANTS[definitionId] : undefined;
  if (!variant) return "default";
  return preview ? "growth-preview" : variant;
}
