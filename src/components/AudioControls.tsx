import { Music, Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "../store/useAudioStore";

export function AudioControls() {
  const enabled = useAudioStore((state) => state.enabled);
  const sfxVolume = useAudioStore((state) => state.sfxVolume);
  const musicEnabled = useAudioStore((state) => state.musicEnabled);
  const musicVolume = useAudioStore((state) => state.musicVolume);
  const setEnabled = useAudioStore((state) => state.setEnabled);
  const setSfxVolume = useAudioStore((state) => state.setSfxVolume);
  const setMusicEnabled = useAudioStore((state) => state.setMusicEnabled);
  const setMusicVolume = useAudioStore((state) => state.setMusicVolume);
  const playSfx = useAudioStore((state) => state.playSfx);

  return (
    <section className="old-panel-soft p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="old-title text-xs font-bold uppercase tracking-wide">SFX</div>
        <button
          className="old-button flex h-8 w-8 items-center justify-center rounded-full transition"
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
          className="min-w-0 flex-1 accent-[#d8a154]"
        />
        <span className="w-9 text-right text-xs font-bold text-[#d6b879]">{Math.round(sfxVolume * 100)}</span>
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
            className="old-button flex h-8 w-8 items-center justify-center rounded-full transition"
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
            className="min-w-0 flex-1 accent-[#d8a154]"
          />
          <span className="w-9 text-right text-xs font-bold text-[#d6b879]">{Math.round(musicVolume * 100)}</span>
        </div>
      </div>
    </section>
  );
}
