export const HOSTFALL_DECK_SCHEMA_VERSION = "1.0.0" as const;

export const CARD_KINDS = ["ECHO", "SOURCE", "SPELL", "SUPPORT", "TOKEN"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_MODIFIERS = ["QUICK", "CHRONICLE"] as const;
export type CardModifier = (typeof CARD_MODIFIERS)[number];

export const BASE_TRAITS = [
  "FLYING",
  "SKYGUARD",
  "ALERT",
  "DAUNTING",
  "LETHAL",
  "REFLEX",
  "FURTIVE",
  "DRAIN",
  "OVERFLOW",
  "IMPETUS",
] as const;

export type BaseTrait = (typeof BASE_TRAITS)[number];
export type PoisonTrait = `POISON_${number}`;
export type Trait = BaseTrait | PoisonTrait;

export type CardKindView = Readonly<{
  cardTypes: readonly CardKind[];
  modifiers?: readonly CardModifier[];
}>;

const CARD_KIND_SET: ReadonlySet<string> = new Set(CARD_KINDS);
const CARD_MODIFIER_SET: ReadonlySet<string> = new Set(CARD_MODIFIERS);
const BASE_TRAIT_SET: ReadonlySet<string> = new Set(BASE_TRAITS);

export function isCardKind(value: unknown): value is CardKind {
  return typeof value === "string" && CARD_KIND_SET.has(value);
}

export function isCardModifier(value: unknown): value is CardModifier {
  return typeof value === "string" && CARD_MODIFIER_SET.has(value);
}

export function isTrait(value: unknown): value is Trait {
  return typeof value === "string"
    && (BASE_TRAIT_SET.has(value) || /^POISON_[1-9]\d*$/u.test(value));
}

export function hasCardKind(card: CardKindView, kind: CardKind): boolean {
  return card.cardTypes.includes(kind);
}

export function hasCardModifier(card: CardKindView, modifier: CardModifier): boolean {
  return card.modifiers?.includes(modifier) ?? false;
}

export function isQuickSpell(card: CardKindView): boolean {
  return hasCardKind(card, "SPELL") && hasCardModifier(card, "QUICK");
}
