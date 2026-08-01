import goblinHostRaw from "./decks/horde/goblins/goblin_assault_horde.json";
import goblinHostImagesRaw from "./decks/horde/goblins/goblin_assault_horde_images_definition.json";
import hostZombiesRaw from "./decks/horde/zombies/horde-zombies.json";
import hostZombiesImagesRaw from "./decks/horde/zombies/horde-zombies_images.json";
import monoGreenRampRaw from "./decks/player/mono_green_ramp/mono_green_ramp.json";
import monoGreenRampImagesRaw from "./decks/player/mono_green_ramp/mono_green_ramp_images.json";
import vampirePreviewRaw from "./decks/player/vampire_preview/vampire_preview.json";
import vampirePreviewImagesRaw from "./decks/player/vampire_preview/vampire_preview_images.json";
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
  register("Mono-Green Ramp 39", monoGreenRampRaw as NewDeckList, monoGreenRampImagesRaw as DeckImageManifest, {
    keyCardId: "sunshower_druid",
    theme: "ramp",
    descriptionKey: "setup.descriptionRamp",
  }),
  register("La Corte Carmesí 40", vampirePreviewRaw as NewDeckList, vampirePreviewImagesRaw as DeckImageManifest, {
    keyCardId: "eternal_feast_countess",
    theme: "vampire",
    descriptionKey: "setup.descriptionVampires",
  }),
  register("Zombie Host 50", hostZombiesRaw as NewDeckList, hostZombiesImagesRaw as DeckImageManifest, {
    keyCardId: "zombie_token",
    theme: "zombie",
    descriptionKey: "setup.descriptionZombies",
    encounterTone: "undead",
  }),
  register("Goblin Host 50", goblinHostRaw as unknown as NewDeckList, goblinHostImagesRaw as DeckImageManifest, {
    keyCardId: "goblin_token_1_1_red",
    theme: "goblin",
    descriptionKey: "setup.descriptionGoblins",
    encounterTone: "goblins",
  }),
];

export const DEFAULT_PLAYER_DECK_ID = "mono_green_ramp";
export const DEFAULT_HOST_DECK_ID = "horde_zombies";

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
