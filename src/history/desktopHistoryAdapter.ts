import type {
  DesktopHistoryResetResult,
  DesktopHistoryWriteResult,
  StoredJsonCandidates,
} from "../platform/desktopBridge";
import {
  HistoryPersistenceError,
  type HistoryAdapterInitialization,
  type HistoryAdapterResetResult,
  type HistoryExternalChangeListener,
  type HistoryPersistenceAdapter,
  type HistoryStorageCandidates,
} from "./historyPersistence";
import type { HistoryEnvelopeV1 } from "./historyTypes";

export type DesktopHistoryBridge = Readonly<{
  readSeedHistory(): Promise<StoredJsonCandidates>;
  writeSeedHistory(value: unknown): Promise<DesktopHistoryWriteResult>;
  promoteSeedHistoryBackup(): Promise<void>;
  resetSeedHistory(): Promise<DesktopHistoryResetResult>;
}>;

export class DesktopHistoryPersistenceAdapter implements HistoryPersistenceAdapter {
  readonly kind = "desktop" as const;
  readonly #bridge: DesktopHistoryBridge;
  #initialization?: Promise<HistoryAdapterInitialization>;

  constructor(bridge: DesktopHistoryBridge) {
    this.#bridge = bridge;
  }

  initialize(): Promise<HistoryAdapterInitialization> {
    if (!this.#initialization) {
      this.#initialization = this.readCandidates().then((candidates) => Object.freeze({
        writable: true,
        candidates,
      }));
    }
    return this.#initialization;
  }

  async readCandidates(): Promise<HistoryStorageCandidates> {
    return this.#bridge.readSeedHistory();
  }

  async write(history: HistoryEnvelopeV1): Promise<void> {
    const result = await this.#bridge.writeSeedHistory(history);
    if (!result.ok) throw new HistoryPersistenceError(result.reason, `Desktop history write failed: ${result.reason}.`);
  }

  promoteBackup(): Promise<void> {
    return this.#bridge.promoteSeedHistoryBackup();
  }

  async reset(_options: Readonly<{ allowWithoutDiagnostic: boolean }>): Promise<HistoryAdapterResetResult> {
    const result = await this.#bridge.resetSeedHistory();
    return Object.freeze({ reset: true, preservedDiagnostic: result.preservedDiagnostic });
  }

  subscribe(_listener: HistoryExternalChangeListener): () => void {
    return () => undefined;
  }

  dispose(): void {
    // Main owns the store and drains its queue during application shutdown.
  }
}

export function createDesktopHistoryPersistenceAdapter(): DesktopHistoryPersistenceAdapter {
  const bridge = window.hostfallDesktop;
  if (!bridge) throw new Error("Desktop history persistence requires the Electron bridge.");
  return new DesktopHistoryPersistenceAdapter(bridge);
}
