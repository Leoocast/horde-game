import { parseCanonicalTrait, type CanonicalTraitId } from "../i18n/gameVocabulary";

export type CardTraitIconKind =
  | "alert"
  | "daunting"
  | "drain"
  | "fallback"
  | "flying"
  | "furtive"
  | "impetus"
  | "lethal"
  | "overflow"
  | "poison"
  | "reflex"
  | "skyguard";

const ICON_KIND_BY_TRAIT: Record<CanonicalTraitId, CardTraitIconKind> = {
  ALERT: "alert",
  DAUNTING: "daunting",
  DRAIN: "drain",
  FLYING: "flying",
  FURTIVE: "furtive",
  IMPETUS: "impetus",
  LETHAL: "lethal",
  OVERFLOW: "overflow",
  POISON: "poison",
  REFLEX: "reflex",
  SKYGUARD: "skyguard",
};

export function cardTraitIconPresentation(keyword: string): {
  amount?: number;
  kind: CardTraitIconKind;
} {
  const parsed = parseCanonicalTrait(keyword);
  return {
    amount: parsed.id === "POISON" ? parsed.amount : undefined,
    kind: parsed.id ? ICON_KIND_BY_TRAIT[parsed.id] : "fallback",
  };
}
