import type { AppLanguage } from "../i18n/translations";

const REQUEST_GAP_MS = 300;
const MAX_RETRIES = 2;

type ScryfallRequestError = Error & {
  status?: number;
  retryAfterMs?: number;
};

const responseCache = new Map<string, unknown>();
const pendingRequests = new Map<string, Promise<unknown>>();
let nextRequestAt = 0;
let requestGate: Promise<void> = Promise.resolve();

export function fetchScryfallJson(url: string): Promise<unknown> {
  if (responseCache.has(url)) return Promise.resolve(responseCache.get(url));

  const existing = pendingRequests.get(url);
  if (existing) return existing;

  const request = fetchWithRetry(url)
    .then((payload) => {
      responseCache.set(url, payload);
      return payload;
    })
    .finally(() => {
      pendingRequests.delete(url);
    });

  pendingRequests.set(url, request);
  return request;
}

export async function fetchScryfallCardJson(canonicalUrl: string, language: AppLanguage): Promise<unknown> {
  if (language !== "es") return fetchScryfallJson(canonicalUrl);

  const spanishUrl = buildSpanishLookupUrl(canonicalUrl);
  if (!spanishUrl) return fetchScryfallJson(canonicalUrl);

  try {
    return await fetchScryfallJson(spanishUrl);
  } catch (error) {
    // A rate-limit is transient. Do not worsen it by immediately making the
    // English fallback request after the Spanish retries were exhausted.
    if ((error as ScryfallRequestError).status === 429) throw error;
    return fetchScryfallJson(canonicalUrl);
  }
}

async function fetchWithRetry(url: string, attempt = 0): Promise<unknown> {
  try {
    await waitForRequestSlot();
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-cache" });
    if (!response.ok) {
      const error = new Error(`Card lookup failed: ${response.status}`) as ScryfallRequestError;
      error.status = response.status;
      const retryAfterSeconds = Number.parseFloat(response.headers.get("Retry-After") ?? "");
      if (Number.isFinite(retryAfterSeconds)) error.retryAfterMs = retryAfterSeconds * 1000;
      throw error;
    }
    return await response.json();
  } catch (error) {
    const requestError = error as ScryfallRequestError;
    const retryable = requestError.status === 429 || requestError.status === undefined || requestError.status >= 500;
    if (attempt >= MAX_RETRIES || !retryable) throw error;

    const retryDelay = requestError.retryAfterMs ?? (requestError.status === 429 ? 2000 * (attempt + 1) : 700 * (attempt + 1));
    nextRequestAt = Math.max(nextRequestAt, Date.now() + retryDelay);
    await delay(retryDelay);
    return fetchWithRetry(url, attempt + 1);
  }
}

function buildSpanishLookupUrl(canonicalUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    return undefined;
  }
  if (url.hostname !== "api.scryfall.com") return undefined;

  if (url.pathname === "/cards/search") {
    const query = url.searchParams.get("q");
    if (!query) return undefined;
    if (!/(^|\s)lang:/i.test(query)) url.searchParams.set("q", `${query} lang:es`);
    url.searchParams.set("unique", "prints");
    return url.toString();
  }

  if (url.pathname === "/cards/named") {
    const name = url.searchParams.get("exact") ?? url.searchParams.get("fuzzy");
    if (!name) return undefined;
    const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const set = url.searchParams.get("set");
    const query = [`!"${escapedName}"`, set ? `set:${set}` : "", "lang:es"].filter(Boolean).join(" ");
    const searchUrl = new URL("https://api.scryfall.com/cards/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("unique", "prints");
    return searchUrl.toString();
  }

  return undefined;
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
