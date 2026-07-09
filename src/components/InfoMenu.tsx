import { Menu, RefreshCcw } from "lucide-react";
import { useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { GameLog } from "./GameLog";
import { ZoneDrawer } from "./ZoneDrawer";

export function InfoMenu({ game }: { game: GameState }) {
  const [open, setOpen] = useState(false);
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const reset = useGameStore((state) => state.reset);
  return (
    <div className="relative">
      <button className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/25 bg-stone-950/80 text-cyan-100 shadow-xl shadow-black/25 backdrop-blur-md transition hover:border-cyan-200/60 hover:bg-cyan-950/80" onClick={() => setOpen((value) => !value)} title="Extra info">
        <Menu size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 max-h-[calc(100vh-90px)] w-80 overflow-auto rounded-2xl border border-white/15 bg-stone-950/90 text-white shadow-2xl shadow-black/35 backdrop-blur-md">
          <div className="space-y-3 p-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-stone-300">Seed</label>
              <div className="mt-1 flex gap-2">
                <input value={seed} onChange={(event) => setSeed(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-sm text-white outline-none focus:border-cyan-200/70" />
                <button className="icon-button" onClick={() => reset(seed)} title="Reset">
                  <RefreshCcw size={16} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1 text-center text-xs">
              <Mana label="G" value={game.player.manaPool.green} />
              <Mana label="R" value={game.player.manaPool.red} />
              <Mana label="U" value={game.player.manaPool.blue} />
              <Mana label="W" value={game.player.manaPool.white} />
              <Mana label="B" value={game.player.manaPool.black} />
              <Mana label="C" value={game.player.manaPool.colorless} />
            </div>
            <div className="text-xs text-stone-300">RNG: {game.currentRandomState.toString(16)}</div>
            <ZoneDrawer game={game} />
            <GameLog game={game} className="h-60" />
          </div>
        </div>
      )}
    </div>
  );
}

function Mana({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-1">
      <div className="font-bold text-emerald-200">{label}</div>
      <div className="text-white">{value}</div>
    </div>
  );
}
