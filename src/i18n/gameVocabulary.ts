import type { Phase, ZoneName } from "../engine/GameTypes";

export type VocabularyLanguage = "en" | "es";

type LocalizedTerm = Readonly<{
  en: string;
  es: string;
}>;

type LocalizedRuleTerm = LocalizedTerm & Readonly<{
  reminder: LocalizedTerm;
}>;

export function vocabularyText(term: LocalizedTerm, language: VocabularyLanguage): string {
  return term[language];
}

export const IDENTITY_VOCABULARY = {
  CHRONICLER: { en: "Chronicler", es: "Cronista" },
  CHRONICLE: { en: "Chronicle", es: "Crónica" },
  HOST: { en: "Host", es: "Hueste" },
  CHAPTER: { en: "Chapter", es: "Capítulo" },
  SURGE: { en: "Surge", es: "Oleada" },
} as const satisfies Record<string, LocalizedTerm>;

export const ZONE_VOCABULARY = {
  archive: { en: "Archive", es: "Archivo" },
  hand: { en: "Hand", es: "Mano" },
  field: { en: "Field", es: "Campo" },
  memory: { en: "Memory", es: "Memoria" },
  oblivion: { en: "Oblivion", es: "Olvido" },
} as const satisfies Record<ZoneName, LocalizedTerm>;

export const PHASE_VOCABULARY = {
  untap: { en: "Ready", es: "Preparar" },
  draw: { en: "Draw", es: "Robar" },
  main: { en: "Main", es: "Principal" },
  combat: { en: "Battle", es: "Batalla" },
  end: { en: "End", es: "Final" },
  host: { en: "Host Turn", es: "Turno de la Hueste" },
} as const satisfies Record<Phase, LocalizedTerm>;

export const CARD_TYPE_VOCABULARY = {
  CARD: { en: "Card", es: "Carta" },
  ECHO: { en: "Echo", es: "Eco" },
  SOURCE: { en: "Source", es: "Fuente" },
  SPELL: { en: "Spell", es: "Hechizo" },
  SUPPORT: { en: "Support", es: "Apoyo" },
  TOKEN: { en: "Token", es: "Ficha" },
  QUICK: { en: "Quick", es: "Rápido" },
  CHRONICLE: { en: "Chronicle", es: "de Crónica" },
} as const satisfies Record<string, LocalizedTerm>;

export const RESOURCE_VOCABULARY = {
  ENERGY: { en: "Energy", es: "Energía" },
  POWER: { en: "Power", es: "Fuerza" },
  ENDURANCE: { en: "Endurance", es: "Aguante" },
  LIFE: { en: "Life", es: "Vida" },
  POISON: { en: "Poison", es: "Veneno" },
} as const satisfies Record<string, LocalizedTerm>;

export const ACTION_VOCABULARY = {
  PLAY: { en: "Play", es: "Jugar" },
  INVOKE: { en: "Invoke", es: "Invocar" },
  EXHAUST: { en: "Exhaust", es: "Agotar" },
  READY: { en: "Ready", es: "Preparar" },
  DRAW: { en: "Draw", es: "Robar" },
  DISCARD: { en: "Discard", es: "Descartar" },
  DESTROY: { en: "Destroy", es: "Destruir" },
  DIE: { en: "Die", es: "Morir" },
  SACRIFICE: { en: "Sacrifice", es: "Sacrificar" },
  BANISH: { en: "Banish", es: "Desterrar" },
  REVEAL: { en: "Reveal", es: "Revelar" },
} as const satisfies Record<string, LocalizedTerm>;

export const ABILITY_CLASS_VOCABULARY = {
  TRAIT: { en: "Trait", es: "Rasgo" },
  ACTION: { en: "Action", es: "Acción" },
  REACTION: { en: "Reaction", es: "Reacción" },
  PASSIVE: { en: "Passive", es: "Pasiva" },
} as const satisfies Record<string, LocalizedTerm>;

export const STATE_VOCABULARY = {
  READY: { en: "Ready", es: "Preparada" },
  EXHAUSTED: { en: "Exhausted", es: "Agotada" },
  ATTACKING: { en: "Attacking", es: "Atacando" },
  DEFENDING: { en: "Defending", es: "Defendiendo" },
  WOUNDED: { en: "Wounded", es: "Herida" },
  EMPOWERED: { en: "Empowered", es: "Potenciada" },
  STABILIZING: { en: "Stabilizing", es: "Estabilizándose" },
} as const satisfies Record<string, LocalizedTerm>;

export const TRAIT_VOCABULARY = {
  FLYING: {
    en: "Flying",
    es: "Volar",
    reminder: {
      en: "Can defend against Echoes with Flying.",
      es: "Puede defender contra Ecos con Volar.",
    },
  },
  SKYGUARD: {
    en: "Skyguard",
    es: "Guardia aérea",
    reminder: {
      en: "Can defend against Echoes with Flying.",
      es: "Puede defender contra Ecos con Volar.",
    },
  },
  ALERT: {
    en: "Alert",
    es: "Alerta",
    reminder: {
      en: "Attacking does not Exhaust this Echo.",
      es: "Atacar no Agota este Eco.",
    },
  },
  DAUNTING: {
    en: "Daunting",
    es: "Imponente",
    reminder: {
      en: "Requires two or more defending Echoes.",
      es: "Requiere dos o más Ecos defensores.",
    },
  },
  LETHAL: {
    en: "Lethal",
    es: "Letal",
    reminder: {
      en: "Any positive damage this Echo deals to another Echo is lethal.",
      es: "Cualquier cantidad positiva de daño que haga a otro Eco es letal.",
    },
  },
  REFLEX: {
    en: "Reflex",
    es: "Reflejos",
    reminder: {
      en: "Deals Battle damage before an Echo without Reflex.",
      es: "Hace daño de Batalla antes que un Eco sin Reflejos.",
    },
  },
  FURTIVE: {
    en: "Furtive",
    es: "Furtivo",
    reminder: {
      en: "Cannot be defended by an Echo with greater Power.",
      es: "No puede ser defendido por un Eco con mayor Fuerza.",
    },
  },
  DRAIN: {
    en: "Drain",
    es: "Drenar",
    reminder: {
      en: "Battle damage dealt by this Echo restores that much Life.",
      es: "El daño de Batalla que hace este Eco recupera la misma cantidad de Vida.",
    },
  },
  POISON: {
    en: "Poison",
    es: "Veneno",
    reminder: {
      en: "When this Echo deals Battle damage to the Host, it adds the stated Poison.",
      es: "Cuando este Eco hace daño de Batalla a la Hueste, agrega el Veneno indicado.",
    },
  },
  OVERFLOW: {
    en: "Overflow",
    es: "Desborde",
    reminder: {
      en: "Excess Battle damage can pass to the defending side.",
      es: "El daño de Batalla sobrante puede pasar al bando defendido.",
    },
  },
  IMPETUS: {
    en: "Impetus",
    es: "Ímpetu",
    reminder: {
      en: "This Echo does not Stabilize and can attack or use Exhaust Actions immediately.",
      es: "Este Eco no se Estabiliza y puede atacar o usar Acciones de Agotar de inmediato.",
    },
  },
} as const satisfies Record<string, LocalizedRuleTerm>;

export type CanonicalTraitId = keyof typeof TRAIT_VOCABULARY;
export type CanonicalCardKindId = "ECHO" | "SOURCE" | "SPELL" | "SUPPORT" | "TOKEN";

const INTERNAL_CARD_TYPE_ALIASES: Readonly<Record<string, CanonicalCardKindId | undefined>> = {
  CREATURE: "ECHO",
  ECHO: "ECHO",
  LAND: "SOURCE",
  ENERGY: "SOURCE",
  SOURCE: "SOURCE",
  INSTANT: "SPELL",
  SORCERY: "SPELL",
  SPELL: "SPELL",
  ARTIFACT: "SUPPORT",
  ENCHANTMENT: "SUPPORT",
  SUPPORT: "SUPPORT",
  TOKEN: "TOKEN",
  BASIC: undefined,
  LEGENDARY: undefined,
  SNOW: undefined,
};

const INTERNAL_TRAIT_ALIASES: Readonly<Record<string, CanonicalTraitId>> = {
  FLYING: "FLYING",
  REACH: "SKYGUARD",
  SKYGUARD: "SKYGUARD",
  VIGILANCE: "ALERT",
  ALERT: "ALERT",
  MENACE: "DAUNTING",
  DAUNTING: "DAUNTING",
  DEATHTOUCH: "LETHAL",
  LETHAL: "LETHAL",
  FIRST_STRIKE: "REFLEX",
  REFLEX: "REFLEX",
  SKULK: "FURTIVE",
  FURTIVE: "FURTIVE",
  LIFESTEAL: "DRAIN",
  DRAIN: "DRAIN",
  TRAMPLE: "OVERFLOW",
  OVERFLOW: "OVERFLOW",
  HASTE: "IMPETUS",
  IMPETUS: "IMPETUS",
  TOXIC: "POISON",
  POISON: "POISON",
};

export function zoneVocabularyLabel(zone: ZoneName, language: VocabularyLanguage): string {
  return vocabularyText(ZONE_VOCABULARY[zone], language);
}

export function phaseVocabularyLabel(phase: Phase, language: VocabularyLanguage): string {
  return vocabularyText(PHASE_VOCABULARY[phase], language);
}

export function canonicalCardKindIds(kinds: readonly string[], isToken = false): CanonicalCardKindId[] {
  const result: CanonicalCardKindId[] = [];
  for (const cardType of kinds) {
    const canonical = INTERNAL_CARD_TYPE_ALIASES[cardType.trim().toUpperCase()];
    if (canonical && !result.includes(canonical)) result.push(canonical);
  }
  if (isToken && !result.includes("TOKEN")) result.push("TOKEN");
  return result;
}

export function canonicalCardKindLine(
  kinds: readonly string[],
  subtypes: readonly string[],
  language: VocabularyLanguage,
  isToken = false,
  modifiers: readonly string[] = [],
): string {
  const canonicalTypes = canonicalCardKindIds(kinds, isToken);
  const visibleTypes = canonicalTypes.length > 0
    ? canonicalTypes.map((id) => vocabularyText(CARD_TYPE_VOCABULARY[id], language))
    : [vocabularyText(CARD_TYPE_VOCABULARY.CARD, language)];
  if (modifiers.includes("QUICK") || kinds.some((type) => type.trim().toUpperCase() === "INSTANT")) {
    visibleTypes.push(vocabularyText(CARD_TYPE_VOCABULARY.QUICK, language));
  }
  if (modifiers.includes("CHRONICLE")) {
    visibleTypes.push(vocabularyText(CARD_TYPE_VOCABULARY.CHRONICLE, language));
  }
  const typePart = visibleTypes.join(" · ");
  return subtypes.length > 0 ? `${typePart} — ${subtypes.join(" ")}` : typePart;
}

export function parseCanonicalTrait(keyword: string): { id?: CanonicalTraitId; amount?: number } {
  const normalized = keyword.trim().toUpperCase().replace(/-/g, "_");
  const poison = normalized.match(/^(?:TOXIC|POISON)(?:[_\s]+\{?(\d+)\}?)?$/);
  if (poison) return { id: "POISON", amount: poison[1] ? Number(poison[1]) : undefined };
  return { id: INTERNAL_TRAIT_ALIASES[normalized] };
}

export function traitVocabularyLabel(keyword: string, language: VocabularyLanguage): string {
  const parsed = parseCanonicalTrait(keyword);
  if (!parsed.id) return vocabularyText(ABILITY_CLASS_VOCABULARY.TRAIT, language);
  const label = vocabularyText(TRAIT_VOCABULARY[parsed.id], language);
  return parsed.amount === undefined ? label : `${label} ${parsed.amount}`;
}

export function traitVocabularyTooltip(keyword: string, language: VocabularyLanguage): string {
  const parsed = parseCanonicalTrait(keyword);
  if (!parsed.id) {
    return language === "es"
      ? "Este Rasgo todavía no tiene una definición publicada de Hostfall."
      : "This Trait does not yet have a published Hostfall definition.";
  }
  return vocabularyText(TRAIT_VOCABULARY[parsed.id].reminder, language);
}
