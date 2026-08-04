import brokenForgeMutinyRaw from "./decks/host/broken_forge_mutiny/broken_forge_mutiny.json";
import brokenForgeMutinyImagesRaw from "./decks/host/broken_forge_mutiny/broken_forge_mutiny_images.json";
import hollowBellProcessionRaw from "./decks/host/hollow_bell_procession/hollow_bell_procession.json";
import hollowBellProcessionImagesRaw from "./decks/host/hollow_bell_procession/hollow_bell_procession_images.json";
import lastRainRaw from "./decks/player/last_rain/last_rain.json";
import lastRainImagesRaw from "./decks/player/last_rain/last_rain_images.json";
import crimsonCourtRaw from "./decks/player/crimson_court/crimson_court.json";
import crimsonCourtImagesRaw from "./decks/player/crimson_court/crimson_court_images.json";
import type { DeckImageManifest, DeckPresentation, NewDeckList } from "./deckCatalog";
import { normalizeDeck } from "./normalizeDeck";
import type { CardDefinition, DeckList } from "../engine/GameTypes";

export type DeckRegistryEntry = {
  /** Short label shown in deck selectors and the inspector. */
  label: string;
  raw: NewDeckList;
  images: DeckImageManifest;
  presentation: DeckPresentation;
  /** Engine-ready deck derived from `raw`; id and side come from the JSON itself. */
  deck: DeckList;
};

function register(label: string, raw: NewDeckList, images: DeckImageManifest, presentation: DeckPresentation): DeckRegistryEntry {
  return { label, raw, images, presentation, deck: normalizeDeck(raw) };
}

// Single registration point: the engine deck, the inspector view and the image lookups
// all derive from this list. Adding a deck = one `register(...)` line.
export const DECK_REGISTRY: DeckRegistryEntry[] = [
  register("El Pacto de Elarion 39", lastRainRaw as NewDeckList, lastRainImagesRaw as DeckImageManifest, {
    keyCardId: "iria_voice_last_rain",
    theme: "ramp",
    descriptionKey: "setup.descriptionRamp",
  }),
  register("La Corte del Eclipse Carmesí 40", crimsonCourtRaw as NewDeckList, crimsonCourtImagesRaw as DeckImageManifest, {
    keyCardId: "eternal_feast_countess",
    theme: "vampire",
    descriptionKey: "setup.descriptionVampires",
  }),
  register("El Alzamiento de los Sinsepulcro 50", hollowBellProcessionRaw as NewDeckList, hollowBellProcessionImagesRaw as DeckImageManifest, {
    keyCardId: "last_knell_dead",
    theme: "zombie",
    descriptionKey: "setup.descriptionZombies",
    encounterTone: "undead",
  }),
  register("La Legión de Varka 50", brokenForgeMutinyRaw as unknown as NewDeckList, brokenForgeMutinyImagesRaw as DeckImageManifest, {
    keyCardId: "ember_scrap_runner",
    theme: "goblin",
    descriptionKey: "setup.descriptionGoblins",
    encounterTone: "goblins",
  }),
];

export const DEFAULT_PLAYER_DECK_ID = "last_rain";
export const DEFAULT_HOST_DECK_ID = "hollow_bell_procession";

export const playerDeck = requireDeck(DEFAULT_PLAYER_DECK_ID);
export const hostDeck = requireDeck(DEFAULT_HOST_DECK_ID);

export function getPlayerDeck(id: string): DeckList {
  const entry = DECK_REGISTRY.find(
    (item) => item.deck.id === id && item.deck.side === "player" && item.presentation.playable !== false,
  );
  return entry?.deck ?? playerDeck;
}

export function getHostDeck(id: string): DeckList {
  const entry = DECK_REGISTRY.find((item) => item.deck.id === id && item.deck.side === "host");
  return entry?.deck ?? hostDeck;
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
