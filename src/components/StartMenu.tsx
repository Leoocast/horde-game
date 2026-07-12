import { ChevronDown, Play } from "lucide-react";
import { useState } from "react";
import type { InspectableDeck } from "../data/deckCatalog";
import { useAudioStore } from "../store/useAudioStore";
import { AppHeader } from "./AppHeader";

export type DifficultyMode = "easy" | "normal" | "hard";

type Props = {
  initialSeed: string;
  decks: InspectableDeck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onViewDeck: () => void;
  onStart: (options: { playerName: string; mode: DifficultyMode; setupTurns: number; seed: string }) => void;
};

const modes: Array<{ id: DifficultyMode; label: string; setupTurns: number; description: string }> = [
  { id: "easy", label: "Easy", setupTurns: 5, description: "5 extra setup turns" },
  { id: "normal", label: "Normal", setupTurns: 4, description: "4 extra setup turns" },
  { id: "hard", label: "Hard", setupTurns: 3, description: "3 extra setup turns" },
];

export function StartMenu({ initialSeed, decks, selectedDeckId, onSelectDeck, onViewDeck, onStart }: Props) {
  const [playerName, setPlayerName] = useState("Arky");
  const [mode, setMode] = useState<DifficultyMode>("normal");
  const [seed, setSeed] = useState(initialSeed);
  const [deckOpen, setDeckOpen] = useState(false);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[1];
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0];

  return (
    <main className="duel-table h-screen overflow-hidden text-[#f6e6b8]" onPointerDownCapture={startBattleMusic}>
      <AppHeader
        left={<div className="pl-3 old-title text-sm font-black uppercase tracking-[0.18em] text-[#f8dfa0]">Horde Magic PvE</div>}
        center={<div className="old-panel-soft px-4 py-2 text-sm font-black uppercase tracking-wide text-[#fff0b2]">New Game</div>}
      />
      <div className="flex h-[calc(100vh-56px)] items-center justify-center p-6">
        <section className="old-panel relative w-full max-w-lg p-6">
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

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="player-deck">
          Deck
        </label>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <div className="relative min-w-0">
            {deckOpen && <button aria-label="Close deck selector" className="fixed inset-0 z-10 cursor-default bg-transparent" onClick={() => setDeckOpen(false)} />}
            <button
              id="player-deck"
              className="old-select relative z-20 flex h-11 w-full min-w-0 items-center justify-between gap-3 px-3 pr-2 text-left text-sm font-bold outline-none transition"
              onClick={() => setDeckOpen((value) => !value)}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={deckOpen}
            >
              <span className="truncate">{selectedDeck?.label ?? "Select deck"}</span>
              <ChevronDown className={`shrink-0 text-[#f0c46f] transition ${deckOpen ? "rotate-180" : ""}`} size={18} />
            </button>
            {deckOpen && (
              <div className="old-panel old-scrollbar absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-auto p-1 shadow-2xl shadow-black/60" role="listbox" aria-labelledby="player-deck">
                {decks.map((deck) => {
                  const selected = deck.id === selectedDeckId;
                  return (
                    <button
                      key={deck.id}
                      className={[
                        "w-full rounded-md px-3 py-2 text-left text-sm font-bold transition",
                        selected ? "bg-[#8a5b20]/65 text-[#fff0b2] shadow-[inset_0_0_0_1px_rgba(246,211,132,0.38)]" : "text-[#d6b879] hover:bg-[#4d3018]/80 hover:text-[#ffe6aa]",
                      ].join(" ")}
                      onClick={() => {
                        onSelectDeck(deck.id);
                        setDeckOpen(false);
                      }}
                      role="option"
                      aria-selected={selected}
                      type="button"
                    >
                      <span className="block truncate">{deck.label}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[#a88956]">{deck.deck.deckSize ?? deck.deck.cards.length} cards</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="old-button h-11 px-4 text-sm font-black uppercase tracking-wide" onClick={onViewDeck}>
            View
          </button>
        </div>

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
      </div>
    </main>
  );
}
