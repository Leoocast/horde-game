import legionOfVarkaRaw from "./decks/host/legion_of_varka/legion_of_varka.json";
import legionOfVarkaImagesRaw from "./decks/host/legion_of_varka/legion_of_varka_images.json";
import uprisingOfTheGravelessRaw from "./decks/host/uprising_of_the_graveless/uprising_of_the_graveless.json";
import uprisingOfTheGravelessImagesRaw from "./decks/host/uprising_of_the_graveless/uprising_of_the_graveless_images.json";
import pactOfElarionRaw from "./decks/player/pact_of_elarion/pact_of_elarion.json";
import pactOfElarionImagesRaw from "./decks/player/pact_of_elarion/pact_of_elarion_images.json";
import courtOfTheCrimsonEclipseRaw from "./decks/player/court_of_the_crimson_eclipse/court_of_the_crimson_eclipse.json";
import courtOfTheCrimsonEclipseImagesRaw from "./decks/player/court_of_the_crimson_eclipse/court_of_the_crimson_eclipse_images.json";
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

function register(raw: NewDeckList, images: DeckImageManifest, presentation: DeckPresentation): DeckRegistryEntry {
  return {
    label: `${raw.name} ${raw.deckSize}`,
    raw,
    images,
    presentation,
    deck: normalizeDeck(raw),
  };
}

// Single registration point: the engine deck, the inspector view and the image lookups
// all derive from this list. Adding a deck = one `register(...)` line.
export const DECK_REGISTRY: DeckRegistryEntry[] = [
  register(pactOfElarionRaw as NewDeckList, pactOfElarionImagesRaw as DeckImageManifest, {
    keyCardId: "aelyra_heir_of_elarion",
    theme: "ramp",
    descriptionKey: "setup.descriptionRamp",
  }),
  register(courtOfTheCrimsonEclipseRaw as NewDeckList, courtOfTheCrimsonEclipseImagesRaw as DeckImageManifest, {
    keyCardId: "mirevna_countess_of_the_crimson_eclipse",
    theme: "vampire",
    descriptionKey: "setup.descriptionVampires",
  }),
  register(uprisingOfTheGravelessRaw as NewDeckList, uprisingOfTheGravelessImagesRaw as DeckImageManifest, {
    keyCardId: "nerezh_graveless_matriarch",
    theme: "zombie",
    descriptionKey: "setup.descriptionZombies",
    encounterTone: "undead",
  }),
  register(legionOfVarkaRaw as unknown as NewDeckList, legionOfVarkaImagesRaw as DeckImageManifest, {
    keyCardId: "varka_infernal_matriarch",
    theme: "goblin",
    descriptionKey: "setup.descriptionGoblins",
    encounterTone: "goblins",
  }),
];

export const DEFAULT_PLAYER_DECK_ID = "pact_of_elarion";
export const DEFAULT_HOST_DECK_ID = "uprising_of_the_graveless";

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
