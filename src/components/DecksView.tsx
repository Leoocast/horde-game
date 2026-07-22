import { ArrowLeft } from "lucide-react";
import type { InspectableDeck, NewDeckCard } from "../data/deckCatalog";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { useDeckCardDetails } from "../utils/deckCardImages";

type Props = {
  collection: "chronicles" | "hosts";
  decks: InspectableDeck[];
  onOpenDeck: (deckId: string) => void;
  onBack: () => void;
  closing?: boolean;
};

const KEY_CARD_IDS: Record<string, string> = {
  mono_green_ramp: "sunshower_druid",
  horde_zombies: "zombie_token",
  goblin_assault_horde: "goblin_token_1_1_red",
};

export function DecksView({ collection, decks, onOpenDeck, onBack, closing = false }: Props) {
  const t = useTranslation();
  const title = collection === "chronicles" ? t("menu.chronicles") : t("menu.hosts");
  const description = collection === "chronicles" ? t("decks.chroniclesDescription") : t("decks.hostsDescription");

  return (
    <section className={`main-settings-screen decks-panel ${closing ? "is-closing" : ""}`} aria-label={title}>
      <header className="main-settings-header">
        <button className="menu-screen-back" type="button" onClick={onBack}><ArrowLeft size={16} /> {t("common.back")}</button>
        <h2>{title}</h2>
        <span>{description}</span>
      </header>

      <div className="decks-content decks-content-single">
        <div className="decks-card-row">
          {decks.map((deck) => (
            <DeckKeyCard key={deck.id} deck={deck} onOpen={() => onOpenDeck(deck.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DeckKeyCard({ deck, onOpen }: { deck: InspectableDeck; onOpen: () => void }) {
  const t = useTranslation();
  const keyCard = findKeyCard(deck);
  const details = useDeckCardDetails(deck.id, keyCard, deck.images);
  const playSfx = useAudioStore((state) => state.playSfx);

  const playHoverSound = () => playSfx("drawOne", { volume: 0.56 });

  return (
    <button
      className={`deck-key-card deck-theme-${deckTheme(deck.id)}`}
      type="button"
      onClick={onOpen}
      onMouseEnter={playHoverSound}
      onFocus={(event) => {
        if (!event.currentTarget.matches(":hover")) playHoverSound();
      }}
      aria-label={t("decks.open", { deck: deck.label })}
    >
      <span className="deck-key-card-stage">
        <span className="deck-key-card-depth deck-key-card-depth-back" aria-hidden="true" />
        <span className="deck-key-card-depth deck-key-card-depth-mid" aria-hidden="true" />
        <span className="deck-key-card-face">
          {details.imageUrl ? (
            <img src={details.imageUrl} alt={keyCard?.name ?? deck.label} draggable={false} />
          ) : (
            <span className="deck-key-card-fallback">
              <small>{t("decks.keyCard")}</small>
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

function deckTheme(deckId: string): "ramp" | "zombie" | "goblin" {
  if (deckId === "horde_zombies") return "zombie";
  if (deckId === "goblin_assault_horde") return "goblin";
  return "ramp";
}
