import { sfxManifest, type SfxId } from "./soundManifest";
import { musicCollectionIds, musicCollections, type MusicCollectionId, type MusicVariant } from "./musicManifest";

type AudioSettings = {
  enabled: boolean;
  sfxVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
};

type PlayOptions = {
  volume?: number;
  rate?: number;
};

export type MusicStatus = {
  collectionId?: MusicCollectionId;
  variant: MusicVariant;
  label: string;
  playing: boolean;
  muted: boolean;
  paused: boolean;
};

const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  sfxVolume: 0.8,
  musicEnabled: true,
  musicVolume: 0.4,
};

class AudioEngine {
  private settings: AudioSettings = DEFAULT_SETTINGS;
  private sfxCache = new Map<SfxId, HTMLAudioElement>();
  private activeSfx = new Set<HTMLAudioElement>();
  private music?: HTMLAudioElement;
  private currentCollectionId?: MusicCollectionId;
  private currentVariant: MusicVariant = "battle";
  private pausedByUser = false;
  private pausedByMute = false;

  configure(settings: Partial<AudioSettings>) {
    this.settings = {
      ...this.settings,
      ...settings,
      sfxVolume: clamp01(settings.sfxVolume ?? this.settings.sfxVolume),
      musicVolume: clamp01(settings.musicVolume ?? this.settings.musicVolume),
    };
    this.syncMusicSettings();
  }

  preloadSfx(ids: SfxId[] = Object.keys(sfxManifest) as SfxId[]) {
    for (const id of ids) this.getBaseSfx(id);
  }

  playSfx(id: SfxId, options: PlayOptions = {}) {
    if (!this.settings.enabled) return;
    const base = this.getBaseSfx(id);
    const instance = base.cloneNode(true) as HTMLAudioElement;
    instance.volume = clamp01(this.settings.sfxVolume * (options.volume ?? 1));
    instance.playbackRate = options.rate ?? 1;
    instance.preload = "auto";
    this.activeSfx.add(instance);

    const cleanup = () => {
      instance.pause();
      instance.removeAttribute("src");
      instance.load();
      this.activeSfx.delete(instance);
    };
    instance.addEventListener("ended", cleanup, { once: true });
    instance.addEventListener("error", cleanup, { once: true });

    void instance.play().catch(() => {
      cleanup();
    });
  }

  stopAllSfx() {
    for (const sound of this.activeSfx) {
      sound.pause();
      sound.currentTime = 0;
    }
    this.activeSfx.clear();
  }

  startRandomBattleTheme() {
    if (this.music && this.currentCollectionId) {
      this.resumeMusic();
      return this.getStatus();
    }

    const id = musicCollectionIds[Math.floor(Math.random() * musicCollectionIds.length)];
    return this.playCollection(id, "battle");
  }

  playCollection(id: MusicCollectionId, variant: MusicVariant = this.currentVariant) {
    if (this.currentCollectionId === id && this.currentVariant === variant && this.music) {
      this.pausedByUser = false;
      this.resumeMusic();
      return this.getStatus();
    }

    const currentTime = this.currentCollectionId === id && this.music ? this.music.currentTime : 0;
    this.replaceMusic(id, variant, currentTime);
    this.pausedByUser = false;
    this.resumeMusic();
    return this.getStatus();
  }

  setVariant(variant: MusicVariant) {
    if (!this.currentCollectionId) return this.getStatus();
    if (this.currentVariant === variant) return this.getStatus();
    this.replaceMusic(this.currentCollectionId, variant, 0);
    this.resumeMusic();
    return this.getStatus();
  }

  playNext() {
    const currentIndex = this.currentCollectionId ? musicCollectionIds.indexOf(this.currentCollectionId) : -1;
    const next = musicCollectionIds[(currentIndex + 1 + musicCollectionIds.length) % musicCollectionIds.length];
    return this.playCollection(next, this.currentVariant);
  }

  playPrevious() {
    const currentIndex = this.currentCollectionId ? musicCollectionIds.indexOf(this.currentCollectionId) : 0;
    const previous = musicCollectionIds[(currentIndex - 1 + musicCollectionIds.length) % musicCollectionIds.length];
    return this.playCollection(previous, this.currentVariant);
  }

  pauseMusic() {
    if (!this.music) return this.getStatus();
    this.pausedByUser = true;
    this.music.pause();
    return this.getStatus();
  }

  resumeMusic() {
    if (!this.music) return this.getStatus();
    if (!this.settings.musicEnabled || this.pausedByUser) return this.getStatus();
    this.pausedByMute = false;
    void this.music.play().catch(() => undefined);
    return this.getStatus();
  }

  togglePause() {
    if (!this.music) return this.startRandomBattleTheme();
    if (this.pausedByUser || this.music.paused) {
      this.pausedByUser = false;
      return this.resumeMusic();
    }
    return this.pauseMusic();
  }

  stopMusic() {
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
    this.music = undefined;
    this.currentCollectionId = undefined;
    this.currentVariant = "battle";
    this.pausedByUser = false;
    this.pausedByMute = false;
  }

  getStatus(): MusicStatus {
    return {
      collectionId: this.currentCollectionId,
      variant: this.currentVariant,
      label: this.currentCollectionId ? musicCollections[this.currentCollectionId].label : "No track",
      playing: Boolean(this.music && !this.music.paused && !this.pausedByUser && this.settings.musicEnabled),
      muted: !this.settings.musicEnabled,
      paused: Boolean(this.music && (this.pausedByUser || this.music.paused)),
    };
  }

  private syncMusicSettings() {
    if (!this.music) return;
    this.music.volume = this.settings.musicVolume;
    if (!this.settings.musicEnabled) {
      this.pausedByMute = true;
      this.music.pause();
      return;
    }
    if (this.pausedByMute && !this.pausedByUser) this.resumeMusic();
  }

  private replaceMusic(id: MusicCollectionId, variant: MusicVariant, startAt = 0) {
    if (this.music) this.music.pause();
    this.currentCollectionId = id;
    this.currentVariant = variant;

    const music = new Audio(musicCollections[id][variant]);
    music.loop = true;
    music.preload = "auto";
    music.volume = this.settings.musicVolume;
    try {
      music.currentTime = Math.max(0, startAt);
    } catch {
      music.addEventListener("loadedmetadata", () => {
        music.currentTime = Math.max(0, startAt);
      }, { once: true });
    }
    this.music = music;
  }

  private getBaseSfx(id: SfxId) {
    const cached = this.sfxCache.get(id);
    if (cached) return cached;
    const audio = new Audio(sfxManifest[id]);
    audio.preload = "auto";
    this.sfxCache.set(id, audio);
    return audio;
  }
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export const audioEngine = new AudioEngine();
