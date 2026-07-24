import { Layers, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toArtCropImageUrl, useCardImage } from "../../utils/cardImages";
import { CATALOG_DECKS, describeCardTypes, searchCatalog, type CatalogCard } from "../cardCatalog";
import { SCENARIO_ZONES, type ScenarioCard, type ScenarioZoneKey } from "../scenario";

const RESULT_LIMIT = 60;

type Props = {
  /** Adds to the scenario definition; takes effect on the next start. */
  onAddToScenario: (zone: ScenarioZoneKey, entry: ScenarioCard) => void;
  /** Places into the live game right now, without running enter triggers. */
  onPlaceNow: (zone: ScenarioZoneKey, entry: ScenarioCard) => void;
};

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
      <div className="playground-button-row">
        <span className="playground-skeleton-field" />
        <span className="playground-skeleton-field" />
      </div>
      <p className="playground-note">Select a card below to place it into a zone.</p>
    </div>
  );
}

export function CardsPanel({ onAddToScenario, onPlaceNow }: Props) {
  const [query, setQuery] = useState("");
  const [deckId, setDeckId] = useState("");
  const [selected, setSelected] = useState<CatalogCard | undefined>();
  const [zone, setZone] = useState<ScenarioZoneKey>("playerHand");
  const [amount, setAmount] = useState(1);
  const [tapped, setTapped] = useState(false);

  const results = useMemo(() => searchCatalog(query, deckId || undefined), [query, deckId]);
  const visible = results.slice(0, RESULT_LIMIT);
  const entry: ScenarioCard | undefined = selected
    ? { definitionId: selected.definition.id, amount, ...(tapped ? { tapped: true } : {}) }
    : undefined;

  return (
    <div className="playground-section">
      {!selected && <SelectedSkeleton />}
      {selected && (
        <div className="playground-selected">
          <div className="playground-selected-head">
            <CardThumb definitionId={selected.definition.id} name={selected.definition.name} large />
            <div className="playground-section-title">{selected.definition.name}</div>
          </div>
          <div className="playground-note">
            {describeCardTypes(selected.definition)}
            {(selected.definition.keywords ?? []).length > 0 && <> · {(selected.definition.keywords ?? []).join(", ")}</>}
            <br />
            {selected.deckLabel} · {selected.definition.id}
          </div>

          <select className="playground-select" value={zone} onChange={(event) => setZone(event.target.value as ScenarioZoneKey)}>
            {SCENARIO_ZONES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="playground-inline-row">
            <label className="playground-mana-input">
              <span>×</span>
              <input type="number" min={1} value={amount} onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))} />
            </label>
            <label className="playground-checkbox">
              <input type="checkbox" checked={tapped} onChange={(event) => setTapped(event.target.checked)} />
              <span>Tapped</span>
            </label>
          </div>

          <div className="playground-button-row">
            <button className="playground-button is-primary" type="button" onClick={() => entry && onPlaceNow(zone, entry)}>
              <Plus size={14} /> Place now
            </button>
            <button className="playground-button" type="button" onClick={() => entry && onAddToScenario(zone, entry)}>
              <Layers size={14} /> Add to scenario
            </button>
          </div>
          <p className="playground-note">
            Place now drops the card into the live game without running enter triggers — use it to set
            a board up. Resolving a card through its real flow is an Actions-tab job.
          </p>
        </div>
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
              onClick={() => setSelected(card)}
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
