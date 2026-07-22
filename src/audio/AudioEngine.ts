import { sfxManifest, type SfxId } from "./soundManifest";
import { battleThemeIds, musicCollectionIds, musicCollections, type MusicCollectionId, type MusicVariant } from "./musicManifest";

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
  sfxVolume: 1,
  musicEnabled: true,
  musicVolume: 0.6,
};

const SFX_POOL_SIZE = 3;

class AudioEngine {
  private settings: AudioSettings = DEFAULT_SETTINGS;
  private sfxCache = new Map<SfxId, HTMLAudioElement[]>();
  private activeSfx = new Set<HTMLAudioElement>();
  private preparedMusic = new Map<string, HTMLAudioElement>();
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

  async preloadSfx(ids: SfxId[] = Object.keys(sfxManifest) as SfxId[]) {
    await Promise.all(ids.flatMap((id) => this.getSfxPool(id).map((audio) => waitForMediaReady(audio))));
  }

  async preloadMusic(ids: MusicCollectionId[]) {
    const tracks = Array.from(new Map(ids.flatMap((id) => (["battle", "climax"] as MusicVariant[]).map((variant) => ({
      key: musicKey(id, variant),
      url: musicCollections[id][variant],
    }))).map((track) => [track.key, track])).values());
    await Promise.all(tracks.map(({ key, url }) => {
      const prepared = this.preparedMusic.get(key);
      if (prepared) return waitForMediaReady(prepared);
      const audio = createAudio(url);
      this.preparedMusic.set(key, audio);
      return waitForMediaReady(audio);
    }));
  }

  playSfx(id: SfxId, options: PlayOptions = {}) {
    if (!this.settings.enabled) return;
    const pool = this.getSfxPool(id);
    // `paused` is not a reliable ownership signal while a freshly requested
    // HTMLAudioElement is still starting. Two SFX fired in the same frame could
    // therefore grab the same element and the second reset the first before it
    // became audible. Keep voices reserved until their play finishes/fails.
    const instance = pool.find((audio) => !this.activeSfx.has(audio)) ?? createAudio(sfxManifest[id]);
    if (!pool.includes(instance)) pool.push(instance);
    instance.pause();
    instance.currentTime = 0;
    instance.volume = clamp01(volumeToGain(this.settings.sfxVolume) * (options.volume ?? 1));
    instance.playbackRate = options.rate ?? 1;
    instance.preload = "auto";
    this.activeSfx.add(instance);

    const cleanup = () => {
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

  startRandomBattleTheme(forceNew = false) {
    const isBattleTheme = this.currentCollectionId && battleThemeIds.includes(this.currentCollectionId);
    if (!forceNew && this.music && isBattleTheme) {
      this.resumeMusic();
      return this.getStatus();
    }

    const id = battleThemeIds[Math.floor(Math.random() * battleThemeIds.length)];
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
    this.stashCurrentMusic();
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
    this.music.volume = volumeToGain(this.settings.musicVolume);
    if (!this.settings.musicEnabled) {
      this.pausedByMute = true;
      this.music.pause();
      return;
    }
    if (this.pausedByMute && !this.pausedByUser) this.resumeMusic();
  }

  private replaceMusic(id: MusicCollectionId, variant: MusicVariant, startAt = 0) {
    if (this.music) this.stashCurrentMusic();
    this.currentCollectionId = id;
    this.currentVariant = variant;

    const key = musicKey(id, variant);
    const music = this.preparedMusic.get(key) ?? createAudio(musicCollections[id][variant]);
    this.preparedMusic.delete(key);
    music.loop = true;
    music.volume = volumeToGain(this.settings.musicVolume);
    try {
      music.currentTime = Math.max(0, startAt);
    } catch {
      music.addEventListener("loadedmetadata", () => {
        music.currentTime = Math.max(0, startAt);
      }, { once: true });
    }
    this.music = music;
  }

  private stashCurrentMusic() {
    if (!this.music || !this.currentCollectionId) return;
    this.music.pause();
    this.music.currentTime = 0;
    this.preparedMusic.set(musicKey(this.currentCollectionId, this.currentVariant), this.music);
  }

  private getSfxPool(id: SfxId) {
    const cached = this.sfxCache.get(id);
    if (cached) return cached;
    const pool = Array.from({ length: SFX_POOL_SIZE }, () => createAudio(sfxManifest[id]));
    this.sfxCache.set(id, pool);
    return pool;
  }
}

function createAudio(url: string) {
  const audio = new Audio(url);
  audio.preload = "auto";
  return audio;
}

function waitForMediaReady(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`Audio failed to preload: ${audio.currentSrc || audio.src}`)); };
    audio.addEventListener("canplaythrough", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.load();
  });
}

function musicKey(id: MusicCollectionId, variant: MusicVariant) {
  return musicCollections[id][variant];
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// HTMLMediaElement.volume is a linear gain control, but the slider is easier to
// use when its low end follows human loudness perception more closely.
function volumeToGain(value: number) {
  const normalized = clamp01(value);
  return normalized * normalized;
}

export const audioEngine = new AudioEngine();
