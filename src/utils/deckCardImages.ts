import type { DeckImageManifest, NewDeckCard } from "../data/deckCatalog";
import { resolveBuiltinAssetUrl } from "../content/bootstrap";
import type { AppLanguage } from "../i18n/translations";

export type DeckCardDetails = {
  imageUrl?: string;
};

export function useDeckCardDetails(
  card: NewDeckCard | undefined,
  manifest: DeckImageManifest,
  language: AppLanguage = "es",
): DeckCardDetails {
  return localDeckCardDetails(card, manifest, language) ?? {};
}

function localDeckCardDetails(
  card: NewDeckCard | undefined,
  manifest: DeckImageManifest,
  language: AppLanguage,
): DeckCardDetails | undefined {
  if (!card) return undefined;
  const imageUrl = manifest.cards[card.id]?.imageUrl;
  return imageUrl
    ? { imageUrl: resolveBuiltinAssetUrl(localizedDeckCardImageUrl(imageUrl, manifest, language)) }
    : undefined;
}

export function localizedDeckCardImageUrl(
  imageUrl: string,
  manifest: DeckImageManifest,
  language: AppLanguage,
): string {
  const directory = manifest.defaults?.localizedImageDirectories?.[language]?.trim();
  if (!directory) return imageUrl;
  const separator = imageUrl.lastIndexOf("/");
  if (separator < 0) return imageUrl;
  return `${imageUrl.slice(0, separator + 1)}${directory}/${imageUrl.slice(separator + 1)}`;
}
