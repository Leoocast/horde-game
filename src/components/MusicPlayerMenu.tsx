import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MusicCollectionId } from "../audio/musicManifest";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { VolumePercentInput } from "./VolumePercentInput";

export function MusicPlayerMenu() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const menuPresence = useAnimatedPresence(open);
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
        setMenuPos({ top: rect.bottom + 14, right: window.innerWidth - rect.right });
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
      <button ref={buttonRef} className="game-header-button flex h-10 w-10 items-center justify-center transition" onClick={toggle} title={t("music.player")}>
        <Music size={20} />
      </button>
      {menuPresence.mounted && menuPos && (
        <div className={["old-panel game-popover game-music-popover game-menu-surface fixed z-[400] w-80 overflow-hidden text-[#e8dfc2]", menuPresence.closing ? "is-closing" : ""].join(" ")} style={{ top: menuPos.top, right: menuPos.right }}>
          <div className="space-y-4 p-4">
            <div className="game-music-now-playing flex items-center gap-3">
              <div className="game-music-now-icon"><Music size={18} /></div>
              <div className="min-w-0">
                <div className="game-dialog-kicker">{t("music.nowPlaying")}</div>
                <div className="mt-1 truncate font-serif text-base text-[#e9ddb9]">{musicStatus.label}</div>
                <div className="game-music-variant">{musicStatus.variant === "climax" ? t("music.climaxSequence") : t("music.battleSequence")}</div>
              </div>
            </div>

            <div className="game-music-controls grid grid-cols-4 gap-2">
              <button className="icon-button h-9 w-full" onClick={playPrevious} title={t("music.previous")}>
                <SkipBack size={16} />
              </button>
              <button className="icon-button h-9 w-full" onClick={toggleMusicPause} title={musicStatus.playing ? t("music.pause") : t("music.play")}>
                {musicStatus.playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="icon-button h-9 w-full" onClick={playNext} title={t("music.next")}>
                <SkipForward size={16} />
              </button>
              <button className="icon-button h-9 w-full" onClick={() => setMusicEnabled(!musicEnabled)} title={musicEnabled ? t("music.mute") : t("music.unmute")}>
                {musicEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
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
                className="game-range min-w-0 flex-1"
              />
              <VolumePercentInput value={musicVolume} onChange={setMusicVolume} ariaLabel={t("audio.musicPercent")} className="game-music-volume-value" />
            </div>

            <div className="game-music-playlist old-scrollbar max-h-72 overflow-auto pr-1">
              {playlist.map((track) => (
                <button
                  key={track.id}
                  className={[
                    "game-music-track flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold transition",
                    selectedId === track.id ? "is-selected" : "",
                  ].join(" ")}
                  onClick={() => selectCollection(track.id)}
                  onDoubleClick={() => playCollection(track.id as MusicCollectionId)}
                >
                  <span>{track.label}</span>
                  {musicStatus.collectionId === track.id && <span className="game-music-playing-tag">{musicStatus.variant}</span>}
                </button>
              ))}
            </div>
            <div className="game-music-hint">{t("music.selectHint")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
