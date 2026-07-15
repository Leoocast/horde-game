import { Copy, Crown, Home, RefreshCcw, RefreshCw } from "lucide-react";
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

export function VictoryModal({ game, setupTurns, onReturnToMenu }: Props) {
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

        {!isTutorial && (
          <>
            <label className="mt-6 block text-left text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="victory-seed">
              Seed
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="victory-seed"
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

        <div className={["grid grid-cols-2 gap-3", isTutorial ? "mt-6" : "mt-5"].join(" ")}>
          <button
            className="old-button flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
            onClick={onReturnToMenu}
          >
            <Home size={18} />
            {isTutorial ? "Home" : "Menu"}
          </button>
          <button
            className="old-button-green flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
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
