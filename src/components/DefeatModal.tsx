import { RefreshCcw, Skull } from "lucide-react";
import { useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

type Props = {
  game: GameState;
  setupTurns: number;
};

export function DefeatModal({ game, setupTurns }: Props) {
  const reset = useGameStore((state) => state.reset);
  const setSeed = useGameStore((state) => state.setSeed);
  const [seedInput, setSeedInput] = useState(game.seed);

  function restart() {
    const nextSeed = seedInput.trim() || game.seed;
    setSeed(nextSeed);
    reset(nextSeed, setupTurns);
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/75 p-6 text-white backdrop-blur-md">
      <section className="w-full max-w-md rounded-3xl border border-rose-200/20 bg-stone-950/90 p-6 text-center shadow-2xl shadow-black/50">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-rose-300/50 bg-rose-950/80 text-rose-100 shadow-[0_0_28px_rgba(244,63,94,0.35)]">
          <Skull size={32} />
        </div>
        <h2 className="mt-4 text-3xl font-black uppercase tracking-wide">You Lost</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-300">Your life total has been reduced to 0. You lost.</p>

        <label className="mt-6 block text-left text-xs font-bold uppercase tracking-wide text-stone-300" htmlFor="defeat-seed">
          Seed
        </label>
        <input
          id="defeat-seed"
          value={seedInput}
          onChange={(event) => setSeedInput(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-white outline-none transition placeholder:text-stone-500 focus:border-orange-300/70"
        />

        <button
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-orange-200/35 bg-orange-500/95 text-sm font-black uppercase tracking-wide text-stone-950 shadow-xl shadow-orange-950/30 transition hover:bg-orange-300"
          onClick={restart}
        >
          <RefreshCcw size={18} />
          Restart
        </button>
      </section>
    </div>
  );
}
