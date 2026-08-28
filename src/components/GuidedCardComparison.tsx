import { useLayoutEffect, useRef, useState, type Ref } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import type { GuidedCardComparison as GuidedCardComparisonPresentation } from "../guidance/contracts";
import {
  statLabelLeaders,
  statLabelLeadersEqual,
  type StatLabelBox,
  type StatLabelLeader,
} from "../guidance/statLabelGeometry";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { cardStatState } from "../utils/selectors";
import { cardThemeForDefinition, useCardDetails } from "../utils/cardImages";
import { CardCostBadge, CardStatsBadge } from "./Card";

const NO_LEADERS: readonly StatLabelLeader[] = Object.freeze([]);

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
  const details = useCardDetails(card.definitionId, language);
  const name = localizedCardName(card, language);
  const cost = Math.max(0, Number(card.energyCost) || 0);
  const theme = cardThemeForDefinition(card.definitionId);
  const combatStats = cardStatState(game, card);
  const showStats = emphasis === "combatStats" && Boolean(combatStats.text);

  const frameRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const powerRef = useRef<HTMLDivElement>(null);
  const enduranceRef = useRef<HTMLDivElement>(null);
  const [leaders, setLeaders] = useState<readonly StatLabelLeader[]>(NO_LEADERS);

  /*
   * Las cartelas se colocan en cqw, pero el marcador ensancha con los dígitos y la
   * comparación se escala con el viewport, así que la guía se remide en cuanto algo
   * cambia de tamaño. No hay bucle: la capa de guías no ocupa layout.
   */
  useLayoutEffect(() => {
    if (!showStats) {
      setLeaders((current) => (current.length === 0 ? current : NO_LEADERS));
      return;
    }
    const frame = frameRef.current;
    const badge = badgeRef.current;
    const power = powerRef.current;
    const endurance = enduranceRef.current;
    if (!frame || !badge || !power || !endurance || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const base = frame.getBoundingClientRect();
      if (base.width <= 0 || base.height <= 0) return;
      const localise = (node: HTMLElement): StatLabelBox => {
        const bounds = node.getBoundingClientRect();
        return {
          left: bounds.left - base.left,
          top: bounds.top - base.top,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const next = statLabelLeaders(localise(badge), {
        power: localise(power),
        endurance: localise(endurance),
      });
      setLeaders((current) => (statLabelLeadersEqual(current, next) ? current : next));
    };

    const observer = new ResizeObserver(measure);
    for (const node of [frame, badge, power, endurance]) observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [showStats, combatStats.power, combatStats.endurance, language]);

  return (
    <figure className="guided-card-comparison-item">
      <div
        ref={frameRef}
        className={[
          "guided-card-comparison-frame",
          "card-preview-full-card-frame",
          theme === "ramp" ? "" : `card-theme-${theme}`,
        ].filter(Boolean).join(" ")}
      >
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
            <CardStatsBadge stats={combatStats} preferSingleSword ref={badgeRef} />
            <StatLabelCard
              ref={powerRef}
              half="power"
              term={t("guided.cardComparison.power")}
              gloss={t("guided.cardComparison.powerGloss")}
              value={combatStats.power}
            />
            <StatLabelCard
              ref={enduranceRef}
              half="endurance"
              term={t("guided.cardComparison.endurance")}
              gloss={t("guided.cardComparison.enduranceGloss")}
              value={combatStats.endurance}
            />
            {leaders.length > 0 && (
              <svg className="guided-card-comparison-leaders" aria-hidden="true">
                {leaders.map((leader) => (
                  <g key={leader.half} className={`is-${leader.half}`}>
                    <path className="guided-card-comparison-leader" d={leader.path} />
                    <circle
                      className="guided-card-comparison-leader-dot"
                      cx={leader.target.x}
                      cy={leader.target.y}
                      r={leader.radius}
                    />
                  </g>
                ))}
              </svg>
            )}
          </>
        )}
      </div>
    </figure>
  );
}

/**
 * El cuadro de diálogo del tutorial en tamaño de cartela: mismo material, misma tapa
 * clara y el mismo rombo. El término ocupa el lugar del título y la cifra el del
 * contador de paso, así que la cartela se lee como una hoja más de la misma guía.
 */
function StatLabelCard({
  half,
  term,
  gloss,
  value,
  ref,
}: {
  half: "power" | "endurance";
  term: string;
  gloss: string;
  value?: number;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className={`guided-stat-label is-${half}`}>
      <span className="guided-stat-label-mark" aria-hidden="true" />
      <div className="guided-stat-label-head">
        <span className="guided-stat-label-term">{term}</span>
        {typeof value === "number" && <b className="guided-stat-label-value">{value}</b>}
      </div>
      <p className="guided-stat-label-body">{gloss}</p>
    </div>
  );
}
