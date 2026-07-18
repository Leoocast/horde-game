import { musicCollections } from "../audio/musicManifest";
import { sfxManifest } from "../audio/soundManifest";
import { inspectableDecks } from "../data/deckCatalog";
import { resolveDeckCardDetails } from "./deckCardImages";

const ASSET_CACHE_NAME = "hostfall-assets-v1";

type ProgressUpdate = {
  completed: number;
  total: number;
  percent: number;
  label: string;
};

const bundledImages = Object.values(
  import.meta.glob("../../assets/images/*.{avif,gif,jpeg,jpg,png,svg,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
) as string[];

const audioUrls = Array.from(new Set([
  ...Object.values(sfxManifest),
  ...Object.values(musicCollections).flatMap((collection) => [collection.battle, collection.climax]),
]));

export async function preloadGameAssets(onProgress: (update: ProgressUpdate) => void): Promise<void> {
  const cardTasks = inspectableDecks.flatMap((deck) => {
    const cards = [...deck.deck.cards, ...(deck.deck.tokens ?? [])];
    return cards.map((card) => ({ deck, card }));
  });
  const uniqueCardTasks = Array.from(new Map(cardTasks.map((task) => [`${task.deck.id}:${task.card.id}`, task])).values());
  const tasks: Array<{ label: string; run: () => Promise<void> }> = [
    ...bundledImages.map((url) => ({ label: "Preparing artwork", run: () => preloadUrl(url) })),
    ...audioUrls.map((url) => ({ label: "Tuning the soundscape", run: () => preloadUrl(url) })),
    ...uniqueCardTasks.map(({ deck, card }) => ({
      label: "Gathering the chronicles",
      run: async () => {
        const details = await resolveDeckCardDetails(deck.id, card, deck.images);
        if (details?.imageUrl) await preloadUrl(details.imageUrl);
      },
    })),
  ];

  let completed = 0;
  const total = Math.max(tasks.length, 1);
  onProgress({ completed, total, percent: 0, label: "Opening the ancient gates" });

  await runWithConcurrency(tasks, 6, async (task) => {
    try {
      await withTimeout(task.run(), 15000);
    } catch {
      // One unavailable remote asset must not prevent the game from opening.
    }
    completed += 1;
    onProgress({ completed, total, percent: Math.round((completed / total) * 100), label: task.label });
  });
}

async function preloadUrl(url: string): Promise<void> {
  const assetCache = "caches" in window ? await window.caches.open(ASSET_CACHE_NAME) : undefined;
  const cached = await assetCache?.match(url);
  if (cached) {
    await cached.blob();
    return;
  }
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
  await assetCache?.put(url, response.clone());
  await response.blob();
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
