import type { GameState } from "../engine/GameTypes";
import { gameStatus } from "../utils/selectors";

export function GameStatusBadge({ game }: { game: GameState }) {
  return (
    <div className="game-status h-14 min-w-0 px-3 py-2 text-[#f6e6b8]">
      <div className="game-status-kicker">Chronicle in progress</div>
      <div className="game-status-title truncate text-sm font-bold leading-tight">{gameStatus(game)}</div>
      <div className="game-status-meta truncate text-xs">
        {game.phase} phase <span /> turn {game.turnNumber}
      </div>
    </div>
  );
}
