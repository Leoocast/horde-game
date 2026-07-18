import type { ReactNode } from "react";
import { MusicPlayerMenu } from "./MusicPlayerMenu";
import { SettingsMenu } from "./SettingsMenu";

type Props = {
  left?: ReactNode;
  showSettings?: boolean;
  onReturnToMenu?: () => void;
  setupTurns?: number;
};

export function AppHeader({ left, showSettings = true, onReturnToMenu, setupTurns }: Props) {
  return (
    <header className="game-command-bar relative z-[130] grid h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-0 text-[#f8dfa0]">
      <div className="game-command-left min-w-0 justify-self-start">{left}</div>
      <div className="game-command-actions flex items-center gap-2 justify-self-end">
        <MusicPlayerMenu />
        {showSettings && <SettingsMenu onReturnToMenu={onReturnToMenu} setupTurns={setupTurns} />}
      </div>
    </header>
  );
}
