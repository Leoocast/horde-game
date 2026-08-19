import { useCallback, useState } from "react";
import { Copy, RefreshCcw } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { useToastStore } from "../store/useToastStore";
import { useTranslation } from "../i18n/useTranslation";
import { writeClipboardText } from "../platform/desktopBridge";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { VictoryConstellationAnimator } from "./VictoryConstellationAnimator";

type Props = {
  game: GameState;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

export function VictoryModal({ game, onRewriteFuture, onContemplateFuture }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(game.seed);
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  // El desenlace se nombra cuando la figura ya cerró, no en un reloj propio.
  const revealOutcome = useCallback(() => setRevealed(true), []);

  async function copySeed() {
    try {
      await writeClipboardText(game.seed);
      pushToast({ title: t("destiny.identityCopied"), message: t("destiny.future", { code: futureCode }), tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: t("destiny.future", { code: futureCode }), tone: "warning" });
    }
  }

  return (
    <div className={`game-result-overlay game-result-victory fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <VictoryConstellationAnimator seed={game.seed} onSequenceStart={startSequence} onVerdict={revealOutcome} />

      {/* El bloque se centra con una capa a pantalla completa, no con un `translate` propio: la
          succión del vórtice anima `transform` sobre cada pieza de la escena y borraría ese
          desplazamiento, dejando el desenlace descolgado hacia abajo y a la derecha. */}
      {revealed && (
        <div className="victory-outcome">
          <div
            className="victory-outcome-inner"
            role="dialog"
            aria-modal="true"
            aria-labelledby="victory-result-title"
            aria-describedby="victory-result-description"
          >
            <span className="victory-kicker">{t("result.victory")}</span>
            <strong className="victory-title" id="victory-result-title">
              <span className="line">{t("destiny.futurePreservedLineOne")}</span>
              <span className="line">{t("destiny.futurePreservedLineTwo")}</span>
            </strong>
            <span className="victory-subtitle" id="victory-result-description">
              {t("result.chapterEnduresInChronicle")}
            </span>

            <span className="victory-future-plate">
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

            <div className="victory-outcome-actions">
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
