import { Home, RefreshCcw, Skull } from "lucide-react";
import { useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

type Props = {
  game: GameState;
  setupTurns: number;
  onReturnToMenu: () => void;
};

export function DefeatModal({ game, setupTurns, onReturnToMenu }: Props) {
  const reset = useGameStore((state) => state.reset);
  const setSeed = useGameStore((state) => state.setSeed);
  const [seedInput, setSeedInput] = useState(game.seed);

  function restart() {
    const nextSeed = seedInput.trim() || game.seed;
    setSeed(nextSeed);
    reset(nextSeed, setupTurns);
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#090604]/85 p-6 text-[#f6e6b8]">
      <section className="old-panel w-full max-w-md p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#d8a154] bg-[#4a130d] text-[#ffd59b] shadow-[0_0_28px_rgba(168,69,24,0.45)]">
          <Skull size={32} />
        </div>
        <h2 className="old-title mt-4 text-3xl font-black uppercase tracking-wide">You Lost</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#d6b879]">Your life total has been reduced to 0. You lost.</p>

        <label className="mt-6 block text-left text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="defeat-seed">
          Seed
        </label>
        <input
          id="defeat-seed"
          value={seedInput}
          onChange={(event) => setSeedInput(event.target.value)}
          className="old-input mt-2 h-11 w-full px-3 outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74]"
        />

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="old-button flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
            onClick={onReturnToMenu}
          >
            <Home size={18} />
            Menu
          </button>
          <button
            className="old-button mt-0 flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
            onClick={restart}
          >
            <RefreshCcw size={18} />
            Restart
          </button>
        </div>
      </section>
    </div>
  );
}
