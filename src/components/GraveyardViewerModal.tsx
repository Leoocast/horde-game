import { Archive, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { useCardDetails } from "../utils/cardImages";
import { cleanCardDescriptionText } from "../utils/cardTextSymbols";
import { effectSummary } from "../utils/cardText";
import { cardKeywords, cardStats } from "../utils/selectors";
import { CardDetailsModal } from "./CardPreview";

type Props = {
  game: GameState;
  title: string;
  cards: CardInstance[];
  onClose: () => void;
};

export function GraveyardViewerModal({ game, title, cards, onClose }: Props) {
  const [detailsCardId, setDetailsCardId] = useState<string | undefined>();
  const [detailsFontSize, setDetailsFontSize] = useState(20);
  const detailsIndex = Math.max(0, cards.findIndex((card) => card.instanceId === detailsCardId));
  const detailsCard = detailsCardId ? cards[detailsIndex] : undefined;

  return (
    <div data-preserve-card-focus="true" className="fixed inset-0 z-[250] flex items-center justify-center bg-black/82 p-5 text-[#f6e6b8] backdrop-blur-md">
      <section className="old-panel flex h-[min(82vh,760px)] w-[min(1180px,calc(100vw-40px))] flex-col overflow-hidden p-4 shadow-2xl shadow-black/70">
        <header className="flex items-center justify-between gap-4 border-b border-[#8f6a36]/60 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#8f6a36] bg-[#17100a] text-[#d7b878] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <Archive size={20} strokeWidth={2.5} />
            </div>
            <div>
              <p className="old-title text-xs font-bold uppercase tracking-[0.22em]">Graveyard</p>
              <h2 className="old-title text-2xl font-black">{title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="deck-quantity-badge h-7 min-w-16 text-sm">x{cards.length}</div>
            <button className="icon-button h-9 w-9" title="Close graveyard" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm font-bold uppercase tracking-wide text-[#d6b879]">
            This graveyard is empty.
          </div>
        ) : (
          <div className="old-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-4 px-2 pb-8 pt-5">
              {cards.map((card, index) => (
                <GraveyardCardTile key={card.instanceId} card={card} index={index} onClick={() => setDetailsCardId(card.instanceId)} />
              ))}
            </div>
          </div>
        )}
      </section>

      {detailsCard && (
        <GraveyardDetailsModal
          game={game}
          card={detailsCard}
          fontSize={detailsFontSize}
          setFontSize={setDetailsFontSize}
          onClose={() => setDetailsCardId(undefined)}
          onPrevious={cards.length > 1 ? () => setDetailsCardId(cards[(detailsIndex - 1 + cards.length) % cards.length]?.instanceId) : undefined}
          onNext={cards.length > 1 ? () => setDetailsCardId(cards[(detailsIndex + 1) % cards.length]?.instanceId) : undefined}
        />
      )}
    </div>
  );
}

function GraveyardCardTile({ card, index, onClick }: { card: CardInstance; index: number; onClick: () => void }) {
  const details = useCardDetails(card.definitionId);

  return (
    <button
      className="group text-left transition hover:-translate-y-1 hover:drop-shadow-[0_0_14px_rgba(94,210,255,0.46)]"
      onClick={onClick}
      title={card.displayName}
    >
      <div className="relative mx-auto w-full max-w-[156px]">
        <span className="deck-quantity-badge pointer-events-none absolute -left-2 -top-2 z-20 h-6 min-w-8 text-xs">{index + 1}</span>
        <div className="relative aspect-[488/680] overflow-hidden rounded-md border-2 border-[#5e3f1f] bg-[#170f09] shadow-lg shadow-black/45 group-hover:border-[#78d9ff]">
          {details.imageUrl ? (
            <img src={details.imageUrl} alt={card.displayName} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-bold text-[#d6b879]">{card.displayName}</div>
          )}
        </div>
      </div>
      <div className="mx-auto mt-2 max-w-[156px] truncate text-center text-xs font-bold text-[#f4dfb0]">{card.displayName}</div>
    </button>
  );
}

function GraveyardDetailsModal({
  game,
  card,
  fontSize,
  setFontSize,
  onClose,
  onPrevious,
  onNext,
}: {
  game: GameState;
  card: CardInstance;
  fontSize: number;
  setFontSize: (value: number) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const details = useCardDetails(card.definitionId);
  const keywords = cardKeywords(game, card);
  const stats = cardStats(game, card);
  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, keywords, effectSummary(card));

  return (
    <CardDetailsModal
      card={card}
      imageUrl={details.imageUrl}
      keywords={keywords}
      stats={stats}
      text={text}
      fontSize={fontSize}
      setFontSize={setFontSize}
      onClose={onClose}
      onPrevious={onPrevious}
      onNext={onNext}
      previousLabel="Previous graveyard card"
      nextLabel="Next graveyard card"
    />
  );
}
