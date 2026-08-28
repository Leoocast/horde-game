import {
  HISTORY_BACKUP_STORAGE_KEY,
  HISTORY_BROADCAST_CHANNEL,
  HISTORY_MAX_SERIALIZED_BYTES,
  HISTORY_QUARANTINE_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  HISTORY_WEB_LOCK_NAME,
  HistoryPersistenceError,
  serializedHistoryBytes,
  type HistoryAdapterInitialization,
  type HistoryAdapterResetResult,
  type HistoryExternalChangeListener,
  type HistoryPersistenceAdapter,
  type HistoryStorageCandidates,
} from "./historyPersistence";
import type { HistoryEnvelopeV1 } from "./historyTypes";

export interface HistoryKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HistoryWebLockManager {
  request(
    name: string,
    options: Readonly<{ mode: "exclusive"; ifAvailable: true }>,
    callback: (lock: unknown | null) => Promise<void> | void,
  ): Promise<unknown>;
}

export interface HistoryBroadcastPort {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: () => void): void;
  removeEventListener(type: "message", listener: () => void): void;
  close(): void;
}

export type WebHistoryAdapterOptions = Readonly<{
  storage: HistoryKeyValueStorage;
  lockManager?: HistoryWebLockManager;
  channel?: HistoryBroadcastPort;
  now?: () => string;
}>;

export class WebHistoryPersistenceAdapter implements HistoryPersistenceAdapter {
  readonly kind = "web" as const;

  readonly #storage: HistoryKeyValueStorage;
  readonly #lockManager?: HistoryWebLockManager;
  readonly #channel?: HistoryBroadcastPort;
  readonly #now: () => string;
  readonly #listeners = new Set<HistoryExternalChangeListener>();
  #initialization?: Promise<HistoryAdapterInitialization>;
  #writable = false;
  #disposed = false;
  #releaseLock?: () => void;
  #lockRequest?: Promise<unknown>;

  constructor(options: WebHistoryAdapterOptions) {
    this.#storage = options.storage;
    this.#lockManager = options.lockManager;
    this.#channel = options.channel;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#channel?.addEventListener("message", this.#notifyExternalChange);
  }

  initialize(): Promise<HistoryAdapterInitialization> {
    if (this.#initialization) return this.#initialization;
    this.#initialization = this.#initializeOnce();
    return this.#initialization;
  }

  async readCandidates(): Promise<HistoryStorageCandidates> {
    try {
      const primary = parseCandidate(this.#storage.getItem(HISTORY_STORAGE_KEY));
      const backup = parseCandidate(this.#storage.getItem(HISTORY_BACKUP_STORAGE_KEY));
      return Object.freeze({
        ...(primary.value === undefined ? {} : { primary: primary.value }),
        ...(backup.value === undefined ? {} : { backup: backup.value }),
        primaryCorrupted: primary.corrupted,
        backupCorrupted: backup.corrupted,
      });
    } catch {
      return Object.freeze({ primaryCorrupted: true, backupCorrupted: true });
    }
  }

  async write(history: HistoryEnvelopeV1): Promise<void> {
    this.#assertWritable();
    if (serializedHistoryBytes(history) > HISTORY_MAX_SERIALIZED_BYTES) {
      throw new HistoryPersistenceError("full", "History payload exceeds the storage limit.");
    }
    const serialized = JSON.stringify(history);
    try {
      const current = this.#storage.getItem(HISTORY_STORAGE_KEY);
      if (current !== null) this.#storage.setItem(HISTORY_BACKUP_STORAGE_KEY, current);
      this.#storage.setItem(HISTORY_STORAGE_KEY, serialized);
    } catch (error) {
      throw webStorageError(error);
    }
    this.#broadcastChange();
  }

  async promoteBackup(): Promise<void> {
    this.#assertWritable();
    try {
      const backup = this.#storage.getItem(HISTORY_BACKUP_STORAGE_KEY);
      if (backup === null) throw new HistoryPersistenceError("io", "History backup is missing.");
      // Deliberately bypass normal write rotation: the invalid primary must never replace backup.
      this.#storage.setItem(HISTORY_STORAGE_KEY, backup);
    } catch (error) {
      if (error instanceof HistoryPersistenceError) throw error;
      throw webStorageError(error);
    }
    this.#broadcastChange();
  }

  async reset(options: Readonly<{ allowWithoutDiagnostic: boolean }>): Promise<HistoryAdapterResetResult> {
    this.#assertWritable();
    let primary: string | null;
    let backup: string | null;
    try {
      primary = this.#storage.getItem(HISTORY_STORAGE_KEY);
      backup = this.#storage.getItem(HISTORY_BACKUP_STORAGE_KEY);
    } catch (error) {
      throw webStorageError(error);
    }

    let preservedDiagnostic = false;
    if (primary !== null || backup !== null) {
      try {
        this.#storage.setItem(HISTORY_QUARANTINE_STORAGE_KEY, JSON.stringify({
          capturedAt: this.#now(),
          primary,
          backup,
        }));
        preservedDiagnostic = true;
      } catch (error) {
        if (!options.allowWithoutDiagnostic) {
          return Object.freeze({ reset: false, requiresUnrecoverableConfirmation: true });
        }
        if (!isQuotaError(error)) throw webStorageError(error);
      }
    }

    try {
      this.#storage.removeItem(HISTORY_STORAGE_KEY);
      this.#storage.removeItem(HISTORY_BACKUP_STORAGE_KEY);
    } catch (error) {
      throw webStorageError(error);
    }
    this.#broadcastChange();
    return Object.freeze({ reset: true, preservedDiagnostic });
  }

  subscribe(listener: HistoryExternalChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#channel?.removeEventListener("message", this.#notifyExternalChange);
    this.#channel?.close();
    this.#releaseLock?.();
    this.#releaseLock = undefined;
    this.#listeners.clear();
  }

  async #initializeOnce(): Promise<HistoryAdapterInitialization> {
    this.#writable = await this.#acquireWriter();
    return Object.freeze({ writable: this.#writable, candidates: await this.readCandidates() });
  }

  async #acquireWriter(): Promise<boolean> {
    if (!this.#lockManager || this.#disposed) return false;
    let settleAcquired: (value: boolean) => void = () => undefined;
    const acquired = new Promise<boolean>((resolve) => { settleAcquired = resolve; });
    let settled = false;
    const settleOnce = (value: boolean) => {
      if (settled) return;
      settled = true;
      settleAcquired(value);
    };
    this.#lockRequest = this.#lockManager.request(
      HISTORY_WEB_LOCK_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock || this.#disposed) {
          settleOnce(false);
          return;
        }
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => { release = resolve; });
        this.#releaseLock = release;
        settleOnce(true);
        await held;
      },
    ).catch(() => settleOnce(false));
    return acquired;
  }

  #assertWritable(): void {
    if (!this.#writable || this.#disposed) {
      throw new HistoryPersistenceError("readonly", "This web tab does not own the history writer lock.");
    }
  }

  #broadcastChange(): void {
    try {
      this.#channel?.postMessage(Object.freeze({ kind: "history-changed" }));
    } catch {
      // Persistence already succeeded; notification failure cannot roll it back.
    }
  }

  #notifyExternalChange = () => {
    for (const listener of this.#listeners) listener();
  };
}

export function createBrowserHistoryPersistenceAdapter(): WebHistoryPersistenceAdapter {
  if (typeof window === "undefined") throw new Error("Web history persistence requires a browser window.");
  const navigatorWithLocks = navigator as Navigator & { locks?: HistoryWebLockManager };
  const channel = typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel(HISTORY_BROADCAST_CHANNEL) as unknown as HistoryBroadcastPort;
  return new WebHistoryPersistenceAdapter({
    storage: window.localStorage,
    lockManager: navigatorWithLocks.locks,
    channel,
  });
}

function parseCandidate(raw: string | null): Readonly<{ value?: unknown; corrupted: boolean }> {
  if (raw === null) return Object.freeze({ corrupted: false });
  try {
    return Object.freeze({ value: JSON.parse(raw) as unknown, corrupted: false });
  } catch {
    return Object.freeze({ corrupted: true });
  }
}

function webStorageError(error: unknown): HistoryPersistenceError {
  return new HistoryPersistenceError(
    isQuotaError(error) ? "full" : "io",
    error instanceof Error ? error.message : "Web history storage failed.",
  );
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: number };
  return candidate.name === "QuotaExceededError" || candidate.code === 22 || candidate.code === 1014;
}
