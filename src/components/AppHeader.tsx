import type { ReactNode } from "react";
import { MusicPlayerMenu } from "./MusicPlayerMenu";
import { SettingsMenu } from "./SettingsMenu";

type Props = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  showSettings?: boolean;
  onReturnToMenu?: () => void;
};

export function AppHeader({ left, center, right, showSettings = true, onReturnToMenu }: Props) {
  return (
    <header className="old-frame-top relative z-[130] grid h-14 grid-cols-[minmax(280px,1fr)_auto_minmax(48px,1fr)] items-center gap-2 px-0 py-0 text-[#f8dfa0]">
      <div className="min-w-0 justify-self-start">{left}</div>
      <div className="justify-self-center">{center}</div>
      <div className="flex items-center gap-2 pr-3 justify-self-end">
        <MusicPlayerMenu />
        {right}
        {showSettings && <SettingsMenu onReturnToMenu={onReturnToMenu} />}
      </div>
    </header>
  );
}
