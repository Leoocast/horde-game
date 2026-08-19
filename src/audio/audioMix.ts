import rawAudioMix from "./audioMix.json";
import { musicCollectionIds, type MusicCollectionId, type MusicVariant } from "./musicManifest";
import { sfxManifest, type SfxId } from "./soundManifest";

export const AUDIO_MIX_SCHEMA_VERSION = 1;
export const MIN_AUDIO_TRIM_DB = -30;
export const MAX_AUDIO_TRIM_DB = 0;

export type AudioMixConfig = {
  schemaVersion: typeof AUDIO_MIX_SCHEMA_VERSION;
  unit: "dB";
  sfx: Record<SfxId, number>;
  music: Record<MusicCollectionId, Record<MusicVariant, number>>;
};

export type AudioMixParseResult = {
  config?: AudioMixConfig;
  problems: string[];
};

const sfxIds = Object.keys(sfxManifest) as SfxId[];
const musicVariants: MusicVariant[] = ["battle", "climax"];

export function parseAudioMix(input: string | unknown): AudioMixParseResult {
  const problems: string[] = [];
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return { problems: ["The file is not valid JSON."] };
    }
  }
  if (!isRecord(value)) return { problems: ["The audio mix must be a JSON object."] };
  if (value.schemaVersion !== AUDIO_MIX_SCHEMA_VERSION) {
    return { problems: [`Unsupported schemaVersion. Expected ${AUDIO_MIX_SCHEMA_VERSION}.`] };
  }
  if (value.unit !== "dB") return { problems: ['Unsupported unit. Expected "dB".'] };

  const zero = createZeroAudioMix();
  const rawSfx = isRecord(value.sfx) ? value.sfx : {};
  const rawMusic = isRecord(value.music) ? value.music : {};

  for (const id of sfxIds) zero.sfx[id] = readTrim(rawSfx, id, `sfx.${id}`, problems);
  reportUnknownKeys(rawSfx, new Set(sfxIds), "sfx", problems);

  for (const id of musicCollectionIds) {
    const rawCollection = isRecord(rawMusic[id]) ? rawMusic[id] : {};
    if (!isRecord(rawMusic[id])) problems.push(`Missing music.${id}; using 0 dB.`);
    for (const variant of musicVariants) {
      zero.music[id][variant] = readTrim(rawCollection, variant, `music.${id}.${variant}`, problems);
    }
    reportUnknownKeys(rawCollection, new Set(musicVariants), `music.${id}`, problems);
  }
  reportUnknownKeys(rawMusic, new Set(musicCollectionIds), "music", problems);

  return { config: zero, problems };
}

export function createZeroAudioMix(): AudioMixConfig {
  const sfx = Object.fromEntries(sfxIds.map((id) => [id, 0])) as Record<SfxId, number>;
  const music = Object.fromEntries(
    musicCollectionIds.map((id) => [id, { battle: 0, climax: 0 }]),
  ) as Record<MusicCollectionId, Record<MusicVariant, number>>;
  return { schemaVersion: AUDIO_MIX_SCHEMA_VERSION, unit: "dB", sfx, music };
}

export function cloneAudioMix(config: AudioMixConfig): AudioMixConfig {
  return {
    schemaVersion: AUDIO_MIX_SCHEMA_VERSION,
    unit: "dB",
    sfx: { ...config.sfx },
    music: Object.fromEntries(
      musicCollectionIds.map((id) => [id, { ...config.music[id] }]),
    ) as AudioMixConfig["music"],
  };
}

export function serializeAudioMix(config: AudioMixConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function dbToGain(db: number): number {
  return Math.pow(10, clampAudioTrimDb(db) / 20);
}

export function dbToTrimPositionPercent(db: number): number {
  return (
    (clampAudioTrimDb(db) - MIN_AUDIO_TRIM_DB)
    / (MAX_AUDIO_TRIM_DB - MIN_AUDIO_TRIM_DB)
  ) * 100;
}

export function clampAudioTrimDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(MIN_AUDIO_TRIM_DB, Math.min(MAX_AUDIO_TRIM_DB, db));
}

function readTrim(record: Record<string, unknown>, key: string, path: string, problems: string[]): number {
  const raw = record[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    problems.push(`Missing or invalid ${path}; using 0 dB.`);
    return 0;
  }
  const trimmed = clampAudioTrimDb(raw);
  if (trimmed !== raw) problems.push(`${path} was clamped to ${trimmed} dB.`);
  return trimmed;
}

function reportUnknownKeys(record: Record<string, unknown>, known: Set<string>, path: string, problems: string[]) {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) problems.push(`Unknown ${path}.${key}; it will be ignored.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const parsedProjectAudioMix = parseAudioMix(rawAudioMix);
if (!parsedProjectAudioMix.config) throw new Error(parsedProjectAudioMix.problems.join(" "));

export const projectAudioMix = parsedProjectAudioMix.config;
export const projectAudioMixProblems = parsedProjectAudioMix.problems;
