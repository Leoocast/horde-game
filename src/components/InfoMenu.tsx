import { AlertTriangle, Copy, Menu, RefreshCcw, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { GameLog } from "./GameLog";
import { ZoneDrawer } from "./ZoneDrawer";

export function InfoMenu({ setupTurns }: { setupTurns: number }) {
  const game = useGameStore((state) => state.game);
  const [open, setOpen] = useState(false);
  const menuPresence = useAnimatedPresence(open);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | undefined>();
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const reset = useGameStore((state) => state.reset);
  const pushToast = useToastStore((state) => state.pushToast);
  const [showRestartConfirmation, setShowRestartConfirmation] = useState(false);
  const [restartSeed, setRestartSeed] = useState("");
  const nextSeed = seed.trim() || game.seed;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
      }
      return next;
    });
  };

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(nextSeed);
      pushToast({ title: "Seed copied", message: nextSeed, tone: "success" });
    } catch {
      pushToast({ title: "Could not copy seed", message: nextSeed, tone: "warning" });
    }
  }

  function restartGame() {
    const confirmedSeed = restartSeed.trim() || game.seed;
    setSeed(confirmedSeed);
    reset(confirmedSeed, setupTurns);
    setShowRestartConfirmation(false);
    setOpen(false);
  }

  function openRestartConfirmation() {
    setRestartSeed(nextSeed);
    setShowRestartConfirmation(true);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button ref={buttonRef} className="game-header-button flex h-10 w-10 items-center justify-center transition" onClick={toggle} title="Battle information">
        <Menu size={20} />
      </button>
      {menuPresence.mounted && menuPos && (
        <div className={["old-panel game-popover game-menu-surface old-scrollbar fixed z-[400] max-h-[calc(100vh-90px)] w-80 overflow-auto text-[#f6e6b8]", menuPresence.closing ? "is-closing" : ""].join(" ")} style={{ top: menuPos.top, right: menuPos.right }}>
          <div className="space-y-3 p-3">
            <div>
              <label className="old-title text-xs font-bold uppercase tracking-wide">Seed</label>
              <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2">
                <input value={seed} onChange={(event) => setSeed(event.target.value)} className="old-input game-seed-input min-w-0 flex-1 px-2 py-1 text-sm outline-none" />
                <button className="icon-button" type="button" onClick={copySeed} title="Copy seed" aria-label="Copy seed">
                  <Copy size={16} />
                </button>
                <button className="icon-button" type="button" onClick={openRestartConfirmation} title="Restart" aria-label="Restart game">
                  <RefreshCcw size={16} />
                </button>
              </div>
            </div>
            <div className="text-xs text-[#d6b879]">RNG: {game.currentRandomState.toString(16)}</div>
            <ZoneDrawer game={game} />
            <GameLog game={game} className="h-60" />
          </div>
        </div>
      )}

      {showRestartConfirmation && (
        <div className="fixed inset-0 z-[450] flex items-center justify-center bg-[#090604]/90 p-6 text-[#f6e6b8] backdrop-blur-sm" role="presentation">
          <section className="old-panel w-full max-w-md p-5 shadow-2xl shadow-black/70" role="dialog" aria-modal="true" aria-labelledby="restart-game-title">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#b97637] bg-[#3a1b0d] text-[#ffbd73]">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 id="restart-game-title" className="old-title text-lg font-black uppercase tracking-wide text-[#f4cc74]">
                  Restart game?
                </h2>
                <p className="mt-1 text-sm text-[#d6b879]">Your current game progress will be lost.</p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 rounded-lg border border-[#8f6a36]/55 bg-[#120b07]/75 p-4">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a98d5c]">Current seed</dt>
                <dd className="mt-1 break-all font-mono text-sm text-[#f6e6b8]">{game.seed}</dd>
              </div>
              <div className="border-t border-[#8f6a36]/40 pt-3">
                <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a98d5c]">New seed</dt>
                <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-3">
                  <dd className="min-w-0 break-all font-mono text-sm text-[#ffe09a]">{restartSeed}</dd>
                  <button
                    className="old-button flex h-9 w-9 items-center justify-center"
                    type="button"
                    onClick={() => setRestartSeed(generateRandomSeed())}
                    title="Regenerate seed"
                    aria-label="Regenerate new seed"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>
            </dl>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="old-button flex h-11 items-center justify-center text-sm font-black uppercase tracking-wide" type="button" onClick={() => setShowRestartConfirmation(false)}>
                Cancel
              </button>
              <button className="old-button-green flex h-11 items-center justify-center gap-2 text-sm font-black uppercase tracking-wide" type="button" onClick={restartGame}>
                <RefreshCcw size={16} />
                Restart
              </button>
            </div>
          </section>
        </div>
      )}
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
