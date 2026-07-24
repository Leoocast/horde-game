import { GripVertical, Plus, RefreshCw, Skull, X } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { searchCatalog } from "../cardCatalog";
import type { ScenarioCard, ScenarioDefinition } from "../scenario";
import { TextField } from "./fields";

const RESULT_LIMIT = 20;

type Props = {
  draft: ScenarioDefinition;
  queue: ScenarioCard[];
  onChange: (definition: ScenarioDefinition) => void;
  onChangeQueue: (queue: ScenarioCard[]) => void;
  onUpdate: () => void;
  onExecuteHordeTurn: () => void;
};

export function ScenarioPanel({ draft, queue, onChange, onChangeQueue, onUpdate, onExecuteHordeTurn }: Props) {
  const [query, setQuery] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number>();
  const [dropIndex, setDropIndex] = useState<number>();
  const results = useMemo(
    () => searchCatalog(query).filter((card) => card.side === "horde").slice(0, RESULT_LIMIT),
    [query],
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
      </section>

      <section className="playground-group playground-horde-turn">
        <header className="playground-group-head">
          <span className="playground-group-title">Horde turn</span>
          <span className="playground-group-badge">{queue.length} queued</span>
        </header>

        <div className="playground-horde-toolbar">
          <div className="playground-horde-search">
            <input
              className="playground-search"
              placeholder="Search Horde cards"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim() && (
              <ul className="playground-horde-search-results old-scrollbar">
                {results.map((card) => (
                  <li key={card.key}>
                    <button className="playground-result is-compact" type="button" onClick={() => addToQueue(card.definition.id)}>
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
          <button className="playground-button is-primary" type="button" onClick={onExecuteHordeTurn}>
            <Skull size={14} /> Execute
          </button>
        </div>

        {queue.length > 0 && (
          <ol className="playground-horde-queue old-scrollbar">
            {queue.map((entry, index) => {
              const card = searchCatalog(entry.definitionId).find(
                (candidate) => candidate.side === "horde" && candidate.definition.id === entry.definitionId,
              );
              return (
                <li
                  key={`${entry.definitionId}-${index}`}
                  className={[
                    "playground-library-entry",
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
                    className="playground-horde-grip"
                    draggable
                    title="Drag to reorder"
                    onDragStart={(event) => beginDrag(event, index)}
                    onDragEnd={finishDrag}
                  >
                    <GripVertical size={14} aria-hidden="true" />
                  </span>
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
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
