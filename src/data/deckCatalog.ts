import type { Color } from "../engine/GameTypes";
import type { DeckList } from "../engine/GameTypes";
import hordeDeckRaw from "./horde-zombies.json";
import monoGreenRampRaw from "./decks/mono_green_ramp/mono_green_ramp.json";
import monoGreenRampImagesRaw from "./decks/mono_green_ramp/mono_green_ramp_images.json";
import cardImageLookupsRaw from "../../cardImageLookups.json";

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
      lookupUrl?: string;
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

export const playerInspectableDecks: InspectableDeck[] = [
  {
    id: "mono_green_ramp",
    label: "Mono-Green Ramp 40",
    deck: monoGreenRampRaw as NewDeckList,
    images: monoGreenRampImagesRaw as DeckImageManifest,
  },
];

export const hordeInspectableDecks: InspectableDeck[] = [
  {
    id: "horde_zombies",
    label: "Zombie Horde 50",
    deck: hordeDeckToInspectable(hordeDeckRaw as DeckList),
    images: hordeImageManifest(),
  },
];

export const inspectableDecks: InspectableDeck[] = [
  ...playerInspectableDecks,
  ...hordeInspectableDecks,
];

export function findInspectableDeck(id: string): InspectableDeck {
  return inspectableDecks.find((deck) => deck.id === id) ?? inspectableDecks[0];
}

function hordeDeckToInspectable(deck: DeckList): NewDeckList {
  return {
    schemaVersion: "legacy-horde-adapter",
    id: deck.id,
    name: deck.name,
    side: "horde",
    deckSize: deck.deckSize,
    cards: deck.cards.map((card) => ({
      ...card,
      power: typeof card.power === "number" ? card.power : null,
      toughness: typeof card.toughness === "number" ? card.toughness : null,
      abilities: [],
    })),
  };
}

function hordeImageManifest(): DeckImageManifest {
  const raw = cardImageLookupsRaw as {
    hordeZombieDeck?: Array<{
      id: string;
      name: string;
      lookup_url: string;
      image_path: string;
    }>;
  };
  return {
    schemaVersion: "legacy-horde-image-adapter",
    provider: "scryfall",
    cards: Object.fromEntries(
      (raw.hordeZombieDeck ?? []).map((entry) => [
        entry.id,
        {
          source: "legacyLookupUrl",
          exact: entry.name,
          lookupUrl: entry.lookup_url,
          imagePath: entry.image_path,
          fallbackImagePath: "image_uris.large",
        },
      ]),
    ),
  };
}
