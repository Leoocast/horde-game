import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectableDeck, NewDeckAbility, NewDeckCard } from "../data/deckCatalog";
import { localizedCardName, localizedTypeLine } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import type { AppLanguage } from "../i18n/translations";
import { cleanCardDescriptionText, renderCardText } from "../utils/cardTextSymbols";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { useAudioStore } from "../store/useAudioStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { KeywordPills } from "./CardPreview";

type Props = {
  deck: InspectableDeck;
  backLabel: string;
  onBack: () => void;
};

type CardCopy = {
  key: string;
  card: NewDeckCard;
  quantity: number;
};

const DECK_COLUMN_OPTIONS = [7, 6, 5] as const;
type DeckColumnCount = (typeof DECK_COLUMN_OPTIONS)[number];
const DEFAULT_DECK_COLUMNS = DECK_COLUMN_OPTIONS[0];
const DECK_COLUMNS_STORAGE_KEY = "horde-deck-inspector-columns";
const ENABLE_DECK_CARD_PREVIEW = false;

export function DeckInspector({ deck, backLabel, onBack }: Props) {
  const t = useTranslation();
  const cards = useMemo(() => uniqueCards([...(deck.deck.tokens ?? []), ...deck.deck.cards]), [deck]);
  const [hoveredCardId, setHoveredCardId] = useState<string | undefined>(cards[0]?.card.id);
  const [focusedCardId, setFocusedCardId] = useState<string | undefined>();
  const activeCard = cards.find((copy) => copy.card.id === (focusedCardId ?? hoveredCardId))?.card ?? cards[0]?.card;
  const [detailsCardId, setDetailsCardId] = useState<string | undefined>();
  const detailsIndex = Math.max(0, cards.findIndex((copy) => copy.card.id === detailsCardId));
  const detailsCard = detailsCardId ? cards[detailsIndex]?.card : undefined;
  const [columnCount, setColumnCountState] = useState(readStoredColumnCount);
  const [detailsFontSize, setDetailsFontSize] = useState(20);
  const [closing, setClosing] = useState(false);
  const theme = deckTheme(deck.id);
  const zoomLevel = DECK_COLUMN_OPTIONS.indexOf(columnCount);
  const setColumnCount = (value: number | ((current: number) => number)) => {
    setColumnCountState((current) => {
      const next = clampColumnCount(typeof value === "function" ? value(current) : value);
      writeStoredColumnCount(next);
      return next;
    });
  };

  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(onBack, 160);
    return () => window.clearTimeout(timeout);
  }, [closing, onBack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || detailsCardId || closing) return;
      event.preventDefault();
      setClosing(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closing, detailsCardId]);

  return (
    <main className={`deck-detail-screen main-menu-shell deck-theme-${theme} h-screen overflow-hidden text-[#f6e6b8] ${closing ? "is-closing" : ""}`}>
      <DeckFireflies />
      <header className="deck-detail-header">
        <button className="expedition-back" type="button" onClick={() => setClosing(true)} disabled={closing}>
          <ArrowLeft size={17} />
          {backLabel}
        </button>
        <div className="deck-detail-heading">
          <p>{t("deck.collection")}</p>
          <h1>{deck.deck.name}</h1>
        </div>
        <div className="deck-detail-tools">
          <div className="deck-detail-counts">
            <span><strong>{cards.length}</strong> {t("common.unique")}</span>
            <span><strong>{cards.reduce((total, copy) => total + copy.quantity, 0)}</strong> {t("common.cards")}</span>
          </div>
          <div className="deck-detail-zoom">
            <Search size={15} aria-label={t("deck.cardZoom")} />
            <button disabled={columnCount === DECK_COLUMN_OPTIONS[0]} onClick={() => setColumnCount((value) => value + 1)} title={t("deck.zoomOut")}>−</button>
            <input
              aria-label={t("deck.cardZoomColumns", { count: columnCount })}
              className="game-range"
              type="range"
              min={0}
              max={DECK_COLUMN_OPTIONS.length - 1}
              step={1}
              value={zoomLevel}
              onChange={(event) => setColumnCount(DECK_COLUMN_OPTIONS[Number(event.target.value)])}
            />
            <button disabled={columnCount === DECK_COLUMN_OPTIONS[DECK_COLUMN_OPTIONS.length - 1]} onClick={() => setColumnCount((value) => value - 1)} title={t("deck.zoomIn")}>+</button>
          </div>
        </div>
      </header>

      <div className={`deck-detail-layout ${ENABLE_DECK_CARD_PREVIEW ? "" : "is-preview-hidden"}`}>
        <section className="deck-detail-collection">
          <div className="deck-detail-grid-scroll">
            <div className="deck-detail-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
              {cards.map((copy) => (
                <DeckCardTile
                  key={copy.key}
                  deck={deck}
                  card={copy.card}
                  quantity={copy.quantity}
                  selected={copy.card.id === focusedCardId}
                  onHover={() => setHoveredCardId(copy.card.id)}
                  onClick={() => {
                    setFocusedCardId(copy.card.id);
                    setDetailsCardId(copy.card.id);
                  }}
                />
              ))}
            </div>
          </div>
        </section>
        {ENABLE_DECK_CARD_PREVIEW && (
          <DeckCardInfo deck={deck} card={activeCard} pinned={Boolean(focusedCardId)} onClearPin={() => setFocusedCardId(undefined)} onDetails={() => activeCard && setDetailsCardId(activeCard.id)} />
        )}
      </div>
      {detailsCard && (
        <DeckInspectorDetailsModal
          deck={deck}
          card={detailsCard}
          position={detailsIndex + 1}
          total={cards.length}
          fontSize={detailsFontSize}
          setFontSize={setDetailsFontSize}
          onClose={() => {
            setDetailsCardId(undefined);
            setFocusedCardId(undefined);
          }}
          onPrevious={() => setDetailsCardId(cards[(detailsIndex - 1 + cards.length) % cards.length]?.card.id)}
          onNext={() => setDetailsCardId(cards[(detailsIndex + 1) % cards.length]?.card.id)}
        />
      )}
    </main>
  );
}

function DeckCardTile({
  deck,
  card,
  quantity,
  selected,
  onHover,
  onClick,
}: {
  deck: InspectableDeck;
  card: NewDeckCard;
  quantity: number;
  selected: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const language = useLanguageStore((state) => state.language);
  const details = useDeckCardDetails(deck.id, card, deck.images);
  const displayName = language === "es" ? card.displayNameEs || details.displayName || localizedCardName(card, language) : localizedCardName(card, language);
  const playSfx = useAudioStore((state) => state.playSfx);
  const playHoverSound = () => playSfx("drawOne", { volume: 0.42 });

  return (
    <button
      className={`deck-detail-card ${selected ? "is-selected" : ""}`}
      onMouseEnter={() => {
        onHover();
        playHoverSound();
      }}
      onFocus={(event) => {
        onHover();
        if (!event.currentTarget.matches(":hover")) playHoverSound();
      }}
      onClick={onClick}
      title={displayName}
    >
      <div className="deck-detail-card-frame">
        {quantity > 1 && (
          <span className="deck-quantity-badge pointer-events-none absolute -right-2 -top-2 z-20">
            x{quantity}
          </span>
        )}
        <div className="deck-detail-card-image">
          {details.imageUrl ? <img src={details.imageUrl} alt={displayName} draggable={false} /> : <MissingCardArt card={card} />}
          {selected && <div className="deck-detail-card-selection" />}
        </div>
      </div>
      <div className="deck-detail-card-name">{displayName}</div>
    </button>
  );
}

function DeckCardInfo({ deck, card, pinned, onClearPin, onDetails }: { deck: InspectableDeck; card?: NewDeckCard; pinned: boolean; onClearPin: () => void; onDetails: () => void }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const details = useDeckCardDetails(deck.id, card, deck.images);
  if (!card) {
    return (
      <aside className="deck-detail-info flex min-h-0 items-center justify-center p-4 text-center text-sm text-[#87958d]">
        {t("deck.hoverInspect")}
      </aside>
    );
  }

  const displayName = language === "es" ? card.displayNameEs || details.displayName || localizedCardName(card, language) : localizedCardName(card, language);
  const text = deckCardDescription(card, language, details.oracleText, details.flavorText);
  const hasText = text.length > 0;

  return (
    <aside className="deck-detail-info relative z-[90] flex min-h-0 flex-col overflow-hidden text-[#f6e6b8]">
      <div className="deck-detail-info-header">
        <div>
          <span className="deck-detail-info-kicker">{t("deck.selectedCard")}</span>
          <h2>{displayName}</h2>
          <p>{details.typeLine && (language === "en" || details.language === "es") ? details.typeLine : localizedTypeLine(card, language)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pinned && (
            <button className="deck-detail-close" title={t("deck.clearSelection")} onClick={onClearPin}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="deck-detail-info-body">
        {details.imageUrl ? (
          <img src={details.imageUrl} alt={displayName} className="deck-detail-info-image" />
        ) : (
          <MissingCardArt card={card} />
        )}
        <div className="relative z-[120] flex items-center justify-start gap-2 overflow-visible">
          {stats(card) && <span className="preview-stat-pill">{stats(card)}</span>}
          {deckKeywords(card) && <KeywordPills keywords={deckKeywords(card)} compact />}
        </div>
        {hasText && (
          <div className="deck-detail-rules">
            <p>{renderCardText(text)}</p>
          </div>
        )}
        <button className="deck-detail-action" onClick={onDetails}>
          <span>{t("common.openDetails")}</span>
          <Maximize2 size={18} />
        </button>
      </div>
    </aside>
  );
}

function DeckInspectorDetailsModal({
  deck,
  card,
  position,
  total,
  fontSize,
  setFontSize,
  onClose,
  onPrevious,
  onNext,
}: {
  deck: InspectableDeck;
  card: NewDeckCard;
  position: number;
  total: number;
  fontSize: number;
  setFontSize: (value: number) => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const details = useDeckCardDetails(deck.id, card, deck.images);
  const displayName = language === "es" ? card.displayNameEs || details.displayName || localizedCardName(card, language) : localizedCardName(card, language);
  const text = deckCardDescription(card, language, details.oracleText, details.flavorText);
  const keywords = deckKeywords(card);
  const cardStats = stats(card);
  const playSfx = useAudioStore((state) => state.playSfx);
  const [closing, setClosing] = useState(false);
  const [transition, setTransition] = useState<"idle" | "leave-next" | "leave-previous" | "enter-next" | "enter-previous">("idle");
  const timers = useRef<number[]>([]);
  const closeLock = useRef(false);
  const transitionLock = useRef(false);

  useEffect(() => {
    return () => timers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const closeModal = () => {
    if (closeLock.current) return;
    closeLock.current = true;
    setClosing(true);
    timers.current.push(window.setTimeout(onClose, 210));
  };

  const navigate = (direction: "next" | "previous") => {
    if (transitionLock.current || closeLock.current || transition !== "idle" || closing) return;
    transitionLock.current = true;
    setTransition(`leave-${direction}`);
    timers.current.push(window.setTimeout(() => {
      if (direction === "next") onNext();
      else onPrevious();
      playSfx("drawOne", { volume: 0.52 });
      setTransition(`enter-${direction}`);
      timers.current.push(window.setTimeout(() => {
        setTransition("idle");
        transitionLock.current = false;
      }, 160));
    }, 90));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      if (event.key === "ArrowLeft") navigate("previous");
      if (event.key === "ArrowRight") navigate("next");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      data-preserve-card-focus="true"
      className={`deck-collection-modal-backdrop deck-theme-${deckTheme(deck.id)} ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section className="deck-collection-modal" role="dialog" aria-modal="true" aria-label={`${displayName} details`}>
        <button className="deck-collection-modal-close" type="button" onClick={closeModal} title={t("common.closeDetails")}>
          <X size={20} />
        </button>

        <div className={`deck-collection-modal-content is-${transition}`}>
          <div className="deck-collection-modal-art-column">
            <button className="deck-collection-modal-nav is-previous" type="button" onClick={() => navigate("previous")} title={t("common.previousCard")}>
              <ChevronLeft size={24} />
            </button>
            <div className="deck-collection-modal-art">
              {details.imageUrl ? <img src={details.imageUrl} alt={displayName} draggable={false} /> : <MissingCardArt card={card} />}
            </div>
            <button className="deck-collection-modal-nav is-next" type="button" onClick={() => navigate("next")} title={t("common.nextCard")}>
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="deck-collection-modal-info">
            <header className="deck-collection-modal-header">
              <p>{t("deck.cardDetails")} <span>{position} / {total}</span></p>
              <div>
                <h2>{displayName}</h2>
              </div>
              <small>{details.typeLine && (language === "en" || details.language === "es") ? details.typeLine : localizedTypeLine(card, language)}</small>
            </header>

            {(keywords || cardStats) && (
              <div className="deck-collection-modal-badges">
                {cardStats && <span className="deck-collection-modal-stats">{cardStats}</span>}
                {keywords && <KeywordPills keywords={keywords} />}
              </div>
            )}

            <div className="deck-collection-modal-rules">
              <p style={{ fontSize }}>{renderCardText(text)}</p>
            </div>

            <footer className="deck-collection-modal-footer">
              <span>{t("common.textSize")}</span>
              <button disabled={fontSize <= 16} onClick={() => setFontSize(Math.max(16, fontSize - 1))}>−</button>
              <input className="game-range" type="range" min={16} max={30} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
              <button disabled={fontSize >= 30} onClick={() => setFontSize(Math.min(30, fontSize + 1))}>+</button>
              <strong>{fontSize}</strong>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}

function uniqueCards(cards: NewDeckCard[]): CardCopy[] {
  const byId = new Map<string, CardCopy>();
  for (const card of cards) {
    const existing = byId.get(card.id);
    if (existing) {
      existing.quantity += card.quantity ?? 1;
      continue;
    }
    byId.set(card.id, {
      key: card.id,
      card,
      quantity: card.quantity ?? 1,
    });
  }
  return [...byId.values()];
}

function stats(card: NewDeckCard): string | undefined {
  if (typeof card.power !== "number" || typeof card.toughness !== "number") return undefined;
  return `${card.power}/${card.toughness}`;
}

function deckKeywords(card: NewDeckCard): string {
  const keywords = new Set((card.keywords ?? []).map(formatDeckKeyword).filter((keyword) => keyword !== "TRAMPLE"));
  for (const ability of card.abilities ?? []) {
    if (ability.customHandler === "toxic_1" || ability.id?.toLowerCase().includes("toxic_1")) keywords.add("TOXIC {1}");
  }
  return [...keywords].filter(Boolean).join(", ");
}

function formatDeckKeyword(keyword: string): string {
  const text = String(keyword).trim();
  const toxic = text.match(/^TOXIC[_\s-]?(\d+)$/i) ?? text.match(/^Toxic\s+(\d+)$/i);
  if (toxic) return `TOXIC {${toxic[1]}}`;
  return text.toUpperCase();
}

function describeCardFromJson(card: NewDeckCard): string {
  const abilities = card.abilities ?? [];
  return abilities.map(describeAbility).filter(Boolean).join("\n\n");
}

function deckCardDescription(card: NewDeckCard, language: AppLanguage, oracleText?: string, flavorText?: string): string {
  if ((card.cardTypes ?? []).some((type) => type.toLowerCase() === "land")) return language === "es" ? "Agrega maná." : "Add mana.";
  return cleanCardDescriptionText(oracleText, flavorText, deckKeywords(card), describeCardFromJson(card));
}

function describeAbility(ability: NewDeckAbility): string {
  const parts = [
    ability.kind ? `${String(ability.kind).toLowerCase()}` : "",
    ability.cost ? `Cost: ${JSON.stringify(ability.cost)}` : "",
    ability.trigger ? `Trigger: ${JSON.stringify(ability.trigger)}` : "",
    ...(ability.effects ?? []).map((effect) => describeEffect(effect)),
  ];
  return parts.filter(Boolean).join("\n");
}

function describeEffect(effect: Record<string, unknown>): string {
  const type = typeof effect.type === "string" ? effect.type.replaceAll("_", " ") : "Effect";
  const rest = Object.entries(effect)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
  return rest ? `${type} (${rest})` : type;
}

function MissingCardArt({ card }: { card: NewDeckCard }) {
  const language = useLanguageStore((state) => state.language);
  return (
    <div className="flex aspect-[488/680] w-full items-center justify-center rounded-md border-2 border-[#b88945] bg-[#1b120b] p-4 text-center text-sm font-bold text-[#d6b879]">
      {localizedCardName(card, language)}
    </div>
  );
}

function readStoredColumnCount(): DeckColumnCount {
  if (typeof window === "undefined") return DEFAULT_DECK_COLUMNS;
  const stored = window.localStorage.getItem(DECK_COLUMNS_STORAGE_KEY);
  const parsed = stored ? Number(stored) : DEFAULT_DECK_COLUMNS;
  return clampColumnCount(Number.isFinite(parsed) ? parsed : DEFAULT_DECK_COLUMNS);
}

function deckTheme(deckId: string): "ramp" | "zombie" | "goblin" {
  if (deckId === "horde_zombies") return "zombie";
  if (deckId === "goblin_assault_horde") return "goblin";
  return "ramp";
}

function DeckFireflies() {
  return (
    <div className="menu-fireflies deck-detail-fireflies" aria-hidden="true">
      {Array.from({ length: 34 }, (_, index) => <span key={index} style={fireflyStyle(index)} />)}
    </div>
  );
}

function fireflyStyle(index: number): React.CSSProperties {
  const random = (salt: number) => {
    const value = Math.sin((index + 1) * (12.9898 + salt * 17.13)) * 43758.5453;
    return value - Math.floor(value);
  };
  const driftX = -45 + random(6) * 90;
  const driftY = -60 + random(7) * 80;
  return {
    "--firefly-left": `${3 + random(1) * 94}%`,
    "--firefly-top": `${5 + random(2) * 88}%`,
    "--firefly-size": `${1.5 + random(3) * 3}px`,
    "--firefly-duration": `${7 + random(4) * 8}s`,
    "--firefly-delay": `${-random(5) * 13}s`,
    "--firefly-mid-x": `${driftX * 0.55}px`,
    "--firefly-mid-y": `${driftY * 0.72}px`,
    "--firefly-drift-x": `${driftX}px`,
    "--firefly-drift-y": `${driftY}px`,
  } as React.CSSProperties;
}

function writeStoredColumnCount(value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DECK_COLUMNS_STORAGE_KEY, String(value));
}

function clampColumnCount(value: number): DeckColumnCount {
  return DECK_COLUMN_OPTIONS.reduce((closest, option) => (
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest
  ), DEFAULT_DECK_COLUMNS);
}
