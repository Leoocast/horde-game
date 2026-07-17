import type { InspectableDeck, NewDeckCard } from "../data/deckCatalog";
import { useAudioStore } from "../store/useAudioStore";
import { useDeckCardDetails } from "../utils/deckCardImages";

type Props = {
  playerDecks: InspectableDeck[];
  hordeDecks: InspectableDeck[];
  onOpenDeck: (deckId: string) => void;
};

const KEY_CARD_IDS: Record<string, string> = {
  mono_green_ramp: "sunshower_druid",
  horde_zombies: "zombie_token",
  goblin_assault_horde: "goblin_token_1_1_red",
};

export function DecksView({ playerDecks, hordeDecks, onOpenDeck }: Props) {
  return (
    <section className="main-settings-screen decks-panel" aria-label="Decks">
      <header className="main-settings-header">
        <h2>Decks</h2>
        <span>Choose a deck to explore cards.</span>
      </header>

      <div className="decks-content">
        <DeckSection title="Player" decks={playerDecks} onOpenDeck={onOpenDeck} />
        <DeckSection title="Horde" decks={hordeDecks} onOpenDeck={onOpenDeck} />
      </div>
    </section>
  );
}

function DeckSection({ title, decks, onOpenDeck }: { title: string; decks: InspectableDeck[]; onOpenDeck: (deckId: string) => void }) {
  return (
    <section className="decks-section" aria-labelledby={`decks-${title.toLowerCase()}`}>
      <div className="decks-section-heading">
        <h2 id={`decks-${title.toLowerCase()}`}>{title}</h2>
      </div>
      <div className="decks-card-row">
        {decks.map((deck) => (
          <DeckKeyCard key={deck.id} deck={deck} onOpen={() => onOpenDeck(deck.id)} />
        ))}
      </div>
    </section>
  );
}

function DeckKeyCard({ deck, onOpen }: { deck: InspectableDeck; onOpen: () => void }) {
  const keyCard = findKeyCard(deck);
  const details = useDeckCardDetails(deck.id, keyCard, deck.images);
  const playSfx = useAudioStore((state) => state.playSfx);

  const playHoverSound = () => playSfx("drawOne", { volume: 0.56 });

  return (
    <button
      className="deck-key-card"
      type="button"
      onClick={onOpen}
      onMouseEnter={playHoverSound}
      onFocus={(event) => {
        if (!event.currentTarget.matches(":hover")) playHoverSound();
      }}
      aria-label={`Open ${deck.label}`}
    >
      <span className="deck-key-card-stage">
        <span className="deck-key-card-depth deck-key-card-depth-back" aria-hidden="true" />
        <span className="deck-key-card-depth deck-key-card-depth-mid" aria-hidden="true" />
        <span className="deck-key-card-face">
          {details.imageUrl ? (
            <img src={details.imageUrl} alt={keyCard?.name ?? deck.label} draggable={false} />
          ) : (
            <span className="deck-key-card-fallback">
              <small>Key Card</small>
              <strong>{keyCard?.name ?? deck.label}</strong>
            </span>
          )}
          <span className="deck-key-card-sheen" aria-hidden="true" />
        </span>
      </span>
      <span className="deck-key-card-copy">
        <strong>{deck.deck.name}</strong>
      </span>
    </button>
  );
}

function findKeyCard(deck: InspectableDeck): NewDeckCard | undefined {
  const cardId = KEY_CARD_IDS[deck.id];
  const cards = [...(deck.deck.tokens ?? []), ...deck.deck.cards];
  return cards.find((card) => card.id === cardId) ?? cards[0];
}
