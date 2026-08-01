import { DECK_REGISTRY } from "../data/decks";
import type { CardDefinition, Side } from "../engine/GameTypes";
import { canonicalCardTypeLine } from "../i18n/gameVocabulary";

export type CatalogCard = {
  /** Unique across the whole catalog; safe as a React list key. */
  key: string;
  definition: CardDefinition;
  deckId: string;
  deckLabel: string;
  side: Side;
  isToken: boolean;
};

/** Every card the engine knows about, tokens included. Derived from DECK_REGISTRY so a new deck
 *  shows up here the moment it is registered — the Playground never keeps its own card list.
 *
 * Deduplicated per deck by definition id: a deck may legitimately list the same id in both `cards`
 * and `tokens` (the Goblin Host runs Goblin tokens as real Archive cards), and `findCardDefinition`
 * resolves such an id to a single definition anyway. `key` is unique and stable for React lists. */
export const CATALOG_CARDS: CatalogCard[] = DECK_REGISTRY.flatMap((entry) => {
  const seen = new Set<string>();
  return [
    ...(entry.deck.cards ?? []).map((definition) => ({ definition, isToken: false })),
    ...(entry.deck.tokens ?? []).map((definition) => ({ definition, isToken: true })),
  ]
    .filter(({ definition }) => {
      if (seen.has(definition.id)) return false;
      seen.add(definition.id);
      return true;
    })
    .map(({ definition, isToken }) => ({
      key: `${entry.deck.id}:${definition.id}`,
      definition,
      deckId: entry.deck.id,
      deckLabel: entry.label,
      side: entry.deck.side,
      isToken: isToken || Boolean(definition.isToken),
    }));
});

export const CATALOG_DECKS: Array<{ id: string; label: string; side: Side }> = DECK_REGISTRY.map((entry) => ({
  id: entry.deck.id,
  label: entry.label,
  side: entry.deck.side,
}));

export function searchCatalog(query: string, deckId?: string): CatalogCard[] {
  const needle = query.trim().toLowerCase();
  return CATALOG_CARDS.filter((card) => {
    if (deckId && card.deckId !== deckId) return false;
    if (!needle) return true;
    return card.definition.name.toLowerCase().includes(needle) || card.definition.id.toLowerCase().includes(needle);
  });
}

/** One-line type summary rendered through the public Hostfall vocabulary. */
export function describeCardTypes(definition: CardDefinition): string {
  const line = canonicalCardTypeLine(definition.cardTypes ?? [], definition.subtypes ?? [], "en", definition.isToken);
  const power = definition.power ?? null;
  const toughness = definition.toughness ?? null;
  return power === null && toughness === null ? line : `${line} ${power ?? 0}/${toughness ?? 0}`;
}
