import type { CardInstance } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { useCardDetails } from "../utils/cardImages";
import { CardCostBadge } from "./Card";

export function GuidedCardComparison({
  cards,
}: {
  cards: readonly CardInstance[];
}) {
  const t = useTranslation();
  return (
    <aside className="guided-card-comparison" aria-label={t("guided.cardComparison.label")} data-guided-overlay-control="true">
      {cards.map((card) => <GuidedComparisonCard key={card.instanceId} card={card} />)}
    </aside>
  );
}

function GuidedComparisonCard({ card }: { card: CardInstance }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const details = useCardDetails(card.definitionId);
  const name = localizedCardName(card, language);
  const cost = Math.max(0, Number(card.energyCost) || 0);

  return (
    <figure className="guided-card-comparison-item">
      <div className="guided-card-comparison-frame">
        {details.imageUrl
          ? <img src={details.imageUrl} alt={name} draggable={false} />
          : <span className="guided-card-comparison-fallback">{name}</span>}
        <CardCostBadge card={card} />
        <span className="guided-card-comparison-cost-accessible">
          {t("guided.cardComparison.energyCost", { count: cost })}
        </span>
      </div>
    </figure>
  );
}
