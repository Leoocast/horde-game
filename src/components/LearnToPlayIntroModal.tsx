import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../i18n/useTranslation";
import type { TranslationKey } from "../i18n/translations";

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
      className="game-settings-popover game-home-backdrop fixed inset-0 z-[22000] flex items-center justify-center p-6 text-[#e4ddc2]"
      role="presentation"
      onKeyDown={handleKeyDown}
    >
      <section
        ref={dialogRef}
        className="old-panel game-dialog game-home-dialog w-full max-w-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-to-play-intro-speaker"
        aria-describedby="learn-to-play-intro-line"
        aria-label={t("guided.learnToPlay.intro.ariaLabel")}
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="game-dialog-kicker">{t("guided.learnToPlay.intro.kicker")}</div>
            <h2 id="learn-to-play-intro-speaker" className="old-title mt-2 text-xl font-medium uppercase tracking-[0.08em]">
              {speaker}
            </h2>
          </div>
          <button className="game-header-button flex h-10 w-10 shrink-0 items-center justify-center" type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={19} />
          </button>
        </div>

        <p id="learn-to-play-intro-line" className="mt-6 min-h-20 text-base leading-relaxed text-[#c4ccc7]" aria-live="polite">
          {t(beat.body)}
        </p>

        <div className="mt-6 flex items-end justify-between gap-5 border-t border-[#8f7e4f]/30 pt-5">
          <div>
            <div className="game-dialog-kicker">
              {t("guided.learnToPlay.intro.progress", { current: beatIndex + 1, total: INTRO_BEATS.length })}
            </div>
            <div className="mt-3 flex gap-2" aria-hidden="true">
              {INTRO_BEATS.map((_, index) => (
                <span key={index} className={`h-1 w-8 ${index <= beatIndex ? "bg-[#c7aa69]" : "bg-[#53605b]"}`} />
              ))}
            </div>
          </div>
          <button ref={advanceButtonRef} className="guided-tutorial-continue" type="button" onClick={advance}>
            {t(finalBeat ? "guided.learnToPlay.intro.enter" : "guided.continue")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
