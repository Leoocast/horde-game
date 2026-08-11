import type { NewDeckCard, NewDeckList } from "../content/contracts";
import { HOSTFALL_DECK_SCHEMA_VERSION } from "../engine/hostfallVocabulary";
import { isHostfallAuthoredZone, toRuntimeZone } from "../engine/hostfallZones";

export { HOSTFALL_DECK_SCHEMA_VERSION } from "../engine/hostfallVocabulary";

export function isHostfallDeck(rawDeck: NewDeckList): boolean {
  return rawDeck.schemaVersion === HOSTFALL_DECK_SCHEMA_VERSION;
}

/**
 * Prepares authored Hostfall data for runtime consumers. Authored zones use uppercase enum values,
 * while card instances use lowercase zone names; every other canonical field passes through.
 */
export function normalizeAuthoredDeck(rawDeck: NewDeckList): NewDeckList {
  if (!isHostfallDeck(rawDeck)) return rawDeck;
  return {
    ...rawDeck,
    cards: rawDeck.cards.map(normalizeAuthoredCard),
    tokens: rawDeck.tokens?.map(normalizeAuthoredCard),
  };
}

export function normalizeAuthoredCard(card: NewDeckCard): NewDeckCard {
  const normalized = normalizeNestedAuthoring(card) as NewDeckCard;
  const hostfallKinds = card.kinds ?? [];

  return {
    ...normalized,
    modifiers: card.modifiers ?? [],
    isToken: Boolean(card.isToken || hostfallKinds.includes("TOKEN")),
  };
}

function normalizeNestedAuthoring(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalizeNestedAuthoring);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(source)) {
    if (key === "zone" && typeof nestedValue === "string") {
      normalized.zone = isHostfallAuthoredZone(nestedValue) ? toRuntimeZone(nestedValue) : nestedValue;
      continue;
    }
    normalized[key] = normalizeNestedAuthoring(nestedValue);
  }

  return normalized;
}
