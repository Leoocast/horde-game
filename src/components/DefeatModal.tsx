import { Copy, Home, RefreshCcw, RefreshCw, Skull } from "lucide-react";
import { useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { useAudioStore } from "../store/useAudioStore";

type Props = {
  game: GameState;
  setupTurns: number;
  onReturnToMenu: () => void;
};

export function DefeatModal({ game, setupTurns, onReturnToMenu }: Props) {
  const reset = useGameStore((state) => state.reset);
  const setSeed = useGameStore((state) => state.setSeed);
  const pushToast = useToastStore((state) => state.pushToast);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playCollection = useAudioStore((state) => state.playCollection);
  const [seedInput, setSeedInput] = useState(game.seed);
  const isTutorial = game.seed.trim().toLowerCase() === "tutorial";

  function restart() {
    const nextSeed = seedInput.trim() || game.seed;
    setSeed(nextSeed);
    reset(nextSeed, setupTurns);
    if (nextSeed.trim().toLowerCase() === "tutorial") playCollection("battleTheme1");
    else startBattleMusic(true);
  }

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(seedInput);
      pushToast({ title: "Seed copied", message: seedInput, tone: "success" });
    } catch {
      pushToast({ title: "Could not copy seed", message: seedInput, tone: "warning" });
    }
  }

  function regenerateSeed() {
    setSeedInput(generateRandomSeed());
  }

  return (
    <div className="game-result-overlay game-result-defeat fixed inset-0 z-[140] flex flex-col items-center justify-center">
      <div className="game-result-atmosphere" />
      <div className="game-result-banner" aria-hidden="true">
        <span className="game-result-line" />
        <span className="game-result-crest"><Skull size={32} strokeWidth={1.7} /></span>
        <h1>Defeat</h1>
        <span className="game-result-line game-result-line-right" />
      </div>

      <section className="game-result-panel old-panel w-full max-w-md p-6 text-center" role="dialog" aria-modal="true" aria-labelledby="defeat-result-title">
        <span className="game-result-panel-mark"><Skull size={17} /></span>
        <p id="defeat-result-title" className="game-result-message">
          The expedition ends in darkness
        </p>

        {!isTutorial && (
          <>
            <label className="game-result-seed-label mt-6 block text-left" htmlFor="defeat-seed">
              Chronicle seed
            </label>
            <div className="game-result-seed mt-2 flex gap-2">
              <input
                id="defeat-seed"
                value={seedInput}
                onChange={(event) => setSeedInput(event.target.value)}
                className="old-input h-11 w-full px-3 outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74]"
              />
              <button className="old-button flex h-11 w-11 items-center justify-center" type="button" onClick={copySeed} title="Copy seed">
                <Copy size={17} />
              </button>
              <button className="old-button flex h-11 w-11 items-center justify-center" type="button" onClick={regenerateSeed} title="Regenerate seed">
                <RefreshCw size={17} />
              </button>
            </div>
          </>
        )}

        <div className={["game-result-actions grid grid-cols-2 gap-3", isTutorial ? "mt-6" : "mt-5"].join(" ")}>
          <button
            className="game-result-action game-result-action-secondary flex h-12 w-full items-center justify-center gap-2"
            onClick={onReturnToMenu}
          >
            <Home size={18} />
            {isTutorial ? "Home" : "Menu"}
          </button>
          <button
            className="game-result-action game-result-action-primary flex h-12 w-full items-center justify-center gap-2"
            onClick={restart}
          >
            <RefreshCcw size={18} />
            {isTutorial ? "Restart Tutorial" : "Restart"}
          </button>
        </div>
      </section>
    </div>
  );
}

function generateRandomSeed(): string {
  const cryptoRandom = new Uint32Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(cryptoRandom);
  } else {
    cryptoRandom[0] = Math.floor(Math.random() * 0xffffffff);
    cryptoRandom[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `horde-${Date.now().toString(36)}-${cryptoRandom[0].toString(36)}${cryptoRandom[1].toString(36)}`;
}
