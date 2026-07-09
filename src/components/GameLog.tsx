import type { GameState } from "../engine/GameTypes";

export function GameLog({ game, className = "" }: { game: GameState; className?: string }) {
  return (
    <aside className={`flex min-h-0 flex-col border border-stone-300 bg-white ${className}`}>
      <div className="border-b border-stone-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-stone-600">Log</div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ol className="space-y-2 text-sm text-stone-700">
          {game.log.slice(0, 80).map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
