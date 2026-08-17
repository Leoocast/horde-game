import { useCallback, useState } from "react";
import { Copy, RefreshCcw } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { useToastStore } from "../store/useToastStore";
import { useTranslation } from "../i18n/useTranslation";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { DefeatShatterAnimator } from "./DefeatShatterAnimator";

type Props = {
  game: GameState;
  snapshotImage?: HTMLImageElement;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

export function DefeatModal({ game, snapshotImage, onRewriteFuture, onContemplateFuture }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(game.seed);
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  // El desenlace se nombra cuando el vidrio ya reventó, no en un reloj propio.
  const revealOutcome = useCallback(() => setRevealed(true), []);

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(game.seed);
      pushToast({ title: t("destiny.identityCopied"), message: t("destiny.future", { code: futureCode }), tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: t("destiny.future", { code: futureCode }), tone: "warning" });
    }
  }

  return (
    <div className={`game-result-overlay game-result-defeat fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <DefeatShatterAnimator seed={game.seed} snapshotImage={snapshotImage} onSequenceStart={startSequence} onBurst={revealOutcome} />

      {/* El bloque se centra con una capa a pantalla completa, no con un `translate` propio:
          la succión del vórtice anima `transform` sobre cada pieza de la escena y borraría
          ese desplazamiento, dejando el desenlace descolgado hacia abajo y a la derecha. */}
      {revealed && (
        <div className="defeat-outcome">
        <div
          className="defeat-outcome-inner"
          role="dialog"
          aria-modal="true"
          aria-labelledby="defeat-result-title"
          aria-describedby="defeat-result-description"
        >
          <span className="defeat-kicker">{t("result.defeat")}</span>
          <strong className="defeat-title" id="defeat-result-title">
            <span className="line">{t("destiny.futureLostLineOne")}</span>
            <span className="line">{t("destiny.futureLostLineTwo")}</span>
          </strong>
          <span className="defeat-subtitle" id="defeat-result-description">
            {t("result.chapterLostAmongShards")}
          </span>

          <span className="defeat-future-plate">
            <span>{t("destiny.futureWord")}</span>
            <b>{futureCode}</b>
            <button
              type="button"
              onClick={copySeed}
              title={t("destiny.copyIdentity")}
              aria-label={t("destiny.copyIdentity")}
            >
              <Copy size={14} />
            </button>
          </span>

          <div className="defeat-outcome-actions">
            <button
              className="game-result-action game-result-action-secondary flex h-12 w-full min-w-0 items-center justify-center"
              onClick={onContemplateFuture}
            >
              <span>{t("destiny.contemplateAnother")}</span>
            </button>
            <button
              className="game-result-action game-result-action-primary flex h-12 w-full min-w-0 items-center justify-center gap-2"
              onClick={onRewriteFuture}
            >
              <RefreshCcw size={18} aria-hidden="true" />
              <span>{t("destiny.rewriteThis")}</span>
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
