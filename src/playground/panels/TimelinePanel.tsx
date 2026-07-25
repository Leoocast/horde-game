import { Circle, FolderOpen, Pause, Play, Save, SkipForward, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { StoredReplay } from "../scenarioStorage";
import { describeStep, type TimelineStep } from "../timeline";
import { ClearableInput } from "./fields";

type Props = {
  steps: TimelineStep[];
  recording: boolean;
  cursor?: number;
  autoPlaying: boolean;
  canReplay: boolean;
  replays: StoredReplay[];
  onToggleRecording: () => void;
  onRemoveStep: (index: number) => void;
  onClear: () => void;
  onStepOnce: () => void;
  onToggleAuto: () => void;
  onStopReplay: () => void;
  onSaveReplay: (name: string) => void;
  onLoadReplay: (replay: StoredReplay) => void;
  onDeleteReplay: (id: string) => void;
};

export function TimelinePanel({
  steps,
  recording,
  cursor,
  autoPlaying,
  canReplay,
  replays,
  onToggleRecording,
  onRemoveStep,
  onClear,
  onStepOnce,
  onToggleAuto,
  onStopReplay,
  onSaveReplay,
  onLoadReplay,
  onDeleteReplay,
}: Props) {
  const replaying = cursor !== undefined;
  const [name, setName] = useState("Untitled replay");

  return (
    <div className="playground-panel">
      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Saved replays</span>
          <span className="playground-group-badge">{replays.length} stored</span>
        </header>
        <div className="playground-save-row">
          <ClearableInput className="playground-search" ariaLabel="Replay name" value={name} onChange={setName} />
          <button
            className="playground-button is-primary"
            type="button"
            disabled={!name.trim() || steps.length === 0}
            onClick={() => onSaveReplay(name.trim())}
          >
            <Save size={13} /> Save
          </button>
        </div>
        {replays.length > 0 && (
          <ul className="playground-library-list">
            {replays.map((replay) => (
              <li key={replay.id} className="playground-library-entry">
                <div className="playground-library-info">
                  <strong>{replay.name}</strong>
                  <span>{replay.steps.length} step{replay.steps.length === 1 ? "" : "s"}</span>
                </div>
                <div className="playground-library-actions">
                  <button className="playground-compact-button" type="button" onClick={() => onLoadReplay(replay)}>
                    <FolderOpen size={12} /> Load
                  </button>
                  <button className="playground-icon-button" type="button" title="Delete replay" onClick={() => onDeleteReplay(replay.id)}>
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
          <span className="playground-group-title">Record</span>
          <span className="playground-group-badge">{recording ? "on" : "off"}</span>
        </header>
        <div className="playground-button-row">
          <button className={`playground-button ${recording ? "is-recording" : ""}`} type="button" onClick={onToggleRecording}>
            <Circle size={12} /> {recording ? "Recording" : "Record"}
          </button>
          <button className="playground-button" type="button" onClick={onClear} disabled={steps.length === 0}>
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Replay</span>
          {replaying && <span className="playground-group-badge">{cursor ?? 0}/{steps.length}</span>}
        </header>
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={onStepOnce} disabled={!canReplay || autoPlaying}>
            <SkipForward size={13} /> Step
          </button>
          <button className="playground-button is-primary" type="button" onClick={onToggleAuto} disabled={!canReplay}>
            {autoPlaying ? <Pause size={13} /> : <Play size={13} />} {autoPlaying ? "Pause" : "Auto"}
          </button>
          {replaying && (
            <button className="playground-button" type="button" onClick={onStopReplay}>
              Stop
            </button>
          )}
        </div>
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Steps</span>
          <span className="playground-group-badge">{steps.length} recorded</span>
        </header>
        {steps.length === 0 ? (
          <div className="playground-empty">Nothing recorded yet.</div>
        ) : (
          <ol className="playground-steps">
            {steps.map((step, index) => (
              <li
                key={index}
                className={[
                  "playground-step",
                  replaying && index < (cursor ?? 0) ? "is-done" : "",
                  replaying && index === cursor ? "is-current" : "",
                ].join(" ")}
              >
                <span className="playground-step-index">{index + 1}</span>
                <span className="playground-step-label">{describeStep(step)}</span>
                <button
                  className="playground-icon-button"
                  type="button"
                  title="Remove step"
                  disabled={replaying}
                  onClick={() => onRemoveStep(index)}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
