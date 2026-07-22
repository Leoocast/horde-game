import { useEffect, useMemo, useState } from "react";
import type { DeckImageManifest, NewDeckCard } from "../data/deckCatalog";
import type { AppLanguage } from "../i18n/translations";
import { useLanguageStore } from "../store/useLanguageStore";
import { fetchScryfallJson, localizedScryfallPayload } from "./scryfall";

export type DeckCardDetails = {
  imageUrl?: string;
  language?: string;
  displayName?: string;
  typeLine?: string;
  oracleText?: string;
  flavorText?: string;
};

const memoryCache = new Map<string, DeckCardDetails | null>();
const pending = new Map<string, Promise<DeckCardDetails | null>>();

export function useDeckCardDetails(deckId: string, card: NewDeckCard | undefined, manifest: DeckImageManifest): DeckCardDetails {
  const language = useLanguageStore((state) => state.language);
  const cacheId = useMemo(() => (card ? `${language}:${deckId}:${card.id}` : ""), [card, deckId, language]);
  const [details, setDetails] = useState<DeckCardDetails>(() => readCachedDetails(cacheId) ?? {});

  useEffect(() => {
    if (!card || !cacheId) {
      setDetails({});
      return;
    }
    let active = true;
    resolveDeckCardDetails(deckId, card, manifest, language).then((loaded) => {
      if (active) setDetails(loaded ?? {});
    });
    return () => {
      active = false;
    };
  }, [cacheId, card, deckId, language, manifest]);

  return details;
}

export async function resolveDeckCardDetails(deckId: string, card: NewDeckCard, manifest: DeckImageManifest, language: AppLanguage = "en"): Promise<DeckCardDetails | null> {
  const cacheId = `${language}:${deckId}:${card.id}`;
  const lookup = manifest.cards[card.id];
  if (!lookup) {
    writeCachedDetails(cacheId, null);
    return null;
  }

  if (lookup.imageUrl && language === "en") {
    const direct = { imageUrl: lookup.imageUrl };
    writeCachedDetails(cacheId, direct);
    return direct;
  }

  const cached = readCachedDetails(cacheId);
  if (cached !== undefined) return cached;

  const existing = pending.get(cacheId);
  if (existing) return existing;

  const request = fetchScryfallJson(buildScryfallUrl(lookup, card))
    .then(async (payload) => {
      const cardPayload = readSearchResult(payload, lookup.pick) ?? payload;
      const localizedPayload = await localizedScryfallPayload(cardPayload, language);
      const details: DeckCardDetails = {
        language: readPath(localizedPayload, "lang"),
        imageUrl:
          readPath(localizedPayload, "image_uris.normal") ??
          readPath(localizedPayload, "image_uris.large") ??
          readPath(localizedPayload, "card_faces[0].image_uris.normal") ??
          readPath(localizedPayload, "card_faces[0].image_uris.large") ??
          readPath(payload, lookup.imagePath ?? card.scryfall?.imagePath ?? "image_uris.normal") ??
          readPath(cardPayload, lookup.imagePath ?? card.scryfall?.imagePath ?? "image_uris.normal") ??
          readPath(cardPayload, lookup.fallbackImagePath ?? card.scryfall?.fallbackImagePath ?? "image_uris.large") ??
          readPath(cardPayload, "image_uris.normal") ??
          readPath(cardPayload, "image_uris.large") ??
          readPath(cardPayload, "card_faces[0].image_uris.normal") ??
          readPath(cardPayload, "card_faces[0].image_uris.large"),
        displayName: readPrintedName(localizedPayload),
        typeLine: readPrintedTypeLine(localizedPayload),
        oracleText: readOracleText(localizedPayload),
        flavorText: readFlavorText(localizedPayload),
      };
      if (!details.imageUrl) throw new Error("Card lookup returned no image");
      writeCachedDetails(cacheId, details);
      return details;
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(cacheId);
    });

  pending.set(cacheId, request);
  return request;
}

function buildScryfallUrl(lookup: DeckImageManifest["cards"][string], card: NewDeckCard): string {
  if (lookup.lookupUrl) return lookup.lookupUrl;
  if (lookup.query) return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(lookup.query)}`;
  const exact = lookup.exact ?? card.scryfall?.lookupQuery ?? card.name;
  if (lookup.set) {
    return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${exact}" set:${lookup.set}`)}`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(exact)}`;
}

function readOracleText(payload: unknown): string | undefined {
  const faceText = readPath(payload, "card_faces[0].printed_text") ?? readPath(payload, "card_faces[0].oracle_text");
  const text = readPath(payload, "printed_text") ?? readPath(payload, "oracle_text");
  return text ?? faceText;
}

function readFlavorText(payload: unknown): string | undefined {
  return readPath(payload, "flavor_text") ?? readPath(payload, "card_faces[0].flavor_text");
}

function readPrintedName(payload: unknown): string | undefined {
  return readPath(payload, "printed_name") ?? readPath(payload, "card_faces[0].printed_name") ?? readPath(payload, "name") ?? readPath(payload, "card_faces[0].name");
}

function readPrintedTypeLine(payload: unknown): string | undefined {
  return readPath(payload, "printed_type_line") ?? readPath(payload, "card_faces[0].printed_type_line") ?? readPath(payload, "type_line") ?? readPath(payload, "card_faces[0].type_line");
}

function readSearchResult(payload: unknown, pick = 0): unknown {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return undefined;
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data[pick] : undefined;
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
    if (!parsed.imageUrl) {
      window.localStorage.removeItem(cacheKey(cacheId));
      return undefined;
    }
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
  return `horde-deck-card-details:v6:${cacheId}`;
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
