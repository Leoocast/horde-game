import { Play } from "lucide-react";
import { useState } from "react";

export type DifficultyMode = "easy" | "normal" | "hard";

type Props = {
  onStart: (options: { playerName: string; mode: DifficultyMode; setupTurns: number }) => void;
};

const modes: Array<{ id: DifficultyMode; label: string; setupTurns: number; description: string }> = [
  { id: "easy", label: "Easy", setupTurns: 4, description: "4 extra setup turns" },
  { id: "normal", label: "Normal", setupTurns: 3, description: "3 extra setup turns" },
  { id: "hard", label: "Hard", setupTurns: 2, description: "2 extra setup turns" },
];

export function StartMenu({ onStart }: Props) {
  const [playerName, setPlayerName] = useState("Arky");
  const [mode, setMode] = useState<DifficultyMode>("normal");
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[1];

  return (
    <main className="duel-table flex h-screen items-center justify-center overflow-hidden p-6 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/15 bg-stone-950/75 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-200">Horde Magic PvE</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">New Game</h1>
        </div>

        <label className="block text-xs font-bold uppercase tracking-wide text-stone-300" htmlFor="player-name">
          Name
        </label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-white outline-none transition placeholder:text-stone-500 focus:border-emerald-300/70"
          placeholder="Player"
        />

        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-300">Mode</div>
          <div className="grid grid-cols-3 gap-2">
            {modes.map((item) => {
              const selected = item.id === mode;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={[
                    "rounded-2xl border px-3 py-3 text-left transition",
                    selected ? "border-emerald-300 bg-emerald-300/15 text-white shadow-lg shadow-emerald-950/30" : "border-white/10 bg-white/5 text-stone-300 hover:border-white/25 hover:bg-white/10",
                  ].join(" ")}
                >
                  <div className="text-sm font-black uppercase tracking-wide">{item.label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-stone-300">{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200/35 bg-emerald-500/90 text-sm font-black uppercase tracking-wide text-stone-950 shadow-xl shadow-emerald-950/30 transition hover:bg-emerald-300"
          onClick={() => onStart({ playerName: playerName.trim() || "Player", mode, setupTurns: selectedMode.setupTurns })}
        >
          <Play size={18} />
          Start
        </button>
      </section>
    </main>
  );
}
