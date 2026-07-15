import goblinHordeRaw from "./decks/horde/goblins/goblin_assault_horde.json";
import hordeDeckRaw from "./decks/horde/zombies/horde-zombies.json";
import monoGreenRampRaw from "./decks/player/mono_green_ramp/mono_green_ramp.json";
import type { NewDeckList } from "./deckCatalog";
import { normalizeDeck } from "./normalizeDeck";
import type { CardDefinition, DeckList } from "../engine/GameTypes";

export const DEFAULT_PLAYER_DECK_ID = "mono_green_ramp";
export const DEFAULT_HORDE_DECK_ID = "horde_zombies";

export const playerDeck = normalizeDeck(monoGreenRampRaw as NewDeckList);
export const hordeDeck = hordeDeckRaw as DeckList;
export const goblinHordeDeck = normalizeDeck(goblinHordeRaw as unknown as NewDeckList);

const playerDecksById: Record<string, DeckList> = {
  [DEFAULT_PLAYER_DECK_ID]: playerDeck,
  [playerDeck.id]: playerDeck,
};

const hordeDecksById: Record<string, DeckList> = {
  [DEFAULT_HORDE_DECK_ID]: hordeDeck,
  [hordeDeck.id]: hordeDeck,
  [goblinHordeDeck.id]: goblinHordeDeck,
};

export function getPlayerDeck(id: string): DeckList {
  return playerDecksById[id] ?? playerDeck;
}

export function getHordeDeck(id: string): DeckList {
  return hordeDecksById[id] ?? hordeDeck;
}

export const cardDefinitions: CardDefinition[] = [
  ...(playerDeck.cards ?? []),
  ...(playerDeck.tokens ?? []),
  ...(hordeDeck.cards ?? []),
  ...(hordeDeck.tokens ?? []),
  ...(goblinHordeDeck.cards ?? []),
  ...(goblinHordeDeck.tokens ?? []),
];

export function findCardDefinition(id: string): CardDefinition | undefined {
  return cardDefinitions.find((card) => card.id === id);
}
