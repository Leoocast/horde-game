import { useEffect, useState } from "react";
import imageLookupsRaw from "../../cardImageLookups.json";
import goblinHordeImagesRaw from "../data/decks/horde/goblins/goblin_assault_horde_images_definition.json";
import monoGreenRampImagesRaw from "../data/decks/player/mono_green_ramp/mono_green_ramp_images.json";
import type { DeckImageManifest } from "../data/deckCatalog";
import { useLanguageStore } from "../store/useLanguageStore";
import type { AppLanguage } from "../i18n/translations";
import { fetchScryfallCardJson } from "./scryfall";

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
  language?: string;
  displayName?: string;
  typeLine?: string;
  oracleText?: string;
  flavorText?: string;
};

const imageLookups = imageLookupsRaw as ImageLookups;
const lookupById = new Map<string, LookupEntry>(
  [
    ...imageLookups.hordeZombieDeck,
    ...newDeckImageLookups(monoGreenRampImagesRaw as DeckImageManifest),
    ...newDeckImageLookups(goblinHordeImagesRaw as DeckImageManifest),
  ].map((entry) => [entry.id, entry]),
);
const directDetailsById = new Map<string, CardRemoteDetails>([
  [
    "zombie_token",
    {
      imageUrl: "https://cards.scryfall.io/large/back/1/3/13e4832d-8530-4b85-b738-51d0c18f28ec.jpg?1782739525",
      oracleText: "Token Creature - Zombie\n2/2",
      flavorText: "",
    },
  ],
]);
const memoryCache = new Map<string, CardRemoteDetails | null>();
const pending = new Map<string, Promise<CardRemoteDetails | null>>();

export function useCardDetails(definitionId: string): CardRemoteDetails {
  const language = useLanguageStore((state) => state.language);
  const cacheId = `${language}:${definitionId}`;
  const [details, setDetails] = useState<CardRemoteDetails>(() => readDirectDetails(definitionId, language) ?? readCachedDetails(cacheId) ?? {});

  useEffect(() => {
    let active = true;
    // Do not display the previous card's image while a new definition is loading.
    setDetails(readDirectDetails(definitionId, language) ?? readCachedDetails(cacheId) ?? {});
    loadCardDetails(definitionId, language).then((loaded) => {
      if (active) setDetails(loaded ?? {});
    });
    return () => {
      active = false;
    };
  }, [cacheId, definitionId, language]);

  return details;
}

export function useCardImage(definitionId: string): string | undefined {
  return useCardDetails(definitionId).imageUrl;
}

const SCRYFALL_RESOLUTION_PATTERN = /\/(small|normal|large)\//;
const SCRYFALL_IMAGE_VARIANT_PATTERN = /\/(small|normal|large|png|art_crop|border_crop)\//;

export function toHighResImageUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return imageUrl;
  return imageUrl.replace(SCRYFALL_RESOLUTION_PATTERN, "/large/");
}

export function toArtCropImageUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return imageUrl;
  return imageUrl.replace(SCRYFALL_IMAGE_VARIANT_PATTERN, "/art_crop/");
}

async function loadCardDetails(definitionId: string, language: AppLanguage): Promise<CardRemoteDetails | null> {
  const cacheId = `${language}:${definitionId}`;
  const directDetails = readDirectDetails(definitionId, language);
  if (directDetails) return directDetails;

  const cached = readCachedDetails(cacheId);
  if (cached !== undefined) return cached;
  const lookup = lookupById.get(definitionId);
  if (!lookup) {
    memoryCache.set(cacheId, null);
    return null;
  }

  const existing = pending.get(cacheId);
  if (existing) return existing;

  const request = fetchScryfallCardJson(lookup.lookup_url, language)
    .then((payload) => {
      const cardPayload = readSearchResult(payload) ?? payload;
      const details: CardRemoteDetails = {
        language: readPath(cardPayload, "lang"),
        imageUrl:
          readPath(cardPayload, "image_uris.large") ??
          readPath(cardPayload, "card_faces[0].image_uris.large") ??
          readPath(cardPayload, "image_uris.normal") ??
          readPath(cardPayload, "card_faces[0].image_uris.normal") ??
          readPath(payload, lookup.image_path) ??
          readPath(payload, "image_uris.large") ??
          readPath(payload, "card_faces[0].image_uris.large") ??
          readPath(payload, "image_uris.normal") ??
          readPath(payload, "card_faces[0].image_uris.normal"),
        displayName: readPrintedName(cardPayload),
        typeLine: readPrintedTypeLine(cardPayload),
        oracleText: readOracleText(cardPayload),
        flavorText: readFlavorText(cardPayload),
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

function readDirectDetails(definitionId: string, language: AppLanguage): CardRemoteDetails | undefined {
  const directDetails = directDetailsById.get(definitionId);
  if (directDetails) memoryCache.set(`${language}:${definitionId}`, directDetails);
  return directDetails;
}

function readOracleText(payload: unknown): string | undefined {
  return readPath(payload, "printed_text") ?? readPath(payload, "card_faces[0].printed_text") ?? readPath(payload, "oracle_text") ?? readPath(payload, "card_faces[0].oracle_text");
}

function readFlavorText(payload: unknown): string | undefined {
  return readPath(payload, "flavor_text") ?? readPath(payload, "card_faces[0].flavor_text");
}

function readSearchResult(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) return undefined;
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data[0] : undefined;
}

function readPrintedName(payload: unknown): string | undefined {
  return readPath(payload, "printed_name") ?? readPath(payload, "card_faces[0].printed_name") ?? readPath(payload, "name") ?? readPath(payload, "card_faces[0].name");
}

function readPrintedTypeLine(payload: unknown): string | undefined {
  return readPath(payload, "printed_type_line") ?? readPath(payload, "card_faces[0].printed_type_line") ?? readPath(payload, "type_line") ?? readPath(payload, "card_faces[0].type_line");
}

function readCachedDetails(cacheId: string): CardRemoteDetails | null | undefined {
  if (memoryCache.has(cacheId)) return memoryCache.get(cacheId);
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(cacheKey(cacheId));
  if (stored === "__missing__") {
    memoryCache.set(cacheId, null);
    return null;
  }
  if (stored) {
    const parsed = JSON.parse(stored) as CardRemoteDetails;
    if (!parsed.imageUrl) {
      window.localStorage.removeItem(cacheKey(cacheId));
      return undefined;
    }
    memoryCache.set(cacheId, parsed);
    return parsed;
  }
  return undefined;
}

function writeCachedDetails(cacheId: string, details: CardRemoteDetails | null): void {
  memoryCache.set(cacheId, details);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cacheKey(cacheId), details ? JSON.stringify(details) : "__missing__");
}

function cacheKey(cacheId: string): string {
  return `horde-card-details:v8:${cacheId}`;
}

function newDeckImageLookups(manifest: DeckImageManifest): LookupEntry[] {
  return Object.entries(manifest.cards).map(([id, entry]) => {
    const exact = entry.exact ?? id;
    const query = entry.query ?? (entry.set ? `!"${exact}" set:${entry.set}` : `!"${exact}"`);
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
