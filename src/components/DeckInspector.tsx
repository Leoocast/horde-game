import { ArrowLeft, Maximize2, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CardInstance } from "../engine/GameTypes";
import type { InspectableDeck, NewDeckAbility, NewDeckCard } from "../data/deckCatalog";
import { cleanCardDescriptionText, renderCardText } from "../utils/cardTextSymbols";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { AppHeader } from "./AppHeader";
import { CardDetailsModal, KeywordPills } from "./CardPreview";

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
  const cards = useMemo(() => uniqueCards(deck.deck.cards), [deck]);
  const [hoveredCardId, setHoveredCardId] = useState<string | undefined>(cards[0]?.card.id);
  const [focusedCardId, setFocusedCardId] = useState<string | undefined>();
  const activeCard = cards.find((copy) => copy.card.id === (focusedCardId ?? hoveredCardId))?.card ?? cards[0]?.card;
  const [detailsCardId, setDetailsCardId] = useState<string | undefined>();
  const detailsIndex = Math.max(0, cards.findIndex((copy) => copy.card.id === detailsCardId));
  const detailsCard = detailsCardId ? cards[detailsIndex]?.card : undefined;
  const [cardZoom, setCardZoomState] = useState(readStoredCardZoom);
  const [detailsFontSize, setDetailsFontSize] = useState(20);
  const gridMin = Math.max(96, cardZoom - 34);
  const setCardZoom = (value: number | ((current: number) => number)) => {
    setCardZoomState((current) => {
      const next = clampCardZoom(typeof value === "function" ? value(current) : value);
      writeStoredCardZoom(next);
      return next;
    });
  };

  return (
    <main className="duel-table h-screen overflow-hidden text-[#f6e6b8]">
      <AppHeader
        left={
          <button className="old-button ml-3 flex h-10 items-center gap-2 px-3 text-sm font-black uppercase tracking-wide" onClick={onBack}>
            <ArrowLeft size={17} />
            Back
          </button>
        }
        center={<div className="old-panel-soft px-4 py-2 text-sm font-black uppercase tracking-wide text-[#fff0b2]">{deck.label}</div>}
      />
      <div className="grid h-[calc(100vh-56px)] grid-cols-[minmax(0,1fr)_360px] gap-3 overflow-hidden p-3">
        <section className="old-panel relative z-0 min-h-0 overflow-hidden p-4">
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-[#8f6a36]/60 pb-3">
            <div>
              <p className="old-title text-xs font-bold uppercase tracking-[0.24em]">Deck Inspector</p>
              <h1 className="old-title mt-1 text-2xl font-black">{deck.deck.name}</h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right text-xs font-bold uppercase tracking-wide text-[#d6b879]">
                <div>{cards.length} unique</div>
                <div>{deck.deck.cards.reduce((total, card) => total + (card.quantity ?? 1), 0)} total</div>
              </div>
              <div className="old-panel-soft flex items-center gap-2 px-2 py-1">
                <Search className="text-[#ffd98a] drop-shadow-[0_0_8px_rgba(255,100,24,0.45)]" size={15} aria-label="Card zoom" />
                <button className="icon-button h-7 w-7 text-sm" disabled={cardZoom <= MIN_CARD_ZOOM} onClick={() => setCardZoom((value) => value - 12)} title="Zoom out">
                  -
                </button>
                <input type="range" min={MIN_CARD_ZOOM} max={MAX_CARD_ZOOM} step={4} value={cardZoom} onChange={(event) => setCardZoom(Number(event.target.value))} className="w-28 accent-[#d6a34c]" />
                <button className="icon-button h-7 w-7 text-sm" disabled={cardZoom >= MAX_CARD_ZOOM} onClick={() => setCardZoom((value) => value + 12)} title="Zoom in">
                  +
                </button>
              </div>
            </div>
          </div>
          <div className="old-scrollbar h-[calc(100%-86px)] overflow-y-auto overflow-x-hidden pr-3">
            <div className="grid gap-4 px-3 pb-8 pt-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridMin}px, 1fr))` }}>
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

  return (
    <button
      className={[
        "group text-left transition hover:-translate-y-1",
        selected ? "drop-shadow-[0_0_16px_rgba(247,207,112,0.62)]" : "hover:drop-shadow-[0_0_12px_rgba(94,210,255,0.48)]",
      ].join(" ")}
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      title={card.name}
    >
      <div className="relative mx-auto w-full" style={{ maxWidth: cardWidth }}>
        {quantity > 1 && (
          <span className="deck-quantity-badge pointer-events-none absolute -right-2 -top-2 z-20">
            x{quantity}
          </span>
        )}
        <div className="relative aspect-[488/680] overflow-hidden rounded-md border-2 border-[#5e3f1f] bg-[#170f09] shadow-lg shadow-black/45 group-hover:border-[#78d9ff]">
          {details.imageUrl ? <img src={details.imageUrl} alt={card.name} className="h-full w-full object-cover" draggable={false} /> : <MissingCardArt card={card} />}
          {selected && <div className="pointer-events-none absolute inset-0 border-2 border-[#f5d078] shadow-[inset_0_0_18px_rgba(245,208,120,0.55)]" />}
        </div>
      </div>
      <div className="mx-auto mt-2 truncate text-center text-xs font-bold text-[#f4dfb0]" style={{ maxWidth: cardWidth }}>{card.name}</div>
    </button>
  );
}

function DeckCardInfo({ deck, card, pinned, onClearPin, onDetails }: { deck: InspectableDeck; card?: NewDeckCard; pinned: boolean; onClearPin: () => void; onDetails: () => void }) {
  const details = useDeckCardDetails(deck.id, card, deck.images);
  if (!card) {
    return (
      <aside className="old-panel flex min-h-0 items-center justify-center p-4 text-center text-sm text-[#d6b879]">
        Hover a card to inspect it.
      </aside>
    );
  }

  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, deckKeywords(card), describeCardFromJson(card));
  const hasText = text.length > 0;

  return (
    <aside className="old-panel relative z-[90] flex min-h-0 flex-col overflow-hidden text-[#f6e6b8]">
      <div className="flex items-start justify-between gap-3 border-b border-[#8f6a36]/60 p-3">
        <div>
          <h2 className="old-title text-lg font-bold leading-tight">{card.name}</h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#d6b879]">{typeLine(card)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pinned && (
            <button className="icon-button" title="Clear selection" onClick={onClearPin}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        {details.imageUrl ? (
          <img src={details.imageUrl} alt={card.name} className="mx-auto max-h-[48vh] w-full max-w-[280px] rounded-md border-2 border-[#9c7238] object-contain shadow-lg shadow-black/45" />
        ) : (
          <MissingCardArt card={card} />
        )}
        <div className="relative z-[120] flex items-center justify-between gap-2 overflow-visible">
          {deckKeywords(card) && <KeywordPills keywords={deckKeywords(card)} compact />}
          {stats(card) && <span className="preview-stat-pill ml-auto">{stats(card)}</span>}
        </div>
        {hasText && (
          <div className="old-panel-soft old-scrollbar min-h-0 flex-1 overflow-auto p-2">
            <p className="whitespace-pre-line text-base leading-relaxed text-[#f4dfb0]">{renderCardText(text)}</p>
          </div>
        )}
        <button className="old-button h-10 text-sm font-black uppercase tracking-wide" onClick={onDetails}>
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
  fontSize,
  setFontSize,
  onClose,
  onPrevious,
  onNext,
}: {
  deck: InspectableDeck;
  card: NewDeckCard;
  fontSize: number;
  setFontSize: (value: number) => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const details = useDeckCardDetails(deck.id, card, deck.images);
  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, deckKeywords(card), describeCardFromJson(card));
  return (
    <CardDetailsModal
      card={toCardInstance(card)}
      imageUrl={details.imageUrl}
      keywords={deckKeywords(card)}
      stats={stats(card)}
      text={text}
      fontSize={fontSize}
      setFontSize={setFontSize}
      onClose={onClose}
      onPrevious={onPrevious}
      onNext={onNext}
      previousLabel="Previous deck card"
      nextLabel="Next deck card"
    />
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
  const keywords = new Set((card.keywords ?? []).map(formatDeckKeyword));
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

function toCardInstance(card: NewDeckCard): CardInstance {
  return {
    instanceId: `inspect-${card.id}`,
    definitionId: card.id,
    name: card.name,
    displayName: card.name,
    owner: "player",
    controller: "player",
    zone: "library",
    isToken: false,
    manaCost: card.manaCost ?? "",
    manaValue: card.manaValue ?? 0,
    colors: card.colors ?? [],
    cardTypes: card.cardTypes ?? [],
    subtypes: card.subtypes ?? [],
    basePower: card.power ?? 0,
    baseToughness: card.toughness ?? 0,
    keywords: [],
    effects: [],
    activatedAbilities: [],
    requiresTargets: [],
    tapped: false,
    entersTapped: false,
    summoningSickness: false,
    activatedThisTurn: false,
    damageMarked: 0,
    deathtouchDamage: false,
    counters: {},
    temporaryPower: 0,
    temporaryToughness: 0,
    temporaryKeywords: [],
    flags: {},
  };
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
