import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MusicCollectionId } from "../audio/musicManifest";
import { useAudioStore } from "../store/useAudioStore";

export function MusicPlayerMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | undefined>();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
      }
      return next;
    });
  };

  const musicEnabled = useAudioStore((state) => state.musicEnabled);
  const musicVolume = useAudioStore((state) => state.musicVolume);
  const musicStatus = useAudioStore((state) => state.musicStatus);
  const selectedCollectionId = useAudioStore((state) => state.selectedCollectionId);
  const playlist = useAudioStore((state) => state.playlist);
  const setMusicEnabled = useAudioStore((state) => state.setMusicEnabled);
  const setMusicVolume = useAudioStore((state) => state.setMusicVolume);
  const selectCollection = useAudioStore((state) => state.selectCollection);
  const playCollection = useAudioStore((state) => state.playCollection);
  const playNext = useAudioStore((state) => state.playNext);
  const playPrevious = useAudioStore((state) => state.playPrevious);
  const toggleMusicPause = useAudioStore((state) => state.toggleMusicPause);

  const selectedId = selectedCollectionId ?? musicStatus.collectionId;

  return (
    <div className="relative" ref={containerRef}>
      <button ref={buttonRef} className="old-button flex h-10 w-10 items-center justify-center rounded-full transition" onClick={toggle} title="Music player">
        <Music size={20} />
      </button>
      {open && menuPos && (
        <div className="old-panel fixed z-[400] w-80 overflow-hidden text-[#f6e6b8]" style={{ top: menuPos.top, right: menuPos.right }}>
          <div className="space-y-3 p-3">
            <div>
              <div className="old-title text-xs font-bold uppercase tracking-wide">Now Playing</div>
              <div className="mt-1 text-sm font-black text-[#fff0b2]">{musicStatus.label}</div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#bda574]">{musicStatus.variant === "climax" ? "Climax" : "Battle"}</div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <button className="icon-button h-9 w-full" onClick={playPrevious} title="Previous">
                <SkipBack size={16} />
              </button>
              <button className="icon-button h-9 w-full" onClick={toggleMusicPause} title={musicStatus.playing ? "Pause" : "Play"}>
                {musicStatus.playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="icon-button h-9 w-full" onClick={playNext} title="Next">
                <SkipForward size={16} />
              </button>
              <button className="icon-button h-9 w-full" onClick={() => setMusicEnabled(!musicEnabled)} title={musicEnabled ? "Mute" : "Unmute"}>
                {musicEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button className="icon-button h-9 w-full" onClick={() => musicStatus.collectionId && playCollection(musicStatus.collectionId)} title="Replay selected">
                <Play size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3">
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

            <div className="old-panel-soft max-h-72 overflow-auto p-1">
              {playlist.map((track) => (
                <button
                  key={track.id}
                  className={[
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs font-bold transition hover:bg-[#6f4b20]/40",
                    selectedId === track.id ? "bg-[#8a5b20]/55 text-[#fff0b2]" : "text-[#d6b879]",
                  ].join(" ")}
                  onClick={() => selectCollection(track.id)}
                  onDoubleClick={() => playCollection(track.id as MusicCollectionId)}
                >
                  <span>{track.label}</span>
                  {musicStatus.collectionId === track.id && <span className="text-[10px] uppercase text-[#9fda72]">{musicStatus.variant}</span>}
                </button>
              ))}
            </div>
            <div className="text-[11px] leading-snug text-[#bda574]">Click to select. Double click to play.</div>
          </div>
        </div>
      )}
    </div>
  );
}
