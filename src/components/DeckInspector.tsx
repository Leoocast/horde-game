import { ArrowLeft, Maximize2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { InspectableDeck, NewDeckAbility, NewDeckCard } from "../data/deckCatalog";
import { cleanReminderText, renderCardText } from "../utils/cardTextSymbols";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { AppHeader } from "./AppHeader";

type Props = {
  deck: InspectableDeck;
  onBack: () => void;
};

type CardCopy = {
  key: string;
  card: NewDeckCard;
  copyNumber: number;
};

export function DeckInspector({ deck, onBack }: Props) {
  const cards = useMemo(() => expandCards(deck.deck.cards), [deck]);
  const [hoveredCardId, setHoveredCardId] = useState<string | undefined>(cards[0]?.card.id);
  const [focusedCardId, setFocusedCardId] = useState<string | undefined>();
  const activeCard = cards.find((copy) => copy.card.id === (focusedCardId ?? hoveredCardId))?.card ?? cards[0]?.card;
  const [detailsCard, setDetailsCard] = useState<NewDeckCard | undefined>();

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
        <section className="old-panel min-h-0 overflow-hidden p-4">
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-[#8f6a36]/60 pb-3">
            <div>
              <p className="old-title text-xs font-bold uppercase tracking-[0.24em]">Deck Inspector</p>
              <h1 className="old-title mt-1 text-2xl font-black">{deck.deck.name}</h1>
            </div>
            <div className="text-right text-xs font-bold uppercase tracking-wide text-[#d6b879]">
              <div>{cards.length} cards</div>
              <div>{deck.deck.cards.length} unique</div>
            </div>
          </div>
          <div className="h-[calc(100%-74px)] overflow-auto pr-2">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-4 pb-8">
              {cards.map((copy) => (
                <DeckCardTile
                  key={copy.key}
                  deck={deck}
                  card={copy.card}
                  selected={copy.card.id === focusedCardId}
                  onHover={() => setHoveredCardId(copy.card.id)}
                  onClick={() => {
                    setFocusedCardId(copy.card.id);
                    setDetailsCard(copy.card);
                  }}
                />
              ))}
            </div>
          </div>
        </section>
        <DeckCardInfo deck={deck} card={activeCard} pinned={Boolean(focusedCardId)} onClearPin={() => setFocusedCardId(undefined)} onDetails={() => activeCard && setDetailsCard(activeCard)} />
      </div>
      {detailsCard && <DeckCardDetailsModal deck={deck} card={detailsCard} onClose={() => setDetailsCard(undefined)} />}
    </main>
  );
}

function DeckCardTile({
  deck,
  card,
  selected,
  onHover,
  onClick,
}: {
  deck: InspectableDeck;
  card: NewDeckCard;
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
      <div className="relative mx-auto aspect-[488/680] w-full max-w-[168px] overflow-hidden rounded-md border-2 border-[#5e3f1f] bg-[#170f09] shadow-lg shadow-black/45 group-hover:border-[#78d9ff]">
        {details.imageUrl ? <img src={details.imageUrl} alt={card.name} className="h-full w-full object-cover" draggable={false} /> : <MissingCardArt card={card} />}
        {selected && <div className="pointer-events-none absolute inset-0 border-2 border-[#f5d078] shadow-[inset_0_0_18px_rgba(245,208,120,0.55)]" />}
      </div>
      <div className="mx-auto mt-2 max-w-[168px] truncate text-center text-xs font-bold text-[#f4dfb0]">{card.name}</div>
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

  const text = cleanReminderText(details.oracleText ?? describeCardFromJson(card));
  const hasText = text.length > 0;

  return (
    <aside className="old-panel flex min-h-0 flex-col overflow-hidden text-[#f6e6b8]">
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#9fda72]">{card.keywords?.join(", ")}</p>
          {stats(card) && <span className="ml-auto border border-[#b88945] bg-[#1a1009]/80 px-2 py-1 text-sm font-bold text-[#ffe0a0]">{stats(card)}</span>}
        </div>
        {hasText && (
          <div className="old-panel-soft min-h-0 flex-1 overflow-auto p-2">
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

function DeckCardDetailsModal({ deck, card, onClose }: { deck: InspectableDeck; card: NewDeckCard; onClose: () => void }) {
  const details = useDeckCardDetails(deck.id, card, deck.images);
  const [fontSize, setFontSize] = useState(20);
  const text = cleanReminderText(details.oracleText ?? describeCardFromJson(card));

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/88 p-6 text-[#f6e6b8] backdrop-blur-md">
      <section className="old-panel card-details-modal-panel max-h-[86vh] w-[min(1180px,calc(100vw-48px))] overflow-hidden p-5 shadow-2xl shadow-black/70">
        <div className="min-h-0">
          {details.imageUrl ? (
            <img src={details.imageUrl} alt={card.name} className="mx-auto max-h-[74vh] w-full max-w-[360px] rounded-md border-2 border-[#b88945] object-contain shadow-xl shadow-black/55" />
          ) : (
            <MissingCardArt card={card} />
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[#8f6a36]/60 pb-3">
            <div>
              <h2 className="old-title text-3xl font-black leading-tight">{card.name}</h2>
              <p className="mt-2 text-sm font-bold uppercase tracking-wide text-[#d6b879]">{typeLine(card)}</p>
            </div>
            <button className="icon-button h-9 w-9" title="Close details" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {card.keywords && card.keywords.length > 0 && <p className="rounded border border-[#4f7d2d] bg-[#15230e]/80 px-3 py-2 text-sm font-bold text-[#aee77b]">{card.keywords.join(", ")}</p>}
            {stats(card) && <span className="border border-[#b88945] bg-[#1a1009]/85 px-3 py-2 text-lg font-black text-[#ffe0a0]">{stats(card)}</span>}
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
  );
}

function expandCards(cards: NewDeckCard[]): CardCopy[] {
  return cards.flatMap((card) =>
    Array.from({ length: card.quantity ?? 1 }, (_, index) => ({
      key: `${card.id}-${index}`,
      card,
      copyNumber: index + 1,
    })),
  );
}

function typeLine(card: NewDeckCard): string {
  return [...(card.cardTypes ?? []), card.subtypes?.length ? `- ${card.subtypes.join(" ")}` : ""].filter(Boolean).join(" ");
}

function stats(card: NewDeckCard): string | undefined {
  if (typeof card.power !== "number" || typeof card.toughness !== "number") return undefined;
  return `${card.power}/${card.toughness}`;
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
