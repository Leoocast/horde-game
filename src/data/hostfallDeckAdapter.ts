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
  BEGIN_BATTLE: "BEGIN_COMBAT",
  BEGIN_READY: "BEGIN_UPKEEP",
  CARD_PLAYED: "CARD_CAST",
  ECHO_DIED: "CREATURE_DIED",
  INVOKED: "ENTERS_BATTLEFIELD",
};

const LEGACY_VALUE_BY_HOSTFALL_VALUE: Record<string, string> = {
  ANOTHER_ALLIED_ECHO_DIED: "ANOTHER_CREATURE_YOU_CONTROL_DIED",
  BANISH_CARD_FROM_MEMORY: "EXILE_CARD_FROM_GRAVEYARD",
  CHRONICLER_CHOOSES: "PLAYER_CHOOSES",
  COUNT_ECHOS: "COUNT_PERMANENTS",
  COUNT_ECHOS_INVOKED_THIS_TURN: "COUNT_PERMANENTS_ENTERED_THIS_TURN",
  DEAL_DAMAGE_TO_OPPONENT_ECHO: "DEAL_DAMAGE_TO_OPPONENT_CREATURE",
  DEAL_DAMAGE_TO_RANDOM_OPPONENT_ECHO: "DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT",
  DISCARD_OWN_ARCHIVE_TO_MEMORY: "MILL_SELF",
  EXHAUST_HOST_ECHOS_FOR_ENERGY: "TAP_HORDE_CREATURES_FOR_MANA",
  HOST_DIRECTIVE_ONLY: "HORDE_DIRECTIVE_ONLY",
  IGNORED_FOR_HOST_MVP: "IGNORED_FOR_HORDE_MVP",
  LOWEST_ENERGY_COST_THEN_RANDOM: "LOWEST_MANA_VALUE_THEN_RANDOM",
  LOWEST_EXCESS_ENERGY_THEN_LOWEST_EXHAUST_PRIORITY: "LOWEST_EXCESS_MANA_THEN_LOWEST_TAP_PRIORITY",
  MEMORY_COUNT_AT_LEAST: "GRAVEYARD_COUNT_AT_LEAST",
  MEMORY_HAS_TOKEN_ECHO_AND_NON_TOKEN_ECHO: "GRAVEYARD_HAS_TOKEN_CREATURE_AND_NON_TOKEN_CREATURE",
  PLAYED_CARD_IS_NON_TOKEN: "CAST_CARD_IS_NON_TOKEN",
  REVEAL_HOST_ROUND: "REVEAL_HORDE_ROUND",
  RETURN_SELF_FROM_MEMORY_TO_FIELD: "RETURN_SELF_FROM_GRAVEYARD_TO_BATTLEFIELD",
};

export function isHostfallDeck(rawDeck: NewDeckList): boolean {
  return rawDeck.schemaVersion === HOSTFALL_DECK_SCHEMA_VERSION;
}

/**
 * Temporary L3/L4 bridge. Every active deck speaks Hostfall while the L4 engine still consumes
 * its previous CardDefinition vocabulary.
 */
export function adaptHostfallDeck(rawDeck: NewDeckList): NewDeckList {
  if (!isHostfallDeck(rawDeck)) return rawDeck;
  return {
    ...rawDeck,
    side: rawDeck.side === "HOST" ? "HORDE" : "PLAYER",
    rulesProfile: rawDeck.rulesProfile
      ? adaptNestedAuthoring(rawDeck.rulesProfile) as Record<string, unknown>
      : undefined,
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
  if (typeof value === "string") return LEGACY_VALUE_BY_HOSTFALL_VALUE[value] ?? value;
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
    if (key === "energy") {
      adapted.mana = typeof nestedValue === "number" ? `{${nestedValue}}` : adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "exhausted") {
      adapted.tapped = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "permanentKind" && typeof nestedValue === "string") {
      adapted.permanentType = LEGACY_KIND_BY_HOSTFALL_KIND[nestedValue]?.[0] ?? nestedValue;
      continue;
    }
    if (key === "controller" && nestedValue === "HOST") {
      adapted.controller = "HORDE";
      continue;
    }
    if (key === "damagePerArchiveDiscard") {
      adapted.damagePerMill = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "poisonPerArchiveDiscard") {
      adapted.poisonPerMill = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "hostEchosHaveImpetus") {
      adapted.hordeCreaturesHaveHaste = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "requiredEnergy") {
      adapted.requiredMana = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "hostDirective") {
      adapted.hordeDirective = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "hostErrata") {
      adapted.hordeErrata = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "hostVersion") {
      adapted.hordeVersion = adaptNestedAuthoring(nestedValue);
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
    if (key === "eventObject" && nestedValue === "echo") {
      adapted.eventObject = "permanent";
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
