import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useState } from "react";
import type { CardInstance } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useCardDetails } from "../utils/cardImages";
import { cleanCardDescriptionText, renderCardText } from "../utils/cardTextSymbols";
import { effectSummary, typeLine } from "../utils/cardText";
import { cardKeywords, cardStats } from "../utils/selectors";
import { GameTooltip } from "./GameTooltip";

const PREVIEW_WIDTH_CLASS = "w-[340px]";
const PREVIEW_IMAGE_MAX_CLASS = "max-w-72";
const PREVIOUS_PREVIEW_WIDTH_CLASS = "w-[300px]";
const PREVIOUS_PREVIEW_IMAGE_MAX_CLASS = "max-w-64";

export function CardPreview() {
  const game = useGameStore((state) => state.game);
  const hoveredCardId = useGameStore((state) => state.hoveredCardId);
  const focusedCardId = useGameStore((state) => state.focusedCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const selectHand = useGameStore((state) => state.selectHand);
  const selectPlayerCreature = useGameStore((state) => state.selectPlayerCreature);
  const selectHordeCreature = useGameStore((state) => state.selectHordeCreature);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFontSize, setDetailsFontSize] = useState(20);

  const activeId = focusedCardId ?? hoveredCardId;
  const card = activeId ? findCard(game, activeId) : undefined;
  const details = useCardDetails(card?.definitionId ?? "");
  if (!card) {
    return null;
  }

  const stats = cardStats(game, card);
  const keywords = cardKeywords(game, card);
  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, keywords, effectSummary(card));
  const hasText = text.length > 0;
  void PREVIOUS_PREVIEW_WIDTH_CLASS;
  void PREVIOUS_PREVIEW_IMAGE_MAX_CLASS;
  const closePreview = () => {
    setFocusedCardId(undefined);
    selectHand(undefined);
    selectPlayerCreature(undefined);
    selectHordeCreature(undefined);
  };

  return (
    <>
      <aside data-preserve-card-focus="true" className={`old-panel fixed left-4 top-[6rem] z-[75] flex max-h-[calc(100vh-14rem)] ${PREVIEW_WIDTH_CLASS} flex-col overflow-hidden text-[#f6e6b8] shadow-2xl shadow-black/55`}>
        <div className="flex items-start justify-between gap-3 border-b border-[#8f6a36]/60 p-3">
          <div>
            <h2 className="old-title text-base font-bold leading-tight">{card.displayName}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#d6b879]">{typeLine(card)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {focusedCardId && (
              <>
                <button className="control-button h-7 px-2 text-[11px] uppercase tracking-wide" title="Open card details" onClick={() => setDetailsOpen(true)}>
                  <Maximize2 size={13} />
                  Details
                </button>
                <button className="icon-button" title="Close preview" onClick={closePreview}>
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden p-3">
          {details.imageUrl && <img src={details.imageUrl} alt={card.name} className={`mx-auto w-full ${PREVIEW_IMAGE_MAX_CLASS} border-2 border-[#9c7238] shadow-lg shadow-black/45`} />}
          <div className="flex items-center justify-between gap-2">
            {keywords && <KeywordPills keywords={keywords} compact />}
            {stats && <span className="preview-stat-pill ml-auto">{stats}</span>}
          </div>
          {hasText && (
            <div className="old-panel-soft min-h-0 flex-1 overflow-auto p-2">
              <p className="whitespace-pre-line text-base leading-relaxed text-[#f4dfb0]">{renderCardText(text)}</p>
            </div>
          )}
        </div>
      </aside>
      {detailsOpen && (
        <CardDetailsModal
          card={card}
          imageUrl={details.imageUrl}
          keywords={keywords}
          stats={stats}
          text={text}
          fontSize={detailsFontSize}
          setFontSize={setDetailsFontSize}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  );
}

export function CardDetailsModal({
  card,
  imageUrl,
  keywords,
  stats,
  text,
  fontSize,
  setFontSize,
  onClose,
  onPrevious,
  onNext,
  previousLabel = "Previous card",
  nextLabel = "Next card",
}: {
  card: CardInstance;
  imageUrl?: string;
  keywords?: string;
  stats?: string;
  text: string;
  fontSize: number;
  setFontSize: (value: number) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  previousLabel?: string;
  nextLabel?: string;
}) {
  return (
    <div data-preserve-card-focus="true" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/88 p-6 text-[#f6e6b8] backdrop-blur-md">
      <div className="relative flex w-[min(1320px,calc(100vw-48px))] items-center justify-center">
        {onPrevious && (
          <button className="old-button absolute left-0 top-1/2 z-[310] flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full" onClick={onPrevious} title={previousLabel}>
            <ChevronLeft size={26} />
          </button>
        )}
        {onNext && (
          <button className="old-button absolute right-0 top-1/2 z-[310] flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full" onClick={onNext} title={nextLabel}>
            <ChevronRight size={26} />
          </button>
        )}
        <section className="old-panel card-details-modal-panel max-h-[86vh] w-[min(1160px,calc(100vw-12rem))] overflow-hidden p-5 shadow-2xl shadow-black/70">
        <div className="min-h-0">
          {imageUrl ? (
            <img src={imageUrl} alt={card.name} className="mx-auto max-h-[74vh] w-full max-w-[360px] rounded-md border-2 border-[#b88945] object-contain shadow-xl shadow-black/55" />
          ) : (
            <div className="flex aspect-[488/680] w-full items-center justify-center rounded-md border-2 border-[#b88945] bg-[#1b120b] p-4 text-center text-lg font-bold text-[#d6b879]">{card.displayName}</div>
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[#8f6a36]/60 pb-3">
            <div>
              <h2 className="old-title text-3xl font-black leading-tight">{card.displayName}</h2>
              <p className="mt-2 text-sm font-bold uppercase tracking-wide text-[#d6b879]">{typeLine(card)}</p>
            </div>
            <button className="icon-button h-9 w-9" title="Close details" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {keywords && <KeywordPills keywords={keywords} />}
            {stats && <span className="preview-stat-pill scale-110">{stats}</span>}
            <label className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#d6b879]">
              <span className="old-title text-base normal-case tracking-normal" title="Font size">
                aA
              </span>
              <button className="icon-button h-7 w-7 text-sm" disabled={fontSize <= 16} onClick={() => setFontSize(Math.max(16, fontSize - 1))} title="Decrease font size">
                -
              </button>
              <input type="range" min={16} max={30} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} className="w-32 accent-[#d6a34c]" />
              <button className="icon-button h-7 w-7 text-sm" disabled={fontSize >= 30} onClick={() => setFontSize(Math.min(30, fontSize + 1))} title="Increase font size">
                +
              </button>
              <span className="w-8 text-right text-[#ffe0a0]">{fontSize}</span>
            </label>
          </div>
          <div className="old-panel-soft mt-4 min-h-0 flex-1 overflow-auto p-4">
            <p className="whitespace-pre-line leading-relaxed text-[#f8e8bd]" style={{ fontSize }}>{renderCardText(text)}</p>
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}

export function KeywordPills({ keywords, compact = false }: { keywords: string; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {keywords.split(",").map((keyword) => {
        const clean = keyword.trim();
        if (!clean) return null;
        return (
          <GameTooltip key={clean} content={keywordTooltip(clean)}>
            <span className={["keyword-pill", compact ? "h-[1.08rem] px-2 text-[0.68rem]" : ""].join(" ")}>{renderKeywordLabel(clean)}</span>
          </GameTooltip>
        );
      })}
    </div>
  );
}

function renderKeywordLabel(keyword: string) {
  const toxic = keyword.match(/^TOXIC\s+\{(\d+)\}$/i);
  if (!toxic) return keyword;
  return (
    <>
      TOXIC <span className="toxic-keyword-badge">{toxic[1]}</span>
    </>
  );
}

function keywordTooltip(keyword: string): string {
  const text = keyword.trim();
  const upper = text.toUpperCase();
  if (upper === "FLYING") return "Can only be blocked by creatures with flying or reach.";
  if (upper === "REACH") return "Can block creatures with flying.";
  if (upper === "VIGILANCE") return "Attacking does not tap this creature.";
  if (upper === "MENACE") return "This creature can only be blocked by two or more creatures.";
  if (upper === "DEATHTOUCH") return "Any damage this creature deals to another creature is lethal.";
  if (upper === "TRAMPLE") return "Excess combat damage can carry over to the defending side.";
  if (upper === "HASTE") return "Can attack and use tap abilities immediately.";
  if (upper.startsWith("TOXIC")) return "When this creature deals combat damage to the Horde, it adds poison counters.";
  return "Keyword ability.";
}

function findCard(game: ReturnType<typeof useGameStore.getState>["game"], id: string): CardInstance | undefined {
  return [
    ...game.player.hand,
    ...game.player.battlefield,
    ...game.player.graveyard,
    ...game.player.exile,
    ...game.horde.battlefield,
    ...game.horde.graveyard,
    ...game.horde.exile,
  ].find((card) => card.instanceId === id);
}
