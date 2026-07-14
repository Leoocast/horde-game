import { Crown, Home, Settings, Skull } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { AudioControls } from "./AudioControls";

type Props = {
  onReturnToMenu?: () => void;
};

export function SettingsMenu({ onReturnToMenu }: Props) {
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
      <button ref={buttonRef} className="old-button flex h-10 w-10 items-center justify-center rounded-full transition" onClick={toggle} title="Settings">
        <Settings size={18} />
      </button>
      {open && menuPos && (
        <div className="fixed z-[400] w-72" style={{ top: menuPos.top, right: menuPos.right }}>
          <AudioControls />
          
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

