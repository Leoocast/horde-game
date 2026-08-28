import type { CardDefinition, DeckList } from "../engine/GameTypes";
import type { CardKind, CardModifier, Trait } from "../engine/hostfallVocabulary";
import type { TranslationKey } from "../i18n/translations";

export type NewDeckCard = {
  id: string;
  /** Stable printed identity: HF (Hostfall) + A1 (Act I) + three-digit sequence. */
  collectorId?: string;
  name: string;
  displayNameEs?: string;
  gameText?: {
    en?: string;
    es?: string;
  };
  /** Narrative text is authored for every card even when the printed layout hides it. */
  flavorText: {
    en: string;
    es: string;
  };
  /** Card Studio printing flag; false preserves flavor in data without rendering it on the card. */
  showFlavorText: boolean;
  quantity?: number;
  isToken?: boolean;
  energyCost?: number | { amount: number };
  kinds?: CardKind[];
  modifiers?: CardModifier[];
  endurance?: number | null;
  traits?: Trait[];
  subtypes?: string[];
  power?: number | null;
  triggerMessage?: string;
  entersExhausted?: boolean;
  entersWithCounters?: Array<{ counterType: string; amount?: number }>;
  flags?: Record<string, boolean>;
  attachTo?: { targetRef: string };
  variableCost?: { hasX?: boolean; xChosenOnCast?: boolean };
  requiresDistribution?: { counterType: string; totalAmount: number; eachTargetMinimum?: number };
  abilities?: NewDeckAbility[];
  [key: string]: unknown;
};

/** Marks an ability the engine does not run generically.
 *  - "pending": not implemented yet; the normalizer skips it and deck lint reports it as WIP.
 *  - "ignored": deliberately not implemented for this game mode (e.g. haste grants for the Host).
 *  - "custom": handled by a bespoke code path outside the generic resolver. */
export type AbilityEngineSupport = "pending" | "ignored" | "custom";

export type NewDeckAbility = {
  id?: string;
  kind?: string;
  trigger?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  requiresStabilized?: boolean;
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
  /** English deck identity; `name` remains the authored Spanish identity for schema v1. */
  displayNameEn?: string;
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
    /** Subdirectories beside `imageUrl` that contain localized printed-card PNGs. */
    localizedImageDirectories?: Partial<Record<"en" | "es", string>>;
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
  /** Host-only palette for the pre-match versus transition. */
  encounterTone?: EncounterTone;
};

export type ContentOrigin = "builtin" | "local" | "workshop";

export type ContentPackDescriptor = Readonly<{
  /** Runtime-unique pack key assigned by the trusted source. */
  packKey: string;
  /** Stable author-facing identity used by future qualified IDs. */
  packId: string;
  origin: ContentOrigin;
  revision: string;
}>;

export type ContentDeckCandidate = Readonly<{
  label: string;
  raw: NewDeckList;
  images: DeckImageManifest;
  presentation: DeckPresentation;
}>;

export type ContentPackCandidate = Readonly<{
  descriptor: ContentPackDescriptor;
  decks: readonly ContentDeckCandidate[];
}>;

export interface ContentSource {
  readonly sourceId: string;
  readonly origin: ContentOrigin;
  loadCandidates(): readonly ContentPackCandidate[];
}

export type ContentDeckRecord = Readonly<{
  label: string;
  raw: NewDeckList;
  images: DeckImageManifest;
  presentation: DeckPresentation;
  /** Engine-ready deck derived from `raw`; id and side come from the JSON itself. */
  deck: DeckList;
  packKey: string;
  packId: string;
  origin: ContentOrigin;
  revision: string;
  qualifiedDeckKey: string;
}>;

export type ContentDefinitionRecord = Readonly<{
  definition: CardDefinition;
  packKey: string;
  packId: string;
  origin: ContentOrigin;
  revision: string;
  deckId: string;
  qualifiedDeckKey: string;
  qualifiedCardKey: string;
}>;
