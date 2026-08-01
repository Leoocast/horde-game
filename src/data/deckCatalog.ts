import type { Color } from "../engine/GameTypes";
import type { TranslationKey } from "../i18n/translations";
import { DECK_REGISTRY } from "./decks";
import { adaptHostfallDeck } from "./hostfallDeckAdapter";

export type NewDeckCard = {
  id: string;
  name: string;
  displayNameEs?: string;
  gameText?: {
    en?: string;
    es?: string;
  };
  quantity?: number;
  isToken?: boolean;
  energyCost?: number | { amount: number };
  kinds?: Array<"ECHO" | "SOURCE" | "SPELL" | "SUPPORT" | "TOKEN">;
  modifiers?: Array<"QUICK" | "CHRONICLE">;
  endurance?: number | null;
  traits?: string[];
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
  manaCost?: string;
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
  manaValue?: number;
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
  colors?: Color[];
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
  cardTypes?: string[];
  subtypes?: string[];
  power?: number | null;
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
  toughness?: number | null;
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
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
  requiresStabilized?: boolean;
  /** @deprecated Temporary compatibility with the pre-L4 engine contract. */
  requiresNoSummoningSickness?: boolean;
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
  /** Number of authored Land copies kept when the runtime prepares this player deck. */
  gameplayLandCount?: number;
  rulesProfile?: Record<string, unknown>;
  cards: NewDeckCard[];
  tokens?: NewDeckCard[];
  [key: string]: unknown;
};

export type DeckImageManifest = {
  schemaVersion?: string;
  provider?: "local";
  defaults?: {
    showFullCardImage?: boolean;
  };
  cards: Record<
    string,
    {
      source: "local";
      imageUrl: string;
      imageKind?: "art" | "card";
      showFullCardImage?: boolean;
      fullArt?: boolean;
    }
  >;
};

export type DeckTheme = "ramp" | "zombie" | "goblin" | "vampire";
export type EncounterTone = "undead" | "goblins";

export type DeckPresentation = {
  /** Card used as the deck cover in collection and expedition views. */
  keyCardId: string;
  /** Existing CSS theme applied to deck collection surfaces. */
  theme: DeckTheme;
  /** Localized summary shown while choosing the deck. */
  descriptionKey: TranslationKey;
  /** Preview Chronicles remain inspectable in the collection without entering Expedition setup. */
  playable?: boolean;
  /** Horde-only palette for the pre-match versus transition. */
  encounterTone?: EncounterTone;
};

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
    deck: adaptHostfallDeck(entry.raw),
    images: entry.images,
    presentation: entry.presentation,
  };
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
