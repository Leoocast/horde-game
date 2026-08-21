import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/useTranslation";
import {
  desktopWindowState,
  onDesktopWindowStateChanged,
  setDesktopFullscreen,
} from "../platform/desktopBridge";

type Props = {
  variant?: "panel" | "screen";
};

export function DisplayControls({ variant = "panel" }: Props) {
  const t = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    void desktopWindowState().then((state) => {
      if (active) setFullscreen(state.fullscreen);
    });
    const unsubscribe = onDesktopWindowStateChanged((state) => setFullscreen(state.fullscreen));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function toggleFullscreen() {
    try {
      const state = await setDesktopFullscreen(!fullscreen);
      setFullscreen(state.fullscreen);
    } catch {
      // Browsers can reject fullscreen without a user gesture; this handler itself is one, but a
      // rejection still leaves the current state intact and Electron remains unaffected.
    }
  }

  if (variant === "screen") {
    return (
      <section className="main-settings-section">
        <div className="main-settings-section-title">{t("settings.display")}</div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">{t("settings.fullscreen")}</div>
            <div className="main-settings-description">{t("settings.fullscreenDescription")}</div>
          </div>
          <button className="main-settings-action main-settings-action-wide" type="button" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {fullscreen ? t("settings.exitFullscreen") : t("settings.enterFullscreen")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="hf-ui-panel-soft p-3">
      <div className="game-settings-section-title">{t("settings.display")}</div>
      <button className="hf-ui-button mt-3 flex h-9 w-full items-center justify-center gap-2 text-xs font-black uppercase tracking-wide" type="button" onClick={toggleFullscreen}>
        {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        {fullscreen ? t("settings.exitFullscreen") : t("settings.enterFullscreen")}
      </button>
    </section>
  );
}
