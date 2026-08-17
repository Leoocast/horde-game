import { AlertTriangle, Crown, Home, RefreshCcw, Settings, Skull, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { guidedProgressStore } from "../guidance/progress";
import { AudioControls } from "./AudioControls";
import { DisplayControls } from "./DisplayControls";
import { GameLog } from "./GameLog";
import { LanguageSelector } from "./LanguageSelector";
import { ZoneDrawer } from "./ZoneDrawer";

type Props = {
  onReturnToMenu?: () => void;
  onRestartTutorial?: () => void;
  sessionKind?: "normal" | "tutorial";
  setupTurns?: number;
};

export function SettingsMenu({ onReturnToMenu, onRestartTutorial, sessionKind = "normal", setupTurns = 3 }: Props) {
  const t = useTranslation();
  const game = useGameStore((state) => state.game);
  const reset = useGameStore((state) => state.reset);
  const triggerEndGame = useGameStore((state) => state.triggerEndGame);
  const isDeveloperMode = game.seed.trim().toLowerCase() === "developer";

  const [open, setOpen] = useState(false);
  const modalPresence = useAnimatedPresence(open, 220);
  const [showRestartConfirmation, setShowRestartConfirmation] = useState(false);
  const restartPresence = useAnimatedPresence(showRestartConfirmation, 190);
  const tutorial = sessionKind === "tutorial";
  const guidanceProgress = useSyncExternalStore(
    (listener) => guidedProgressStore.subscribe(listener),
    () => guidedProgressStore.snapshot(),
    () => guidedProgressStore.snapshot(),
  );

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

  function openRestartConfirmation() {
    setShowRestartConfirmation(true);
  }

  function restartGame() {
    if (tutorial) {
      onRestartTutorial?.();
      setShowRestartConfirmation(false);
      setOpen(false);
      return;
    }
    reset(game.seed, setupTurns);
    setShowRestartConfirmation(false);
    setOpen(false);
  }

  return (
    <>
      <button
        {...(tutorial ? { "data-guided-system-control": "true" } : {})}
        className="game-header-button flex h-10 w-10 items-center justify-center transition"
        onClick={() => setOpen(true)}
        title={t("menu.settings")}
        aria-label={t("settings.open")}
      >
        <Settings size={18} />
      </button>

      {modalPresence.mounted && (
        <div
          {...(tutorial ? { "data-guided-system-control": "true", "data-guided-system-modal": "true" } : {})}
          className={[`game-settings-modal-backdrop fixed inset-0 ${tutorial ? "z-[20030]" : "z-[430]"} flex items-center justify-center p-5`, modalPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
        >
          <section className={[`game-settings-modal old-panel flex max-h-[min(860px,calc(100vh-40px))] ${tutorial ? "w-[min(560px,calc(100vw-40px))]" : "w-[min(1040px,calc(100vw-40px))]"} flex-col overflow-hidden`, modalPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="battle-settings-title">
            <header className="game-settings-modal-header flex items-center justify-between gap-5 px-7 py-5">
              <div>
                <div className="game-dialog-kicker">{t(tutorial ? "guided.settings.kicker" : "settings.battleConfiguration")}</div>
                <h2 id="battle-settings-title">{t(tutorial ? "guided.settings.title" : "settings.battleTitle")}</h2>
              </div>
              <button className="game-header-button flex h-10 w-10 items-center justify-center" type="button" onClick={() => setOpen(false)} title={t("settings.close")} aria-label={t("settings.close")}>
                <X size={19} />
              </button>
            </header>

            <div className={`grid min-h-0 flex-1 ${tutorial ? "grid-cols-1" : "grid-cols-[320px_minmax(0,1fr)]"} gap-5 overflow-hidden p-5`}>
              <div className="old-scrollbar min-h-0 space-y-4 overflow-y-auto pr-2">
                <LanguageSelector variant="panel" />
                <AudioControls />
                <DisplayControls />

                <section className="old-panel-soft p-4">
                  <div className="game-settings-section-title">{t("guided.contextual.settingsTitle")}</div>
                  <label className="contextual-help-preference mt-3">
                    <input
                      type="checkbox"
                      checked={guidanceProgress.preferences.hideSeenContextualHelp}
                      onChange={(event) => guidedProgressStore.setHideSeenContextualHelp(event.currentTarget.checked)}
                    />
                    <span>
                      <strong>{t("guided.contextual.hideSeenLabel")}</strong>
                      <small>{t("guided.contextual.hideSeenBody")}</small>
                    </span>
                  </label>
                </section>

                {!tutorial && <ZoneDrawer game={game} />}

                {!tutorial && isDeveloperMode && (
                  <section className="old-panel-soft p-4">
                    <div className="game-settings-section-title">{t("settings.developerOptions")}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button className="game-dialog-action col-span-2 flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={openRestartConfirmation}><RefreshCcw size={14} /> {t("settings.restartBattle")}</button>
                      <button className="game-dialog-action flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={() => triggerEndGame("host")}><Skull size={14} /> {t("settings.lose")}</button>
                      <button className="game-dialog-action game-dialog-action-primary flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={() => triggerEndGame("player")}><Crown size={14} /> {t("settings.win")}</button>
                    </div>
                  </section>
                )}

                {tutorial && (
                  <section className="old-panel-soft p-4">
                    <div className="game-settings-section-title">{t("guided.settings.lesson")}</div>
                    <p className="mt-2 text-sm text-[#8d9a94]">{t("guided.settings.restartDescription")}</p>
                    <button className="game-dialog-action mt-4 flex h-10 w-full items-center justify-center gap-2 text-xs font-bold uppercase" type="button" onClick={openRestartConfirmation}>
                      <RefreshCcw size={15} /> {t("guided.lifecycle.restart")}
                    </button>
                  </section>
                )}
              </div>

              {!tutorial && <section className="game-settings-log old-panel-soft flex min-h-[430px] flex-col p-5">
                <div className="game-settings-chronicle-title">Chronicle</div>
                <p>Every action recorded during this battle.</p>
                <GameLog game={game} variant="embedded" className="mt-4 min-h-0 flex-1" />
              </section>}
            </div>

            <footer className="game-settings-modal-footer flex items-center justify-between gap-4 px-5 py-4">
              {onReturnToMenu && (
                <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 px-6 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onReturnToMenu}><Home size={16} /> {t(tutorial ? "guided.lifecycle.exit" : "settings.returnMenu")}</button>
              )}
              <button className="game-dialog-action flex h-11 items-center justify-center px-6 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setOpen(false)}>{t("common.close")}</button>
            </footer>
          </section>
        </div>
      )}

      {restartPresence.mounted && (
        <div
          {...(tutorial ? { "data-guided-system-control": "true", "data-guided-system-modal": "true" } : {})}
          className={[`game-home-backdrop fixed inset-0 ${tutorial ? "z-[20040]" : "z-[460]"} flex items-center justify-center p-6 text-[#e4ddc2]`, restartPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
        >
          <section className={["old-panel game-home-dialog w-full max-w-md p-6", restartPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="restart-game-title">
            <div className="flex items-start gap-3">
              <div className="game-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center"><AlertTriangle size={20} /></div>
              <div>
                <div className="game-dialog-kicker">{t(tutorial ? "guided.settings.restartKicker" : isDeveloperMode ? "settings.developerOptions" : "settings.rewriteChronicle")}</div>
                <h2 id="restart-game-title" className="old-title mt-1 text-xl font-medium uppercase tracking-[0.08em]">{t(tutorial ? "guided.settings.restartTitle" : "settings.restartQuestion")}</h2>
                <p className="mt-2 text-sm text-[#8d9a94]">{t(tutorial ? "guided.settings.restartBody" : "settings.currentProgressLost")}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="game-dialog-action flex h-11 items-center justify-center text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setShowRestartConfirmation(false)}>{t("common.cancel")}</button>
              <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={restartGame}><RefreshCcw size={16} /> {t("common.restart")}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
