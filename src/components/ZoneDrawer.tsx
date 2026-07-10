import { Archive } from "lucide-react";
import type { CardInstance, GameState, Side } from "../engine/GameTypes";

export function ZoneDrawer({ game }: { game: GameState }) {
  return (
    <section className="old-panel-soft">
      <div className="old-title flex w-full items-center justify-between px-3 py-2 text-sm font-bold">
        <span className="inline-flex items-center gap-2">
          <Archive size={16} />
          Zones
        </span>
      </div>
      <div className="space-y-3 border-t border-[#8f6a36]/60 p-3">
        <ZoneSide game={game} side="player" />
        <ZoneSide game={game} side="horde" />
      </div>
    </section>
  );
}

function ZoneSide({ game, side }: { game: GameState; side: Side }) {
  const state = game[side];
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#d6b879]">{side}</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <ZoneMetric label="Library" count={state.library.length} />
        {side === "player" && <ZoneMetric label="Hand" count={game.player.hand.length} />}
        <ZoneMetric label="Graveyard" count={state.graveyard.length} top={state.graveyard[0]} />
        <ZoneMetric label="Exile" count={state.exile.length} top={state.exile[0]} />
      </div>
    </div>
  );
}

function ZoneMetric({ label, count, top }: { label: string; count: number; top?: CardInstance }) {
  return (
    <div className="border border-[#8f6a36]/45 bg-[#140d08]/55 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[#d6b879]">{label}</span>
        <span className="font-bold text-[#fff0b2]">{count}</span>
      </div>
      {top && <div className="mt-1 truncate text-[11px] text-[#a58b5a]">{top.displayName}</div>}
    </div>
  );
}
