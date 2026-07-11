import { create } from "zustand";
import { persist } from "zustand/middleware";
import { audioEngine } from "../audio/AudioEngine";
import type { SfxId } from "../audio/soundManifest";

type AudioStore = {
  enabled: boolean;
  sfxVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  setEnabled: (enabled: boolean) => void;
  setSfxVolume: (volume: number) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  playSfx: (id: SfxId, options?: { volume?: number; rate?: number }) => void;
  startBattleMusic: () => void;
  stopMusic: () => void;
  preload: () => void;
  stopAllSfx: () => void;
};

export const useAudioStore = create<AudioStore>()(
  persist(
    (set, get) => ({
      enabled: true,
      sfxVolume: 0.8,
      musicEnabled: true,
      musicVolume: 0.4,
      setEnabled: (enabled) => {
        set({ enabled });
        syncEngine();
      },
      setSfxVolume: (volume) => {
        set({ sfxVolume: clamp01(volume) });
        syncEngine();
      },
      setMusicEnabled: (musicEnabled) => {
        set({ musicEnabled });
        syncEngine();
        if (musicEnabled) audioEngine.startRandomBattleTheme();
      },
      setMusicVolume: (volume) => {
        set({ musicVolume: clamp01(volume) });
        syncEngine();
      },
      playSfx: (id, options) => {
        syncEngine();
        audioEngine.playSfx(id, options);
      },
      startBattleMusic: () => {
        syncEngine();
        audioEngine.startRandomBattleTheme();
      },
      stopMusic: () => audioEngine.stopMusic(),
      preload: () => {
        syncEngine();
        audioEngine.preloadSfx();
      },
      stopAllSfx: () => audioEngine.stopAllSfx(),
    }),
    {
      name: "horde-audio-settings",
      partialize: (state) => ({ enabled: state.enabled, sfxVolume: state.sfxVolume, musicEnabled: state.musicEnabled, musicVolume: state.musicVolume }),
      onRehydrateStorage: () => () => syncEngine(),
    },
  ),
);

function syncEngine() {
  const { enabled, sfxVolume, musicEnabled, musicVolume } = useAudioStore.getState();
  audioEngine.configure({ enabled, sfxVolume, musicEnabled, musicVolume });
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
