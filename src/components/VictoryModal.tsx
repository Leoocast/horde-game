import { Copy, Crown, Home, RefreshCcw, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { useAudioStore } from "../store/useAudioStore";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  game: GameState;
  setupTurns: number;
  onReturnToMenu: () => void;
};

export function VictoryModal({ game, setupTurns, onReturnToMenu }: Props) {
  const t = useTranslation();
  const reset = useGameStore((state) => state.reset);
  const setSeed = useGameStore((state) => state.setSeed);
  const pushToast = useToastStore((state) => state.pushToast);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playCollection = useAudioStore((state) => state.playCollection);
  const resetSfx = useAudioStore((state) => state.resetSfx);
  const [seedInput, setSeedInput] = useState(game.seed);
  const isTutorial = game.seed.trim().toLowerCase() === "tutorial";

  function restart() {
    const nextSeed = seedInput.trim() || game.seed;
    resetSfx();
    setSeed(nextSeed);
    reset(nextSeed, setupTurns);
    if (nextSeed.trim().toLowerCase() === "tutorial") playCollection("battleTheme1");
    else startBattleMusic(true);
  }

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(seedInput);
      pushToast({ title: t("toast.seedCopied"), message: seedInput, tone: "success" });
    } catch {
      pushToast({ title: t("toast.seedCopyFailed"), message: seedInput, tone: "warning" });
    }
  }

  function regenerateSeed() {
    setSeedInput(generateRandomSeed());
  }

  return (
    <div className="game-result-overlay game-result-victory fixed inset-0 z-[140] flex flex-col items-center justify-center">
      <div className="game-result-atmosphere" />
      <div className="game-result-banner" aria-hidden="true">
        <span className="game-result-line" />
        <span className="game-result-crest"><Crown size={32} strokeWidth={1.7} /></span>
        <h1>{t("result.victory")}</h1>
        <span className="game-result-line game-result-line-right" />
      </div>

      <section className="game-result-panel old-panel w-full max-w-md p-6 text-center" role="dialog" aria-modal="true" aria-labelledby="victory-result-title">
        <span className="game-result-panel-mark" />
        <p id="victory-result-title" className="game-result-message">
          {t("result.hordeDefeated")}
        </p>

        {!isTutorial && (
          <>
            <label className="game-result-seed-label mt-6 block text-left" htmlFor="victory-seed">
              {t("result.chronicleSeed")}
            </label>
            <div className="game-result-seed mt-2 flex gap-2">
              <input
                id="victory-seed"
                value={seedInput}
                onChange={(event) => setSeedInput(event.target.value)}
                className="old-input h-11 w-full px-3 outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74]"
              />
              <button className="old-button flex h-11 w-11 items-center justify-center" type="button" onClick={copySeed} title={t("result.copySeed")}>
                <Copy size={17} />
              </button>
              <button className="old-button flex h-11 w-11 items-center justify-center" type="button" onClick={regenerateSeed} title={t("result.regenerateSeed")}>
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
            {isTutorial ? t("common.home") : t("common.menu")}
          </button>
          <button
            className="game-result-action game-result-action-primary flex h-12 w-full items-center justify-center gap-2"
            onClick={restart}
          >
            <RefreshCcw size={18} />
            {isTutorial ? t("result.restartTutorial") : t("common.restart")}
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
  return `hostfall-${Date.now().toString(36)}-${cryptoRandom[0].toString(36)}${cryptoRandom[1].toString(36)}`;
}
