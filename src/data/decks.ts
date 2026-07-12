import hordeDeckRaw from "./horde-zombies.json";
import monoGreenRampRaw from "./decks/mono_green_ramp/mono_green_ramp.json";
import type { NewDeckList } from "./deckCatalog";
import { normalizeDeck } from "./normalizeDeck";
import type { CardDefinition, DeckList } from "../engine/GameTypes";

export const playerDeck = normalizeDeck(monoGreenRampRaw as NewDeckList);
export const hordeDeck = hordeDeckRaw as DeckList;

export const cardDefinitions: CardDefinition[] = [
  ...(playerDeck.cards ?? []),
  ...(playerDeck.tokens ?? []),
  ...(hordeDeck.cards ?? []),
  ...(hordeDeck.tokens ?? []),
];

export function findCardDefinition(id: string): CardDefinition | undefined {
  return cardDefinitions.find((card) => card.id === id);
}
