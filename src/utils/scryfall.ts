import type { AppLanguage } from "../i18n/translations";

const REQUEST_GAP_MS = 125;
let nextRequestAt = 0;
let requestGate: Promise<void> = Promise.resolve();

export async function fetchScryfallJson(url: string, attempt = 0): Promise<unknown> {
  try {
    await waitForRequestSlot();
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-cache" });
    if (!response.ok) {
      const error = new Error(`Card lookup failed: ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (attempt >= 2 || (status !== undefined && status < 500 && status !== 429)) throw error;
    await delay(650 * (attempt + 1));
    return fetchScryfallJson(url, attempt + 1);
  }
}

export async function localizedScryfallPayload(payload: unknown, language: AppLanguage): Promise<unknown> {
  if (language !== "es") return payload;
  const set = readString(payload, "set");
  const collectorNumber = readString(payload, "collector_number");
  if (!set || !collectorNumber) return payload;
  try {
    return await fetchScryfallJson(`https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(collectorNumber)}/es`);
  } catch {
    return payload;
  }
}

function waitForRequestSlot(): Promise<void> {
  const slot = requestGate.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait > 0) await delay(wait);
    nextRequestAt = Date.now() + REQUEST_GAP_MS;
  });
  requestGate = slot.catch(() => undefined);
  return slot;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null || !(key in source)) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
