import { Archive, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { useCardDetails } from "../utils/cardImages";
import { cleanCardDescriptionText, renderCardText } from "../utils/cardTextSymbols";
import { effectSummary } from "../utils/cardText";
import { cardKeywords, cardStats } from "../utils/selectors";
import { KeywordPills } from "./CardPreview";

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
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function closeViewer() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 180);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (detailsCardId) setDetailsCardId(undefined);
        else closeViewer();
        return;
      }
      if (!detailsCardId || cards.length < 2) return;
      if (event.key === "ArrowLeft") setDetailsCardId(cards[(detailsIndex - 1 + cards.length) % cards.length]?.instanceId);
      if (event.key === "ArrowRight") setDetailsCardId(cards[(detailsIndex + 1) % cards.length]?.instanceId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cards, closing, detailsCardId, detailsIndex]);

  useEffect(() => () => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
  }, []);

  return (
    <div
      data-preserve-card-focus="true"
      className={["deck-collection-modal-backdrop graveyard-viewer-backdrop", closing ? "is-closing" : ""].join(" ")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeViewer();
      }}
    >
      <section className="deck-collection-modal graveyard-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="graveyard-viewer-title">
        <header className="deck-detail-header graveyard-viewer-header">
          <div className="graveyard-viewer-emblem" aria-hidden="true">
            <Archive size={22} strokeWidth={2.2} />
          </div>
          <div className="deck-detail-heading">
            <p>Graveyard collection</p>
            <h1 id="graveyard-viewer-title">{title}</h1>
          </div>
          <div className="deck-detail-tools graveyard-viewer-tools">
            <div className="deck-detail-counts">
              <span><strong>{cards.length}</strong> cards</span>
            </div>
          </div>
          <button className="deck-collection-modal-close" type="button" title="Close graveyard" aria-label="Close graveyard" onClick={closeViewer}>
            <X size={20} />
          </button>
        </header>

        {cards.length === 0 ? (
          <div className="graveyard-viewer-empty">
            <Archive size={34} strokeWidth={1.5} />
            This graveyard is empty.
          </div>
        ) : (
          <div className="graveyard-viewer-collection">
            <div className="deck-detail-grid-scroll">
              <div className="deck-detail-grid graveyard-viewer-grid">
              {cards.map((card, index) => (
                <GraveyardCardTile key={card.instanceId} card={card} index={index} onClick={() => setDetailsCardId(card.instanceId)} />
              ))}
              </div>
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
          position={detailsIndex + 1}
          total={cards.length}
        />
      )}
    </div>
  );
}

function GraveyardCardTile({ card, index, onClick }: { card: CardInstance; index: number; onClick: () => void }) {
  const details = useCardDetails(card.definitionId);

  return (
    <button
      className="deck-detail-card graveyard-viewer-card"
      onClick={onClick}
      title={card.displayName}
    >
      <div className="deck-detail-card-frame">
        <span className="graveyard-card-position" aria-hidden="true">{index + 1}</span>
        <div className="deck-detail-card-image">
          {details.imageUrl ? (
            <img src={details.imageUrl} alt={card.displayName} draggable={false} />
          ) : (
            <div className="graveyard-card-missing">{card.displayName}</div>
          )}
        </div>
      </div>
      <div className="deck-detail-card-name">{card.displayName}</div>
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
  position,
  total,
}: {
  game: GameState;
  card: CardInstance;
  fontSize: number;
  setFontSize: (value: number) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position: number;
  total: number;
}) {
  const displayCard = graveyardDisplayCard(card);
  const details = useCardDetails(displayCard.definitionId);
  const keywords = cardKeywords(game, displayCard);
  const stats = cardStats(game, displayCard);
  const text = cleanCardDescriptionText(details.oracleText, details.flavorText, keywords, effectSummary(displayCard));

  return (
    <div
      data-preserve-card-focus="true"
      className="deck-collection-modal-backdrop"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="deck-collection-modal" role="dialog" aria-modal="true" aria-label={`${displayCard.displayName} details`}>
        <button className="deck-collection-modal-close" type="button" onClick={onClose} title="Close details">
          <X size={20} />
        </button>

        <div className="deck-collection-modal-content">
          <div className="deck-collection-modal-art-column">
            {onPrevious && (
              <button className="deck-collection-modal-nav is-previous" type="button" onClick={onPrevious} title="Previous graveyard card">
                <ChevronLeft size={24} />
              </button>
            )}
            <div className="deck-collection-modal-art">
              {details.imageUrl ? <img src={details.imageUrl} alt={displayCard.displayName} draggable={false} /> : <div className="graveyard-card-missing">{displayCard.displayName}</div>}
            </div>
            {onNext && (
              <button className="deck-collection-modal-nav is-next" type="button" onClick={onNext} title="Next graveyard card">
                <ChevronRight size={24} />
              </button>
            )}
          </div>

          <div className="deck-collection-modal-info">
            <header className="deck-collection-modal-header">
              <p>Graveyard card <span>{position} / {total}</span></p>
              <div><h2>{displayCard.displayName}</h2></div>
              <small>{graveyardTypeLine(displayCard)}</small>
            </header>

            {(keywords || stats) && (
              <div className="deck-collection-modal-badges">
                {stats && <span className="deck-collection-modal-stats">{stats}</span>}
                {keywords && <KeywordPills keywords={keywords} />}
              </div>
            )}

            <div className="deck-collection-modal-rules">
              <p style={{ fontSize }}>{renderCardText(text)}</p>
            </div>

            <footer className="deck-collection-modal-footer">
              <span>Text size</span>
              <button disabled={fontSize <= 16} onClick={() => setFontSize(Math.max(16, fontSize - 1))}>-</button>
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

function graveyardTypeLine(card: CardInstance): string {
  return [...card.cardTypes, card.subtypes.length ? `- ${card.subtypes.join(" ")}` : ""].filter(Boolean).join(" ");
}

function graveyardDisplayCard(card: CardInstance): CardInstance {
  return {
    ...card,
    tapped: false,
    summoningSickness: false,
    activatedThisTurn: false,
    damageMarked: 0,
    deathtouchDamage: false,
    counters: {},
    temporaryPower: 0,
    temporaryToughness: 0,
    temporaryKeywords: [],
  };
}
