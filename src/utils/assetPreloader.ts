import { audioEngine } from "../audio/AudioEngine";
import type { MusicCollectionId } from "../audio/musicManifest";

const CRITICAL_MUSIC: MusicCollectionId[] = ["mainMenuTheme", "winTheme", "lossTheme", "battleTheme1", "battleTheme3"];

type ProgressUpdate = {
  completed: number;
  total: number;
  percent: number;
  label: string;
};

// Image preloading (bundled art + deck card artwork) is disabled for now: it was
// blocking the loading screen and delaying game start. Images load lazily as cards
// render instead. Sound preload stays, since it's cheap and audio pops if skipped.
export async function preloadGameAssets(onProgress: (update: ProgressUpdate) => void): Promise<void> {
  const mediaTasks: Array<{ label: string; run: () => Promise<void>; timeoutMs?: number }> = [
    { label: "Tuning sound effects", run: () => audioEngine.preloadSfx() },
    { label: "Preparing the first songs", run: () => audioEngine.preloadMusic(CRITICAL_MUSIC), timeoutMs: 60000 },
  ];

  let completed = 0;
  const total = Math.max(mediaTasks.length, 1);
  onProgress({ completed, total, percent: 0, label: "Opening the ancient gates" });

  const finishTask = async (task: { label: string; run: () => Promise<void>; timeoutMs?: number }) => {
    try {
      await withTimeout(task.run(), task.timeoutMs ?? 15000);
    } catch {
      // One unavailable asset must not prevent the game from opening.
    }
    completed += 1;
    onProgress({ completed, total, percent: Math.round((completed / total) * 100), label: task.label });
  };

  await runWithConcurrency(mediaTasks, mediaTasks.length, finishTask);
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Asset preload timed out")), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}
