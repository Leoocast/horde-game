import { Music, Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "../store/useAudioStore";
import { VolumePercentInput } from "./VolumePercentInput";

type Props = {
  variant?: "panel" | "screen";
};

export function AudioControls({ variant = "panel" }: Props) {
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
        <div className="main-settings-section-title">Audio</div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">Sound Effects</div>
            <div className="main-settings-description">Actions, cards, and interface feedback</div>
          </div>
          <div className="main-settings-control">
            <input type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={(event) => setSfxVolume(Number(event.target.value))} className="main-settings-range game-range" />
            <VolumePercentInput value={sfxVolume} onChange={setSfxVolume} ariaLabel="Sound effects volume percentage" className="main-settings-value" />
            <button className={`main-settings-toggle ${enabled ? "is-on" : ""}`} type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)}>
              <span />
            </button>
          </div>
        </div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">Music</div>
            <div className="main-settings-description">Menu and battle soundtrack</div>
          </div>
          <div className="main-settings-control">
            <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} className="main-settings-range game-range" />
            <VolumePercentInput value={musicVolume} onChange={setMusicVolume} ariaLabel="Music volume percentage" className="main-settings-value" />
            <button className={`main-settings-toggle ${musicEnabled ? "is-on" : ""}`} type="button" role="switch" aria-checked={musicEnabled} onClick={() => setMusicEnabled(!musicEnabled)}>
              <span />
            </button>
          </div>
        </div>
        <div className="main-settings-row">
          <div>
            <div className="main-settings-label">Test Sound</div>
            <div className="main-settings-description">Play the interface confirmation sound</div>
          </div>
          <button data-audio-click="off" className="main-settings-action" disabled={!enabled} onClick={() => playSfx("click")} type="button">Test</button>
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
          title={enabled ? "Mute SFX" : "Enable SFX"}
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
        <VolumePercentInput value={sfxVolume} onChange={setSfxVolume} ariaLabel="Sound effects volume percentage" />
      </div>
      <button
        data-audio-click="off"
        className="old-button mt-3 h-8 w-full text-xs font-black uppercase tracking-wide transition disabled:opacity-40"
        disabled={!enabled}
        onClick={() => playSfx("click")}
      >
        Test
      </button>
      <div className="mt-4 border-t border-[#8f6a36]/60 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="old-title text-xs font-bold uppercase tracking-wide">Music</div>
          <button
            className="old-button flex h-8 w-8 items-center justify-center transition"
            onClick={() => setMusicEnabled(!musicEnabled)}
            title={musicEnabled ? "Mute music" : "Enable music"}
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
          <VolumePercentInput value={musicVolume} onChange={setMusicVolume} ariaLabel="Music volume percentage" />
        </div>
      </div>
    </section>
  );
}
