import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCcw, Sparkles } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { useToastStore } from "../store/useToastStore";
import { useTranslation } from "../i18n/useTranslation";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { DefeatShatterAnimator } from "./DefeatShatterAnimator";

type Props = {
  game: GameState;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

/** El desenlace se nombra cuando el abismo ya quedó al descubierto, no antes. */
const REVEAL_AT_MS = 2900;

export function DefeatModal({ game, onRewriteFuture, onContemplateFuture }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(game.seed);
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);

  useEffect(() => {
    if (!sequenceStarted) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRevealed(true), reducedMotion ? 60 : REVEAL_AT_MS);
    return () => window.clearTimeout(timer);
  }, [sequenceStarted]);

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
      <DefeatShatterAnimator seed={game.seed} onSequenceStart={startSequence} />

      {revealed && (
        <div
          className="defeat-outcome"
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
              className="game-result-action game-result-action-secondary flex h-12 items-center justify-center gap-2"
              onClick={onContemplateFuture}
            >
              <Sparkles size={17} />
              {t("destiny.contemplateAnother")}
            </button>
            <button
              className="game-result-action game-result-action-primary flex h-12 items-center justify-center gap-2"
              onClick={onRewriteFuture}
            >
              <RefreshCcw size={18} />
              {t("destiny.rewriteThis")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
