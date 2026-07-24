import { Download, FlaskConical, FolderOpen, Save, Swords, Trash2, Upload } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { hordeInspectableDecks, playerInspectableDecks } from "../../data/deckCatalog";
import { MAX_PLAYER_LANDS } from "../../engine/GameRules";
import type { DifficultyMode, GameMode, Phase, Side } from "../../engine/GameTypes";
import { STORED_MANA_CAP } from "../../engine/ManaSystem";
import { useGameStore } from "../../store/useGameStore";
import type { StoredScenario } from "../scenarioStorage";
import type { ScenarioDefinition } from "../scenario";
import { NumberField, SelectField, TextField } from "./fields";

const PHASES: Array<{ value: Phase; label: string }> = [
  { value: "untap", label: "Untap" },
  { value: "draw", label: "Draw" },
  { value: "main", label: "Main" },
  { value: "combat", label: "Combat" },
  { value: "end", label: "End" },
  { value: "horde", label: "Horde" },
];

type Mode = "board" | "game";

type Props = {
  draft: ScenarioDefinition;
  mode: Mode;
  startedFrom?: ScenarioDefinition;
  dirty: boolean;
  setupTurns: number;
  library: StoredScenario[];
  onChangeMode: (mode: Mode) => void;
  onChange: (definition: ScenarioDefinition) => void;
  onChangeSetupTurns: (turns: number) => void;
  onSave: () => void;
  onLoad: (entry: StoredScenario) => void;
  onDelete: (id: string) => void;
  onExport: (entry: StoredScenario) => void;
  onImport: (file: File) => void;
};

/**
 * Two jobs behind one tab, and only one of them on screen at a time. The lab and a real match need
 * almost disjoint settings — difficulty, deck choice and setup turns mean nothing to a hand-built
 * board — and showing both at once made the lab look like a game you were configuring wrong.
 */
export function ScenarioPanel({
  draft,
  mode,
  startedFrom,
  dirty,
  setupTurns,
  library,
  onChangeMode,
  onChange,
  onChangeSetupTurns,
  onSave,
  onLoad,
  onDelete,
  onExport,
  onImport,
}: Props) {
  const patch = (changes: Partial<ScenarioDefinition>) => onChange({ ...draft, ...changes });
  const patchPlayer = (changes: Partial<ScenarioDefinition["player"]>) => patch({ player: { ...draft.player, ...changes } });

  return (
    <div className="playground-panel">
      <div className="playground-modeswitch" role="group" aria-label="What this dock is set up for">
        <button
          className={`playground-modeswitch-button ${mode === "board" ? "is-active" : ""}`}
          type="button"
          onClick={() => onChangeMode("board")}
        >
          <FlaskConical size={13} /> Lab
        </button>
        <button
          className={`playground-modeswitch-button ${mode === "game" ? "is-active" : ""}`}
          type="button"
          onClick={() => onChangeMode("game")}
        >
          <Swords size={13} /> Real game
        </button>
      </div>

      {mode === "board" ? (
        <>
          <p className="playground-hint">
            A bench, not a match. You place cards, watch what they do and wipe the table. Decks,
            difficulty and opening hands belong to <strong>Real game</strong> — none of them apply here.
          </p>

          {dirty && startedFrom && (
            <p className="playground-note is-warning">
              These settings changed since the board was built. <strong>Restart</strong> replays what
              was launched; <strong>Build board</strong> adopts the edits.
            </p>
          )}

          <Group title="Starting state" hint="Where Build board drops you.">
            <TextField label="Name" value={draft.name} onChange={(name) => patch({ name })} />
            <div className="playground-grid-2">
              <SelectField
                label="Active side"
                value={draft.activeSide}
                options={[
                  { value: "player" as Side, label: "Player" },
                  { value: "horde" as Side, label: "Horde" },
                ]}
                onChange={(activeSide) => patch({ activeSide })}
              />
              <SelectField label="Phase" value={draft.phase} options={PHASES} onChange={(phase) => patch({ phase })} />
              <NumberField label="Turn" value={draft.turnNumber} min={1} onChange={(turnNumber) => patch({ turnNumber })} />
              <NumberField label="Horde turn" value={draft.hordeTurnNumber} onChange={(hordeTurnNumber) => patch({ hordeTurnNumber })} />
              <NumberField label="Life" value={draft.player.life} onChange={(life) => patchPlayer({ life })} />
              <NumberField
                label="Poison"
                value={draft.horde.poisonCounters}
                onChange={(poisonCounters) => patch({ horde: { ...draft.horde, poisonCounters } })}
              />
              {/* One resource, shown as energy: untapped lands are available energy, the pool is the
                  stored reserve. Nothing per-color is ever shown to the player, so nothing
                  per-color is configured here. */}
              <NumberField
                label="Energy sources"
                value={draft.player.energy}
                min={0}
                max={MAX_PLAYER_LANDS}
                onChange={(energy) => patchPlayer({ energy })}
              />
              <NumberField
                label="Stored energy"
                value={draft.player.storedEnergy}
                min={0}
                max={STORED_MANA_CAP}
                onChange={(storedEnergy) => patchPlayer({ storedEnergy })}
              />
            </div>
          </Group>

          <BoardContents />

          <Library
            library={library}
            onSave={onSave}
            onLoad={onLoad}
            onDelete={onDelete}
            onExport={onExport}
            onImport={onImport}
          />
        </>
      ) : (
        <>
          <p className="playground-hint">
            An ordinary match: opening hand, mulligans, setup turns, the real Horde. Everything the
            main menu would ask you, asked here, with the dock still on top of it.
          </p>

          <Group title="Match" hint="The seed drives every shuffle and reveal: the same seed always replays the same run.">
            <TextField label="Seed" value={draft.seed} onChange={(seed) => patch({ seed })} />
            <div className="playground-grid-2">
              <SelectField
                label="Player deck"
                value={draft.playerDeckId}
                options={playerInspectableDecks.map((deck) => ({ value: deck.id, label: deck.label }))}
                onChange={(playerDeckId) => patch({ playerDeckId })}
              />
              <SelectField
                label="Horde deck"
                value={draft.hordeDeckId}
                options={hordeInspectableDecks.map((deck) => ({ value: deck.id, label: deck.label }))}
                onChange={(hordeDeckId) => patch({ hordeDeckId })}
              />
              <SelectField
                label="Difficulty"
                value={draft.difficulty}
                options={[
                  { value: "easy" as DifficultyMode, label: "Easy" },
                  { value: "normal" as DifficultyMode, label: "Normal" },
                  { value: "hard" as DifficultyMode, label: "Hard" },
                ]}
                onChange={(difficulty) => patch({ difficulty })}
              />
              <SelectField
                label="Game mode"
                value={draft.gameMode}
                options={[
                  { value: "standard" as GameMode, label: "Standard" },
                  { value: "chaos" as GameMode, label: "Chaos" },
                ]}
                onChange={(gameMode) => patch({ gameMode })}
              />
            </div>
            <NumberField label="Setup turns" value={setupTurns} min={0} max={10} onChange={onChangeSetupTurns} />
          </Group>
        </>
      )}
    </div>
  );
}

function Library({
  library,
  onSave,
  onLoad,
  onDelete,
  onExport,
  onImport,
}: Pick<Props, "library" | "onSave" | "onLoad" | "onDelete" | "onExport" | "onImport">) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">Saved boards</span>
        {library.length > 0 && <span className="playground-group-badge">{library.length} stored</span>}
      </header>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={onSave} title="Stores the board exactly as it is right now">
          <Save size={13} /> Save board
        </button>
        <button className="playground-button" type="button" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Import
        </button>
      </div>
      <input
        ref={fileInput}
        className="playground-file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          // Reset so importing the same file twice still fires a change event.
          event.target.value = "";
        }}
      />
      {library.length === 0 ? (
        <p className="playground-hint">Save takes a snapshot of the live board — cards, life, energy, turn — under the name above.</p>
      ) : (
        <ul className="playground-library-list">
          {library.map((entry) => (
            <li key={entry.id} className="playground-library-entry">
              <div className="playground-library-info">
                <strong>{entry.name}</strong>
                <span>
                  {new Date(entry.savedAt).toLocaleString()} · {entry.steps.length} step{entry.steps.length === 1 ? "" : "s"}
                </span>
              </div>
              <button className="playground-icon-button" type="button" title="Load" onClick={() => onLoad(entry)}>
                <FolderOpen size={13} />
              </button>
              <button className="playground-icon-button" type="button" title="Export as JSON" onClick={() => onExport(entry)}>
                <Download size={13} />
              </button>
              <button className="playground-icon-button" type="button" title="Delete" onClick={() => onDelete(entry.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What is actually on the board right now, read live from the store. It used to be an editable
 *  list belonging to a separate draft, which is why placing a card never showed up here — the two
 *  were different objects. There is only one board now, and this is a window onto it. */
function BoardContents() {
  const game = useGameStore((state) => state.game);
  const zones: Array<{ label: string; cards: Array<{ definitionId: string; name: string; tapped?: boolean }> }> = [
    { label: "Your hand", cards: game.player.hand },
    { label: "Your battlefield", cards: game.player.battlefield },
    { label: "Your graveyard", cards: game.player.graveyard },
    { label: "Horde battlefield", cards: game.horde.battlefield },
    { label: "Horde graveyard", cards: game.horde.graveyard },
  ];
  const filled = zones.filter((zone) => zone.cards.length > 0);

  return (
    <section className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">On the board</span>
        <span className="playground-group-badge">live</span>
      </header>
      {filled.length === 0 ? (
        <p className="playground-note">Nothing in play. Add cards from the Cards tab.</p>
      ) : (
        filled.map((zone) => (
          <div key={zone.label} className="playground-zone">
            <div className="playground-zone-title">
              {zone.label} · {zone.cards.length}
            </div>
            {summarise(zone.cards).map((line) => (
              <div key={line.key} className="playground-zone-entry">
                <span className="playground-zone-amount is-static">{line.amount}</span>
                <span className="playground-zone-name">{line.name}</span>
                {line.tapped && <span className="playground-zone-flag">tapped</span>}
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}

function summarise(cards: Array<{ definitionId: string; name: string; tapped?: boolean }>) {
  const groups = new Map<string, { key: string; name: string; amount: number; tapped?: boolean }>();
  for (const card of cards) {
    const key = `${card.definitionId}:${card.tapped ? "t" : ""}`;
    const existing = groups.get(key);
    if (existing) existing.amount += 1;
    else groups.set(key, { key, name: card.name, amount: 1, tapped: card.tapped });
  }
  return [...groups.values()];
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">{title}</span>
      </header>
      {children}
      {hint && <p className="playground-hint">{hint}</p>}
    </section>
  );
}
