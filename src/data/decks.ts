import goblinHordeRaw from "./decks/horde/goblins/goblin_assault_horde.json";
import goblinHordeImagesRaw from "./decks/horde/goblins/goblin_assault_horde_images_definition.json";
import hordeZombiesRaw from "./decks/horde/zombies/horde-zombies.json";
import hordeZombiesImagesRaw from "./decks/horde/zombies/horde-zombies_images.json";
import monoGreenRampRaw from "./decks/player/mono_green_ramp/mono_green_ramp.json";
import monoGreenRampImagesRaw from "./decks/player/mono_green_ramp/mono_green_ramp_images.json";
import type { DeckImageManifest, NewDeckList } from "./deckCatalog";
import { normalizeDeck } from "./normalizeDeck";
import type { CardDefinition, DeckList } from "../engine/GameTypes";

export type DeckRegistryEntry = {
  /** Short label shown in deck selectors and the inspector. */
  label: string;
  raw: NewDeckList;
  images: DeckImageManifest;
  /** Engine-ready deck derived from `raw`; id and side come from the JSON itself. */
  deck: DeckList;
};

function register(label: string, raw: NewDeckList, images: DeckImageManifest): DeckRegistryEntry {
  return { label, raw, images, deck: normalizeDeck(raw) };
}

// Single registration point: the engine deck, the inspector view and the image lookups
// all derive from this list. Adding a deck = one `register(...)` line.
export const DECK_REGISTRY: DeckRegistryEntry[] = [
  register("Mono-Green Ramp 39", monoGreenRampRaw as NewDeckList, monoGreenRampImagesRaw as DeckImageManifest),
  register("Zombie Horde 50", hordeZombiesRaw as NewDeckList, hordeZombiesImagesRaw as DeckImageManifest),
  register("Goblin Horde 50", goblinHordeRaw as unknown as NewDeckList, goblinHordeImagesRaw as DeckImageManifest),
];

export const DEFAULT_PLAYER_DECK_ID = "mono_green_ramp";
export const DEFAULT_HORDE_DECK_ID = "horde_zombies";

export const playerDeck = requireDeck(DEFAULT_PLAYER_DECK_ID);
export const hordeDeck = requireDeck(DEFAULT_HORDE_DECK_ID);

export function getPlayerDeck(id: string): DeckList {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === id && item.deck.side === "player");
  return entry?.deck ?? playerDeck;
}

export function getHordeDeck(id: string): DeckList {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === id && item.deck.side === "horde");
  return entry?.deck ?? hordeDeck;
}

export const cardDefinitions: CardDefinition[] = DECK_REGISTRY.flatMap((entry) => [
  ...(entry.deck.cards ?? []),
  ...(entry.deck.tokens ?? []),
]);

export function findCardDefinition(id: string): CardDefinition | undefined {
  return cardDefinitions.find((card) => card.id === id);
}

function requireDeck(id: string): DeckList {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === id);
  if (!entry) throw new Error(`Deck "${id}" is not registered.`);
  return entry.deck;
}
