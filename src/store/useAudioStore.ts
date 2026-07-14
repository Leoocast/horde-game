import { create } from "zustand";
import { persist } from "zustand/middleware";
import { audioEngine, type MusicStatus } from "../audio/AudioEngine";
import { musicCollectionIds, musicCollections, type MusicCollectionId, type MusicVariant } from "../audio/musicManifest";
import type { SfxId } from "../audio/soundManifest";

type AudioStore = {
  enabled: boolean;
  sfxVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  musicStatus: MusicStatus;
  selectedCollectionId?: MusicCollectionId;
  playlist: Array<{ id: MusicCollectionId; label: string }>;
  setEnabled: (enabled: boolean) => void;
  setSfxVolume: (volume: number) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  selectCollection: (id: MusicCollectionId) => void;
  playCollection: (id: MusicCollectionId) => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleMusicPause: () => void;
  setMusicVariant: (variant: MusicVariant) => void;
  playSfx: (id: SfxId, options?: { volume?: number; rate?: number }) => void;
  startBattleMusic: (forceNew?: boolean) => void;
  startMenuMusic: () => void;
  resumeMusic: () => void;
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
      musicVolume: 0.1,
      musicStatus: audioEngine.getStatus(),
      selectedCollectionId: undefined,
      playlist: musicCollectionIds.map((id) => ({ id, label: musicCollections[id].label })),
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
        syncMusicStatus();
      },
      setMusicVolume: (volume) => {
        set({ musicVolume: clamp01(volume) });
        syncEngine();
      },
      selectCollection: (id) => set({ selectedCollectionId: id }),
      playCollection: (id) => {
        syncEngine();
        const variant = get().musicStatus.variant;
        const status = audioEngine.playCollection(id, variant);
        set({ musicStatus: status, selectedCollectionId: id });
      },
      playNext: () => {
        syncEngine();
        const status = audioEngine.playNext();
        set({ musicStatus: status, selectedCollectionId: status.collectionId });
      },
      playPrevious: () => {
        syncEngine();
        const status = audioEngine.playPrevious();
        set({ musicStatus: status, selectedCollectionId: status.collectionId });
      },
      toggleMusicPause: () => {
        syncEngine();
        const status = audioEngine.togglePause();
        set({ musicStatus: status, selectedCollectionId: status.collectionId ?? get().selectedCollectionId });
      },
      setMusicVariant: (variant) => {
        syncEngine();
        const status = audioEngine.setVariant(variant);
        set({ musicStatus: status, selectedCollectionId: status.collectionId ?? get().selectedCollectionId });
      },
      playSfx: (id, options) => {
        syncEngine();
        audioEngine.playSfx(id, options);
      },
      startBattleMusic: (forceNew?: boolean) => {
        syncEngine();
        const force = forceNew === true; // Convert event objects to boolean
        const status = audioEngine.startRandomBattleTheme(force);
        set({ musicStatus: status, selectedCollectionId: status.collectionId ?? get().selectedCollectionId });
      },
      startMenuMusic: () => {
        syncEngine();
        const status = audioEngine.playCollection("mainMenuTheme", "battle");
        set({ musicStatus: status, selectedCollectionId: status.collectionId ?? get().selectedCollectionId });
      },
      resumeMusic: () => {
        syncEngine();
        const status = audioEngine.resumeMusic();
        set({ musicStatus: status, selectedCollectionId: status.collectionId ?? get().selectedCollectionId });
      },
      stopMusic: () => {
        audioEngine.stopMusic();
        syncMusicStatus();
      },
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
  syncMusicStatus();
}

function syncMusicStatus() {
  useAudioStore.setState({ musicStatus: audioEngine.getStatus() });
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
