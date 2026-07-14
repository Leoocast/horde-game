import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AudioControls } from "./AudioControls";

export function SettingsMenu() {
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
        </div>
      )}
    </div>
  );
}
