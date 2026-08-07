export type BuffAnimationVariant =
  | "default"
  | "growth-preview"
  | "growth-soft"
  | "growth-strong"
  | "growth-feral"
  | "storm-strong";

const BUFF_VARIANTS: Record<string, Exclude<BuffAnimationVariant, "default" | "growth-preview">> = {
  aelyra_heir_of_elarion: "growth-strong",
  kaelor_stormcaller: "storm-strong",
  elixir_of_the_first_leaf: "growth-strong",
  shield_of_the_heir: "growth-strong",
};

/** Presentation mapping only. Rules remain generic; this chooses how an already-confirmed buff
 *  should read visually for the card that caused it. */
export function buffAnimationVariantForCard(
  definitionId?: string,
  preview = false,
): BuffAnimationVariant {
  const variant = definitionId ? BUFF_VARIANTS[definitionId] : undefined;
  if (!variant) return "default";
  return preview && variant.startsWith("growth-") ? "growth-preview" : variant;
}
