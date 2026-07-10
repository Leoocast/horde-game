import type { GameState } from "../engine/GameTypes";

export function GameLog({ game, className = "" }: { game: GameState; className?: string }) {
  return (
    <aside className={`old-panel-soft flex min-h-0 flex-col ${className}`}>
      <div className="old-title border-b border-[#8f6a36]/60 px-3 py-2 text-xs font-bold uppercase tracking-wide">Log</div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ol className="space-y-2 text-sm text-[#f0d49a]">
          {game.log.slice(0, 80).map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
