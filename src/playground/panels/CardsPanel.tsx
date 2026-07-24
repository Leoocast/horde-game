import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { toArtCropImageUrl, useCardImage } from "../../utils/cardImages";
import { CATALOG_DECKS, describeCardTypes, searchCatalog, type CatalogCard } from "../cardCatalog";
import type { ScenarioZoneKey } from "../scenario";
import type { TimelineStep } from "../timeline";

const RESULT_LIMIT = 60;

type Props = {
  /** Every action goes through the timeline so it is executed and recorded by the same call. */
  onDispatch: (step: TimelineStep) => void;
};

/**
 * Where a card can be put without pretending. A sorcery has no battlefield to sit on and the Horde
 * has no hand, so those options are never offered — the old panel let you drop Smallpox onto the
 * Horde's battlefield, which is a state the game itself can never reach.
 */
function destinationsFor(card: CatalogCard): Array<{ zone: ScenarioZoneKey; label: string }> {
  const isPermanent = (card.definition.cardTypes ?? []).some((type) =>
    ["Creature", "Land", "Artifact", "Enchantment", "Planeswalker"].includes(type),
  );
  if (card.side === "horde") {
    return [
      ...(isPermanent ? ([{ zone: "hordeBattlefield", label: "Horde battlefield" }] as const) : []),
      { zone: "hordeLibraryTop", label: "Top of Horde library" },
      { zone: "hordeGraveyard", label: "Horde graveyard" },
      { zone: "hordeExile", label: "Horde exile" },
    ];
  }
  return [
    { zone: "playerHand", label: "Your hand" },
    ...(isPermanent ? ([{ zone: "playerBattlefield", label: "Your battlefield" }] as const) : []),
    { zone: "playerLibraryTop", label: "Top of your library" },
    { zone: "playerGraveyard", label: "Your graveyard" },
    { zone: "playerExile", label: "Your exile" },
  ];
}

/** Same image source the game uses (`useCardImage` → manifest lookup + localStorage cache), so the
 *  thumbnails are already warm from the boot preload instead of firing fresh Scryfall requests. */
function CardThumb({ definitionId, name, large = false }: { definitionId: string; name: string; large?: boolean }) {
  const imageUrl = toArtCropImageUrl(useCardImage(definitionId));
  return (
    <span className={`playground-thumb ${large ? "is-large" : ""}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className="playground-thumb-fallback">{name.slice(0, 1)}</span>}
    </span>
  );
}

/** Same shape and height as the real detail block, so selecting the first card doesn't shove the
 *  search field down the panel. Inert: nothing here is focusable or clickable. */
function SelectedSkeleton() {
  return (
    <div className="playground-selected is-skeleton" aria-hidden="true">
      <div className="playground-selected-head">
        <span className="playground-thumb is-large" />
        <span className="playground-skeleton-bar is-title" />
      </div>
      <div className="playground-note">
        <span className="playground-skeleton-bar" />
        <span className="playground-skeleton-bar is-short" />
      </div>
      <span className="playground-skeleton-field" />
      <div className="playground-inline-row">
        <span className="playground-skeleton-field is-narrow" />
        <span className="playground-skeleton-bar is-short" />
      </div>
      <p className="playground-note">Pick a card below to play it or put it somewhere.</p>
    </div>
  );
}

export function CardsPanel({ onDispatch }: Props) {
  const [query, setQuery] = useState("");
  const [deckId, setDeckId] = useState("");
  const [selected, setSelected] = useState<CatalogCard | undefined>();
  const [zone, setZone] = useState<ScenarioZoneKey | undefined>();
  const [amount, setAmount] = useState(1);
  const [tapped, setTapped] = useState(false);

  const results = useMemo(() => searchCatalog(query, deckId || undefined), [query, deckId]);
  const visible = results.slice(0, RESULT_LIMIT);
  const destinations = selected ? destinationsFor(selected) : [];
  // The card decides which destinations exist, so a leftover choice from the previous card is not
  // trustworthy; fall back to that card's first legal one.
  const activeZone = destinations.some((option) => option.zone === zone) ? zone : destinations[0]?.zone;
  const isPermanent = activeZone === "playerBattlefield" || activeZone === "hordeBattlefield";

  function select(card: CatalogCard) {
    setSelected(card);
    setZone(destinationsFor(card)[0]?.zone);
  }

  return (
    <div className="playground-panel">
      {!selected && <SelectedSkeleton />}
      {selected && (
        <section className="playground-group playground-selected">
          <div className="playground-selected-head">
            <CardThumb definitionId={selected.definition.id} name={selected.definition.name} large />
            <div>
              <div className="playground-group-title">{selected.definition.name}</div>
              <div className="playground-result-meta">{describeCardTypes(selected.definition)}</div>
              <div className="playground-result-id">
                {selected.deckLabel} · {selected.definition.manaCost || "no cost"}
              </div>
            </div>
          </div>

          <button
            className="playground-button is-primary is-tall"
            type="button"
            onClick={() =>
              onDispatch({
                kind: "playCard",
                definitionId: selected.definition.id,
                cardName: selected.definition.name,
                side: selected.side,
              })
            }
          >
            <Play size={14} /> Play {selected.definition.name}
          </button>
          <p className="playground-hint">
            {selected.side === "horde"
              ? "Goes on top of the Horde library and runs the Horde's turn, so it enters exactly the way it would in a match — reveal, triggers, animations."
              : "Goes to your hand and casts through the normal path, cost covered. Triggers and targeting all run; if it needs targets, pick them on the board."}
          </p>

          <div className="playground-divider" />

          <div className="playground-field">
            <span>Or put it straight into</span>
            <select
              className="playground-select"
              value={activeZone ?? ""}
              onChange={(event) => setZone(event.target.value as ScenarioZoneKey)}
            >
              {destinations.map((option) => (
                <option key={option.zone} value={option.zone}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="playground-inline-row">
            <label className="playground-mini-input">
              <span>×</span>
              <input type="number" min={1} value={amount} onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))} />
            </label>
            {isPermanent && (
              <label className="playground-checkbox">
                <input type="checkbox" checked={tapped} onChange={(event) => setTapped(event.target.checked)} />
                <span>Tapped</span>
              </label>
            )}
            <button
              className="playground-button"
              type="button"
              disabled={!activeZone}
              onClick={() =>
                activeZone &&
                onDispatch({
                  kind: "place",
                  zone: activeZone,
                  entry: { definitionId: selected.definition.id, amount, ...(isPermanent && tapped ? { tapped: true } : {}) },
                })
              }
            >
              Put it there
            </button>
          </div>
          <p className="playground-hint">
            Silent: no cost, no enter-the-battlefield triggers, no animation. For building a board to
            test something else against.
          </p>
        </section>
      )}

      <input
        className="playground-search"
        placeholder="Search by name or id"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select className="playground-select" value={deckId} onChange={(event) => setDeckId(event.target.value)}>
        <option value="">All decks</option>
        {CATALOG_DECKS.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.label}
          </option>
        ))}
      </select>

      <div className="playground-result-count">
        {results.length} card{results.length === 1 ? "" : "s"}
        {results.length > RESULT_LIMIT ? ` — showing first ${RESULT_LIMIT}` : ""}
      </div>

      <ul className="playground-results">
        {visible.map((card) => (
          <li key={card.key}>
            <button
              className={`playground-result ${selected?.key === card.key ? "is-active" : ""}`}
              type="button"
              onClick={() => select(card)}
            >
              <CardThumb definitionId={card.definition.id} name={card.definition.name} />
              <span className="playground-result-text">
                <span className="playground-result-name">
                  {card.definition.name}
                  {card.isToken && <em>token</em>}
                </span>
                <span className="playground-result-meta">
                  {card.definition.manaCost || "—"} · {describeCardTypes(card.definition)}
                </span>
                <span className="playground-result-id">{card.definition.id}</span>
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="playground-note">No card matches that search.</li>}
      </ul>
    </div>
  );
}
