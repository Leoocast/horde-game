import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { DefeatShatterAnimator } from "./DefeatShatterAnimator";

type Props = Readonly<{
  game: GameState;
  snapshotImage?: HTMLImageElement;
}>;

const LEARN_TO_PLAY_NARRATIVE_DELAY_MS = 1_000;

/** The normal defeat remains intact; the authored narration and its CTA arrive afterward. */
export function LearnToPlayDefeatModal({ game, snapshotImage }: Props) {
  const t = useTranslation();
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [narrativeVisible, setNarrativeVisible] = useState(false);
  const [narrativeAcknowledged, setNarrativeAcknowledged] = useState(false);
  const narrativeTimerRef = useRef<number | undefined>(undefined);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  const revealOutcome = useCallback(() => {
    setRevealed(true);
    if (narrativeTimerRef.current !== undefined) return;
    narrativeTimerRef.current = window.setTimeout(() => {
      narrativeTimerRef.current = undefined;
      setNarrativeVisible(true);
    }, LEARN_TO_PLAY_NARRATIVE_DELAY_MS);
  }, []);

  useEffect(() => () => {
    if (narrativeTimerRef.current !== undefined) window.clearTimeout(narrativeTimerRef.current);
  }, []);

  const narrativeOpen = narrativeVisible && !narrativeAcknowledged;

  return (
    <div className={`game-result-overlay game-result-defeat fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <DefeatShatterAnimator
        seed={game.seed}
        snapshotImage={snapshotImage}
        onSequenceStart={startSequence}
        onBurst={revealOutcome}
      />

      {revealed && (
        <div className="defeat-outcome">
          <div
            className="defeat-outcome-inner"
            role={narrativeOpen ? undefined : "dialog"}
            aria-modal={narrativeOpen ? undefined : "true"}
            aria-hidden={narrativeOpen || undefined}
            aria-labelledby="learn-to-play-defeat-title"
            aria-describedby="learn-to-play-defeat-description"
          >
            <span className="defeat-kicker">{t("result.defeat")}</span>
            <strong className="defeat-title" id="learn-to-play-defeat-title">
              <span className="line">{t("destiny.futureLostLineOne")}</span>
              <span className="line">{t("destiny.futureLostLineTwo")}</span>
            </strong>
            <span className="defeat-subtitle" id="learn-to-play-defeat-description">
              {t("result.chapterLostAmongShards")}
            </span>

            {narrativeAcknowledged && (
              <div className="defeat-outcome-actions is-single-action learn-to-play-defeat-cta">
                <button
                  type="button"
                  className="game-result-action game-result-action-primary flex h-12 w-full min-w-0 items-center justify-center"
                  disabled
                  aria-describedby="learn-to-play-defeat-description"
                >
                  <span>{t("guided.learnToPlay.defeatCta")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {narrativeOpen && (
        <div className="learn-to-play-defeat-dialog-layer">
          <section
            className="learn-to-play-defeat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learn-to-play-narrative-title"
            aria-describedby="learn-to-play-narrative-description"
          >
            <header className="learn-to-play-defeat-dialog-header">
              <h2 id="learn-to-play-narrative-title">{t("guided.learnToPlay.defeatLineOne")}</h2>
            </header>
            <div className="learn-to-play-defeat-dialog-body" id="learn-to-play-narrative-description">
              <p>{t("guided.learnToPlay.defeatLineTwo")}</p>
              <p>{t("guided.learnToPlay.defeatBody")}</p>
            </div>
            <button
              type="button"
              className="guided-tutorial-continue"
              onClick={() => setNarrativeAcknowledged(true)}
            >
              {t("guided.continue")}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
