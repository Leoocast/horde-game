import { Copy, Orbit, RefreshCcw, Sparkles, Skull } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { useToastStore } from "../store/useToastStore";
import { useTranslation } from "../i18n/useTranslation";
import { futureCodeFromSeed } from "../utils/futureIdentity";

type Props = {
  game: GameState;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

export function DefeatModal({ game, onRewriteFuture, onContemplateFuture }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(game.seed);

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(game.seed);
      pushToast({ title: t("destiny.identityCopied"), message: t("destiny.future", { code: futureCode }), tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: t("destiny.future", { code: futureCode }), tone: "warning" });
    }
  }

  return (
    <div className="game-result-overlay game-result-defeat fixed inset-0 z-[140] flex flex-col items-center justify-center">
      <div className="game-result-atmosphere" />
      <div className="game-result-banner" aria-hidden="true">
        <span className="game-result-line" />
        <span className="game-result-crest"><Skull size={32} strokeWidth={1.7} /></span>
        <h1>{t("result.defeat")}</h1>
        <span className="game-result-line game-result-line-right" />
      </div>

      <section className="game-result-panel old-panel w-full max-w-md p-6 text-center" role="dialog" aria-modal="true" aria-labelledby="defeat-result-title">
        <span className="game-result-panel-mark" />
        <p id="defeat-result-title" className="game-result-message">
          {t("result.expeditionDark")}
        </p>

        <div className="game-result-future mt-6">
          <span className="game-result-future-glyph" aria-hidden="true"><Orbit size={25} strokeWidth={1.35} /></span>
          <span><small>{t("destiny.future", { code: futureCode })}</small><strong>{t("destiny.futureLost")}</strong></span>
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
  );
}
