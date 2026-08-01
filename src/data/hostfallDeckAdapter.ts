import type { NewDeckCard, NewDeckList } from "./deckCatalog";

export const HOSTFALL_DECK_SCHEMA_VERSION = "1.0.0";

const LEGACY_KIND_BY_HOSTFALL_KIND: Record<string, string[]> = {
  ECHO: ["Creature"],
  SOURCE: ["Land"],
  SUPPORT: ["Artifact", "Enchantment"],
};

const LEGACY_TRAIT_BY_HOSTFALL_TRAIT: Record<string, string> = {
  ALERT: "VIGILANCE",
  DAUNTING: "MENACE",
  DRAIN: "LIFESTEAL",
  FURTIVE: "SKULK",
  IMPETUS: "HASTE",
  LETHAL: "DEATHTOUCH",
  OVERFLOW: "TRAMPLE",
  REFLEX: "FIRST_STRIKE",
  SKYGUARD: "REACH",
};

const LEGACY_ZONE_BY_HOSTFALL_ZONE: Record<string, string> = {
  ARCHIVE: "LIBRARY",
  FIELD: "BATTLEFIELD",
  HAND: "HAND",
  MEMORY: "GRAVEYARD",
  OBLIVION: "EXILE",
};

const LEGACY_EVENT_BY_HOSTFALL_EVENT: Record<string, string> = {
  INVOKED: "ENTERS_BATTLEFIELD",
};

export function isHostfallDeck(rawDeck: NewDeckList): boolean {
  return rawDeck.schemaVersion === HOSTFALL_DECK_SCHEMA_VERSION;
}

/**
 * Temporary L3 bridge. Deck JSON can speak Hostfall while the L4 engine still consumes its
 * previous CardDefinition vocabulary. Legacy 0.2 decks pass through untouched until migrated.
 */
export function adaptHostfallDeck(rawDeck: NewDeckList): NewDeckList {
  if (!isHostfallDeck(rawDeck)) return rawDeck;
  return {
    ...rawDeck,
    side: rawDeck.side === "HOST" ? "HORDE" : "PLAYER",
    cards: rawDeck.cards.map(adaptHostfallCard),
    tokens: rawDeck.tokens?.map(adaptHostfallCard),
  };
}

export function adaptHostfallCard(card: NewDeckCard): NewDeckCard {
  const {
    energyCost,
    kinds,
    modifiers,
    endurance,
    traits,
    ...legacyCompatibleCard
  } = card;
  const adapted = adaptNestedAuthoring(legacyCompatibleCard) as NewDeckCard;
  const amount = normalizeEnergyAmount(energyCost);
  const hostfallKinds = kinds ?? [];
  const legacyCardTypes = topLevelLegacyCardTypes(hostfallKinds, modifiers ?? []);

  return {
    ...adapted,
    manaCost: amount > 0 ? `{${amount}}` : "",
    manaValue: amount,
    colors: [],
    cardTypes: legacyCardTypes,
    isToken: Boolean(card.isToken || hostfallKinds.includes("TOKEN")),
    toughness: endurance,
    keywords: (traits ?? []).map(toLegacyTrait),
  };
}

function normalizeEnergyAmount(value: unknown): number {
  if (typeof value === "number") return Math.max(0, value);
  if (!value || typeof value !== "object") return 0;
  return Math.max(0, Number((value as Record<string, unknown>).amount ?? 0));
}

function topLevelLegacyCardTypes(kinds: string[], modifiers: string[]): string[] {
  const cardTypes = kinds.flatMap((kind) => {
    if (kind === "SPELL") return [modifiers.includes("QUICK") ? "Instant" : "Sorcery"];
    if (kind === "SUPPORT") return ["Enchantment"];
    return LEGACY_KIND_BY_HOSTFALL_KIND[kind] ?? [];
  });
  if (modifiers.includes("CHRONICLE")) cardTypes.unshift("Legendary");
  return [...new Set(cardTypes)];
}

function nestedLegacyKinds(kinds: unknown): unknown {
  if (!Array.isArray(kinds)) return kinds;
  return [...new Set(kinds.flatMap((kind) => LEGACY_KIND_BY_HOSTFALL_KIND[String(kind)] ?? []))];
}

function toLegacyTrait(trait: string): string {
  const poison = trait.match(/^POISON_(\d+)$/u);
  if (poison) return `TOXIC_${poison[1]}`;
  return LEGACY_TRAIT_BY_HOSTFALL_TRAIT[trait] ?? trait;
}

function nestedLegacyTraits(traits: unknown): unknown {
  if (!Array.isArray(traits)) return traits;
  return traits.map((trait) => toLegacyTrait(String(trait)));
}

function adaptNestedAuthoring(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [adaptNestedAuthoring(item)];
      const record = item as Record<string, unknown>;
      const kinds = Array.isArray(record.kinds) ? record.kinds.map(String) : [];
      if (!kinds.includes("SUPPORT")) return [adaptNestedAuthoring(item)];
      const { kinds: _kinds, ...rest } = record;
      const otherTypes = nestedLegacyKinds(kinds.filter((kind) => kind !== "SUPPORT")) as string[];
      const adaptedRest = adaptNestedAuthoring(rest) as Record<string, unknown>;
      return ["Artifact", "Enchantment"].map((supportType) => ({
        ...adaptedRest,
        cardTypes: [...otherTypes, supportType],
      }));
    });
  }
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const adapted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(source)) {
    if (key === "kinds") {
      adapted.cardTypes = nestedLegacyKinds(nestedValue);
      continue;
    }
    if (key === "traits") {
      adapted.keywords = nestedLegacyTraits(nestedValue);
      continue;
    }
    if (key === "keyword" && typeof nestedValue === "string") {
      adapted.keyword = toLegacyTrait(nestedValue);
      continue;
    }
    if (key === "endurance") {
      adapted.toughness = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "exhaust") {
      adapted.tap = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "requiresStabilized") {
      adapted.requiresNoSummoningSickness = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "type" && nestedValue === "SOURCE_IS_READY") {
      adapted.type = "SOURCE_IS_UNTAPPED";
      continue;
    }
    if (key === "zone" && typeof nestedValue === "string") {
      adapted.zone = LEGACY_ZONE_BY_HOSTFALL_ZONE[nestedValue] ?? nestedValue;
      continue;
    }
    if (key === "event" && typeof nestedValue === "string") {
      adapted.event = LEGACY_EVENT_BY_HOSTFALL_EVENT[nestedValue] ?? nestedValue;
      continue;
    }
    if (key === "duration" && nestedValue === "WHILE_SOURCE_ON_FIELD") {
      adapted.duration = "WHILE_SOURCE_ON_BATTLEFIELD";
      continue;
    }
    if (key === "speed" && typeof nestedValue === "string") {
      adapted.speed = nestedValue === "QUICK" ? "INSTANT" : nestedValue === "MAIN" ? "SORCERY" : nestedValue;
      continue;
    }
    adapted[key] = adaptNestedAuthoring(nestedValue);
  }

  if (adapted.type === "GAIN_ENERGY") {
    const amount = Math.max(0, Number(adapted.amount ?? 1));
    adapted.type = "ADD_MANA";
    adapted.mana = { G: amount };
    delete adapted.amount;
  }
  return adapted;
}
