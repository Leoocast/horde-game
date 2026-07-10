import { Play } from "lucide-react";
import { useState } from "react";

export type DifficultyMode = "easy" | "normal" | "hard";

type Props = {
  initialSeed: string;
  onStart: (options: { playerName: string; mode: DifficultyMode; setupTurns: number; seed: string }) => void;
};

const modes: Array<{ id: DifficultyMode; label: string; setupTurns: number; description: string }> = [
  { id: "easy", label: "Easy", setupTurns: 4, description: "4 extra setup turns" },
  { id: "normal", label: "Normal", setupTurns: 3, description: "3 extra setup turns" },
  { id: "hard", label: "Hard", setupTurns: 2, description: "2 extra setup turns" },
];

export function StartMenu({ initialSeed, onStart }: Props) {
  const [playerName, setPlayerName] = useState("Arky");
  const [mode, setMode] = useState<DifficultyMode>("normal");
  const [seed, setSeed] = useState(initialSeed);
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[1];

  return (
    <main className="duel-table flex h-screen items-center justify-center overflow-hidden p-6 text-[#f6e6b8]">
      <section className="old-panel w-full max-w-lg p-6">
        <div className="mb-6">
          <p className="old-title text-xs font-bold uppercase tracking-[0.28em]">Horde Magic PvE</p>
          <h1 className="old-title mt-2 text-4xl font-black leading-tight">New Game</h1>
        </div>

        <label className="block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="player-name">
          Name
        </label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          className="old-input mt-2 h-11 w-full px-3 outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74]"
          placeholder="Player"
        />

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="game-seed">
          Seed
        </label>
        <input
          id="game-seed"
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          className="old-input mt-2 h-11 w-full px-3 outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74]"
          placeholder="horde-mvp-001"
        />

        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#d6b879]">Mode</div>
          <div className="grid grid-cols-3 gap-2">
            {modes.map((item) => {
              const selected = item.id === mode;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={[
                    "old-panel-soft px-3 py-3 text-left transition hover:brightness-125",
                    selected ? "outline outline-2 outline-[#e6c36f] text-[#fff0b8]" : "text-[#d2bc83]",
                  ].join(" ")}
                >
                  <div className="text-sm font-black uppercase tracking-wide">{item.label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-[#bda574]">{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="old-button-green mt-6 flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
          onClick={() => onStart({ playerName: playerName.trim() || "Player", mode, setupTurns: selectedMode.setupTurns, seed: seed.trim() || initialSeed })}
        >
          <Play size={18} />
          Start
        </button>
      </section>
    </main>
  );
}
