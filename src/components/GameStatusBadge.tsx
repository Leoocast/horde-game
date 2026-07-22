import type { GameState } from "../engine/GameTypes";
import { hordeInSurge } from "../engine/StaticEffects";
import { useTranslation } from "../i18n/useTranslation";

export function GameStatusBadge({ game }: { game: GameState }) {
  const t = useTranslation();
  const status = game.winner
    ? t(game.winner === "player" ? "game.playerWins" : "game.hordeWins")
    : game.gameMode === "chaos"
      ? t(hordeInSurge(game) ? "game.chaosSurgeActive" : "game.chaosMutationActive")
      : game.setupTurnsRemaining > 0
        ? t("game.setupRemaining", { count: game.setupTurnsRemaining })
        : t(hordeInSurge(game) ? "game.hordeSurgeActive" : "game.normalAlternation");
  const phase = t((`phase.${game.phase === "horde" ? "main" : game.phase}`) as "phase.untap" | "phase.draw" | "phase.main" | "phase.combat" | "phase.end");
  return (
    <div className="game-status h-14 min-w-0 px-3 py-2 text-[#f6e6b8]">
      <div className="game-status-kicker">{t("game.chronicleInProgress")}</div>
      <div className="game-status-title truncate text-sm font-bold leading-tight">{status}</div>
      <div className="game-status-meta truncate text-xs">
        {t("game.phaseTurn", { phase, turn: game.turnNumber })}
      </div>
    </div>
  );
}
