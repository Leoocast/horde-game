import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectableDeck, NewDeckAbility, NewDeckCard } from "../data/deckCatalog";
import { cleanCardDescriptionText, renderCardText } from "../utils/cardTextSymbols";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { useAudioStore } from "../store/useAudioStore";
import { KeywordPills } from "./CardPreview";

type Props = {
  deck: InspectableDeck;
  onBack: () => void;
};

type CardCopy = {
  key: string;
  card: NewDeckCard;
  quantity: number;
};

const MIN_CARD_ZOOM = 120;
const MAX_CARD_ZOOM = 272;
const DEFAULT_CARD_ZOOM = 168;

export function DeckInspector({ deck, onBack }: Props) {
  const cards = useMemo(() => uniqueCards([...(deck.deck.tokens ?? []), ...deck.deck.cards]), [deck]);
  const [hoveredCardId, setHoveredCardId] = useState<string | undefined>(cards[0]?.card.id);
  const [focusedCardId, setFocusedCardId] = useState<string | undefined>();
  const activeCard = cards.find((copy) => copy.card.id === (focusedCardId ?? hoveredCardId))?.card ?? cards[0]?.card;
  const [detailsCardId, setDetailsCardId] = useState<string | undefined>();
  const detailsIndex = Math.max(0, cards.findIndex((copy) => copy.card.id === detailsCardId));
  const detailsCard = detailsCardId ? cards[detailsIndex]?.card : undefined;
  const [cardZoom, setCardZoomState] = useState(readStoredCardZoom);
  const [detailsFontSize, setDetailsFontSize] = useState(20);
  const [closing, setClosing] = useState(false);
  const gridMin = Math.max(96, cardZoom - 34);
  const setCardZoom = (value: number | ((current: number) => number)) => {
    setCardZoomState((current) => {
      const next = clampCardZoom(typeof value === "function" ? value(current) : value);
      writeStoredCardZoom(next);
      return next;
    });
  };

  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(onBack, 160);
    return () => window.clearTimeout(timeout);
  }, [closing, onBack]);

  return (
    <main className={`deck-detail-screen main-menu-shell h-screen overflow-hidden text-[#f6e6b8] ${closing ? "is-closing" : ""}`}>
      <header className="deck-detail-header">
        <button className="deck-detail-back" type="button" onClick={() => setClosing(true)} disabled={closing}>
          <ArrowLeft size={17} />
          Decks
        </button>
        <div className="deck-detail-heading">
          <p>Deck collection</p>
          <h1>{deck.deck.name}</h1>
        </div>
        <div className="deck-detail-tools">
          <div className="deck-detail-counts">
            <span><strong>{cards.length}</strong> unique</span>
            <span><strong>{cards.reduce((total, copy) => total + copy.quantity, 0)}</strong> cards</span>
          </div>
          <div className="deck-detail-zoom">
            <Search size={15} aria-label="Card zoom" />
            <button disabled={cardZoom <= MIN_CARD_ZOOM} onClick={() => setCardZoom((value) => value - 12)} title="Zoom out">−</button>
            <input className="game-range" type="range" min={MIN_CARD_ZOOM} max={MAX_CARD_ZOOM} step={4} value={cardZoom} onChange={(event) => setCardZoom(Number(event.target.value))} />
            <button disabled={cardZoom >= MAX_CARD_ZOOM} onClick={() => setCardZoom((value) => value + 12)} title="Zoom in">+</button>
          </div>
        </div>
      </header>

      <div className="deck-detail-layout">
        <section className="deck-detail-collection">
          <div className="deck-detail-grid-scroll">
            <div className="deck-detail-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridMin}px, 1fr))` }}>
              {cards.map((copy) => (
                <DeckCardTile
                  key={copy.key}
                  deck={deck}
                  card={copy.card}
                  quantity={copy.quantity}
                  cardWidth={cardZoom}
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
        <DeckCardInfo deck={deck} card={activeCard} pinned={Boolean(focusedCardId)} onClearPin={() => setFocusedCardId(undefined)} onDetails={() => activeCard && setDetailsCardId(activeCard.id)} />
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
  cardWidth,
  selected,
  onHover,
  onClick,
}: {
  deck: InspectableDeck;
  card: NewDeckCard;
  quantity: number;
  cardWidth: number;
  selected: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const details = useDeckCardDetails(deck.id, card, deck.images);
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
      title={card.name}
    >
      <div className="deck-detail-card-frame" style={{ maxWidth: cardWidth }}>
        {quantity > 1 && (
          <span className="deck-quantity-badge pointer-events-none absolute -right-2 -top-2 z-20">
            x{quantity}
          </span>
        )}
        <div className="deck-detail-card-image">
          {details.imageUrl ? <img src={details.imageUrl} alt={card.name} draggable={false} /> : <MissingCardArt card={card} />}
          {selected && <div className="deck-detail-card-selection" />}
        </div>
      </div>
      <div className="deck-detail-card-name" style={{ maxWidth: cardWidth }}>{card.name}</div>
    </button>
  );
}

function DeckCardInfo({ deck, card, pinned, onClearPin, onDetails }: { deck: InspectableDeck; card?: NewDeckCard; pinned: boolean; onClearPin: () => void; onDetails: () => void }) {
  const details = useDeckCardDetails(deck.id, card, deck.images);
  if (!card) {
    return (
      <aside className="deck-detail-info flex min-h-0 items-center justify-center p-4 text-center text-sm text-[#87958d]">
        Hover a card to inspect it.
      </aside>
    );
  }

  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, deckKeywords(card), describeCardFromJson(card));
  const hasText = text.length > 0;

  return (
    <aside className="deck-detail-info relative z-[90] flex min-h-0 flex-col overflow-hidden text-[#f6e6b8]">
      <div className="deck-detail-info-header">
        <div>
          <h2>{card.name}</h2>
          <p>{typeLine(card)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pinned && (
            <button className="deck-detail-close" title="Clear selection" onClick={onClearPin}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="deck-detail-info-body">
        {details.imageUrl ? (
          <img src={details.imageUrl} alt={card.name} className="deck-detail-info-image" />
        ) : (
          <MissingCardArt card={card} />
        )}
        <div className="relative z-[120] flex items-center justify-between gap-2 overflow-visible">
          {deckKeywords(card) && <KeywordPills keywords={deckKeywords(card)} compact />}
          {stats(card) && <span className="preview-stat-pill ml-auto">{stats(card)}</span>}
        </div>
        {hasText && (
          <div className="deck-detail-rules">
            <p>{renderCardText(text)}</p>
          </div>
        )}
        <button className="deck-detail-action" onClick={onDetails}>
          <Maximize2 className="mr-2 inline" size={16} />
          Details
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
  const details = useDeckCardDetails(deck.id, card, deck.images);
  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, deckKeywords(card), describeCardFromJson(card));
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
    timers.current.push(window.setTimeout(onClose, 150));
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
      if (event.key === "Escape") closeModal();
      if (event.key === "ArrowLeft") navigate("previous");
      if (event.key === "ArrowRight") navigate("next");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      data-preserve-card-focus="true"
      className={`deck-collection-modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section className="deck-collection-modal" role="dialog" aria-modal="true" aria-label={`${card.name} details`}>
        <button className="deck-collection-modal-close" type="button" onClick={closeModal} title="Close details">
          <X size={20} />
        </button>

        <div className={`deck-collection-modal-content is-${transition}`}>
          <div className="deck-collection-modal-art-column">
            <button className="deck-collection-modal-nav is-previous" type="button" onClick={() => navigate("previous")} title="Previous deck card">
              <ChevronLeft size={24} />
            </button>
            <div className="deck-collection-modal-art">
              {details.imageUrl ? <img src={details.imageUrl} alt={card.name} draggable={false} /> : <MissingCardArt card={card} />}
            </div>
            <button className="deck-collection-modal-nav is-next" type="button" onClick={() => navigate("next")} title="Next deck card">
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="deck-collection-modal-info">
            <header className="deck-collection-modal-header">
              <p>Card details <span>{position} / {total}</span></p>
              <div>
                <h2>{card.name}</h2>
                {card.manaCost && <span className="deck-collection-modal-cost">{card.manaCost}</span>}
              </div>
              <small>{typeLine(card)}</small>
            </header>

            <div className="deck-collection-modal-badges">
              {deckKeywords(card) && <KeywordPills keywords={deckKeywords(card)} />}
              {stats(card) && <span className="deck-collection-modal-stats">{stats(card)}</span>}
            </div>

            <div className="deck-collection-modal-rules">
              <p style={{ fontSize }}>{renderCardText(text)}</p>
            </div>

            <footer className="deck-collection-modal-footer">
              <span>Text size</span>
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

function typeLine(card: NewDeckCard): string {
  return [...(card.cardTypes ?? []), card.subtypes?.length ? `- ${card.subtypes.join(" ")}` : ""].filter(Boolean).join(" ");
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
  return (
    <div className="flex aspect-[488/680] w-full items-center justify-center rounded-md border-2 border-[#b88945] bg-[#1b120b] p-4 text-center text-sm font-bold text-[#d6b879]">
      {card.name}
    </div>
  );
}

function readStoredCardZoom(): number {
  if (typeof window === "undefined") return DEFAULT_CARD_ZOOM;
  const stored = window.localStorage.getItem("horde-deck-inspector-card-zoom");
  const parsed = stored ? Number(stored) : DEFAULT_CARD_ZOOM;
  return clampCardZoom(Number.isFinite(parsed) ? parsed : DEFAULT_CARD_ZOOM);
}

function writeStoredCardZoom(value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("horde-deck-inspector-card-zoom", String(value));
}

function clampCardZoom(value: number): number {
  return Math.min(MAX_CARD_ZOOM, Math.max(MIN_CARD_ZOOM, value));
}
