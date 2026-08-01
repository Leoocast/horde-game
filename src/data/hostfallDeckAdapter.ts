import type { NewDeckCard, NewDeckList } from "./deckCatalog";
import { HOSTFALL_DECK_SCHEMA_VERSION } from "../engine/hostfallVocabulary";
import { isHostfallAuthoredZone, toRuntimeZone } from "../engine/hostfallZones";

export { HOSTFALL_DECK_SCHEMA_VERSION } from "../engine/hostfallVocabulary";

export function isHostfallDeck(rawDeck: NewDeckList): boolean {
  return rawDeck.schemaVersion === HOSTFALL_DECK_SCHEMA_VERSION;
}

/**
 * Temporary L4 bridge. Runtime identity and card structure now stay in Hostfall vocabulary; this
 * adapter only converts authored zone casing to the lowercase runtime representation.
 */
export function adaptHostfallDeck(rawDeck: NewDeckList): NewDeckList {
  if (!isHostfallDeck(rawDeck)) return rawDeck;
  return {
    ...rawDeck,
    rulesProfile: rawDeck.rulesProfile,
    cards: rawDeck.cards.map(adaptHostfallCard),
    tokens: rawDeck.tokens?.map(adaptHostfallCard),
  };
}

export function adaptHostfallCard(card: NewDeckCard): NewDeckCard {
  const adapted = adaptNestedAuthoring(card) as NewDeckCard;
  const hostfallKinds = card.kinds ?? [];

  return {
    ...adapted,
    modifiers: card.modifiers ?? [],
    isToken: Boolean(card.isToken || hostfallKinds.includes("TOKEN")),
  };
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
    if (key === "zone" && typeof nestedValue === "string") {
      adapted.zone = isHostfallAuthoredZone(nestedValue) ? toRuntimeZone(nestedValue) : nestedValue;
      continue;
    }
    adapted[key] = adaptNestedAuthoring(nestedValue);
  }

  return adapted;
}
