import { BookOpen } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { playerDrawForecast, type PlayerDrawReason } from "../engine/TurnManager";
import { useTranslation } from "../i18n/useTranslation";
import { GameTooltip } from "./GameTooltip";

const REASON_KEY: Partial<Record<PlayerDrawReason, "game.drawReasonEasy" | "game.drawReasonChaos">> = {
  easy: "game.drawReasonEasy",
  chaos: "game.drawReasonChaos",
};

export function PlayerArchiveForecast({ game }: { game: GameState }) {
  const t = useTranslation();
  const forecast = playerDrawForecast(game, { timing: "next" });
  const reasonKey = forecast.reason === "easy" || forecast.reason === "chaos" ? REASON_KEY[forecast.reason] : undefined;
  const reasonLabel = reasonKey ? t(reasonKey) : undefined;
  const emptyHandTooltip = forecast.emptyHandBonus ? t("game.drawReasonEmptyHandTooltip") : undefined;
  const archiveLabel = t("zones.deck");
  const nextDrawLabel = t("game.nextDraw");
  const drawValue = (
    <strong key={`draw-${forecast.amount}`} className="player-archive-value is-draw">
      {forecast.amount}
    </strong>
  );

  return (
    <section
      data-player-archive-origin="true"
      data-draw-reason={forecast.reason}
      className={[
        "player-archive-forecast",
        forecast.emptyHandBonus ? "is-empty-hand" : "",
        forecast.reason === "chaos" ? "is-chaos" : "",
      ].join(" ")}
      aria-label={`${archiveLabel}: ${game.player.archive.length}. ${nextDrawLabel}: ${forecast.amount}.${emptyHandTooltip ? ` ${emptyHandTooltip}` : reasonLabel ? ` ${reasonLabel}.` : ""}`}
    >
      <span className="player-archive-emblem" aria-hidden="true">
        <BookOpen size={20} strokeWidth={1.8} />
      </span>
      <span className="player-archive-copy" aria-hidden="true">
        <span className="player-archive-row">
          <span className="player-archive-label">{archiveLabel}</span>
          <strong key={`archive-${game.player.archive.length}`} className="player-archive-value">{game.player.archive.length}</strong>
        </span>
        <span className="player-archive-row player-archive-draw-row">
          <span className="player-archive-label">{nextDrawLabel}</span>
          {emptyHandTooltip ? (
            <GameTooltip content={emptyHandTooltip} className="player-archive-draw-tooltip">
              {drawValue}
            </GameTooltip>
          ) : drawValue}
          {reasonLabel && <span className="player-archive-reason">{reasonLabel}</span>}
        </span>
      </span>
    </section>
  );
}
