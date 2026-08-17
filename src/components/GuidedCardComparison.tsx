import type { CardInstance, GameState } from "../engine/GameTypes";
import type { GuidedCardComparison as GuidedCardComparisonPresentation } from "../guidance/contracts";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { cardStatState } from "../utils/selectors";
import { cardThemeForDefinition, useCardDetails } from "../utils/cardImages";
import { CardCostBadge, CardStatsBadge } from "./Card";

export function GuidedCardComparison({
  cards,
  game,
  emphasis,
}: {
  cards: readonly CardInstance[];
  game: GameState;
  emphasis: GuidedCardComparisonPresentation["emphasis"];
}) {
  const t = useTranslation();
  return (
    <aside
      className={["guided-card-comparison", `is-${emphasis}`].join(" ")}
      aria-label={t("guided.cardComparison.label")}
      data-guided-overlay-control="true"
    >
      {cards.map((card) => (
        <GuidedComparisonCard key={card.instanceId} card={card} game={game} emphasis={emphasis} />
      ))}
    </aside>
  );
}

function GuidedComparisonCard({
  card,
  game,
  emphasis,
}: {
  card: CardInstance;
  game: GameState;
  emphasis: GuidedCardComparisonPresentation["emphasis"];
}) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const details = useCardDetails(card.definitionId);
  const name = localizedCardName(card, language);
  const cost = Math.max(0, Number(card.energyCost) || 0);
  const theme = cardThemeForDefinition(card.definitionId);
  const combatStats = cardStatState(game, card);

  return (
    <figure className="guided-card-comparison-item">
      <div className={[
        "guided-card-comparison-frame",
        "card-preview-full-card-frame",
        theme === "ramp" ? "" : `card-theme-${theme}`,
      ].filter(Boolean).join(" ")}>
        {details.imageUrl
          ? <img src={details.imageUrl} alt={name} draggable={false} />
          : <span className="guided-card-comparison-fallback">{name}</span>}
        {emphasis === "energyCost" && (
          <>
            <CardCostBadge card={card} />
            <span className="guided-card-comparison-cost-accessible">
              {t("guided.cardComparison.energyCost", { count: cost })}
            </span>
          </>
        )}
        {emphasis === "combatStats" && (
          <>
            <CardStatsBadge stats={combatStats} preferSingleSword />
            <span className="guided-card-comparison-stat-label is-power">{t("guided.cardComparison.power")}</span>
            <span className="guided-card-comparison-stat-label is-endurance">{t("guided.cardComparison.endurance")}</span>
          </>
        )}
      </div>
    </figure>
  );
}
