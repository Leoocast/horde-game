import { Crown, Home, RefreshCcw, Settings, Skull, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { guidedProgressStore } from "../guidance/progress";
import { AudioControls } from "./AudioControls";
import { DisplayControls } from "./DisplayControls";
import { GameLog } from "./GameLog";
import { LanguageSelector } from "./LanguageSelector";
import { ZoneDrawer } from "./ZoneDrawer";
import { GameConfirmationDialog } from "./GameConfirmationDialog";

type Props = {
  onReturnToMenu?: () => void;
  onRestartTutorial?: () => void;
  sessionKind?: "normal" | "tutorial" | "journey";
  restricted?: boolean;
  setupTurns?: number;
  initiallyOpen?: boolean;
  hideLauncher?: boolean;
  allowDeveloperActions?: boolean;
  onDismiss?: () => void;
};

export function SettingsMenu({
  onReturnToMenu,
  onRestartTutorial,
  sessionKind = "normal",
  restricted,
  setupTurns = 3,
  initiallyOpen = false,
  hideLauncher = false,
  allowDeveloperActions = true,
  onDismiss,
}: Props) {
  const t = useTranslation();
  const game = useGameStore((state) => state.game);
  const reset = useGameStore((state) => state.reset);
  const triggerEndGame = useGameStore((state) => state.triggerEndGame);
  const isDeveloperMode = allowDeveloperActions && game.seed.trim().toLowerCase() === "developer";

  const [open, setOpenState] = useState(initiallyOpen);
  const modalPresence = useAnimatedPresence(open, 220);
  const [showRestartConfirmation, setShowRestartConfirmation] = useState(false);
  const restartPresence = useAnimatedPresence(showRestartConfirmation, 190);
  const guided = restricted ?? sessionKind !== "normal";
  const journey = sessionKind === "journey";
  const portalLauncher = guided && typeof document !== "undefined";
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
    if (guided) {
      onRestartTutorial?.();
      setShowRestartConfirmation(false);
      setOpen(false);
      return;
    }
    reset(game.seed, setupTurns);
    setShowRestartConfirmation(false);
    setOpen(false);
  }

  const launcher = (
    <button
      {...(guided ? { "data-guided-system-control": "true" } : {})}
      className="game-header-button flex h-10 w-10 items-center justify-center transition"
      onClick={() => setOpen(true)}
      title={t("menu.settings")}
      aria-label={t("settings.open")}
    >
      <Settings size={18} />
    </button>
  );

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) onDismiss?.();
  }

  return (
    <>
      {!hideLauncher && portalLauncher && <span className="block h-10 w-10" aria-hidden="true" />}
      {!hideLauncher && (portalLauncher
        ? createPortal(
          <div className="game-settings-popover game-guided-settings-launcher-layer fixed right-4 top-4">
            {launcher}
          </div>,
          document.body,
        )
        : launcher)}

      {modalPresence.mounted && createPortal(
        <div
          {...(guided ? { "data-guided-system-control": "true", "data-guided-system-modal": "true" } : {})}
          className={["game-settings-popover game-settings-system-layer game-settings-modal-backdrop fixed inset-0 flex items-center justify-center p-5", modalPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
        >
          <section className={[`game-settings-modal hf-ui-panel flex max-h-[min(860px,calc(100vh-40px))] ${guided ? "w-[min(640px,calc(100vw-40px))]" : "w-[min(1040px,calc(100vw-40px))]"} flex-col overflow-hidden`, modalPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="battle-settings-title">
            <header className="game-settings-modal-header flex items-center justify-between gap-5 px-7 py-5">
              <div>
                <div className="game-dialog-kicker">{t(journey ? "guided.journey.settingsKicker" : guided ? "guided.settings.kicker" : "settings.battleConfiguration")}</div>
                <h2 id="battle-settings-title">{t(journey ? "guided.journey.settingsTitle" : guided ? "guided.settings.title" : "settings.battleTitle")}</h2>
              </div>
              <button className="game-header-button flex h-10 w-10 items-center justify-center" type="button" onClick={() => setOpen(false)} title={t("settings.close")} aria-label={t("settings.close")}>
                <X size={19} />
              </button>
            </header>

            <div className={`grid min-h-0 flex-1 ${guided ? "grid-cols-1" : "grid-cols-[320px_minmax(0,1fr)]"} gap-5 overflow-hidden p-5`}>
              <div className="old-scrollbar min-h-0 space-y-4 overflow-y-auto pr-2">
                <LanguageSelector variant="panel" />
                <AudioControls />
                <DisplayControls />

                {!guided && <section className="hf-ui-panel-soft p-4">
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
                </section>}

                {!guided && <ZoneDrawer game={game} />}

                {!guided && isDeveloperMode && (
                  <section className="hf-ui-panel-soft p-4">
                    <div className="game-settings-section-title">{t("settings.developerOptions")}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button className="game-dialog-action col-span-2 flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={openRestartConfirmation}><RefreshCcw size={14} /> {t("settings.restartBattle")}</button>
                      <button className="game-dialog-action flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={() => triggerEndGame("host")}><Skull size={14} /> {t("settings.lose")}</button>
                      <button className="game-dialog-action game-dialog-action-primary flex h-10 items-center justify-center gap-2 text-xs font-bold uppercase" onClick={() => triggerEndGame("player")}><Crown size={14} /> {t("settings.win")}</button>
                    </div>
                  </section>
                )}

                {guided && (
                  <section className="hf-ui-panel-soft p-4">
                    <div className="game-settings-section-title">{t(journey ? "guided.journey.current" : "guided.settings.lesson")}</div>
                    <p className="mt-2 text-sm text-[#8d9a94]">{t(journey ? "guided.journey.restartDescription" : "guided.settings.restartDescription")}</p>
                    <button className="hf-ui-button guided-settings-restart mt-4 flex h-9 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wide transition" type="button" onClick={openRestartConfirmation}>
                      <RefreshCcw size={15} /> {t(journey ? "guided.journey.restart" : "guided.lifecycle.restart")}
                    </button>
                  </section>
                )}
              </div>

              {!guided && <section className="game-settings-log hf-ui-panel-soft flex min-h-[430px] flex-col p-5">
                <div className="game-settings-chronicle-title">Chronicle</div>
                <p>Every action recorded during this battle.</p>
                <GameLog game={game} variant="embedded" className="mt-4 min-h-0 flex-1" />
              </section>}
            </div>

            <footer className="game-settings-modal-footer flex items-center justify-between gap-4 px-5 py-4">
              {onReturnToMenu && (
                <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 px-6 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onReturnToMenu}><Home size={16} /> {t(journey ? "guided.journey.exit" : guided ? "guided.lifecycle.exit" : "settings.returnMenu")}</button>
              )}
              <button className="game-dialog-action flex h-11 items-center justify-center px-6 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setOpen(false)}>{t("common.close")}</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}

      {restartPresence.mounted && createPortal(
        <div
          {...(guided ? { "data-guided-system-control": "true", "data-guided-system-modal": "true" } : {})}
          className={["game-settings-popover game-system-confirmation-layer game-home-backdrop fixed inset-0 flex items-center justify-center p-6 text-[#e4ddc2]", restartPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
        >
          <GameConfirmationDialog
            titleId="restart-game-title"
            title={t(journey ? "guided.journey.restartTitle" : guided ? "guided.settings.restartTitle" : "settings.restartQuestion")}
            body={t(journey ? "guided.journey.restartBody" : guided ? "guided.settings.restartBody" : "settings.currentProgressLost")}
            closing={restartPresence.closing}
            actions={[
              { label: t("common.cancel"), onClick: () => setShowRestartConfirmation(false) },
              { label: t("common.restart"), icon: <RefreshCcw size={16} />, onClick: restartGame, primary: true },
            ]}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
