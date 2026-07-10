import type { GameState } from "../engine/GameTypes";
import { gameStatus } from "../utils/selectors";

export function GameStatusBadge({ game }: { game: GameState }) {
  return (
    <div className="h-14 min-w-0 px-3 py-2 text-[#f6e6b8]">
      <div className="old-title truncate text-sm font-bold leading-tight">{gameStatus(game)}</div>
      <div className="truncate text-xs text-[#d6b879]">
        Phase: {game.phase} | Turn {game.turnNumber}
      </div>
    </div>
  );
}
