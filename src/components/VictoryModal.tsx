import { Crown, Home, RefreshCcw } from "lucide-react";
import { useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

type Props = {
  game: GameState;
  setupTurns: number;
  onReturnToMenu: () => void;
};

export function VictoryModal({ game, setupTurns, onReturnToMenu }: Props) {
  const reset = useGameStore((state) => state.reset);
  const setSeed = useGameStore((state) => state.setSeed);
  const [seedInput, setSeedInput] = useState(game.seed);

  function restart() {
    const nextSeed = seedInput.trim() || game.seed;
    setSeed(nextSeed);
    reset(nextSeed, setupTurns);
  }

  return (
    <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-[#090604]/85">
      <div className="victory-banner-shell mb-8">
        <div className="victory-banner">
          <span className="victory-banner-text flex items-center gap-4">
            <Crown className="mt-1" size={56} strokeWidth={2.5} />
            Victory
          </span>
        </div>
      </div>

      <section
        className="old-panel w-full max-w-md p-6 text-center"
        style={{ animation: "victory-panel-fade-in 800ms 600ms both" }}
      >
        <p className="text-sm font-bold uppercase tracking-widest text-[#d6b879]">
          The Horde has been defeated
        </p>

        <label className="mt-6 block text-left text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="victory-seed">
          Seed
        </label>
        <input
          id="victory-seed"
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
            className="old-button-green flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
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
