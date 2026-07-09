import { Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "../store/useAudioStore";

export function AudioControls() {
  const enabled = useAudioStore((state) => state.enabled);
  const sfxVolume = useAudioStore((state) => state.sfxVolume);
  const setEnabled = useAudioStore((state) => state.setEnabled);
  const setSfxVolume = useAudioStore((state) => state.setSfxVolume);
  const playSfx = useAudioStore((state) => state.playSfx);

  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wide text-stone-300">SFX</div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-cyan-100 transition hover:border-cyan-200/60"
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
          className="min-w-0 flex-1 accent-cyan-300"
        />
        <span className="w-9 text-right text-xs font-bold text-stone-300">{Math.round(sfxVolume * 100)}</span>
      </div>
      <button
        data-audio-click="off"
        className="mt-3 h-8 w-full rounded-xl border border-cyan-200/25 bg-cyan-500/15 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-40"
        disabled={!enabled}
        onClick={() => playSfx("click")}
      >
        Test
      </button>
    </section>
  );
}
