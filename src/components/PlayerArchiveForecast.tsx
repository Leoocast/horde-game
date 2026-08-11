import { BookOpen } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { playerDrawForecast, type PlayerDrawReason } from "../engine/TurnManager";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { useSourceActionUiStore } from "../store/useSourceActionUiStore";
import { GameTooltip } from "./GameTooltip";

const REASON_KEY: Partial<Record<PlayerDrawReason, "game.drawReasonEasy" | "game.drawReasonChaos">> = {
  easy: "game.drawReasonEasy",
  chaos: "game.drawReasonChaos",
};

export function PlayerArchiveForecast({ game }: { game: GameState }) {
  const t = useTranslation();
  const energyRecycleDragActive = useGameStore((state) => state.energyRecycleDragActive);
  const draggingRecyclableSourceId = useSourceActionUiStore((state) => state.draggingRecyclableSourceId);
  const forecast = playerDrawForecast(game, { timing: "next" });
  // Drawing one card is a rule the player learns once, so the permanent UI stays silent about it.
  // The badge only appears when the next draw actually deviates: Easy, Chaos or an empty Hand.
  // `playerDrawForecast` remains the single source of truth for the forecast and the real draw.
  const extraDraw = forecast.amount > 1;
  const reasonKey = forecast.reason === "easy" || forecast.reason === "chaos" ? REASON_KEY[forecast.reason] : undefined;
  const reasonLabel = reasonKey ? t(reasonKey) : undefined;
  const emptyHandTooltip = forecast.emptyHandBonus ? t("game.drawReasonEmptyHandTooltip") : undefined;
  const archiveLabel = t("zones.deck");
  const nextDrawLabel = t("game.nextDraw");
  const sourceDragActive = Boolean(
    draggingRecyclableSourceId && game.player.hand.some((card) => card.instanceId === draggingRecyclableSourceId),
  );
  const returnTitle = energyRecycleDragActive ? t("sourceAction.releaseToReturn") : t("sourceAction.recycleSource");
  const returnHint = energyRecycleDragActive ? t("hand.recycleHint") : t("sourceAction.dragRight");
  const drawDetail = emptyHandTooltip ?? (reasonLabel ? `${reasonLabel}.` : "");
  const drawBadge = (
    <strong className="player-draw-badge">
      +1
      {reasonLabel && <small>{reasonLabel}</small>}
    </strong>
  );

  return (
    <section
      data-player-archive-origin="true"
      data-energy-recycle-target="true"
      data-draw-reason={forecast.reason}
      className={[
        "card-pile card-pile-archive",
        forecast.reason === "chaos" ? "is-chaos" : "",
        sourceDragActive ? "is-source-return-target" : "",
        energyRecycleDragActive ? "is-recycle-targeted" : "",
      ].join(" ")}
      aria-label={sourceDragActive
        ? `${returnTitle}. ${returnHint}.`
        : `${archiveLabel}: ${game.player.archive.length}.${extraDraw ? ` ${nextDrawLabel}: ${forecast.amount}. ${drawDetail}` : ""}`}
    >
      <span className="card-pile-glyph" aria-hidden="true">
        <BookOpen size={15} strokeWidth={1.9} />
      </span>
      <strong key={`archive-${game.player.archive.length}`} className="card-pile-count" aria-hidden="true">
        {game.player.archive.length}
      </strong>
      <span className="card-pile-label" aria-hidden="true">{archiveLabel}</span>
      {extraDraw && (
        <span className="player-draw-badge-host" aria-hidden="true">
          {emptyHandTooltip
            ? <GameTooltip content={emptyHandTooltip} side="top">{drawBadge}</GameTooltip>
            : drawBadge}
        </span>
      )}
    </section>
  );
}
