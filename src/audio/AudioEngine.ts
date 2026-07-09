import { sfxManifest, type SfxId } from "./soundManifest";

type AudioSettings = {
  enabled: boolean;
  sfxVolume: number;
};

type PlayOptions = {
  volume?: number;
  rate?: number;
};

const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  sfxVolume: 0.8,
};

class AudioEngine {
  private settings: AudioSettings = DEFAULT_SETTINGS;
  private sfxCache = new Map<SfxId, HTMLAudioElement>();
  private activeSfx = new Set<HTMLAudioElement>();

  configure(settings: Partial<AudioSettings>) {
    this.settings = {
      ...this.settings,
      ...settings,
      sfxVolume: clamp01(settings.sfxVolume ?? this.settings.sfxVolume),
    };
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
