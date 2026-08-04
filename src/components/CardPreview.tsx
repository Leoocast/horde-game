import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import type { DeckTheme } from "../data/deckCatalog";
import type { CardInstance } from "../engine/GameTypes";
import { cardLabelCamelCase, localizedCardName, localizedTraitLabel, localizedTraitTooltip, localizedTypeLine, naturalCaseTraitLabel } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { cardThemeForDefinition, shouldShowFullCardImage, useCardDetails, usesFullArtCardImage } from "../utils/cardImages";
import { cardStatFrameCssVariables } from "../utils/cardStatFrame";
import { renderCardText } from "../utils/cardTextSymbols";
import { cardTraits, cardStatState } from "../utils/selectors";
import { CardCostBadge, CardStatsBadge } from "./Card";
import { CardTraitIcon } from "./CardTraitIcon";
import { GameTooltip } from "./GameTooltip";
import {
  fitHoverCardDisplay,
  LARGE_CARD_DISPLAY_HEIGHT,
  LARGE_CARD_DISPLAY_WIDTH,
} from "./cardDisplayGeometry";

const HOVER_PREVIEW_GAP = 14;
const VIEWPORT_PADDING = 12;

type HoverPreviewPosition = {
  cardId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function CardPreview() {
  const language = useLanguageStore((state) => state.language);
  const game = useGameStore((state) => state.game);
  const hoveredCardId = useGameStore((state) => state.hoveredCardId);
  const focusedCardId = useGameStore((state) => state.focusedCardId);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const [hoverPosition, setHoverPosition] = useState<HoverPreviewPosition>();

  const activeId = focusedCardId ?? activeEffectCardId ?? hoveredCardId;
  const card = activeId ? findCard(game, activeId) : undefined;
  const heldStaticAuraBonus = useGameStore((state) => activeId ? state.heldStaticAuraBonuses[activeId] : undefined);
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
    // The lifted-effect preview must follow the zoomed/translated card, so it is
    // driven by activeEffectCardId (set at click time) rather than hover. The hover
    // clears on click, so relying on it here left the preview measuring a stale,
    // unzoomed rect until a fresh mouseenter fired.
    const previewCardId = activeEffectCardId ?? hoveredCardId;
    if (focusedCardId || !previewCardId) {
      setHoverPosition(undefined);
      return;
    }
    const observedCardId = previewCardId;

    const anchor = document.querySelector<HTMLElement>(`[data-card-id="${observedCardId}"]`);
    if (!anchor) {
      setHoverPosition(undefined);
      return;
    }
    const observedAnchor = anchor;
    const battlefieldSlot = observedAnchor.closest<HTMLElement>(".field-card-slot, .field-card-slot-compact");

    let scheduleFrame = 0;
    let settleFrame = 0;
    function measure() {
      const liftedSlot = observedAnchor.closest<HTMLElement>(".effect-card-lifted");
      const placementAnchor = liftedSlot ?? observedAnchor;
      const rect = placementAnchor.getBoundingClientRect();
      if (!observedAnchor.isConnected || rect.width < 24 || rect.height < 24) {
        setHoverPosition(undefined);
        return;
      }
      const availableHeightWidth = Math.max(122, (window.innerHeight - 76) * (488 / 680));
      const { width, height } = fitHoverCardDisplay(availableHeightWidth);
      const effectActionOpen = Boolean(liftedSlot?.querySelector(".effect-action-button"));

      if (effectActionOpen) {
        const hasRoomOnLeft = rect.left >= width + HOVER_PREVIEW_GAP + VIEWPORT_PADDING;
        const availableAbove = Math.max(0, rect.top - HOVER_PREVIEW_GAP - VIEWPORT_PADDING);
        const previewSize = hasRoomOnLeft
          ? { width, height }
          : fitHoverCardDisplay(Math.min(width, Math.max(122, availableAbove * (488 / 680))));
        const previewWidth = previewSize.width;
        const previewHeight = previewSize.height;
        const desiredLeft = hasRoomOnLeft
          ? rect.left - previewWidth - HOVER_PREVIEW_GAP
          : rect.left + (rect.width - previewWidth) / 2;
        const left = Math.round(Math.min(window.innerWidth - previewWidth - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, desiredLeft)));
        const desiredTop = hasRoomOnLeft
          ? rect.top + (rect.height - previewHeight) / 2
          : rect.top - previewHeight - HOVER_PREVIEW_GAP;
        const top = Math.round(Math.min(window.innerHeight - previewHeight - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, desiredTop)));
        setHoverPosition({ cardId: observedCardId, left, top, width: previewWidth, height: previewHeight });
        return;
      }

      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      const placeRight = spaceRight >= width + HOVER_PREVIEW_GAP || spaceRight >= spaceLeft;
      const desiredLeft = placeRight ? rect.right + HOVER_PREVIEW_GAP : rect.left - width - HOVER_PREVIEW_GAP;
      const left = Math.round(Math.min(window.innerWidth - width - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, desiredLeft)));
      const desiredTop = rect.top + (rect.height - height) / 2;
      const top = Math.round(Math.min(window.innerHeight - height - VIEWPORT_PADDING, Math.max(64, desiredTop)));
      setHoverPosition({ cardId: observedCardId, left, top, width, height });
    }

    // Uses its own frame handle so the settle loop below is never cancelled by it.
    // ResizeObserver fires an initial callback right after observe(); if it shared
    // the settle handle it would kill the loop before the lift/zoom animation ended,
    // freezing the preview at the card's unzoomed position.
    function scheduleMeasure() {
      window.cancelAnimationFrame(scheduleFrame);
      scheduleFrame = window.requestAnimationFrame(measure);
    }

    // CSS transforms do not trigger ResizeObserver. Keep measuring through the
    // whole lift animation so the preview follows the card's visible, zoomed box.
    const settleUntil = performance.now() + 460;
    function measureUntilSettled() {
      measure();
      if (performance.now() < settleUntil) settleFrame = window.requestAnimationFrame(measureUntilSettled);
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(observedAnchor);
    if (battlefieldSlot && battlefieldSlot !== observedAnchor) observer.observe(battlefieldSlot);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    settleFrame = window.requestAnimationFrame(measureUntilSettled);
    return () => {
      window.cancelAnimationFrame(scheduleFrame);
      window.cancelAnimationFrame(settleFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [activeEffectCardId, focusedCardId, hoveredCardId]);

  if (!card) return null;

  if (!details.imageUrl) return null;

  const traits = cardTraits(game, card);
  const stats = cardStatState(game, card, 0, heldStaticAuraBonus);
  const showFullCardPresentation = shouldShowFullCardImage(card.definitionId);
  const showFullCardStats = showFullCardPresentation && Boolean(stats.text);
  const deckTheme = cardThemeForDefinition(card.definitionId);
  const cardTheme = deckTheme === "ramp" ? undefined : deckTheme;
  const usesFullArtLayout = usesFullArtCardImage(card.definitionId);
  const imageUrl = details.imageUrl;
  const displayName = localizedCardName(card, language);

  if (focusedCardId) {
    return (
      <>
        <div className="card-preview-dismiss-layer pointer-events-none fixed inset-0 z-[179]" aria-hidden="true" />
        <aside
          className="fixed left-4 top-[6rem] z-[180] flex max-h-[calc(100vh-7rem)] items-start gap-3 text-[#f6e6b8]"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            data-preserve-card-focus="true"
            data-card-preview-locked="true"
            data-preview-renderer="image"
            className={[
              "card-preview-cropped-frame shadow-2xl shadow-black/65",
              showFullCardPresentation ? "card-preview-full-card-frame" : "",
              cardTheme ? `card-theme-${cardTheme}` : "",
              usesFullArtLayout ? "card-layout-full-art" : "",
            ].join(" ")}
            style={{
              width: LARGE_CARD_DISPLAY_WIDTH,
              height: LARGE_CARD_DISPLAY_HEIGHT,
              ...cardStatFrameCssVariables(details.statsFrame),
            }}
          >
            {imageUrl && <img src={imageUrl} alt={displayName} className="card-preview-cropped-image" draggable={false} />}
          </div>
          {traits && (
            <div data-preserve-card-focus="true" data-card-preview-locked="true">
              <TraitExplanations traits={traits} chaos={game.gameMode === "chaos"} cardTheme={cardTheme} />
            </div>
          )}
        </aside>
      </>
    );
  }

  if (!hoverPosition || hoverPosition.cardId !== (activeEffectCardId ?? hoveredCardId)) return null;

  const { cardId: _positionCardId, ...hoverStyle } = hoverPosition;
  void _positionCardId;

  return (
    <div
      data-preview-renderer="image"
      className={[
        "card-preview-cropped-frame pointer-events-none fixed z-[180] shadow-2xl shadow-black/65",
        showFullCardPresentation ? "card-preview-full-card-frame" : "",
        cardTheme ? `card-theme-${cardTheme}` : "",
        usesFullArtLayout ? "card-layout-full-art" : "",
      ].join(" ")}
      style={{ ...hoverStyle, ...cardStatFrameCssVariables(details.statsFrame) }}
    >
      {imageUrl && <img src={imageUrl} alt={displayName} className="card-preview-cropped-image" draggable={false} />}
      {showFullCardPresentation && card.controller !== "host" && <CardCostBadge card={card} />}
      {showFullCardStats && <CardStatsBadge stats={stats} preferSingleSword />}
    </div>
  );
}

export function CardDetailsModal({
  card,
  imageUrl,
  traits,
  stats,
  text,
  fontSize,
  setFontSize,
  onClose,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  displayName,
  typeLineText,
}: {
  card: CardInstance;
  imageUrl?: string;
  traits?: string;
  stats?: string;
  text: string;
  fontSize: number;
  setFontSize: (value: number) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  previousLabel?: string;
  nextLabel?: string;
  displayName?: string;
  typeLineText?: string;
}) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const cardTheme = cardThemeForDefinition(card.definitionId);
  const localizedName = cardLabelCamelCase(
    language === "es"
      ? card.displayNameEs || displayName || localizedCardName(card, language)
      : displayName ?? localizedCardName(card, language),
    language,
  );
  const localizedType = cardLabelCamelCase(typeLineText ?? localizedTypeLine(card, language), language);
  return (
    <div data-preserve-card-focus="true" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/88 p-6 text-[#f6e6b8] backdrop-blur-md">
      <div className="relative flex w-[min(1320px,calc(100vw-48px))] items-center justify-center">
        {onPrevious && (
          <button className="old-button absolute left-0 top-1/2 z-[310] flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full" onClick={onPrevious} title={previousLabel ?? t("common.previousCard")}>
            <ChevronLeft size={26} />
          </button>
        )}
        {onNext && (
          <button className="old-button absolute right-0 top-1/2 z-[310] flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full" onClick={onNext} title={nextLabel ?? t("common.nextCard")}>
            <ChevronRight size={26} />
          </button>
        )}
        <section className="old-panel card-details-modal-panel max-h-[86vh] w-[min(1160px,calc(100vw-12rem))] overflow-hidden p-5 shadow-2xl shadow-black/70">
        <div className="min-h-0">
          {imageUrl ? (
            <img src={imageUrl} alt={localizedName} className="mx-auto max-h-[74vh] w-full max-w-[360px] rounded-md border-2 border-[#b88945] object-contain shadow-xl shadow-black/55" />
          ) : (
            <div className="flex aspect-[488/680] w-full items-center justify-center rounded-md border-2 border-[#b88945] bg-[#1b120b] p-4 text-center text-lg font-bold text-[#d6b879]">{localizedName}</div>
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[#8f6a36]/60 pb-3">
            <div>
              <h2 className="old-title text-3xl font-black leading-tight">{localizedName}</h2>
              <p className="mt-2 text-sm font-bold tracking-wide text-[#d6b879]">{localizedType}</p>
            </div>
            <button className="icon-button h-9 w-9" title={t("common.closeDetails")} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {traits && <TraitPills traits={traits} />}
            {stats && <PreviewStatsBadge stats={stats} cardTheme={cardTheme} />}
            <label className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#d6b879]">
              <span className="old-title text-base normal-case tracking-normal" title={t("common.fontSize")}>
                aA
              </span>
              <button className="icon-button h-7 w-7 text-sm" disabled={fontSize <= 16} onClick={() => setFontSize(Math.max(16, fontSize - 1))} title={t("common.decreaseFont")}>
                -
              </button>
              <input type="range" min={16} max={30} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} className="w-32 accent-[#d6a34c]" />
              <button className="icon-button h-7 w-7 text-sm" disabled={fontSize >= 30} onClick={() => setFontSize(Math.min(30, fontSize + 1))} title={t("common.increaseFont")}>
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

export function PreviewStatsBadge({ stats, cardTheme }: { stats: string; cardTheme?: DeckTheme }) {
  const language = useLanguageStore((state) => state.language);
  const parsed = stats.match(/^(-?\d+)\s*\/\s*(-?\d+)$/u);
  if (!parsed) return null;

  const power = Number(parsed[1]);
  const endurance = Number(parsed[2]);

  return (
    <div
      className={["card-preview-stats", cardTheme ? `card-theme-${cardTheme}` : ""].join(" ")}
      aria-label={language === "es" ? `${power} de Fuerza, ${endurance} de Aguante` : `${power} Power, ${endurance} Endurance`}
    >
      <span className="card-preview-stat-value">{power}</span>
      <span className="card-preview-stat-separator" aria-hidden="true">/</span>
      <span className="card-preview-stat-value">{endurance}</span>
    </div>
  );
}

export function TraitPills({ traits, compact = false, cardTheme }: { traits: string; compact?: boolean; cardTheme?: DeckTheme }) {
  const language = useLanguageStore((state) => state.language);
  const cardTone = cardTheme === "ramp" ? "ally" : cardTheme;
  return (
    <div className={cardTheme ? "deck-viewer-trait-list flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
      {traits.split(",").map((keyword) => {
        const clean = keyword.trim();
        if (!clean) return null;
        return (
          <GameTooltip key={clean} content={localizedTraitTooltip(clean, language)}>
            <span className={cardTheme
              ? ["card-keyword-badge", `card-keyword-badge-${cardTone}`, compact ? "deck-viewer-trait-badge-compact" : ""].join(" ")
              : ["keyword-pill", compact ? "h-[1.08rem] px-2 text-[0.68rem]" : ""].join(" ")}
            >
              <CardTraitIcon keyword={clean} />
              {renderTraitLabel(naturalCaseTraitLabel(localizedTraitLabel(clean, language)))}
            </span>
          </GameTooltip>
        );
      })}
    </div>
  );
}

function TraitExplanations({
  traits,
  chaos = false,
  cardTheme,
}: {
  traits: string;
  chaos?: boolean;
  cardTheme?: "zombie" | "goblin" | "vampire";
}) {
  const language = useLanguageStore((state) => state.language);
  const entries = traits
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (entries.length === 0) return null;

  return (
    <div className={["card-preview-keyword-explanations flex w-[min(260px,20vw)] flex-col gap-2", chaos ? "is-chaos" : "", cardTheme ? `is-${cardTheme}` : ""].join(" ")}>
      {entries.map((keyword) => (
        <div key={keyword} className="old-panel-soft p-2.5">
          <div className="keyword-pill card-preview-keyword-badge">
            <CardTraitIcon keyword={keyword} />
            {renderTraitLabel(naturalCaseTraitLabel(localizedTraitLabel(keyword, language)))}
          </div>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-[#f4dfb0]">{localizedTraitTooltip(keyword, language)}</p>
        </div>
      ))}
    </div>
  );
}

function renderTraitLabel(keyword: string) {
  const poison = keyword.match(/^(POISON|VENENO)\s+\{(\d+)\}$/i);
  if (!poison) return keyword;
  return (
    <>
      {poison[1]} <span className="toxic-keyword-badge">{poison[2]}</span>
    </>
  );
}

function findCard(game: ReturnType<typeof useGameStore.getState>["game"], id: string): CardInstance | undefined {
  return [
    ...game.player.hand,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.field,
    ...game.host.memory,
    ...game.host.oblivion,
  ].find((card) => card.instanceId === id);
}
