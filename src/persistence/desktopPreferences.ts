import type { AppLanguage } from "../i18n/translations";
import { guidedProgressStore, parseGuidedProgress, type GuidedProgressEnvelope } from "../guidance/progress";
import { useAudioStore } from "../store/useAudioStore";
import { useLanguageStore } from "../store/useLanguageStore";

export const DESKTOP_PREFERENCES_VERSION = 1;

export type DesktopPreferencesEnvelope = Readonly<{
  kind: "hostfall-preferences";
  formatVersion: 1;
  savedAt: string;
  values: Readonly<{
    language: AppLanguage;
    audio: Readonly<{
      sfxEnabled: boolean;
      sfxVolume: number;
      musicEnabled: boolean;
      musicVolume: number;
    }>;
    /** Optional only while reading preferences-v1 files created before guided lessons existed. */
    guidedLessons?: GuidedProgressEnvelope;
  }>;
}>;

export function createDesktopPreferencesEnvelope(savedAt = new Date().toISOString()): DesktopPreferencesEnvelope {
  const language = useLanguageStore.getState().language;
  const audio = useAudioStore.getState();
  return Object.freeze({
    kind: "hostfall-preferences",
    formatVersion: DESKTOP_PREFERENCES_VERSION,
    savedAt,
    values: Object.freeze({
      language,
      audio: Object.freeze({
        sfxEnabled: audio.enabled,
        sfxVolume: audio.sfxVolume,
        musicEnabled: audio.musicEnabled,
        musicVolume: audio.musicVolume,
      }),
      guidedLessons: guidedProgressStore.snapshot(),
    }),
  });
}

export function parseDesktopPreferences(value: unknown): DesktopPreferencesEnvelope | undefined {
  if (!isRecord(value) || value.kind !== "hostfall-preferences" || value.formatVersion !== DESKTOP_PREFERENCES_VERSION) return undefined;
  if (typeof value.savedAt !== "string" || !isRecord(value.values)) return undefined;
  const { language, audio } = value.values;
  if ((language !== "en" && language !== "es") || !isRecord(audio)) return undefined;
  if (typeof audio.sfxEnabled !== "boolean" || typeof audio.musicEnabled !== "boolean") return undefined;
  if (!isUnitNumber(audio.sfxVolume) || !isUnitNumber(audio.musicVolume)) return undefined;
  const guidedLessons = "guidedLessons" in value.values
    ? parseGuidedProgress(value.values.guidedLessons)
    : undefined;
  if ("guidedLessons" in value.values && !guidedLessons) return undefined;
  return Object.freeze({
    kind: "hostfall-preferences",
    formatVersion: DESKTOP_PREFERENCES_VERSION,
    savedAt: value.savedAt,
    values: Object.freeze({
      language,
      audio: Object.freeze({
        sfxEnabled: audio.sfxEnabled,
        sfxVolume: audio.sfxVolume,
        musicEnabled: audio.musicEnabled,
        musicVolume: audio.musicVolume,
      }),
      ...(guidedLessons ? { guidedLessons } : {}),
    }),
  });
}

/**
 * Desktop files become authoritative when available. With no file, the existing localStorage
 * values are imported once and written as preferences-v1; the web adapter remains untouched.
 */
export async function initializeDesktopPreferences(): Promise<() => void> {
  const bridge = window.hostfallDesktop;
  if (!bridge) return () => undefined;

  const candidates = await bridge.readPreferences();
  const stored = parseDesktopPreferences(candidates.primary) ?? parseDesktopPreferences(candidates.backup);
  if (stored) {
    applyDesktopPreferences(stored);
    // Additive v1 migration: old preference files remain valid and inherit any web completion
    // imported before desktop became authoritative.
    if (!stored.values.guidedLessons) await bridge.writePreferences(createDesktopPreferencesEnvelope());
  }
  else await bridge.writePreferences(createDesktopPreferencesEnvelope());

  let writeTimer: number | undefined;
  const scheduleWrite = () => {
    if (writeTimer !== undefined) window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(() => {
      writeTimer = undefined;
      void bridge.writePreferences(createDesktopPreferencesEnvelope()).catch(() => undefined);
    }, 180);
  };
  const unsubscribeLanguage = useLanguageStore.subscribe(scheduleWrite);
  const unsubscribeAudio = useAudioStore.subscribe(scheduleWrite);
  // Completion is a one-shot milestone, not a continuously dragged preference. Dispatch it
  // immediately so closing right after the final lesson frame does not wait on the audio debounce.
  const unsubscribeGuidedProgress = guidedProgressStore.subscribe(() => {
    void bridge.writePreferences(createDesktopPreferencesEnvelope()).catch(() => undefined);
  });
  return () => {
    if (writeTimer !== undefined) window.clearTimeout(writeTimer);
    unsubscribeLanguage();
    unsubscribeAudio();
    unsubscribeGuidedProgress();
  };
}

function applyDesktopPreferences(preferences: DesktopPreferencesEnvelope): void {
  const { language, audio } = preferences.values;
  useLanguageStore.getState().setLanguage(language);
  const audioStore = useAudioStore.getState();
  audioStore.setEnabled(audio.sfxEnabled);
  audioStore.setSfxVolume(audio.sfxVolume);
  audioStore.setMusicEnabled(audio.musicEnabled);
  audioStore.setMusicVolume(audio.musicVolume);
  if (preferences.values.guidedLessons) guidedProgressStore.hydrate(preferences.values.guidedLessons);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
