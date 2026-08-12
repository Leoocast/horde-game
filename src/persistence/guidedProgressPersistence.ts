import {
  emptyGuidedProgress,
  guidedProgressStore,
  parseGuidedProgress,
} from "../guidance/progress";

export const GUIDED_PROGRESS_STORAGE_KEY = "hostfall-guided-progress:v1";

/**
 * Web stores completion in its own namespace. Desktop imports that value once as a migration
 * fallback, then profile/preferences-v1.json becomes authoritative.
 */
export function initializeGuidedProgressPersistence(): () => void {
  if (typeof window === "undefined") return () => undefined;
  try {
    const raw = window.localStorage.getItem(GUIDED_PROGRESS_STORAGE_KEY);
    guidedProgressStore.hydrate(raw ? parseGuidedProgress(JSON.parse(raw)) ?? emptyGuidedProgress() : emptyGuidedProgress());
  } catch {
    guidedProgressStore.hydrate(emptyGuidedProgress());
  }

  if (window.hostfallDesktop) return () => undefined;
  return guidedProgressStore.subscribe((progress) => {
    try {
      window.localStorage.setItem(GUIDED_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // A denied web storage write must not make the active lesson fail after completion.
    }
  });
}
