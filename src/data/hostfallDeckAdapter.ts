import type { NewDeckCard, NewDeckList } from "./deckCatalog";
import { HOSTFALL_DECK_SCHEMA_VERSION } from "../engine/hostfallVocabulary";
import { isHostfallAuthoredZone, toRuntimeZone } from "../engine/hostfallZones";

export { HOSTFALL_DECK_SCHEMA_VERSION } from "../engine/hostfallVocabulary";

export function isHostfallDeck(rawDeck: NewDeckList): boolean {
  return rawDeck.schemaVersion === HOSTFALL_DECK_SCHEMA_VERSION;
}

/**
 * Temporary L4 bridge. Card kinds, modifiers, Traits and the core Energy cost/pool contract already
 * stay in Hostfall vocabulary. Events, Actions and Host rules now do too; this adapter only keeps
 * the structural/side aliases scheduled for L4.6. Authored zone casing stays canonical.
 */
export function adaptHostfallDeck(rawDeck: NewDeckList): NewDeckList {
  if (!isHostfallDeck(rawDeck)) return rawDeck;
  return {
    ...rawDeck,
    side: rawDeck.side === "HOST" ? "HORDE" : "PLAYER",
    rulesProfile: rawDeck.rulesProfile,
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

  return {
    ...adapted,
    energyCost: amount,
    cardTypes: hostfallKinds,
    modifiers: modifiers ?? [],
    isToken: Boolean(card.isToken || hostfallKinds.includes("TOKEN")),
    toughness: endurance,
    keywords: traits ?? [],
  };
}

function normalizeEnergyAmount(value: unknown): number {
  if (typeof value === "number") return Math.max(0, value);
  if (!value || typeof value !== "object") return 0;
  return Math.max(0, Number((value as Record<string, unknown>).amount ?? 0));
}

function adaptNestedAuthoring(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [adaptNestedAuthoring(item)];
      return [adaptNestedAuthoring(item)];
    });
  }
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const adapted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(source)) {
    if (key === "kinds") {
      adapted.cardTypes = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "traits") {
      adapted.keywords = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "keyword" && typeof nestedValue === "string") {
      adapted.keyword = nestedValue;
      continue;
    }
    if (key === "endurance") {
      adapted.toughness = adaptNestedAuthoring(nestedValue);
      continue;
    }
    if (key === "permanentKind" && typeof nestedValue === "string") {
      adapted.permanentType = nestedValue;
      continue;
    }
    if (key === "controller" && nestedValue === "HOST") {
      adapted.controller = "HORDE";
      continue;
    }
    if (key === "zone" && typeof nestedValue === "string") {
      adapted.zone = isHostfallAuthoredZone(nestedValue) ? toRuntimeZone(nestedValue) : nestedValue;
      continue;
    }
    adapted[key] = adaptNestedAuthoring(nestedValue);
  }

  return adapted;
}
