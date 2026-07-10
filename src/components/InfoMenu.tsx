import { Menu, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { AudioControls } from "./AudioControls";
import { GameLog } from "./GameLog";
import { ZoneDrawer } from "./ZoneDrawer";

export function InfoMenu({ setupTurns }: { setupTurns: number }) {
  const game = useGameStore((state) => state.game);
  const [open, setOpen] = useState(false);
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const reset = useGameStore((state) => state.reset);
  return (
    <div className="relative">
      <button className="old-button flex h-10 w-10 items-center justify-center rounded-full transition" onClick={() => setOpen((value) => !value)} title="Extra info">
        <Menu size={20} />
      </button>
      {open && (
        <div className="old-panel absolute right-0 top-full mt-2 max-h-[calc(100vh-90px)] w-80 overflow-auto text-[#f6e6b8]">
          <div className="space-y-3 p-3">
            <div>
              <label className="old-title text-xs font-bold uppercase tracking-wide">Seed</label>
              <div className="mt-1 flex gap-2">
                <input value={seed} onChange={(event) => setSeed(event.target.value)} className="old-input min-w-0 flex-1 px-2 py-1 text-sm outline-none focus:border-[#f4cc74]" />
                <button className="icon-button" onClick={() => reset(seed, setupTurns)} title="Reset">
                  <RefreshCcw size={16} />
                </button>
              </div>
            </div>
            <AudioControls />
            <div className="text-xs text-[#d6b879]">RNG: {game.currentRandomState.toString(16)}</div>
            <ZoneDrawer game={game} />
            <GameLog game={game} className="h-60" />
          </div>
        </div>
      )}
    </div>
  );
}
