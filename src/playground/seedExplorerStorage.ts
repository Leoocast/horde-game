import { decodeCanonSeed } from "../content/CanonSeed";
import type { SeedAnalysisResult } from "./seedExplorer";
import type { SeedSearchResult } from "./seedExplorerSearch";

const SEED_FAVORITES_STORAGE_KEY = "hostfall-playground-seed-favorites:v1";
const SEED_FAVORITES_VERSION = 1 as const;
const SEED_EXPORT_VERSION = 1 as const;
const MAX_STORED_FAVORITES = 100;

export type StoredSeedFavorite = Readonly<{
  canonCode: string;
  savedAt: string;
  evaluateMulligan: boolean;
  avoidEarlySpikes: boolean;
}>;

type StoredSeedFavoriteFile = Readonly<{
  version: typeof SEED_FAVORITES_VERSION;
  entries: readonly StoredSeedFavorite[];
}>;

export function listStoredSeedFavorites(): readonly StoredSeedFavorite[] {
  if (typeof window === "undefined") return Object.freeze([]);
  return parseStoredSeedFavorites(window.localStorage.getItem(SEED_FAVORITES_STORAGE_KEY));
}

export function saveStoredSeedFavorite(
  result: SeedAnalysisResult,
  config: Readonly<{ evaluateMulligan: boolean; avoidEarlySpikes: boolean }>,
): readonly StoredSeedFavorite[] {
  const current = listStoredSeedFavorites();
  const existing = current.find((entry) => entry.canonCode === result.identity.canonCode);
  const saved = Object.freeze({
    canonCode: result.identity.canonCode,
    savedAt: existing?.savedAt ?? new Date().toISOString(),
    evaluateMulligan: config.evaluateMulligan,
    avoidEarlySpikes: config.avoidEarlySpikes,
  });
  const next = Object.freeze([
    saved,
    ...current.filter((entry) => entry.canonCode !== saved.canonCode),
  ].slice(0, MAX_STORED_FAVORITES));
  writeStoredSeedFavorites(next);
  return next;
}

export function deleteStoredSeedFavorite(canonCode: string): readonly StoredSeedFavorite[] {
  const next = Object.freeze(listStoredSeedFavorites().filter((entry) => entry.canonCode !== canonCode));
  writeStoredSeedFavorites(next);
  return next;
}

export function parseStoredSeedFavorites(serialized: string | null): readonly StoredSeedFavorite[] {
  if (!serialized) return Object.freeze([]);
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isFavoriteFile(parsed)) return Object.freeze([]);
    const unique = new Map<string, StoredSeedFavorite>();
    for (const entry of parsed.entries) {
      if (!isStoredSeedFavorite(entry) || unique.has(entry.canonCode)) continue;
      unique.set(entry.canonCode, Object.freeze({ ...entry }));
      if (unique.size >= MAX_STORED_FAVORITES) break;
    }
    return Object.freeze([...unique.values()].sort((left, right) => right.savedAt.localeCompare(left.savedAt)));
  } catch {
    return Object.freeze([]);
  }
}

export function serializeStoredSeedFavorites(entries: readonly StoredSeedFavorite[]): string {
  const file: StoredSeedFavoriteFile = Object.freeze({
    version: SEED_FAVORITES_VERSION,
    entries: Object.freeze(entries.slice(0, MAX_STORED_FAVORITES)),
  });
  return JSON.stringify(file);
}

export function seedSearchResultToJson(result: SeedSearchResult): string {
  return JSON.stringify({
    exportedBy: "hostfall-seed-explorer",
    version: SEED_EXPORT_VERSION,
    result,
  }, null, 2);
}

export function seedSearchResultToCsv(result: SeedSearchResult): string {
  const headers = [
    "rank",
    "canonCode",
    "score",
    "playerDeckKey",
    "hostDeckKey",
    "difficulty",
    "preparationTurns",
    "recommendation",
    "openingRating",
    "resourceRating",
    "curveRating",
    "firstHostPressure",
    "peakHostPressure",
    "escalation",
    "solvability",
  ];
  const rows = result.candidates.map((candidate, index) => [
    index + 1,
    candidate.identity.canonCode,
    candidate.score,
    candidate.identity.playerDeckKey,
    candidate.identity.hostDeckKey,
    candidate.identity.difficulty,
    candidate.identity.preparationTurns,
    candidate.mulligan.recommendation,
    candidate.metrics.ratings.opening,
    candidate.metrics.ratings.resources,
    candidate.metrics.ratings.curve,
    candidate.metrics.host.firstWindowPressure,
    candidate.metrics.host.peakPressure,
    candidate.metrics.host.escalation,
    candidate.solvability.status,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function writeStoredSeedFavorites(entries: readonly StoredSeedFavorite[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEED_FAVORITES_STORAGE_KEY, serializeStoredSeedFavorites(entries));
  } catch {
    // Dev tooling must remain usable when storage is disabled or full.
  }
}

function isFavoriteFile(value: unknown): value is StoredSeedFavoriteFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  return file.version === SEED_FAVORITES_VERSION && Array.isArray(file.entries);
}

function isStoredSeedFavorite(value: unknown): value is StoredSeedFavorite {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.canonCode !== "string"
    || typeof entry.savedAt !== "string"
    || typeof entry.evaluateMulligan !== "boolean"
    || typeof entry.avoidEarlySpikes !== "boolean"
    || Number.isNaN(Date.parse(entry.savedAt))
  ) return false;
  try {
    return decodeCanonSeed(entry.canonCode).canonCode === entry.canonCode;
  } catch {
    return false;
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
