import type { DeckImageManifest, NewDeckCard } from "../data/deckCatalog";
import { resolveBuiltinAssetUrl } from "../content/bootstrap";

export type DeckCardDetails = {
  imageUrl?: string;
};

export function useDeckCardDetails(card: NewDeckCard | undefined, manifest: DeckImageManifest): DeckCardDetails {
  return localDeckCardDetails(card, manifest) ?? {};
}

function localDeckCardDetails(card: NewDeckCard | undefined, manifest: DeckImageManifest): DeckCardDetails | undefined {
  if (!card) return undefined;
  const imageUrl = manifest.cards[card.id]?.imageUrl;
  return imageUrl ? { imageUrl: resolveBuiltinAssetUrl(imageUrl) } : undefined;
}
