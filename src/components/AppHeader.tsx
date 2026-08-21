import type { ReactNode } from "react";
import { DestinyCopyIdentityButton } from "./DestinyCopyIdentityButton";
import { DestinyRewriteControl } from "./DestinyRewriteControl";
import { MusicPlayerMenu } from "./MusicPlayerMenu";
import { SettingsMenu } from "./SettingsMenu";

type Props = {
  left?: ReactNode;
  showSettings?: boolean;
  onReturnToMenu?: () => void;
  onRestartTutorial?: () => void;
  onRewriteFuture?: () => void;
  onContemplateFuture?: () => void;
  futureSeed?: string;
  sessionKind?: "normal" | "tutorial" | "journey";
  settingsRestricted?: boolean;
  setupTurns?: number;
  // The mulligan overlay (z-420) covers the whole screen. Lift the header above it so the music
  // and settings controls stay reachable while the opening hand is being decided.
  elevated?: boolean;
};

export function AppHeader({ left, showSettings = true, onReturnToMenu, onRestartTutorial, onRewriteFuture, onContemplateFuture, futureSeed, sessionKind = "normal", settingsRestricted, setupTurns, elevated = false }: Props) {
  const showDestinyControl = sessionKind === "normal"
    && Boolean(futureSeed)
    && Boolean(onRewriteFuture)
    && Boolean(onContemplateFuture);

  return (
    <header className={`game-command-bar relative ${sessionKind !== "normal" ? "z-[20010]" : elevated ? "z-[440]" : "z-[130]"} grid h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-0 text-[#f8dfa0]`}>
      <div className="game-command-left min-w-0 justify-self-start">{left}</div>
      <div className="game-command-actions flex items-center gap-2 justify-self-end">
        {showDestinyControl && (
          <>
            <DestinyRewriteControl
              seed={futureSeed!}
              onRewrite={onRewriteFuture!}
              onContemplateAnother={onContemplateFuture!}
            />
            <DestinyCopyIdentityButton seed={futureSeed!} />
          </>
        )}
        <MusicPlayerMenu />
        {showSettings && <SettingsMenu onReturnToMenu={onReturnToMenu} onRestartTutorial={onRestartTutorial} sessionKind={sessionKind} restricted={settingsRestricted} setupTurns={setupTurns} />}
      </div>
    </header>
  );
}
