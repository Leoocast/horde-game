import { useEffect, useMemo, useState } from "react";
import type { DeckImageManifest, NewDeckCard } from "../data/deckCatalog";

export type DeckCardDetails = {
  imageUrl?: string;
  oracleText?: string;
  flavorText?: string;
};

const memoryCache = new Map<string, DeckCardDetails | null>();
const pending = new Map<string, Promise<DeckCardDetails | null>>();

export function useDeckCardDetails(deckId: string, card: NewDeckCard | undefined, manifest: DeckImageManifest): DeckCardDetails {
  const cacheId = useMemo(() => (card ? `${deckId}:${card.id}` : ""), [card, deckId]);
  const [details, setDetails] = useState<DeckCardDetails>(() => readCachedDetails(cacheId) ?? {});

  useEffect(() => {
    if (!card || !cacheId) {
      setDetails({});
      return;
    }
    let active = true;
    loadDeckCardDetails(deckId, card, manifest).then((loaded) => {
      if (active) setDetails(loaded ?? {});
    });
    return () => {
      active = false;
    };
  }, [cacheId, card, deckId, manifest]);

  return details;
}

async function loadDeckCardDetails(deckId: string, card: NewDeckCard, manifest: DeckImageManifest): Promise<DeckCardDetails | null> {
  const cacheId = `${deckId}:${card.id}`;
  const cached = readCachedDetails(cacheId);
  if (cached !== undefined) return cached;

  const lookup = manifest.cards[card.id];
  if (!lookup) {
    writeCachedDetails(cacheId, null);
    return null;
  }

  const existing = pending.get(cacheId);
  if (existing) return existing;

  if (lookup.imageUrl) {
    const direct = { imageUrl: lookup.imageUrl };
    writeCachedDetails(cacheId, direct);
    return direct;
  }

  const request = fetch(buildScryfallUrl(lookup, card), { headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((payload) => {
      const cardPayload = readSearchResult(payload) ?? payload;
      const details: DeckCardDetails = {
        imageUrl:
          readPath(cardPayload, lookup.imagePath ?? card.scryfall?.imagePath ?? "image_uris.normal") ??
          readPath(cardPayload, lookup.fallbackImagePath ?? card.scryfall?.fallbackImagePath ?? "image_uris.large") ??
          readPath(cardPayload, "image_uris.normal") ??
          readPath(cardPayload, "image_uris.large") ??
          readPath(cardPayload, "card_faces[0].image_uris.normal") ??
          readPath(cardPayload, "card_faces[0].image_uris.large"),
        oracleText: readOracleText(cardPayload),
        flavorText: readFlavorText(cardPayload),
      };
      writeCachedDetails(cacheId, details);
      return details;
    })
    .catch(() => {
      writeCachedDetails(cacheId, null);
      return null;
    })
    .finally(() => {
      pending.delete(cacheId);
    });

  pending.set(cacheId, request);
  return request;
}

function buildScryfallUrl(lookup: DeckImageManifest["cards"][string], card: NewDeckCard): string {
  if (lookup.lookupUrl) return lookup.lookupUrl;
  const exact = lookup.exact ?? card.scryfall?.lookupQuery ?? card.name;
  if (lookup.set) {
    return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${exact}" set:${lookup.set}`)}`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(exact)}`;
}

function readOracleText(payload: unknown): string | undefined {
  const faceText = readPath(payload, "card_faces[0].oracle_text");
  const text = readPath(payload, "oracle_text");
  return text ?? faceText;
}

function readFlavorText(payload: unknown): string | undefined {
  return readPath(payload, "flavor_text") ?? readPath(payload, "card_faces[0].flavor_text");
}

function readSearchResult(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return undefined;
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data[0] : undefined;
}

function readCachedDetails(cacheId: string): DeckCardDetails | null | undefined {
  if (!cacheId) return undefined;
  if (memoryCache.has(cacheId)) return memoryCache.get(cacheId);
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(cacheKey(cacheId));
  if (stored === "__missing__") {
    memoryCache.set(cacheId, null);
    return null;
  }
  if (stored) {
    const parsed = JSON.parse(stored) as DeckCardDetails;
    memoryCache.set(cacheId, parsed);
    return parsed;
  }
  return undefined;
}

function writeCachedDetails(cacheId: string, details: DeckCardDetails | null): void {
  memoryCache.set(cacheId, details);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cacheKey(cacheId), details ? JSON.stringify(details) : "__missing__");
}

function cacheKey(cacheId: string): string {
  return `horde-deck-card-details:v2:${cacheId}`;
}

function readPath(source: unknown, path: string): string | undefined {
  const current = readPathObject(source, path);
  return typeof current === "string" ? current : undefined;
}

function readPathObject(source: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  let current: unknown = source;
  for (const part of normalized.split(".")) {
    if (!part) continue;
    if (typeof current !== "object" || current === null || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
