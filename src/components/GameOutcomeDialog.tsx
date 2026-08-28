import { Copy } from "lucide-react";
import { matchOriginVisualSeed, type MatchOrigin } from "../content/MatchOrigin";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { writeClipboardText } from "../platform/desktopBridge";
import { useToastStore } from "../store/useToastStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { DestinyActionButton } from "./DestinyActionButton";

export type GameOutcomeTone = "victory" | "defeat";

type Props = Readonly<{
  game: GameState;
  matchOrigin: MatchOrigin;
  tone: GameOutcomeTone;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
}>;

/** The UI verdict shared by the runtime outcome sequences and the VFX-free UI Reference. */
export function GameOutcomeDialog({ matchOrigin, tone, onRewriteFuture, onContemplateFuture }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(matchOriginVisualSeed(matchOrigin));
  const titleId = `${tone}-result-title`;
  const descriptionId = `${tone}-result-description`;
  const preserved = tone === "victory";

  async function copySeed() {
    if (matchOrigin.seedKind !== "canon") return;
    try {
      await writeClipboardText(matchOrigin.canonCode);
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
          {t(preserved ? "result.visionPreservesFuture" : "result.visionLostAmongShards")}
        </span>

        <span className={`${tone}-future-plate`}>
          <span>{t("destiny.futureWord")}</span>
          <b>{futureCode}</b>
          {matchOrigin.seedKind === "canon" && <button type="button" onClick={copySeed} title={t("destiny.copyIdentity")} aria-label={t("destiny.copyIdentity")}>
            <Copy size={14} />
          </button>}
        </span>

        <div className={`${tone}-outcome-actions`}>
          <button
            className="hf-ui-button game-outcome-action game-outcome-action-secondary"
            onClick={onContemplateFuture}
          >
            <span>{t("destiny.seekAnotherFuture")}</span>
          </button>
          <DestinyActionButton
            className="game-outcome-rewrite-action"
            label={t("destiny.contemplateThisAgain")}
            onClick={onRewriteFuture}
          />
        </div>
      </div>
    </div>
  );
}
