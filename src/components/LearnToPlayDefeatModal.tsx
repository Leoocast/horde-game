import { useCallback, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { DefeatShatterAnimator } from "./DefeatShatterAnimator";

type Props = Readonly<{
  game: GameState;
  snapshotImage?: HTMLImageElement;
}>;

/** First-cut ending: the normal shatter resolves into one narrative CTA with no handoff yet. */
export function LearnToPlayDefeatModal({ game, snapshotImage }: Props) {
  const t = useTranslation();
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  const revealOutcome = useCallback(() => setRevealed(true), []);

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
            role="dialog"
            aria-modal="true"
            aria-labelledby="learn-to-play-defeat-title"
            aria-describedby="learn-to-play-defeat-description"
          >
            <span className="defeat-kicker">{t("result.defeat")}</span>
            <strong className="defeat-title" id="learn-to-play-defeat-title">
              <span className="line">{t("guided.learnToPlay.defeatLineOne")}</span>
              <span className="line">{t("guided.learnToPlay.defeatLineTwo")}</span>
            </strong>
            <span className="defeat-subtitle" id="learn-to-play-defeat-description">
              {t("guided.learnToPlay.defeatBody")}
            </span>

            <div className="defeat-outcome-actions is-single-action">
              <button
                type="button"
                className="game-result-action game-result-action-primary flex h-12 w-full min-w-0 items-center justify-center"
                disabled
                aria-describedby="learn-to-play-defeat-description"
              >
                <span>{t("guided.learnToPlay.defeatCta")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
