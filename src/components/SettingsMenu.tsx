import { AlertTriangle, Copy, Crown, Home, RefreshCcw, RefreshCw, Settings, Skull, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { AudioControls } from "./AudioControls";
import { GameLog } from "./GameLog";
import { ZoneDrawer } from "./ZoneDrawer";

type Props = {
  onReturnToMenu?: () => void;
  setupTurns?: number;
};

export function SettingsMenu({ onReturnToMenu, setupTurns = 3 }: Props) {
  const game = useGameStore((state) => state.game);
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const reset = useGameStore((state) => state.reset);
  const triggerEndGame = useGameStore((state) => state.triggerEndGame);
  const pushToast = useToastStore((state) => state.pushToast);
  const isDeveloperMode = game.seed.trim().toLowerCase() === "developer";

  const [open, setOpen] = useState(false);
  const modalPresence = useAnimatedPresence(open, 220);
  const [showRestartConfirmation, setShowRestartConfirmation] = useState(false);
  const restartPresence = useAnimatedPresence(showRestartConfirmation, 190);
  const [restartSeed, setRestartSeed] = useState("");
  const effectiveSeed = seed.trim() || game.seed;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showRestartConfirmation) {
        event.preventDefault();
        setShowRestartConfirmation(false);
        return;
      }
      if (open) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, showRestartConfirmation]);

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(effectiveSeed);
      pushToast({ title: "Seed copied", message: effectiveSeed, tone: "success" });
    } catch {
      pushToast({ title: "Could not copy seed", message: effectiveSeed, tone: "warning" });
    }
  }

  function openRestartConfirmation() {
    setRestartSeed(effectiveSeed);
    setShowRestartConfirmation(true);
  }

  function restartGame() {
    const confirmedSeed = restartSeed.trim() || game.seed;
    setSeed(confirmedSeed);
    reset(confirmedSeed, setupTurns);
    setShowRestartConfirmation(false);
    setOpen(false);
  }

  return (
    <>
      <button className="game-header-button flex h-10 w-10 items-center justify-center transition" onClick={() => setOpen(true)} title="Settings" aria-label="Open settings">
        <Settings size={18} />
      </button>

      {modalPresence.mounted && (
        <div className={["game-settings-modal-backdrop fixed inset-0 z-[430] flex items-center justify-center p-5", modalPresence.closing ? "is-closing" : ""].join(" ")} role="presentation">
          <section className={["game-settings-modal old-panel flex max-h-[min(860px,calc(100vh-40px))] w-[min(1040px,calc(100vw-40px))] flex-col overflow-hidden", modalPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="battle-settings-title">
            <header className="game-settings-modal-header flex items-center justify-between gap-5 px-7 py-5">
              <div>
                <div className="game-dialog-kicker">Battle configuration</div>
                <h2 id="battle-settings-title">Settings &amp; Chronicle</h2>
              </div>
              <button className="game-header-button flex h-10 w-10 items-center justify-center" type="button" onClick={() => setOpen(false)} title="Close settings" aria-label="Close settings">
                <X size={19} />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-5 overflow-hidden p-5">
              <div className="old-scrollbar min-h-0 space-y-4 overflow-y-auto pr-2">
                <AudioControls />

                <section className="old-panel-soft p-4">
                  <div className="game-settings-section-title">Battle seed</div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                    <input value={seed} onChange={(event) => setSeed(event.target.value)} className="old-input game-seed-input h-10 min-w-0 px-3 text-sm outline-none" aria-label="Battle seed" />
                    <button className="icon-button h-10 w-10" type="button" onClick={copySeed} title="Copy seed" aria-label="Copy seed"><Copy size={16} /></button>
                    <button className="icon-button h-10 w-10" type="button" onClick={openRestartConfirmation} title="Restart battle" aria-label="Restart battle"><RefreshCcw size={16} /></button>
                  </div>
                  <div className="game-settings-rng mt-3">RNG state <span>{game.currentRandomState.toString(16)}</span></div>
                </section>

                <ZoneDrawer game={game} />

                {isDeveloperMode && (
                  <section className="old-panel-soft p-4">
                    <div className="game-settings-section-title">Developer options</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button className="game-dialog-action flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={() => triggerEndGame("horde")}><Skull size={14} /> Lose</button>
                      <button className="game-dialog-action game-dialog-action-primary flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={() => triggerEndGame("player")}><Crown size={14} /> Win</button>
                    </div>
                  </section>
                )}
              </div>

              <section className="game-settings-log old-panel-soft flex min-h-[430px] flex-col p-5">
                <div className="game-settings-chronicle-title">Chronicle</div>
                <p>Every action recorded during this battle.</p>
                <GameLog game={game} variant="embedded" className="mt-4 min-h-0 flex-1" />
              </section>
            </div>

            <footer className="game-settings-modal-footer flex items-center justify-between gap-4 px-5 py-4">
              {onReturnToMenu && (
                <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 px-6 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onReturnToMenu}><Home size={16} /> Return to menu</button>
              )}
              <button className="game-dialog-action flex h-11 items-center justify-center px-6 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setOpen(false)}>Close</button>
            </footer>
          </section>
        </div>
      )}

      {restartPresence.mounted && (
        <div className={["game-home-backdrop fixed inset-0 z-[460] flex items-center justify-center p-6 text-[#e4ddc2]", restartPresence.closing ? "is-closing" : ""].join(" ")} role="presentation">
          <section className={["old-panel game-home-dialog w-full max-w-md p-6", restartPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="restart-game-title">
            <div className="flex items-start gap-3">
              <div className="game-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center"><AlertTriangle size={20} /></div>
              <div>
                <div className="game-dialog-kicker">Rewrite this chronicle</div>
                <h2 id="restart-game-title" className="old-title mt-1 text-xl font-medium uppercase tracking-[0.08em]">Restart battle?</h2>
                <p className="mt-2 text-sm text-[#8d9a94]">Current progress will be lost.</p>
              </div>
            </div>
            <div className="mt-5 border border-[#687571]/35 bg-[#070d0f]/65 p-4">
              <div className="game-settings-section-title">New seed</div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <input value={restartSeed} onChange={(event) => setRestartSeed(event.target.value)} className="game-seed-input h-10 min-w-0 px-3 text-sm outline-none" />
                <button className="icon-button h-10 w-10" type="button" onClick={() => setRestartSeed(generateRandomSeed())} title="Generate seed"><RefreshCw size={16} /></button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="game-dialog-action flex h-11 items-center justify-center text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setShowRestartConfirmation(false)}>Cancel</button>
              <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={restartGame}><RefreshCcw size={16} /> Restart</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function generateRandomSeed(): string {
  const cryptoRandom = new Uint32Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(cryptoRandom);
  else {
    cryptoRandom[0] = Math.floor(Math.random() * 0xffffffff);
    cryptoRandom[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `hostfall-${Date.now().toString(36)}-${cryptoRandom[0].toString(36)}${cryptoRandom[1].toString(36)}`;
}
