import hordeDeckRaw from "./horde-zombies.json";
import playerDeckRaw from "./player-elves-primordials.json";
import type { CardDefinition, DeckList } from "../engine/GameTypes";

export const playerDeck = playerDeckRaw as DeckList;
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
