export const DEVELOPER_MODE_STORAGE_KEY = "horde-game-developer-mode";
export const PLAYER_NAME_STORAGE_KEY = "horde-game-player-name";
export const ONBOARDING_STORAGE_KEY = "horde-game-onboarding-complete";
export const ASSET_PRELOAD_STORAGE_KEY = "horde-game-assets-preloaded-v2";

const APP_CACHE_PREFIXES = ["horde-card-details:", "horde-deck-card-details:"];

export function readStoredDeveloperMode(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "true";
}

export function persistDeveloperMode(enabled: boolean): void {
  if (typeof window !== "undefined") window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, String(enabled));
}

export function readStoredPlayerName(): string {
  if (typeof window === "undefined") return "Chronicler";
  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() || "Chronicler";
}

export function completeOnboarding(playerName: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName.trim() || "Chronicler");
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
}

export function hasCompletedOnboarding(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
}

export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  window.localStorage.removeItem(ASSET_PRELOAD_STORAGE_KEY);
}

export function hasPreloadedGameAssets(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(ASSET_PRELOAD_STORAGE_KEY) === "true";
}

export function markGameAssetsPreloaded(): void {
  if (typeof window !== "undefined") window.localStorage.setItem(ASSET_PRELOAD_STORAGE_KEY, "true");
}

export async function clearAppAssetCache(): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ASSET_PRELOAD_STORAGE_KEY);
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key && APP_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) window.localStorage.removeItem(key);
  }
  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith("hostfall-assets-")).map((name) => window.caches.delete(name)));
  }
}
