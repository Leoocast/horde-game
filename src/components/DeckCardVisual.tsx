import type { NewDeckCard } from "../data/deckCatalog";
import { toArtCropImageUrl } from "../utils/cardImages";
import { HostfallCardFace } from "./HostfallCardFace";

type Props = {
  card: NewDeckCard;
  imageUrl?: string;
  displayName?: string;
  typeLine?: string;
  description?: string;
  flavorText?: string;
  credit?: string;
  cutted?: boolean;
  previewEffect?: boolean;
  className?: string;
};

export function DeckCardVisual({ card, imageUrl, displayName, typeLine, description = "", flavorText = "", credit, cutted = false, previewEffect = false, className = "" }: Props) {
  const artUrl = toArtCropImageUrl(imageUrl) ?? imageUrl;

  return (
    <HostfallCardFace
      name={displayName ?? card.name}
      imageUrl={artUrl}
      manaValue={card.manaValue}
      typeLine={typeLine}
      cardTypes={card.cardTypes}
      subtypes={card.subtypes}
      rulesText={description}
      flavorText={flavorText}
      credit={credit}
      power={card.power}
      toughness={card.toughness}
      cutted={cutted}
      className={[previewEffect ? "hostfall-card-preview-effect" : "", className].filter(Boolean).join(" ")}
    />
  );
}
