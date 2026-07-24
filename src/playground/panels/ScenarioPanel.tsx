import { Play, RotateCcw, X } from "lucide-react";
import { hordeInspectableDecks, playerInspectableDecks } from "../../data/deckCatalog";
import type { DifficultyMode, GameMode, Phase, Side } from "../../engine/GameTypes";
import { SCENARIO_ZONES, type ScenarioDefinition, type ScenarioZoneKey } from "../scenario";
import { NumberField, SelectField, TextField } from "./fields";

const PHASES: Array<{ value: Phase; label: string }> = [
  { value: "untap", label: "Untap" },
  { value: "draw", label: "Draw" },
  { value: "main", label: "Main" },
  { value: "combat", label: "Combat" },
  { value: "end", label: "End" },
  { value: "horde", label: "Horde" },
];

const MANA_COLORS = [
  { key: "green", label: "G" },
  { key: "red", label: "R" },
  { key: "blue", label: "U" },
  { key: "white", label: "W" },
  { key: "black", label: "B" },
  { key: "colorless", label: "C" },
] as const;

type Props = {
  draft: ScenarioDefinition;
  startedFrom?: ScenarioDefinition;
  dirty: boolean;
  onChange: (definition: ScenarioDefinition) => void;
  onStart: () => void;
  onRestart: () => void;
};

export function ScenarioPanel({ draft, startedFrom, dirty, onChange, onStart, onRestart }: Props) {
  const patch = (changes: Partial<ScenarioDefinition>) => onChange({ ...draft, ...changes });

  function removeZoneEntry(zone: ScenarioZoneKey, index: number) {
    const entries = [...(draft.zones[zone] ?? [])];
    entries.splice(index, 1);
    patch({ zones: { ...draft.zones, [zone]: entries } });
  }

  function setZoneAmount(zone: ScenarioZoneKey, index: number, amount: number) {
    const entries = [...(draft.zones[zone] ?? [])];
    entries[index] = { ...entries[index], amount: Math.max(1, amount) };
    patch({ zones: { ...draft.zones, [zone]: entries } });
  }

  return (
    <div className="playground-section">
      <div className="playground-button-row">
        <button className="playground-button is-primary" type="button" onClick={onStart}>
          <Play size={14} /> Start
        </button>
        <button className="playground-button" type="button" onClick={onRestart} disabled={!startedFrom}>
          <RotateCcw size={14} /> Restart
        </button>
      </div>
      {dirty && startedFrom && (
        <p className="playground-note is-warning">
          The draft changed since this scenario started. Restart replays the started definition; press
          Start to adopt the edits.
        </p>
      )}

      <div className="playground-section-title">Identity</div>
      <TextField label="Name" value={draft.name} onChange={(name) => patch({ name })} />
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
      </div>
      <div className="playground-grid-2">
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

      <div className="playground-section-title">Turn</div>
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
      </div>

      <div className="playground-section-title">Player</div>
      <NumberField label="Life" value={draft.player.life} onChange={(life) => patch({ player: { ...draft.player, life } })} />
      <div className="playground-field">
        <span>Mana pool</span>
        <div className="playground-mana-row">
          {MANA_COLORS.map((color) => (
            <label key={color.key} className="playground-mana-input">
              <span>{color.label}</span>
              <input
                type="number"
                min={0}
                value={draft.player.mana[color.key] ?? 0}
                onChange={(event) =>
                  patch({
                    player: {
                      ...draft.player,
                      mana: { ...draft.player.mana, [color.key]: Math.max(0, Number(event.target.value) || 0) },
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="playground-section-title">Horde</div>
      <NumberField
        label="Poison counters"
        value={draft.horde.poisonCounters}
        onChange={(poisonCounters) => patch({ horde: { ...draft.horde, poisonCounters } })}
      />
      <p className="playground-note">
        The Horde has no life total: it loses by milling out. Its library size is whatever the deck
        holds minus the cards this scenario places elsewhere.
      </p>

      <div className="playground-section-title">Zones</div>
      {SCENARIO_ZONES.every((zone) => (draft.zones[zone.id] ?? []).length === 0) ? (
        <p className="playground-note">Empty. Add cards from the Cards tab.</p>
      ) : (
        SCENARIO_ZONES.filter((zone) => (draft.zones[zone.id] ?? []).length > 0).map((zone) => (
          <div key={zone.id} className="playground-zone">
            <div className="playground-zone-title">{zone.label}</div>
            {(draft.zones[zone.id] ?? []).map((entry, index) => (
              <div key={`${entry.definitionId}-${index}`} className="playground-zone-entry">
                <input
                  className="playground-zone-amount"
                  type="number"
                  min={1}
                  value={entry.amount ?? 1}
                  onChange={(event) => setZoneAmount(zone.id, index, Number(event.target.value) || 1)}
                />
                <span className="playground-zone-name">{entry.definitionId}</span>
                {entry.tapped && <span className="playground-zone-flag">tapped</span>}
                <button className="playground-icon-button" type="button" title="Remove" onClick={() => removeZoneEntry(zone.id, index)}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
