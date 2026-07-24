import type { Color } from "../engine/GameTypes";
import { DECK_REGISTRY } from "./decks";

export type NewDeckCard = {
  id: string;
  name: string;
  displayNameEs?: string;
  quantity?: number;
  isToken?: boolean;
  manaCost?: string;
  manaValue?: number;
  colors?: Color[];
  cardTypes?: string[];
  subtypes?: string[];
  power?: number | null;
  toughness?: number | null;
  keywords?: string[];
  triggerMessage?: string;
  entersTapped?: boolean;
  entersWithCounters?: Array<{ counterType: string; amount?: number }>;
  flags?: Record<string, boolean>;
  asEnters?: Array<{ type: string; storeAs: string; defaultForThisDeck?: Color }>;
  attachTo?: { targetRef: string };
  variableCost?: { hasX?: boolean; xChosenOnCast?: boolean };
  requiresDistribution?: { counterType: string; totalAmount: number; eachTargetMinimum?: number };
  abilities?: NewDeckAbility[];
  scryfall?: {
    lookupMode?: string;
    lookupQuery?: string;
    imagePath?: string;
    fallbackImagePath?: string;
  };
  [key: string]: unknown;
};

/** Marks an ability the engine does not run generically.
 *  - "pending": not implemented yet; the normalizer skips it and deck lint reports it as WIP.
 *  - "ignored": deliberately not implemented for this game mode (e.g. haste grants for the Horde).
 *  - "custom": handled by a bespoke code path outside the generic resolver (e.g. Smallpox). */
export type AbilityEngineSupport = "pending" | "ignored" | "custom";

export type NewDeckAbility = {
  id?: string;
  kind?: string;
  trigger?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  targets?: unknown[];
  conditions?: Array<Record<string, unknown>>;
  effects?: Array<Record<string, unknown>>;
  engineSupport?: AbilityEngineSupport;
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
      query?: string;
      pick?: number;
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

function toInspectable(entry: (typeof DECK_REGISTRY)[number]): InspectableDeck {
  return { id: entry.deck.id, label: entry.label, deck: entry.raw, images: entry.images };
}

export const playerInspectableDecks: InspectableDeck[] = DECK_REGISTRY.filter((entry) => entry.deck.side === "player").map(toInspectable);

export const hordeInspectableDecks: InspectableDeck[] = DECK_REGISTRY.filter((entry) => entry.deck.side === "horde").map(toInspectable);

export const inspectableDecks: InspectableDeck[] = [
  ...playerInspectableDecks,
  ...hordeInspectableDecks,
];

export function findInspectableDeck(id: string): InspectableDeck {
  return inspectableDecks.find((deck) => deck.id === id) ?? inspectableDecks[0];
}
