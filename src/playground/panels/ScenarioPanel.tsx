import { Swords, X } from "lucide-react";
import type { ReactNode } from "react";
import { hordeInspectableDecks, playerInspectableDecks } from "../../data/deckCatalog";
import { MAX_PLAYER_LANDS } from "../../engine/GameRules";
import type { DifficultyMode, GameMode, Phase, Side } from "../../engine/GameTypes";
import { STORED_MANA_CAP } from "../../engine/ManaSystem";
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

type Props = {
  draft: ScenarioDefinition;
  startedFrom?: ScenarioDefinition;
  dirty: boolean;
  matchSetupTurns: number;
  onChange: (definition: ScenarioDefinition) => void;
  onChangeMatchSetupTurns: (turns: number) => void;
  onStartMatch: () => void;
};

export function ScenarioPanel({
  draft,
  startedFrom,
  dirty,
  matchSetupTurns,
  onChange,
  onChangeMatchSetupTurns,
  onStartMatch,
}: Props) {
  const patch = (changes: Partial<ScenarioDefinition>) => onChange({ ...draft, ...changes });
  const patchPlayer = (changes: Partial<ScenarioDefinition["player"]>) => patch({ player: { ...draft.player, ...changes } });

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
    <div className="playground-panel">
      {dirty && startedFrom && (
        <p className="playground-note is-warning">
          This form changed after the scenario started. <strong>Restart</strong> replays what was
          started; <strong>Start scenario</strong> adopts the edits.
        </p>
      )}

      <Group title="Identity" hint="The seed drives every shuffle and reveal — the same seed always replays the same run.">
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
      </Group>

      {/* The playground exists to skip straight to a board state, but sometimes the bug only shows up
          in a real run. This starts an ordinary match — opening hand, setup turns and all — with the
          decks and seed above, and keeps the dock available on top of it. */}
      <Group
        title="Play a real match"
        hint="A normal game with the identity above: opening hand, mulligans and setup turns, exactly like the main menu. The scenario fields below are ignored."
      >
        <div className="playground-grid-2">
          <NumberField label="Setup turns" value={matchSetupTurns} min={0} max={10} onChange={onChangeMatchSetupTurns} />
          <div className="playground-field">
            <span>&nbsp;</span>
            <button className="playground-button is-primary is-tall" type="button" onClick={onStartMatch}>
              <Swords size={14} /> Start match
            </button>
          </div>
        </div>
      </Group>

      <Group title="Turn" hint="Where the scenario board picks up when it starts.">
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
      </Group>

      {/* One resource, shown as energy: untapped lands are available energy, the pool is stored
          energy. There is nothing per-color for the player to see, so there is nothing per-color
          to configure here. */}
      <Group
        title="Player"
        hint={`Energy sources are untapped lands (max ${MAX_PLAYER_LANDS}); stored energy is the reserve that carries over (max ${STORED_MANA_CAP}).`}
      >
        <NumberField label="Life" value={draft.player.life} onChange={(life) => patchPlayer({ life })} />
        <div className="playground-grid-2">
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

      <Group title="Horde" hint="The Horde has no life total: it loses by milling out. Its library is the deck minus whatever this scenario places elsewhere.">
        <NumberField
          label="Poison counters"
          value={draft.horde.poisonCounters}
          onChange={(poisonCounters) => patch({ horde: { ...draft.horde, poisonCounters } })}
        />
      </Group>

      <Group title="Zones" hint="Add cards from the Cards tab, then start the scenario to apply them.">
        {SCENARIO_ZONES.every((zone) => (draft.zones[zone.id] ?? []).length === 0) ? (
          <p className="playground-note">No cards placed yet.</p>
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
      </Group>
    </div>
  );
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
