import type { HistoryEnvelopeV1 } from "./historyTypes";

export const HISTORY_STORAGE_KEY = "hostfall-history:v1";
export const HISTORY_BACKUP_STORAGE_KEY = "hostfall-history:v1:backup";
export const HISTORY_QUARANTINE_STORAGE_KEY = "hostfall-history:quarantine:v1";
export const HISTORY_WEB_LOCK_NAME = "hostfall-history:v1:writer";
export const HISTORY_BROADCAST_CHANNEL = "hostfall-history:v1:changes";
export const HISTORY_MAX_SERIALIZED_BYTES = 5 * 1024 * 1024;

export type HistoryStorageCandidates = Readonly<{
  primary?: unknown;
  backup?: unknown;
  primaryCorrupted: boolean;
  backupCorrupted: boolean;
}>;

export type HistoryAdapterInitialization = Readonly<{
  writable: boolean;
  candidates: HistoryStorageCandidates;
}>;

export type HistoryAdapterResetResult =
  | Readonly<{ reset: true; preservedDiagnostic: boolean }>
  | Readonly<{ reset: false; requiresUnrecoverableConfirmation: true }>;

export type HistoryExternalChangeListener = () => void;

export interface HistoryPersistenceAdapter {
  readonly kind: "desktop" | "web" | "memory";
  initialize(): Promise<HistoryAdapterInitialization>;
  readCandidates(): Promise<HistoryStorageCandidates>;
  write(history: HistoryEnvelopeV1): Promise<void>;
  promoteBackup(): Promise<void>;
  reset(options: Readonly<{ allowWithoutDiagnostic: boolean }>): Promise<HistoryAdapterResetResult>;
  subscribe(listener: HistoryExternalChangeListener): () => void;
  dispose(): void;
}

export class HistoryPersistenceError extends Error {
  readonly reason: "full" | "io" | "readonly";

  constructor(reason: "full" | "io" | "readonly", message: string) {
    super(message);
    this.name = "HistoryPersistenceError";
    this.reason = reason;
  }
}

export function serializedHistoryBytes(history: HistoryEnvelopeV1): number {
  return new TextEncoder().encode(JSON.stringify(history)).byteLength;
}

export function emptyHistoryCandidates(): HistoryStorageCandidates {
  return Object.freeze({ primaryCorrupted: false, backupCorrupted: false });
}
