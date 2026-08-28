import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../i18n/useTranslation";
import type { TranslationKey } from "../i18n/translations";
import { GuidedTutorialDialog } from "./GuidedTutorialDialog";

type Props = {
  open: boolean;
  chroniclerName: string;
  onClose: () => void;
  onComplete: () => void;
};

type IntroBeat = {
  speaker: "evy" | "chronicler";
  body: TranslationKey;
};

const INTRO_BEATS: readonly IntroBeat[] = [
  { speaker: "evy", body: "guided.learnToPlay.intro.beatOne" },
  { speaker: "chronicler", body: "guided.learnToPlay.intro.beatTwo" },
  { speaker: "chronicler", body: "guided.learnToPlay.intro.beatThree" },
  { speaker: "chronicler", body: "guided.learnToPlay.intro.beatFour" },
  { speaker: "evy", body: "guided.learnToPlay.intro.beatFive" },
];

export function LearnToPlayIntroModal({ open, chroniclerName, onClose, onComplete }: Props) {
  const t = useTranslation();
  const [beatIndex, setBeatIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const advanceButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setBeatIndex(0);
  }, [open]);

  useEffect(() => {
    if (open) advanceButtonRef.current?.focus();
  }, [beatIndex, open]);

  if (!open || typeof document === "undefined") return null;

  const beat = INTRO_BEATS[beatIndex];
  const finalBeat = beatIndex === INTRO_BEATS.length - 1;
  const speaker = beat.speaker === "evy"
    ? t("guided.learnToPlay.intro.evy")
    : chroniclerName.trim() || t("guided.learnToPlay.intro.chronicler");

  function advance() {
    if (finalBeat) {
      onComplete();
      return;
    }
    setBeatIndex((current) => current + 1);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []);
    if (focusable.length < 2) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="guided-tutorial-overlay is-learn-to-play learn-to-play-intro-overlay"
      data-mode="explain"
      role="presentation"
      onKeyDown={handleKeyDown}
    >
      <GuidedTutorialDialog
        calloutRef={dialogRef}
        className="learn-to-play-intro-dialog"
        style={{ position: "relative", top: "auto", left: "auto", width: "min(620px, calc(100vw - 48px))" }}
        title={speaker}
        body={(
          <>
            <span className="learn-to-play-intro-context">{t("guided.learnToPlay.intro.kicker")}</span>
            <p className="learn-to-play-intro-line" aria-live="polite">{t(beat.body)}</p>
          </>
        )}
        isLearnToPlay
        ariaModal
        closeLabel={t("common.close")}
        onClose={onClose}
        showFeedback={false}
        titleId="learn-to-play-intro-speaker"
        bodyId="learn-to-play-intro-line"
        footer={(
          <footer className="learn-to-play-intro-footer">
            <div className="learn-to-play-intro-progress">
              <span>
              {t("guided.learnToPlay.intro.progress", { current: beatIndex + 1, total: INTRO_BEATS.length })}
              </span>
              <div aria-hidden="true">
              {INTRO_BEATS.map((_, index) => (
                  <i key={index} className={index <= beatIndex ? "is-complete" : ""} />
              ))}
              </div>
            </div>
            <button ref={advanceButtonRef} className="guided-tutorial-continue" type="button" onClick={advance}>
              {t(finalBeat ? "guided.learnToPlay.intro.enter" : "guided.continue")}
            </button>
          </footer>
        )}
      />
    </div>,
    document.body,
  );
}
