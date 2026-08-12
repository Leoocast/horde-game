import { useSyncExternalStore } from "react";
import {
  guidedBeatBarrier,
  guidedPresentationActivity,
  guidedPresentationBlockers,
  guidedSessionStore,
} from "../../guidance";
import { useGameStore } from "../../store/useGameStore";

const subscribeSession = (listener: () => void) => guidedSessionStore.subscribe(listener);
const readSession = () => guidedSessionStore.snapshot();
const subscribeActivity = (listener: () => void) => guidedPresentationActivity.subscribe(listener);
const readActivity = () => guidedPresentationActivity.snapshot();
const subscribeBarrier = (listener: () => void) => guidedBeatBarrier.subscribe(listener);
const readBarrier = () => guidedBeatBarrier.snapshot();

export function GuidanceLabPanel({ onStart }: { onStart: () => void }) {
  const gameStore = useGameStore();
  const session = useSyncExternalStore(subscribeSession, readSession, readSession);
  const activity = useSyncExternalStore(subscribeActivity, readActivity, readActivity);
  const barrier = useSyncExternalStore(subscribeBarrier, readBarrier, readBarrier);
  const blockers = guidedPresentationBlockers(gameStore, activity);
  const allowedIntent = session.currentStep?.kind === "act" ? session.currentStep.allowedIntent : undefined;
  const terminalExplanation = session.mode === "explain" && !session.currentStep?.nextStepId;

  return (
    <div className="playground-panel">
      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Guidance session</span>
          <span className="playground-group-badge">{session.status}</span>
        </header>
        <p className="playground-empty">
          Technical fixture over the real Board. It tests pause, one allowed intent and visual
          settlement; it is not the authored First Seed.
        </p>
        <div className="playground-button-row">
          <button className="playground-button is-primary" type="button" onClick={onStart}>
            {session.status === "running" ? "Restart fixture" : "Start fixture"}
          </button>
          {session.status === "running" && session.mode === "explain" && (
            <button
              className="playground-button"
              type="button"
              disabled={!session.canContinue}
              onClick={() => guidedSessionStore.continueExplanation()}
            >
              {terminalExplanation ? "Finish fixture" : "Continue"}
            </button>
          )}
          {session.status === "running" && (
            <button className="playground-button" type="button" onClick={() => guidedSessionStore.stop()}>
              Stop
            </button>
          )}
        </div>
      </section>

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Checkpoint</span>
          <span className="playground-group-badge">{session.presentationSettled ? "settled" : "waiting"}</span>
        </header>
        <dl className="playground-guidance-readout">
          <div><dt>Step</dt><dd>{session.currentStep?.id ?? "—"}</dd></div>
          <div><dt>Mode</dt><dd>{session.mode ?? "—"}</dd></div>
          <div><dt>Barrier</dt><dd>{barrier.blocked ? "blocked" : "open"}</dd></div>
          <div><dt>Held beats</dt><dd>{barrier.pending.length}</dd></div>
          <div><dt>Visual tokens</dt><dd>{activity.activeCount}</dd></div>
          <div><dt>Receipt cursor</dt><dd>{session.receiptCursor}</dd></div>
        </dl>
        {blockers.length > 0 && (
          <div className="playground-empty">Waiting for: {blockers.join(", ")}</div>
        )}
      </section>

      {session.status === "running" && (
        <section className="playground-group">
          <header className="playground-group-head">
            <span className="playground-group-title">Expected interaction</span>
            <span className="playground-group-badge">{session.mode}</span>
          </header>
          {session.mode === "explain" && <div className="playground-empty">Read, then use Continue.</div>}
          {session.mode === "act" && (
            <div className="playground-empty">
              Use the real Board: {allowedIntent?.kind ?? "—"}
              {allowedIntent?.cardAlias ? ` · ${allowedIntent.cardAlias}` : ""}.
            </div>
          )}
          {session.mode === "observe" && (
            <div className="playground-empty">Input is locked while the accepted action settles.</div>
          )}
        </section>
      )}

      {session.status === "aborted" && (
        <section className="playground-group">
          <header className="playground-group-head">
            <span className="playground-group-title">Session ended</span>
            <span className="playground-group-badge">{session.endReason}</span>
          </header>
          {session.errorMessage && <div className="playground-empty">{session.errorMessage}</div>}
        </section>
      )}
    </div>
  );
}
