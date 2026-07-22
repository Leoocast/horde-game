import { Music, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { VolumePercentInput } from "./VolumePercentInput";

type Props = {
  variant?: "panel" | "screen";
};

export function AudioControls({ variant = "panel" }: Props) {
  const t = useTranslation();
  const enabled = useAudioStore((state) => state.enabled);
  const sfxVolume = useAudioStore((state) => state.sfxVolume);
  const musicEnabled = useAudioStore((state) => state.musicEnabled);
  const musicVolume = useAudioStore((state) => state.musicVolume);
  const setEnabled = useAudioStore((state) => state.setEnabled);
  const setSfxVolume = useAudioStore((state) => state.setSfxVolume);
  const setMusicEnabled = useAudioStore((state) => state.setMusicEnabled);
  const setMusicVolume = useAudioStore((state) => state.setMusicVolume);
  const playSfx = useAudioStore((state) => state.playSfx);

  if (variant === "screen") {
    return (
      <section className="main-settings-section">
        <div className="main-settings-section-title">{t("audio.title")}</div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">{t("audio.sfx")}</div>
            <div className="main-settings-description">{t("audio.sfxDescription")}</div>
          </div>
          <div className="main-settings-control">
            <input type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={(event) => setSfxVolume(Number(event.target.value))} className="main-settings-range game-range" />
            <VolumePercentInput value={sfxVolume} onChange={setSfxVolume} ariaLabel={t("audio.sfxPercent")} className="main-settings-value" />
            <button className={`main-settings-toggle ${enabled ? "is-on" : ""}`} type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)}>
              <span />
            </button>
          </div>
        </div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">{t("audio.music")}</div>
            <div className="main-settings-description">{t("audio.musicDescription")}</div>
          </div>
          <div className="main-settings-control">
            <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} className="main-settings-range game-range" />
            <VolumePercentInput value={musicVolume} onChange={setMusicVolume} ariaLabel={t("audio.musicPercent")} className="main-settings-value" />
            <button className={`main-settings-toggle ${musicEnabled ? "is-on" : ""}`} type="button" role="switch" aria-checked={musicEnabled} onClick={() => setMusicEnabled(!musicEnabled)}>
              <span />
            </button>
          </div>
        </div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">{t("audio.testSound")}</div>
            <div className="main-settings-description">{t("audio.testDescription")}</div>
          </div>
          <button data-audio-click="off" className="main-settings-action" disabled={!enabled} onClick={() => playSfx("click")} type="button">{t("common.test")}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="old-panel-soft p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="old-title text-xs font-bold uppercase tracking-wide">SFX</div>
        <button
          className="old-button flex h-8 w-8 items-center justify-center transition"
          onClick={() => setEnabled(!enabled)}
          title={enabled ? t("audio.muteSfx") : t("audio.enableSfx")}
        >
          {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sfxVolume}
          onChange={(event) => setSfxVolume(Number(event.target.value))}
          className="game-range min-w-0 flex-1"
        />
        <VolumePercentInput value={sfxVolume} onChange={setSfxVolume} ariaLabel={t("audio.sfxPercent")} />
      </div>
      <button
        data-audio-click="off"
        className="old-button mt-3 h-8 w-full text-xs font-black uppercase tracking-wide transition disabled:opacity-40"
        disabled={!enabled}
        onClick={() => playSfx("click")}
      >
        {t("common.test")}
      </button>
      <div className="mt-4 border-t border-[#8f6a36]/60 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="old-title text-xs font-bold uppercase tracking-wide">{t("audio.music")}</div>
          <button
            className="old-button flex h-8 w-8 items-center justify-center transition"
            onClick={() => setMusicEnabled(!musicEnabled)}
            title={musicEnabled ? t("audio.muteMusic") : t("audio.enableMusic")}
          >
            {musicEnabled ? <Music size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume}
            onChange={(event) => setMusicVolume(Number(event.target.value))}
            className="game-range min-w-0 flex-1"
          />
          <VolumePercentInput value={musicVolume} onChange={setMusicVolume} ariaLabel={t("audio.musicPercent")} />
        </div>
      </div>
    </section>
  );
}
