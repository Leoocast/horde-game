import type { GameState } from "../engine/GameTypes";

export function GameLog({ game, className = "", variant = "panel" }: { game: GameState; className?: string; variant?: "panel" | "embedded" }) {
  if (variant === "embedded") {
    return (
      <div className={`game-log-embedded min-h-0 overflow-y-auto ${className}`}>
        <ol className="space-y-2.5 text-sm text-[#d9d2b8]">
          {game.log.slice(0, 80).map((entry, index) => (
            <li key={`${entry}-${index}`}>{chroniclerLabel(entry)}</li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <aside className={`old-panel-soft flex min-h-0 flex-col ${className}`}>
      <div className="old-title border-b border-[#8f6a36]/60 px-3 py-2 text-xs font-bold uppercase tracking-wide">Log</div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ol className="space-y-2 text-sm text-[#f0d49a]">
          {game.log.slice(0, 80).map((entry, index) => (
            <li key={`${entry}-${index}`}>{chroniclerLabel(entry)}</li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function chroniclerLabel(entry: string): string {
  return entry.replace(/\bPlayer\b/g, "Chronicler").replace(/\bplayer\b/g, "Chronicler");
}
