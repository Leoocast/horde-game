import { useEffect, useState, useSyncExternalStore } from "react";
import {
  guidedBeatBarrier,
  guidedPresentationActivity,
  guidedPresentationBlockers,
  guidedSessionStore,
} from "../../guidance";
import { gameplaySignalStream } from "../../guidance/gameplaySignals";
import {
  contextualConceptRegistry,
  contextualTutorialRuntime,
} from "../../guidance/contextualProductRuntime";
import { useGameStore } from "../../store/useGameStore";
import {
  CONTEXTUAL_GUIDANCE_LAB_CONCEPTS,
  CONTEXTUAL_GUIDANCE_LAB_SCOPE,
} from "../contextualGuidanceLab";

const subscribeSession = (listener: () => void) => guidedSessionStore.subscribe(listener);
const readSession = () => guidedSessionStore.snapshot();
const subscribeActivity = (listener: () => void) => guidedPresentationActivity.subscribe(listener);
const readActivity = () => guidedPresentationActivity.snapshot();
const subscribeBarrier = (listener: () => void) => guidedBeatBarrier.subscribe(listener);
const readBarrier = () => guidedBeatBarrier.snapshot();
const subscribeContextual = (listener: () => void) => contextualTutorialRuntime.subscribe(listener);
const readContextual = () => contextualTutorialRuntime.snapshot();

export function GuidanceLabPanel({ onStart, onStop }: { onStart: () => void; onStop: () => void }) {
  const gameStore = useGameStore();
  const session = useSyncExternalStore(subscribeSession, readSession, readSession);
  const activity = useSyncExternalStore(subscribeActivity, readActivity, readActivity);
  const barrier = useSyncExternalStore(subscribeBarrier, readBarrier, readBarrier);
  const contextual = useSyncExternalStore(subscribeContextual, readContextual, readContextual);
  const [preventiveArmed, setPreventiveArmed] = useState(false);
  const blockers = guidedPresentationBlockers(gameStore, activity);
  const allowedIntent = session.currentStep?.kind === "act" ? session.currentStep.allowedIntent : undefined;

  useEffect(() => {
    contextualConceptRegistry.setScope(
      CONTEXTUAL_GUIDANCE_LAB_SCOPE,
      preventiveArmed ? CONTEXTUAL_GUIDANCE_LAB_CONCEPTS : CONTEXTUAL_GUIDANCE_LAB_CONCEPTS.slice(0, 2),
    );
    return () => contextualConceptRegistry.clearScope(CONTEXTUAL_GUIDANCE_LAB_SCOPE);
  }, [preventiveArmed]);

  useEffect(() => () => {
    contextualTutorialRuntime.rollbackProvisional();
    contextualTutorialRuntime.setProgressMode("immediate");
  }, []);

  const resetContextualFixture = () => {
    onStop();
    contextualTutorialRuntime.rollbackProvisional();
    contextualTutorialRuntime.beginSession(gameplaySignalStream.snapshot().sessionId, "provisional");
  };

  const emitReserve = () => {
    resetContextualFixture();
    gameplaySignalStream.publish({ kind: "player.reserveReleased", amount: 3 });
  };

  const emitStabilizing = () => {
    const cardId = gameStore.game.player.field[0]?.instanceId ?? gameStore.game.player.hand[0]?.instanceId;
    if (!cardId) return;
    resetContextualFixture();
    gameplaySignalStream.publish({
      kind: "action.denied",
      intent: { kind: "combat.toggleAttacker", cardId, selected: true },
      code: "STABILIZING",
      reason: "Synthetic Guidance Lab rejection.",
    });
  };

  const emitSimultaneous = () => {
    const cardId = gameStore.game.player.field[0]?.instanceId ?? gameStore.game.player.hand[0]?.instanceId;
    if (!cardId) return;
    resetContextualFixture();
    gameplaySignalStream.publish({ kind: "player.reserveReleased", amount: 3 });
    gameplaySignalStream.publish({
      kind: "action.denied",
      intent: { kind: "combat.toggleAttacker", cardId, selected: true },
      code: "STABILIZING",
      reason: "Synthetic Guidance Lab rejection.",
    });
  };

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
          <button data-guided-system-control="true" className="playground-button is-primary" type="button" onClick={onStart}>
            {session.status === "running" ? "Restart fixture" : "Start fixture"}
          </button>
          {session.status === "running" && (
            <button data-guided-system-control="true" className="playground-button" type="button" onClick={onStop}>
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
          {session.mode === "explain" && <div className="playground-empty">Read, then use the callout on the Board.</div>}
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

      <section className="playground-group">
        <header className="playground-group-head">
          <span className="playground-group-title">Contextual runtime</span>
          <span className="playground-group-badge">{contextual.status}</span>
        </header>
        <p className="playground-empty">
          Synthetic semantic signals exercise priority, dedupe and the non-blocking callout on the real Board.
        </p>
        <dl className="playground-guidance-readout">
          <div><dt>Active</dt><dd>{contextual.active?.conceptId ?? "—"}</dd></div>
          <div><dt>Queue</dt><dd>{contextual.queue.join(", ") || "—"}</dd></div>
          <div><dt>Ledger</dt><dd>{contextual.provisionalConcepts.join(", ") || "—"}</dd></div>
        </dl>
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={emitReserve}>Emit Reserve</button>
          <button className="playground-button" type="button" onClick={emitStabilizing}>Emit rejection</button>
          <button className="playground-button is-primary" type="button" onClick={emitSimultaneous}>Emit both</button>
        </div>
        <div className="playground-button-row">
          <button
            className={`playground-button ${preventiveArmed ? "is-primary" : ""}`}
            type="button"
            onClick={() => {
              resetContextualFixture();
              setPreventiveArmed((armed) => !armed);
            }}
          >
            {preventiveArmed ? "Preventive armed" : "Arm preventive"}
          </button>
          <button className="playground-button" type="button" onClick={resetContextualFixture}>Reset context</button>
        </div>
      </section>
    </div>
  );
}
