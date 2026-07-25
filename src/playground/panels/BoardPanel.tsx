import { Download, Eraser, FolderOpen, Save, Skull, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CardInstance } from "../../engine/GameTypes";
import { useGameStore } from "../../store/useGameStore";
import type { StoredBoard } from "../scenarioStorage";
import type { TimelineStep } from "../timeline";
import { ClearableInput } from "./fields";

type Props = {
  onDispatch: (step: TimelineStep) => void;
  onInvalid: (reason: string) => void;
  boards: StoredBoard[];
  initialName: string;
  onSaveBoard: (name: string) => void;
  onLoadBoard: (board: StoredBoard) => void;
  onExportBoard: (board: StoredBoard) => void;
  onImportBoard: (file: File) => void;
  onDeleteBoard: (id: string) => void;
};

export function BoardPanel({
  onDispatch,
  onInvalid,
  boards,
  initialName,
  onSaveBoard,
  onLoadBoard,
  onExportBoard,
  onImportBoard,
  onDeleteBoard,
}: Props) {
  const game = useGameStore((state) => state.game);
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const [name, setName] = useState(initialName);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(initialName), [initialName]);

  const handCard = game.player.hand.find((card) => card.instanceId === selectedHandId);
  const permanent = [...game.player.battlefield, ...game.horde.battlefield].find(
    (card) => card.instanceId === (selectedPlayerCreatureId ?? selectedHordeCreatureId),
  );
  const target = permanent ?? handCard;

  return (
    <div className="playground-panel">
      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Saved boards</span>
          <span className="playground-group-badge">{boards.length} stored</span>
        </header>
        <div className="playground-save-row">
          <ClearableInput className="playground-search" ariaLabel="Board name" value={name} onChange={setName} />
          <button
            className="playground-button is-primary"
            type="button"
            disabled={!name.trim()}
            onClick={() => onSaveBoard(name.trim())}
          >
            <Save size={13} /> Save
          </button>
        </div>
        <button className="playground-button" type="button" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Load JSON
        </button>
        <input
          ref={fileInput}
          className="playground-file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportBoard(file);
            event.target.value = "";
          }}
        />
        {boards.length > 0 && (
          <ul className="playground-library-list">
            {boards.map((board) => (
              <li key={board.id} className="playground-library-entry">
                <div className="playground-library-info">
                  <strong>{board.name}</strong>
                  <span>{board.definition.zones.playerHand?.reduce((total, card) => total + (card.amount ?? 1), 0) ?? 0} hand · {
                    (board.definition.zones.playerBattlefield?.reduce((total, card) => total + (card.amount ?? 1), 0) ?? 0) +
                    (board.definition.zones.hordeBattlefield?.reduce((total, card) => total + (card.amount ?? 1), 0) ?? 0)
                  } field</span>
                </div>
                <div className="playground-library-actions">
                  <button className="playground-compact-button" type="button" onClick={() => onLoadBoard(board)}>
                    <FolderOpen size={12} /> Load
                  </button>
                  <button className="playground-compact-button" type="button" onClick={() => onExportBoard(board)}>
                    <Download size={12} /> JSON
                  </button>
                  <button className="playground-icon-button" type="button" title="Delete board" onClick={() => onDeleteBoard(board.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Selected</span>
        </header>
        <SelectionLine label="On board" card={permanent} />
        <SelectionLine label="In hand" card={handCard} />

        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={!permanent}
            onClick={() =>
              permanent
                ? onDispatch({ kind: "destroy", cardId: permanent.instanceId, cardName: permanent.name })
                : onInvalid("Select a permanent on the board first.")
            }
          >
            <Skull size={14} /> Kill it
          </button>
          <button
            className="playground-button"
            type="button"
            disabled={!target}
            onClick={() =>
              target
                ? onDispatch({ kind: "toGraveyard", cardId: target.instanceId, cardName: target.name })
                : onInvalid("Select a card on the board or in hand first.")
            }
          >
            <Trash2 size={14} /> Remove it
          </button>
        </div>
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Wipe</span>
        </header>
        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={game.player.battlefield.length === 0}
            onClick={() => onDispatch({ kind: "clearBattlefield", side: "player" })}
          >
            <Eraser size={14} /> Your board ({game.player.battlefield.length})
          </button>
          <button
            className="playground-button"
            type="button"
            disabled={game.horde.battlefield.length === 0}
            onClick={() => onDispatch({ kind: "clearBattlefield", side: "horde" })}
          >
            <Eraser size={14} /> Horde board ({game.horde.battlefield.length})
          </button>
        </div>
      </section>
    </div>
  );
}

function SelectionLine({ label, card }: { label: string; card?: CardInstance }) {
  return (
    <div className={`playground-selection-line ${card ? "" : "is-empty"}`}>
      <span>{label}</span>
      <strong>{card ? card.name : "nothing selected"}</strong>
    </div>
  );
}
