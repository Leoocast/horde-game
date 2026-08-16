import { useCallback, useEffect, useState } from "react";
import { Copy, Orbit, RefreshCcw, Sparkles, Skull } from "lucide-react";
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
    const timer = window.setTimeout(() => setRevealed(true), reducedMotion ? 60 : 1420);
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
      <div className="defeat-result-darkness" />
      <DefeatShatterAnimator seed={game.seed} onSequenceStart={startSequence} />

      {revealed && (
        <div className="defeat-result-revelation">
          <header className="defeat-result-heading">
            <div className="defeat-result-kicker" aria-hidden="true">
              <span />
              <Skull size={22} strokeWidth={1.45} />
              <strong>{t("result.defeat")}</strong>
              <span />
            </div>
            <h1 id="defeat-result-title">{t("destiny.futureLost")}</h1>
            <p id="defeat-result-description">{t("result.expeditionDark")}</p>
          </header>

          <section
            className="game-result-panel defeat-result-panel old-panel w-full max-w-md p-6 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="defeat-result-title"
            aria-describedby="defeat-result-description"
          >
            <span className="game-result-panel-mark" />
            <div className="game-result-future">
              <span className="game-result-future-glyph" aria-hidden="true"><Orbit size={25} strokeWidth={1.35} /></span>
              <span><small>{t("destiny.future", { code: futureCode })}</small><strong>{t("result.chroniclerDefeated")}</strong></span>
              <button type="button" onClick={copySeed} title={t("destiny.copyIdentity")} aria-label={t("destiny.copyIdentity")}><Copy size={16} /></button>
            </div>

            <div className="game-result-actions mt-5 grid grid-cols-2 gap-3">
              <button
                className="game-result-action game-result-action-secondary flex h-12 w-full items-center justify-center gap-2"
                onClick={onContemplateFuture}
              >
                <Sparkles size={17} />
                {t("destiny.contemplateAnother")}
              </button>
              <button
                className="game-result-action game-result-action-primary flex h-12 w-full items-center justify-center gap-2"
                onClick={onRewriteFuture}
              >
                <RefreshCcw size={18} />
                {t("destiny.rewriteThis")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
