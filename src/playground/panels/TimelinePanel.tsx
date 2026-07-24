import { Circle, Pause, Play, SkipForward, Trash2, X } from "lucide-react";
import { describeStep, type TimelineStep } from "../timeline";

type Props = {
  steps: TimelineStep[];
  recording: boolean;
  /** Index of the step replay will run next; undefined when no replay session is active. */
  cursor?: number;
  autoPlaying: boolean;
  canReplay: boolean;
  onToggleRecording: () => void;
  onRemoveStep: (index: number) => void;
  onClear: () => void;
  onStepOnce: () => void;
  onToggleAuto: () => void;
  onStopReplay: () => void;
};

export function TimelinePanel({
  steps,
  recording,
  cursor,
  autoPlaying,
  canReplay,
  onToggleRecording,
  onRemoveStep,
  onClear,
  onStepOnce,
  onToggleAuto,
  onStopReplay,
}: Props) {
  const replaying = cursor !== undefined;

  return (
    <div className="playground-panel">
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
        <p className="playground-hint">
          Every action taken from this dock is recorded. Dragging a card on the board is not — that
          still has to be done by hand on each run.
        </p>
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Replay</span>
          {replaying && <span className="playground-group-badge">{(cursor ?? 0)}/{steps.length}</span>}
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
        <p className="playground-hint">
          Replay restarts whatever is on the board from its own definition and runs the steps in
          order, waiting for each one's animations. Nothing is recorded while replaying.
        </p>
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Steps</span>
          <span className="playground-group-badge">{steps.length} recorded</span>
        </header>
        {steps.length === 0 ? (
          <p className="playground-note">Nothing recorded yet.</p>
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
