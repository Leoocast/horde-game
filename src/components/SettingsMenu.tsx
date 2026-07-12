import { Settings } from "lucide-react";
import { useState } from "react";
import { AudioControls } from "./AudioControls";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button className="old-button flex h-10 w-10 items-center justify-center rounded-full transition" onClick={() => setOpen((value) => !value)} title="Settings">
        <Settings size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72">
          <AudioControls />
        </div>
      )}
    </div>
  );
}
