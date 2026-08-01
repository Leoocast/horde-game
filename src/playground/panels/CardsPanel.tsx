import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { useCardImage } from "../../utils/cardImages";
import { CATALOG_DECKS, describeCardTypes, searchCatalog, type CatalogCard } from "../cardCatalog";
import type { ScenarioZoneKey } from "../scenario";
import type { TimelineStep } from "../timeline";
import { SearchInput } from "./fields";

const RESULT_LIMIT = 60;

type Props = {
  onDispatch: (step: TimelineStep) => void;
};

function destinationsFor(card: CatalogCard): Array<{ zone: ScenarioZoneKey; label: string }> {
  const isPermanent = (card.definition.cardTypes ?? []).some((type) =>
    ["ECHO", "SOURCE", "SUPPORT"].includes(type),
  );
  if (card.side === "horde") {
    return [
      ...(isPermanent ? ([{ zone: "hordeBattlefield", label: "Host Field" }] as const) : []),
      { zone: "hordeLibraryTop", label: "Top of Host Archive" },
      { zone: "hordeGraveyard", label: "Host Memory" },
      { zone: "hordeExile", label: "Host Oblivion" },
    ];
  }
  return [
    { zone: "playerHand", label: "Your hand" },
    ...(isPermanent ? ([{ zone: "playerBattlefield", label: "Your Field" }] as const) : []),
    { zone: "playerLibraryTop", label: "Top of your Archive" },
    { zone: "playerGraveyard", label: "Your Memory" },
    { zone: "playerExile", label: "Your Oblivion" },
  ];
}

function CardThumb({ definitionId, name, large = false }: { definitionId: string; name: string; large?: boolean }) {
  const imageUrl = useCardImage(definitionId);
  return (
    <span className={`playground-thumb ${large ? "is-large" : ""}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className="playground-thumb-fallback">{name.slice(0, 1)}</span>}
    </span>
  );
}

function SelectedSkeleton() {
  return (
    <div className="playground-group playground-selected playground-selected-layout is-skeleton" aria-hidden="true">
      <div className="playground-selected-column">
        <div className="playground-selected-head">
          <span className="playground-thumb is-large" />
          <span className="playground-skeleton-bar is-title" />
        </div>
        <span className="playground-skeleton-field" />
      </div>
      <div className="playground-selected-column">
        <span className="playground-skeleton-field" />
        <div className="playground-inline-row">
          <span className="playground-skeleton-field is-narrow" />
          <span className="playground-skeleton-bar is-short" />
        </div>
        <span className="playground-skeleton-field" />
      </div>
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
        <section className="playground-group playground-selected playground-selected-layout">
          <div className="playground-selected-column">
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
          </div>

          <div className="playground-selected-column">
            <select
              className="playground-select"
              aria-label="Destination"
              value={activeZone ?? ""}
              onChange={(event) => setZone(event.target.value as ScenarioZoneKey)}
            >
              {destinations.map((option) => (
                <option key={option.zone} value={option.zone}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="playground-place-controls">
              <label className="playground-amount-control">
                <input
                  aria-label="Copies"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              {isPermanent && (
                <label className="playground-checkbox">
                  <input type="checkbox" checked={tapped} onChange={(event) => setTapped(event.target.checked)} />
                  <span>Exhausted</span>
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
          </div>
        </section>
      )}

      <div className="playground-card-browser-toolbar">
        <SearchInput
          placeholder="Search by name or id"
          value={query}
          onChange={setQuery}
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
        {visible.length === 0 && <li className="playground-empty">No card matches that search.</li>}
      </ul>
    </div>
  );
}
