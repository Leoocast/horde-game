import { DECK_REGISTRY } from "../data/decks";
import type { DeckTheme } from "../data/deckCatalog";
import gameArtRaw from "../data/cardStudioGameArt.generated.json";
import runtimeLayoutRaw from "../data/cardRuntimeLayout.generated.json";
import type { BattlefieldArtFrame } from "./battlefieldArtFrame";
import type { CardStatFrame } from "./cardStatFrame";

export type CardDetails = {
  imageUrl?: string;
  battlefieldArtUrl?: string;
  battlefieldArtFrame?: BattlefieldArtFrame;
  statsFrame?: CardStatFrame;
};

type GeneratedGameArt = {
  schemaVersion: string;
  cards: Record<string, {
    artUrl: string;
    battlefieldArtFrame?: BattlefieldArtFrame;
  }>;
};

const gameArt = gameArtRaw as GeneratedGameArt;

type GeneratedRuntimeLayout = {
  schemaVersion: string;
  decks: Record<string, {
    cards: Record<string, {
      fullArt: true;
      statsFrame?: CardStatFrame;
    }>;
  }>;
};

const runtimeLayout = runtimeLayoutRaw as GeneratedRuntimeLayout;
const runtimeLayoutById = new Map(
  Object.values(runtimeLayout.decks).flatMap((deck) => Object.entries(deck.cards)),
);

const showFullCardImageById = new Map<string, boolean>(
  DECK_REGISTRY.flatMap((entry) =>
    Object.entries(entry.images.cards).map(([id, image]) => [
      id,
      image.showFullCardImage ?? entry.images.defaults?.showFullCardImage ?? false,
    ]),
  ),
);
const fullArtCardImageIds = new Set<string>(
  [
    ...DECK_REGISTRY.flatMap((entry) =>
      Object.entries(entry.images.cards).flatMap(([id, image]) => image.fullArt ? [id] : []),
    ),
    ...runtimeLayoutById.keys(),
  ],
);
const cardThemeByDefinitionId = new Map<string, DeckTheme>(
  DECK_REGISTRY.flatMap((entry) =>
    [...(entry.deck.cards ?? []), ...(entry.deck.tokens ?? [])].map(
      (card) => [card.id, entry.presentation.theme] as [string, DeckTheme],
    ),
  ),
);
const detailsById = new Map<string, CardDetails>([
  ...DECK_REGISTRY.flatMap((entry) =>
    Object.entries(entry.images.cards).flatMap(([id, image]) =>
      image.imageUrl
        ? [[id, {
            imageUrl: image.imageUrl,
            battlefieldArtUrl: gameArt.cards[id]?.artUrl,
            battlefieldArtFrame: gameArt.cards[id]?.battlefieldArtFrame,
            statsFrame: runtimeLayoutById.get(id)?.statsFrame,
          }] as [string, CardDetails]]
        : [],
    ),
  ),
]);

export function useCardDetails(definitionId: string): CardDetails {
  return detailsById.get(definitionId) ?? {};
}

export function useCardImage(definitionId: string): string | undefined {
  return useCardDetails(definitionId).imageUrl;
}

export function shouldShowFullCardImage(definitionId: string): boolean {
  return showFullCardImageById.get(definitionId) ?? false;
}

export function usesFullArtCardImage(definitionId: string): boolean {
  return fullArtCardImageIds.has(definitionId);
}

export function cardThemeForDefinition(definitionId: string): DeckTheme | undefined {
  return cardThemeByDefinitionId.get(definitionId);
}
