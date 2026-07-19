import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import type { CardInstance } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { toHighResImageUrl, useCardDetails } from "../utils/cardImages";
import { renderCardText } from "../utils/cardTextSymbols";
import { typeLine } from "../utils/cardText";
import { cardKeywords } from "../utils/selectors";
import { GameTooltip } from "./GameTooltip";

const HOVER_PREVIEW_GAP = 14;
const HOVER_PREVIEW_MIN_WIDTH = 230;
const HOVER_PREVIEW_MAX_WIDTH = 350;
const VIEWPORT_PADDING = 12;

type HoverPreviewPosition = {
  cardId: string;
  left: number;
  top: number;
  width: number;
};

export function CardPreview() {
  const game = useGameStore((state) => state.game);
  const hoveredCardId = useGameStore((state) => state.hoveredCardId);
  const focusedCardId = useGameStore((state) => state.focusedCardId);
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const [hoverPosition, setHoverPosition] = useState<HoverPreviewPosition>();

  const activeId = focusedCardId ?? hoveredCardId;
  const card = activeId ? findCard(game, activeId) : undefined;
  const details = useCardDetails(card?.definitionId ?? "");

  useEffect(() => {
    if (hoveredCardId && !findCard(game, hoveredCardId)) setHoveredCardId(undefined);
    if (focusedCardId && !findCard(game, focusedCardId)) setFocusedCardId(undefined);
  }, [focusedCardId, game, hoveredCardId, setFocusedCardId, setHoveredCardId]);

  useLayoutEffect(() => {
    if (!focusedCardId) return;

    function closeLockedPreview(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-card-preview-locked='true']")) return;
      setHoveredCardId(undefined);
      setFocusedCardId(undefined);
    }

    document.addEventListener("pointerdown", closeLockedPreview, true);
    return () => document.removeEventListener("pointerdown", closeLockedPreview, true);
  }, [focusedCardId, setFocusedCardId, setHoveredCardId]);

  useLayoutEffect(() => {
    if (focusedCardId || !hoveredCardId) {
      setHoverPosition(undefined);
      return;
    }
    const observedCardId = hoveredCardId;

    const anchor = document.querySelector<HTMLElement>(`[data-card-id="${observedCardId}"]`);
    if (!anchor) {
      setHoverPosition(undefined);
      return;
    }
    const observedAnchor = anchor;

    let frame = 0;
    function measure() {
      const rect = observedAnchor.getBoundingClientRect();
      if (!observedAnchor.isConnected || rect.width < 24 || rect.height < 24) {
        setHoverPosition(undefined);
        return;
      }
      const availableHeightWidth = Math.max(150, (window.innerHeight - 76) * (488 / 680));
      const unscaledCardWidth = observedAnchor.offsetWidth || rect.width;
      const width = Math.min(HOVER_PREVIEW_MAX_WIDTH, availableHeightWidth, Math.max(HOVER_PREVIEW_MIN_WIDTH, unscaledCardWidth * 1.5));
      const height = width * (680 / 488);
      const effectActionOpen = Boolean(observedAnchor.closest(".effect-card-lifted")?.querySelector(".effect-action-button"));

      if (effectActionOpen) {
        const hasRoomOnLeft = rect.left >= width + HOVER_PREVIEW_GAP + VIEWPORT_PADDING;
        const availableAbove = Math.max(0, rect.top - HOVER_PREVIEW_GAP - VIEWPORT_PADDING);
        const previewWidth = hasRoomOnLeft
          ? width
          : Math.min(width, Math.max(150, availableAbove * (488 / 680)));
        const previewHeight = previewWidth * (680 / 488);
        const desiredLeft = hasRoomOnLeft
          ? rect.left - previewWidth - HOVER_PREVIEW_GAP
          : rect.left + (rect.width - previewWidth) / 2;
        const left = Math.min(window.innerWidth - previewWidth - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, desiredLeft));
        const desiredTop = hasRoomOnLeft
          ? rect.top + (rect.height - previewHeight) / 2
          : rect.top - previewHeight - HOVER_PREVIEW_GAP;
        const top = Math.min(window.innerHeight - previewHeight - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, desiredTop));
        setHoverPosition({ cardId: observedCardId, left, top, width: previewWidth });
        return;
      }

      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      const placeRight = spaceRight >= width + HOVER_PREVIEW_GAP || spaceRight >= spaceLeft;
      const desiredLeft = placeRight ? rect.right + HOVER_PREVIEW_GAP : rect.left - width - HOVER_PREVIEW_GAP;
      const left = Math.min(window.innerWidth - width - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, desiredLeft));
      const desiredTop = rect.top + (rect.height - height) / 2;
      const top = Math.min(window.innerHeight - height - VIEWPORT_PADDING, Math.max(64, desiredTop));
      setHoverPosition({ cardId: observedCardId, left, top, width });
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }

    const settleUntil = performance.now() + 320;
    function measureUntilSettled() {
      measure();
      if (performance.now() < settleUntil) frame = window.requestAnimationFrame(measureUntilSettled);
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(observedAnchor);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    frame = window.requestAnimationFrame(measureUntilSettled);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [focusedCardId, hoveredCardId]);

  if (!card || !details.imageUrl) return null;

  const keywords = cardKeywords(game, card);
  const imageUrl = toHighResImageUrl(details.imageUrl) ?? details.imageUrl;

  if (focusedCardId) {
    return (
      <>
        <div className="card-preview-dismiss-layer pointer-events-none fixed inset-0 z-[179]" aria-hidden="true" />
        <aside
          className="fixed left-4 top-[6rem] z-[180] flex max-h-[calc(100vh-7rem)] items-start gap-3 text-[#f6e6b8]"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div data-preserve-card-focus="true" data-card-preview-locked="true" className="card-preview-cropped-frame aspect-[488/680] w-[min(390px,29vw)] shadow-2xl shadow-black/65">
            <img src={imageUrl} alt={card.name} className="card-preview-cropped-image" draggable={false} />
          </div>
          {keywords && <div data-preserve-card-focus="true" data-card-preview-locked="true"><KeywordExplanations keywords={keywords} /></div>}
        </aside>
      </>
    );
  }

  if (!hoverPosition || hoverPosition.cardId !== hoveredCardId) return null;

  const { cardId: _positionCardId, ...hoverStyle } = hoverPosition;
  void _positionCardId;

  return (
    <div className="card-preview-cropped-frame pointer-events-none fixed z-[180] aspect-[488/680] shadow-2xl shadow-black/65" style={hoverStyle}>
      <img src={imageUrl} alt={card.name} className="card-preview-cropped-image" draggable={false} />
    </div>
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

function KeywordExplanations({ keywords }: { keywords: string }) {
  const entries = keywords
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (entries.length === 0) return null;

  return (
    <div className="flex w-[min(260px,20vw)] flex-col gap-2">
      {entries.map((keyword) => (
        <div key={keyword} className="old-panel-soft p-2.5">
          <div className="keyword-pill inline-flex min-h-6 items-center px-2.5 text-xs">{renderKeywordLabel(keyword)}</div>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-[#f4dfb0]">{keywordTooltip(keyword)}</p>
        </div>
      ))}
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
