import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../i18n/useTranslation";
import { GuidedTutorialDialog } from "./GuidedTutorialDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

export function LearnToPlayIntroModal({ open, onClose, onComplete }: Props) {
  const t = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const enterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) enterButtonRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

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
        title={t("guided.learnToPlay.intro.evy")}
        body={<p className="learn-to-play-intro-line">{t("guided.learnToPlay.intro.body")}</p>}
        isLearnToPlay
        ariaModal
        closeLabel={t("common.close")}
        onClose={onClose}
        showFeedback={false}
        titleId="learn-to-play-intro-speaker"
        bodyId="learn-to-play-intro-line"
        footer={(
          <footer className="learn-to-play-intro-footer">
            <button ref={enterButtonRef} className="guided-tutorial-continue" type="button" onClick={onComplete}>
              {t("guided.learnToPlay.intro.enter")}
            </button>
          </footer>
        )}
      />
    </div>,
    document.body,
  );
}
