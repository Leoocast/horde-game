import { DECK_REGISTRY } from "./decks";
import { normalizeAuthoredDeck } from "./authoredDeckNormalizer";
import type {
  DeckImageManifest,
  DeckPresentation,
  NewDeckCard,
  NewDeckList,
} from "../content/contracts";

export type {
  AbilityEngineSupport,
  DeckImageManifest,
  DeckPresentation,
  DeckTheme,
  EncounterTone,
  NewDeckAbility,
  NewDeckCard,
  NewDeckList,
} from "../content/contracts";

export type InspectableDeck = {
  id: string;
  label: string;
  deck: NewDeckList;
  images: DeckImageManifest;
  presentation: DeckPresentation;
};

function toInspectable(entry: (typeof DECK_REGISTRY)[number]): InspectableDeck {
  return {
    id: entry.deck.id,
    label: entry.label,
    deck: normalizeAuthoredDeck(entry.raw),
    images: entry.images,
    presentation: entry.presentation,
  };
}

export const playerInspectableDecks: InspectableDeck[] = DECK_REGISTRY.filter((entry) => entry.deck.side === "player").map(toInspectable);

export const hostInspectableDecks: InspectableDeck[] = DECK_REGISTRY.filter((entry) => entry.deck.side === "host").map(toInspectable);

export const inspectableDecks: InspectableDeck[] = [
  ...playerInspectableDecks,
  ...hostInspectableDecks,
];

export function findInspectableDeck(id: string): InspectableDeck {
  const deck = inspectableDecks.find((candidate) => candidate.id === id);
  if (!deck) throw new Error(`Inspectable deck "${id}" is not registered.`);
  return deck;
}

/** The card that represents a deck across setup, the collection and the encounter transition. */
export function findDeckKeyCard(deck: InspectableDeck): NewDeckCard | undefined {
  const cards = [...(deck.deck.tokens ?? []), ...deck.deck.cards];
  return cards.find((card) => card.id === deck.presentation.keyCardId) ?? cards[0];
}
