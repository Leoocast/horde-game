export type BuffAnimationVariant =
  | "default"
  | "growth-preview"
  | "growth-soft"
  | "growth-strong"
  | "growth-feral";

const GROWTH_VARIANTS: Record<string, Exclude<BuffAnimationVariant, "default" | "growth-preview">> = {
  sunshower_druid: "growth-strong",
  beast_kin_ranger: "growth-strong",
  giant_growth: "growth-strong",
  ruthless_predation: "growth-strong",
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
