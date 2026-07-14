import { Menu, RefreshCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { GameLog } from "./GameLog";
import { ZoneDrawer } from "./ZoneDrawer";

export function InfoMenu({ setupTurns }: { setupTurns: number }) {
  const game = useGameStore((state) => state.game);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | undefined>();
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const reset = useGameStore((state) => state.reset);

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

  return (
    <div className="relative" ref={containerRef}>
      <button ref={buttonRef} className="old-button flex h-10 w-10 items-center justify-center rounded-full transition" onClick={toggle} title="Extra info">
        <Menu size={20} />
      </button>
      {open && menuPos && (
        <div className="old-panel old-scrollbar fixed z-[400] max-h-[calc(100vh-90px)] w-80 overflow-auto text-[#f6e6b8]" style={{ top: menuPos.top, right: menuPos.right }}>
          <div className="space-y-3 p-3">
            <div>
              <label className="old-title text-xs font-bold uppercase tracking-wide">Seed</label>
              <div className="mt-1 flex gap-2">
                <input value={seed} onChange={(event) => setSeed(event.target.value)} className="old-input min-w-0 flex-1 px-2 py-1 text-sm outline-none focus:border-[#f4cc74]" />
                <button className="icon-button" onClick={() => reset(seed, setupTurns)} title="Reset">
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
    </div>
  );
}
