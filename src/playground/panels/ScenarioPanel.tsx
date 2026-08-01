import { ArrowDownToLine, GripVertical, Play, Plus, RefreshCw, X } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { hostInspectableDecks, playerInspectableDecks } from "../../data/deckCatalog";
import { useCardImage } from "../../utils/cardImages";
import { searchCatalog } from "../cardCatalog";
import type { ScenarioCard, ScenarioDefinition } from "../scenario";
import { SearchInput, SelectField, TextField } from "./fields";

const RESULT_LIMIT = 20;

function CardThumb({ definitionId, name }: { definitionId: string; name: string }) {
  const imageUrl = useCardImage(definitionId);
  return (
    <span className="playground-thumb" aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className="playground-thumb-fallback">{name.slice(0, 1)}</span>}
    </span>
  );
}

type Props = {
  draft: ScenarioDefinition;
  queue: ScenarioCard[];
  onChange: (definition: ScenarioDefinition) => void;
  onChangeQueue: (queue: ScenarioCard[]) => void;
  onUpdate: () => void;
  onExecuteHostTurn: () => void;
};

export function ScenarioPanel({ draft, queue, onChange, onChangeQueue, onUpdate, onExecuteHostTurn }: Props) {
  const [query, setQuery] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number>();
  const [dropIndex, setDropIndex] = useState<number>();
  const results = useMemo(
    () => searchCatalog(query, draft.hostDeckId).filter((card) => card.side === "host").slice(0, RESULT_LIMIT),
    [draft.hostDeckId, query],
  );

  function addToQueue(definitionId: string) {
    onChangeQueue([...queue, { definitionId }]);
    setQuery("");
  }

  function beginDrag(event: DragEvent<HTMLElement>, index: number) {
    setDraggedIndex(index);
    setDropIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function dropAt(event: DragEvent<HTMLLIElement>, targetIndex: number) {
    event.preventDefault();
    const sourceIndex = draggedIndex ?? Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(sourceIndex) || sourceIndex === targetIndex) {
      finishDrag();
      return;
    }
    const next = [...queue];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChangeQueue(next);
    finishDrag();
  }

  function finishDrag() {
    setDraggedIndex(undefined);
    setDropIndex(undefined);
  }

  return (
    <div className="playground-panel">
      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Seed</span>
        </header>
        <div className="playground-seed-row">
          <TextField label="Seed" value={draft.seed} onChange={(seed) => onChange({ ...draft, seed })} />
          <button className="playground-button is-primary" type="button" onClick={onUpdate}>
            <RefreshCw size={14} /> Update
          </button>
        </div>
        <div className="playground-grid-2">
          <SelectField
            label="Player deck"
            value={draft.playerDeckId}
            options={playerInspectableDecks.map((deck) => ({ value: deck.id, label: deck.label }))}
            onChange={(playerDeckId) => onChange({ ...draft, playerDeckId })}
          />
          <SelectField
            label="Host deck"
            value={draft.hostDeckId}
            options={hostInspectableDecks.map((deck) => ({ value: deck.id, label: deck.label }))}
            onChange={(hostDeckId) => onChange({ ...draft, hostDeckId })}
          />
        </div>
      </section>

      <section className="playground-group playground-host-turn">
        <header className="playground-group-head">
          <span className="playground-group-title">Host turn</span>
          <span className="playground-group-badge">{queue.length} queued</span>
        </header>

        <div className="playground-host-toolbar">
          <div className="playground-host-search">
            <SearchInput
              placeholder="Search Host cards"
              value={query}
              onChange={setQuery}
            />
            {query.trim() && (
              <ul className="playground-host-search-results old-scrollbar">
                {results.map((card) => (
                  <li key={card.key}>
                    <button className="playground-result is-compact" type="button" onClick={() => addToQueue(card.definition.id)}>
                      <CardThumb definitionId={card.definition.id} name={card.definition.name} />
                      <span className="playground-result-text">
                        <span className="playground-result-name">{card.definition.name}</span>
                        <span className="playground-result-id">{card.definition.id}</span>
                      </span>
                      <Plus size={14} />
                    </button>
                  </li>
                ))}
                {results.length === 0 && <li className="playground-empty">No cards found.</li>}
              </ul>
            )}
          </div>
          <button className="playground-button is-primary" type="button" onClick={onExecuteHostTurn}>
            <Play size={14} /> Execute
          </button>
        </div>

        {queue.length > 0 && (
          <ol className="playground-host-queue old-scrollbar">
            {queue.map((entry, index) => {
              const card = searchCatalog(entry.definitionId).find(
                (candidate) => candidate.side === "host" && candidate.definition.id === entry.definitionId,
              );
              return (
                <li
                  key={`${entry.definitionId}-${index}`}
                  className={[
                    "playground-library-entry",
                    "playground-host-queue-card",
                    draggedIndex === index ? "is-dragging" : "",
                    dropIndex === index && draggedIndex !== index ? "is-drop-target" : "",
                  ].join(" ")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropIndex(index);
                  }}
                  onDrop={(event) => dropAt(event, index)}
                >
                  <span
                    className="playground-host-grip"
                    draggable
                    title="Drag to reorder"
                    onDragStart={(event) => beginDrag(event, index)}
                    onDragEnd={finishDrag}
                  >
                    <GripVertical size={14} aria-hidden="true" />
                  </span>
                  <CardThumb definitionId={entry.definitionId} name={card?.definition.name ?? entry.definitionId} />
                  <span className="playground-step-index">{index + 1}</span>
                  <span className="playground-step-label">{card?.definition.name ?? entry.definitionId}</span>
                  <button
                    className="playground-icon-button"
                    type="button"
                    title="Remove"
                    onClick={() => onChangeQueue(queue.filter((_, position) => position !== index))}
                  >
                    <X size={12} />
                  </button>
                  <button
                    className="playground-icon-button"
                    type="button"
                    title="Duplicate below"
                    onClick={() =>
                      onChangeQueue([
                        ...queue.slice(0, index + 1),
                        { ...entry },
                        ...queue.slice(index + 1),
                      ])
                    }
                  >
                    <ArrowDownToLine size={12} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
