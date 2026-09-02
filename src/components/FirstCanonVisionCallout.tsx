import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { firstCanonVisionDirector } from "../guidance/firstCanonVision";
import { contextualTutorialRuntime } from "../guidance/contextualProductRuntime";
import { runGuidedSystemAction } from "../guidance/interactionGate";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { AnchoredGoldenFrame } from "./AnchoredGoldenFrame";

const subscribeFirstCanon = (listener: () => void) => firstCanonVisionDirector.subscribe(listener);
const readFirstCanon = () => firstCanonVisionDirector.snapshot();
const subscribeContextual = (listener: () => void) => contextualTutorialRuntime.subscribe(listener);
const readContextual = () => contextualTutorialRuntime.snapshot();

export function FirstCanonVisionCallout() {
  const t = useTranslation();
  const snapshot = useSyncExternalStore(subscribeFirstCanon, readFirstCanon, readFirstCanon);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const narration = snapshot.narration;
  const boardNarration = narration && (
    snapshot.stage === "preparation-intro"
    || snapshot.stage === "preparation-energy"
    || snapshot.stage === "host-awakening-warning"
  );

  useEffect(() => {
    if (!boardNarration) return;
    const frame = window.requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [boardNarration, snapshot.stage]);

  if (typeof document === "undefined") return null;

  const frame = snapshot.stage === "await-mulligan"
    ? <AnchoredGoldenFrame target={{ kind: "surface", anchor: "opening.mulliganAction", padding: 6 }} />
    : boardNarration && narration.anchor
      ? <AnchoredGoldenFrame target={{ kind: "surface", anchor: narration.anchor, padding: 7 }} />
      : null;

  return createPortal(
    <>
      {frame}
      {boardNarration && narration && (
        <div className="first-canon-narration-layer" role="presentation">
          <section
            className="contextual-tutorial-callout first-canon-narration"
            role="dialog"
            aria-modal="true"
            aria-labelledby="first-canon-narration-title"
            aria-describedby="first-canon-narration-body"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              event.preventDefault();
              buttonRef.current?.focus({ preventScroll: true });
            }}
          >
            <span className="contextual-tutorial-mark" aria-hidden="true" />
            <h2 id="first-canon-narration-title">{t(narration.titleKey)}</h2>
            <div id="first-canon-narration-body" className="contextual-tutorial-body">
              <p>{t(narration.bodyKey)}</p>
            </div>
            <button
              ref={buttonRef}
              type="button"
              className="contextual-tutorial-acknowledge"
              onClick={() => {
                const result = firstCanonVisionDirector.acknowledge();
                if (!result.awakenHost) return;
                runGuidedSystemAction(() => useGameStore.getState().endPlayerTurn({ runHostAfter: true }));
              }}
            >
              {t("guided.contextual.understood")}
            </button>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}

export function PersistentContextualGoldenFrames() {
  const snapshot = useSyncExternalStore(subscribeContextual, readContextual, readContextual);
  if (typeof document === "undefined" || snapshot.persistentHighlights.length === 0) return null;
  return createPortal(
    <div className="persistent-contextual-golden-frames" aria-hidden="true">
      {snapshot.persistentHighlights.map((highlight, index) => highlight.kind === "card"
        ? <AnchoredGoldenFrame key={`${highlight.instanceId}:${index}`} target={{ kind: "card", instanceId: highlight.instanceId, padding: highlight.padding }} />
        : <AnchoredGoldenFrame key={`${highlight.anchor}:${index}`} target={{ kind: "surface", anchor: highlight.anchor, padding: highlight.padding }} />)}
    </div>,
    document.body,
  );
}
