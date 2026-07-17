import { Archive } from "lucide-react";
import type { CardInstance, GameState, Side } from "../engine/GameTypes";

export function ZoneDrawer({ game }: { game: GameState }) {
  return (
    <section className="game-zone-panel old-panel-soft">
      <div className="game-zone-header flex w-full items-center justify-between px-4 py-3 text-sm font-bold">
        <span className="inline-flex items-center gap-2">
          <Archive size={16} />
          Zones
        </span>
      </div>
      <div className="game-zone-content space-y-4 p-3">
        <ZoneSide game={game} side="player" />
        <ZoneSide game={game} side="horde" />
      </div>
    </section>
  );
}

function ZoneSide({ game, side }: { game: GameState; side: Side }) {
  const state = game[side];
  return (
    <div className="game-zone-side">
      <h3>{side}</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <ZoneMetric label="Deck" count={state.library.length} />
        {side === "player" && <ZoneMetric label="Hand" count={game.player.hand.length} />}
        <ZoneMetric label="Graveyard" count={state.graveyard.length} top={state.graveyard[0]} />
        <ZoneMetric label="Exile" count={state.exile.length} top={state.exile[0]} />
      </div>
    </div>
  );
}

function ZoneMetric({ label, count, top }: { label: string; count: number; top?: CardInstance }) {
  return (
    <div className="game-zone-metric p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <strong>{count}</strong>
      </div>
      {top && <div className="game-zone-top mt-1 truncate text-[11px]">{top.displayName}</div>}
    </div>
  );
}
