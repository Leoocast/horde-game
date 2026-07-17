import { Copy, Crown, Home, RefreshCw, Settings, Skull } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { AudioControls } from "./AudioControls";

type Props = {
  onReturnToMenu?: () => void;
  launcher?: "icon" | "main-menu";
  newGameSeedSettings?: {
    seed: string;
    developerMode: boolean;
    onSeedChange: (seed: string) => void;
    onCopySeed: () => void;
    onRegenerateSeed: () => void;
    onToggleDeveloperMode: () => void;
  };
};

export function SettingsMenu({ onReturnToMenu, newGameSeedSettings, launcher = "icon" }: Props) {
  const seed = useGameStore((state) => state.game?.seed);
  const triggerEndGame = useGameStore((state) => state.triggerEndGame);
  const isDeveloperMode = seed?.trim().toLowerCase() === "developer";

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | undefined>();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-preserve-settings-menu='true']")) return;
      if (containerRef.current && !containerRef.current.contains(target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 14, right: window.innerWidth - rect.right });
      }
      return next;
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        className={launcher === "main-menu" ? "main-menu-entry group" : "game-header-button flex h-10 w-10 items-center justify-center rounded-full transition"}
        onClick={toggle}
        title="Settings"
      >
        {launcher === "main-menu" ? (
          <>
            <span className="main-menu-entry-mark" />
            <span>Ajustes</span>
          </>
        ) : (
          <Settings size={18} />
        )}
      </button>
      {open && menuPos && (
        <div className={["game-settings-popover fixed z-[400]", newGameSeedSettings ? "w-80" : "w-72"].join(" ")} style={{ top: menuPos.top, right: menuPos.right }}>
          <AudioControls />

          {newGameSeedSettings && (
            <div className="old-panel mt-2 p-4 text-[#f6e6b8]">
              <h3 className="old-title text-sm font-black uppercase tracking-widest text-[#f4cc74]">Game Setup</h3>
              <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="game-seed">
                Seed
              </label>
              <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                <input
                  id="game-seed"
                  value={newGameSeedSettings.developerMode ? "developer" : newGameSeedSettings.seed}
                  onChange={(event) => newGameSeedSettings.onSeedChange(event.target.value)}
                  disabled={newGameSeedSettings.developerMode}
                  className="old-input h-10 min-w-0 px-3 text-sm outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74] disabled:opacity-70"
                  placeholder="random-seed"
                />
                <button className="old-button flex h-10 w-10 items-center justify-center" type="button" onClick={newGameSeedSettings.onCopySeed} title="Copy seed">
                  <Copy size={16} />
                </button>
                <button className="old-button flex h-10 w-10 items-center justify-center" type="button" onClick={newGameSeedSettings.onRegenerateSeed} title="Regenerate seed">
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#8f6a36]/55 bg-[#1b120b]/55 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#d6b879]">
                <span>Developer mode</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={newGameSeedSettings.developerMode}
                  onClick={newGameSeedSettings.onToggleDeveloperMode}
                  className={[
                    "relative h-6 w-11 rounded-full border transition",
                    newGameSeedSettings.developerMode ? "border-[#f0c46f] bg-[#7a4515]" : "border-[#8f6a36]/70 bg-[#120b07]",
                  ].join(" ")}
                >
                  <span className={["absolute top-1 h-3.5 w-3.5 rounded-full bg-[#ffe6aa] transition", newGameSeedSettings.developerMode ? "left-6" : "left-1"].join(" ")} />
                </button>
              </div>
            </div>
          )}
          
          {onReturnToMenu && (
            <div className="mt-2">
              <button
                className="old-button flex h-11 w-full items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-[#ffcfc2]"
                onClick={onReturnToMenu}
              >
                <Home size={16} />
                Return to Menu
              </button>
            </div>
          )}

          {isDeveloperMode && onReturnToMenu && (
            <div className="old-panel mt-2 p-4">
              <h3 className="old-title mb-3 text-center text-sm font-black uppercase tracking-widest text-[#f4cc74]">Developer Options</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="old-button-green flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase"
                  onClick={() => {
                    triggerEndGame("player");
                    setOpen(false);
                  }}
                >
                  <Crown size={14} />
                  Win
                </button>
                <button
                  className="old-button flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase"
                  onClick={() => {
                    triggerEndGame("horde");
                    setOpen(false);
                  }}
                >
                  <Skull size={14} />
                  Lose
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
