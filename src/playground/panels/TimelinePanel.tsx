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
    <div className="playground-section">
      <div className="playground-button-row">
        <button className={`playground-button ${recording ? "is-recording" : ""}`} type="button" onClick={onToggleRecording}>
          <Circle size={12} /> {recording ? "Recording" : "Record"}
        </button>
        <button className="playground-button" type="button" onClick={onClear} disabled={steps.length === 0}>
          <Trash2 size={13} /> Clear
        </button>
      </div>

      <div className="playground-section-title">Replay</div>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={onStepOnce} disabled={!canReplay || autoPlaying}>
          <SkipForward size={13} /> Step
        </button>
        <button className="playground-button is-primary" type="button" onClick={onToggleAuto} disabled={!canReplay}>
          {autoPlaying ? <Pause size={13} /> : <Play size={13} />} {autoPlaying ? "Pause" : "Auto"}
        </button>
      </div>
      {replaying && (
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={onStopReplay}>
            Stop replay
          </button>
        </div>
      )}

      <p className="playground-note">
        Replay restarts the scenario from its start definition and runs the steps in order, waiting
        for each one's animations before the next. Nothing is recorded while replaying.
      </p>

      <div className="playground-section-title">Steps ({steps.length})</div>
      {steps.length === 0 ? (
        <p className="playground-note">Nothing recorded yet. Actions taken with recording on land here.</p>
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
    </div>
  );
}
