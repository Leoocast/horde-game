import path from "node:path";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";

export const DESKTOP_DATA_DIRECTORY = "profile";
export const DESKTOP_LOCAL_DIRECTORY = "local";
export const PREFERENCES_FILE_NAME = "preferences-v1.json";
export const WINDOW_STATE_FILE_NAME = "window-state-v1.json";
export const RESUME_SAVE_FILE_NAME = "resume-v1.json";

const MAX_JSON_BYTES = 5 * 1024 * 1024;

export type DesktopDataPaths = Readonly<{
  preferences: string;
  windowState: string;
  resumeSave: string;
}>;

export type StoredJsonCandidates = Readonly<{
  primary?: unknown;
  backup?: unknown;
  primaryCorrupted: boolean;
  backupCorrupted: boolean;
}>;

export type PersistedWindowState = Readonly<{
  formatVersion: 1;
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}>;

export function desktopDataPaths(userDataPath: string): DesktopDataPaths {
  return Object.freeze({
    preferences: path.join(userDataPath, DESKTOP_DATA_DIRECTORY, PREFERENCES_FILE_NAME),
    windowState: path.join(userDataPath, DESKTOP_LOCAL_DIRECTORY, WINDOW_STATE_FILE_NAME),
    resumeSave: path.join(userDataPath, DESKTOP_DATA_DIRECTORY, "saves", RESUME_SAVE_FILE_NAME),
  });
}

export class DesktopJsonStore {
  #writeQueues = new Map<string, Promise<void>>();

  async readCandidates(filePath: string): Promise<StoredJsonCandidates> {
    const [primary, backup] = await Promise.all([
      readJsonCandidate(filePath),
      readJsonCandidate(`${filePath}.bak`),
    ]);
    return Object.freeze({
      ...(primary.value === undefined ? {} : { primary: primary.value }),
      ...(backup.value === undefined ? {} : { backup: backup.value }),
      primaryCorrupted: primary.corrupted,
      backupCorrupted: backup.corrupted,
    });
  }

  write(filePath: string, value: unknown): Promise<void> {
    assertJsonPayload(value);
    const previous = this.#writeQueues.get(filePath) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => atomicWriteJson(filePath, value));
    this.#writeQueues.set(filePath, next);
    const clearQueue = () => {
      if (this.#writeQueues.get(filePath) === next) this.#writeQueues.delete(filePath);
    };
    void next.then(clearQueue, clearQueue);
    return next;
  }

  delete(filePath: string): Promise<void> {
    const previous = this.#writeQueues.get(filePath) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await Promise.all([
          rm(filePath, { force: true }),
          rm(`${filePath}.bak`, { force: true }),
          rm(`${filePath}.tmp`, { force: true }),
          rm(`${filePath}.bak.tmp`, { force: true }),
        ]);
      });
    this.#writeQueues.set(filePath, next);
    const clearQueue = () => {
      if (this.#writeQueues.get(filePath) === next) this.#writeQueues.delete(filePath);
    };
    void next.then(clearQueue, clearQueue);
    return next;
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.#writeQueues.values());
  }
}

export function parseWindowState(value: unknown): PersistedWindowState | undefined {
  if (!isRecord(value) || value.formatVersion !== 1) return undefined;
  const width = finiteInteger(value.width);
  const height = finiteInteger(value.height);
  if (width === undefined || height === undefined || width < 640 || height < 480) return undefined;
  if (typeof value.maximized !== "boolean" || typeof value.fullscreen !== "boolean") return undefined;
  const x = value.x === undefined ? undefined : finiteInteger(value.x);
  const y = value.y === undefined ? undefined : finiteInteger(value.y);
  if ((value.x !== undefined && x === undefined) || (value.y !== undefined && y === undefined)) return undefined;
  return Object.freeze({
    formatVersion: 1,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    width: Math.min(width, 16_384),
    height: Math.min(height, 16_384),
    maximized: value.maximized,
    fullscreen: value.fullscreen,
  });
}

export function assertJsonPayload(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Desktop persistence payload is not JSON serializable.");
  if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) throw new Error("Desktop persistence payload is too large.");
  const parsed = JSON.parse(serialized) as unknown;
  if (!isJsonValue(parsed)) throw new Error("Desktop persistence payload contains unsupported values.");
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) throw new Error("Desktop persistence payload is too large.");
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  const backupTemporaryPath = `${filePath}.bak.tmp`;

  await writeAndSync(temporaryPath, serialized);
  if (await fileExists(filePath)) {
    await copyFile(filePath, backupTemporaryPath);
    await replaceFile(backupTemporaryPath, backupPath);
  }
  await replaceFile(temporaryPath, filePath);
}

async function writeAndSync(filePath: string, contents: string): Promise<void> {
  const handle = await open(filePath, "w", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    if (code !== "EEXIST" && code !== "EPERM") throw error;
    await rm(destination, { force: true });
    await rename(source, destination);
  }
}

async function readJsonCandidate(filePath: string): Promise<{ value?: unknown; corrupted: boolean }> {
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size > MAX_JSON_BYTES) return { corrupted: true };
    const contents = await readFile(filePath, "utf8");
    return { value: JSON.parse(contents) as unknown, corrupted: false };
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    if (code === "ENOENT") return { corrupted: false };
    return { corrupted: true };
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
