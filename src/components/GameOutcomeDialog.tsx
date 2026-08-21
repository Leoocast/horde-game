import { Copy, RefreshCcw } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { writeClipboardText } from "../platform/desktopBridge";
import { useToastStore } from "../store/useToastStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";

export type GameOutcomeTone = "victory" | "defeat";

type Props = Readonly<{
  game: GameState;
  tone: GameOutcomeTone;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
}>;

/** The UI verdict shared by the runtime outcome sequences and the VFX-free UI Reference. */
export function GameOutcomeDialog({ game, tone, onRewriteFuture, onContemplateFuture }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(game.seed);
  const titleId = `${tone}-result-title`;
  const descriptionId = `${tone}-result-description`;
  const preserved = tone === "victory";

  async function copySeed() {
    try {
      await writeClipboardText(game.seed);
      pushToast({ title: t("destiny.identityCopied"), message: t("destiny.future", { code: futureCode }), tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: t("destiny.future", { code: futureCode }), tone: "warning" });
    }
  }

  return (
    <div className={`${tone}-outcome`}>
      <div
        className={`${tone}-outcome-inner`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className={`${tone}-kicker`}>{t(preserved ? "result.victory" : "result.defeat")}</span>
        <strong className={`${tone}-title`} id={titleId}>
          <span className="line">{t(preserved ? "destiny.futurePreservedLineOne" : "destiny.futureLostLineOne")}</span>
          <span className="line">{t(preserved ? "destiny.futurePreservedLineTwo" : "destiny.futureLostLineTwo")}</span>
        </strong>
        <span className={`${tone}-subtitle`} id={descriptionId}>
          {t(preserved ? "result.chapterEnduresInChronicle" : "result.chapterLostAmongShards")}
        </span>

        <span className={`${tone}-future-plate`}>
          <span>{t("destiny.futureWord")}</span>
          <b>{futureCode}</b>
          <button type="button" onClick={copySeed} title={t("destiny.copyIdentity")} aria-label={t("destiny.copyIdentity")}>
            <Copy size={14} />
          </button>
        </span>

        <div className={`${tone}-outcome-actions`}>
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
  );
}
