import type { Color } from "../engine/GameTypes";
import monoGreenRampRaw from "./decks/mono_green_ramp/mono_green_ramp.json";
import monoGreenRampImagesRaw from "./decks/mono_green_ramp/mono_green_ramp_images.json";

export type NewDeckCard = {
  id: string;
  name: string;
  displayNameEs?: string;
  quantity?: number;
  manaCost?: string;
  manaValue?: number;
  colors?: Color[];
  cardTypes?: string[];
  subtypes?: string[];
  power?: number | null;
  toughness?: number | null;
  keywords?: string[];
  abilities?: NewDeckAbility[];
  scryfall?: {
    lookupMode?: string;
    lookupQuery?: string;
    imagePath?: string;
    fallbackImagePath?: string;
  };
  [key: string]: unknown;
};

export type NewDeckAbility = {
  id?: string;
  kind?: string;
  trigger?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  targets?: unknown[];
  effects?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type NewDeckList = {
  schemaVersion?: string;
  id: string;
  name: string;
  side?: string;
  deckSize?: number;
  cards: NewDeckCard[];
  tokens?: NewDeckCard[];
  [key: string]: unknown;
};

export type DeckImageManifest = {
  schemaVersion?: string;
  provider?: string;
  defaults?: {
    imageSize?: string;
    face?: string;
    cacheKey?: string;
  };
  cards: Record<
    string,
    {
      source: string;
      exact?: string;
      set?: string;
      collectorNumber?: string;
      imageUrl?: string;
      imagePath?: string;
      fallbackImagePath?: string;
    }
  >;
};

export type InspectableDeck = {
  id: string;
  label: string;
  deck: NewDeckList;
  images: DeckImageManifest;
};

export const inspectableDecks: InspectableDeck[] = [
  {
    id: "mono_green_ramp",
    label: "Mono-Green Ramp 40",
    deck: monoGreenRampRaw as NewDeckList,
    images: monoGreenRampImagesRaw as DeckImageManifest,
  },
];

export function findInspectableDeck(id: string): InspectableDeck {
  return inspectableDecks.find((deck) => deck.id === id) ?? inspectableDecks[0];
}
