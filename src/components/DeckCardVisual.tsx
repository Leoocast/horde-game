import type { NewDeckCard } from "../data/deckCatalog";
import { toArtCropImageUrl } from "../utils/cardImages";
import { HostfallCardFace } from "./HostfallCardFace";

type Props = {
  card: NewDeckCard;
  imageUrl?: string;
  description?: string;
  flavorText?: string;
  cutted?: boolean;
  previewEffect?: boolean;
  className?: string;
};

export function DeckCardVisual({ card, imageUrl, description = "", flavorText = "", cutted = false, previewEffect = false, className = "" }: Props) {
  const artUrl = toArtCropImageUrl(imageUrl) ?? imageUrl;

  return (
    <HostfallCardFace
      name={card.name}
      imageUrl={artUrl}
      manaValue={card.manaValue}
      cardTypes={card.cardTypes}
      subtypes={card.subtypes}
      rulesText={description}
      flavorText={flavorText}
      power={card.power}
      toughness={card.toughness}
      cutted={cutted}
      className={[previewEffect ? "hostfall-card-preview-effect" : "", className].filter(Boolean).join(" ")}
    />
  );
}
