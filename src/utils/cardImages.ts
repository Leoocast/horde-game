import { useEffect, useState } from "react";
import imageLookupsRaw from "../../cardImageLookups.json";
import monoGreenRampImagesRaw from "../data/decks/mono_green_ramp/mono_green_ramp_images.json";
import type { DeckImageManifest } from "../data/deckCatalog";

type LookupEntry = {
  id: string;
  name: string;
  lookup_url: string;
  image_path: string;
};

type ImageLookups = {
  hordeZombieDeck: LookupEntry[];
};

export type CardRemoteDetails = {
  imageUrl?: string;
  oracleText?: string;
};

const imageLookups = imageLookupsRaw as ImageLookups;
const lookupById = new Map<string, LookupEntry>(
  [...imageLookups.hordeZombieDeck, ...newDeckImageLookups(monoGreenRampImagesRaw as DeckImageManifest)].map((entry) => [entry.id, entry]),
);
const directDetailsById = new Map<string, CardRemoteDetails>([
  [
    "zombie_token",
    {
      imageUrl: "https://cards.scryfall.io/normal/back/1/3/13e4832d-8530-4b85-b738-51d0c18f28ec.jpg?1782739525",
      oracleText: "Token Creature - Zombie\n2/2",
    },
  ],
]);
const memoryCache = new Map<string, CardRemoteDetails | null>();
const pending = new Map<string, Promise<CardRemoteDetails | null>>();

export function useCardDetails(definitionId: string): CardRemoteDetails {
  const [details, setDetails] = useState<CardRemoteDetails>(() => readDirectDetails(definitionId) ?? readCachedDetails(definitionId) ?? {});

  useEffect(() => {
    let active = true;
    loadCardDetails(definitionId).then((loaded) => {
      if (active) setDetails(loaded ?? {});
    });
    return () => {
      active = false;
    };
  }, [definitionId]);

  return details;
}

export function useCardImage(definitionId: string): string | undefined {
  return useCardDetails(definitionId).imageUrl;
}

async function loadCardDetails(definitionId: string): Promise<CardRemoteDetails | null> {
  const directDetails = readDirectDetails(definitionId);
  if (directDetails) return directDetails;

  const cached = readCachedDetails(definitionId);
  if (cached !== undefined) return cached;
  const lookup = lookupById.get(definitionId);
  if (!lookup) {
    memoryCache.set(definitionId, null);
    return null;
  }

  const existing = pending.get(definitionId);
  if (existing) return existing;

  const request = fetch(lookup.lookup_url, {
    headers: {
      Accept: "application/json",
    },
  })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((payload) => {
      const cardPayload = readSearchResult(payload) ?? payload;
      const details: CardRemoteDetails = {
        imageUrl:
          readPath(payload, lookup.image_path) ??
          readPath(cardPayload, "image_uris.normal") ??
          readPath(cardPayload, "image_uris.large") ??
          readPath(cardPayload, "card_faces[0].image_uris.normal") ??
          readPath(cardPayload, "card_faces[0].image_uris.large") ??
          readPath(payload, "image_uris.normal") ??
          readPath(payload, "image_uris.large") ??
          readPath(payload, "card_faces[0].image_uris.normal") ??
          readPath(payload, "card_faces[0].image_uris.large"),
        oracleText: readOracleText(cardPayload),
      };
      writeCachedDetails(definitionId, details);
      return details;
    })
    .catch(() => {
      writeCachedDetails(definitionId, null);
      return null;
    })
    .finally(() => {
      pending.delete(definitionId);
    });

  pending.set(definitionId, request);
  return request;
}

function readDirectDetails(definitionId: string): CardRemoteDetails | undefined {
  const directDetails = directDetailsById.get(definitionId);
  if (directDetails) memoryCache.set(definitionId, directDetails);
  return directDetails;
}

function readOracleText(payload: unknown): string | undefined {
  return readPath(payload, "oracle_text") ?? readPath(payload, "card_faces[0].oracle_text");
}

function readSearchResult(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return undefined;
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data[0] : undefined;
}

function readCachedDetails(definitionId: string): CardRemoteDetails | null | undefined {
  if (memoryCache.has(definitionId)) return memoryCache.get(definitionId);
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(cacheKey(definitionId));
  if (stored === "__missing__") {
    memoryCache.set(definitionId, null);
    return null;
  }
  if (stored) {
    const parsed = JSON.parse(stored) as CardRemoteDetails;
    memoryCache.set(definitionId, parsed);
    return parsed;
  }
  return undefined;
}

function writeCachedDetails(definitionId: string, details: CardRemoteDetails | null): void {
  memoryCache.set(definitionId, details);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cacheKey(definitionId), details ? JSON.stringify(details) : "__missing__");
}

function cacheKey(definitionId: string): string {
  return `horde-card-details:v4:${definitionId}`;
}

function newDeckImageLookups(manifest: DeckImageManifest): LookupEntry[] {
  return Object.entries(manifest.cards).map(([id, entry]) => {
    const exact = entry.exact ?? id;
    const query = entry.set ? `!"${exact}" set:${entry.set}` : `!"${exact}"`;
    return {
      id,
      name: exact,
      lookup_url: `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`,
      image_path: entry.imagePath ?? "data[0].image_uris.normal",
    };
  });
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
