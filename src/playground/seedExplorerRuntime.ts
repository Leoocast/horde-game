import type { SeedAnalysisResult } from "./seedExplorer";
import {
  SeedSearchAccumulator,
  type SeedSearchProgress,
  type SeedSearchRequest,
  type SeedSearchResult,
  type SeedSearchVerifier,
  type SeedVerificationProgress,
} from "./seedExplorerSearch";

const DEFAULT_SLICE_BUDGET_MS = 10;
const DEFAULT_PROGRESS_INTERVAL_MS = 120;
const DEFAULT_SEARCH_CHUNK_SIZE = 64;
const DEFAULT_VERIFICATION_CHUNK_SIZE = 4;
const DEFAULT_MAX_CHUNKS_PER_SLICE = 16;

export type SeedExplorerRuntimePhase = "searching" | "verifying";

export type SeedExplorerRuntimeFrame = Readonly<{
  phase: SeedExplorerRuntimePhase;
  search: SeedSearchProgress;
  verification?: SeedVerificationProgress;
  partialCandidates: readonly SeedAnalysisResult[];
}>;

export type CooperativeSeedSearchOutcome =
  | Readonly<{
    status: "completed";
    frame: SeedExplorerRuntimeFrame;
    result: SeedSearchResult;
  }>
  | Readonly<{
    status: "cancelled";
    frame: SeedExplorerRuntimeFrame;
  }>;

export type CooperativeSeedSearchOptions = Readonly<{
  signal?: AbortSignal;
  sliceBudgetMs?: number;
  progressIntervalMs?: number;
  searchChunkSize?: number;
  verificationChunkSize?: number;
  maxChunksPerSlice?: number;
  now?: () => number;
  yieldToHost?: () => Promise<void>;
  onProgress?: (frame: SeedExplorerRuntimeFrame) => void;
}>;

export type SeedExplorerRunOutcome =
  | Readonly<{
    runId: number;
    status: "completed";
    result: SeedSearchResult;
  }>
  | Readonly<{
    runId: number;
    status: "cancelled" | "superseded";
    frame: SeedExplorerRuntimeFrame;
  }>;

export type SeedExplorerRuntimeStatus = "idle" | "running" | "completed" | "cancelled" | "failed";

export type SeedExplorerRuntimeSnapshot = Readonly<{
  runId: number;
  status: SeedExplorerRuntimeStatus;
  frame?: SeedExplorerRuntimeFrame;
  result?: SeedSearchResult;
  lastCompleteResult?: SeedSearchResult;
  error?: string;
}>;

export type SeedExplorerStartOptions = CooperativeSeedSearchOptions & Readonly<{
  onSnapshot?: (snapshot: SeedExplorerRuntimeSnapshot) => void;
}>;

type NormalizedRuntimeOptions = Readonly<{
  signal?: AbortSignal;
  sliceBudgetMs: number;
  progressIntervalMs: number;
  searchChunkSize: number;
  verificationChunkSize: number;
  maxChunksPerSlice: number;
  now: () => number;
  yieldToHost: () => Promise<void>;
  onProgress?: (frame: SeedExplorerRuntimeFrame) => void;
}>;

export async function runSeedSearchCooperatively(
  request: SeedSearchRequest,
  options: CooperativeSeedSearchOptions = {},
): Promise<CooperativeSeedSearchOutcome> {
  const runtime = normalizeRuntimeOptions(options);
  const accumulator = new SeedSearchAccumulator(request);
  let frame = searchFrame(accumulator);
  let lastPublishedAt = Number.NEGATIVE_INFINITY;

  const publish = (nextFrame: SeedExplorerRuntimeFrame, force = false, timestamp = runtime.now()): void => {
    frame = nextFrame;
    if (!runtime.onProgress) return;
    if (!force && timestamp - lastPublishedAt < runtime.progressIntervalMs) return;
    lastPublishedAt = timestamp;
    runtime.onProgress(frame);
  };

  const publicationIsDue = (timestamp: number): boolean => (
    runtime.onProgress !== undefined && timestamp - lastPublishedAt >= runtime.progressIntervalMs
  );

  publish(frame, true);
  while (!accumulator.progress().done) {
    if (runtime.signal?.aborted) {
      frame = searchFrame(accumulator);
      return Object.freeze({ status: "cancelled", frame });
    }
    const sliceStartedAt = runtime.now();
    let chunks = 0;
    do {
      if (runtime.signal?.aborted) {
        frame = searchFrame(accumulator);
        return Object.freeze({ status: "cancelled", frame });
      }
      accumulator.process(runtime.searchChunkSize);
      chunks += 1;
      const timestamp = runtime.now();
      if (publicationIsDue(timestamp)) publish(searchFrame(accumulator), false, timestamp);
      if (accumulator.progress().done) break;
      if (timestamp - sliceStartedAt >= runtime.sliceBudgetMs) break;
    } while (chunks < runtime.maxChunksPerSlice);
    if (!accumulator.progress().done) await runtime.yieldToHost();
  }

  const verifier = accumulator.createVerifier();
  frame = verificationFrame(accumulator, verifier);
  publish(frame, true);
  while (!verifier.progress().done) {
    if (runtime.signal?.aborted) {
      frame = verificationFrame(accumulator, verifier);
      return Object.freeze({ status: "cancelled", frame });
    }
    const sliceStartedAt = runtime.now();
    let chunks = 0;
    do {
      if (runtime.signal?.aborted) {
        frame = verificationFrame(accumulator, verifier);
        return Object.freeze({ status: "cancelled", frame });
      }
      verifier.process(runtime.verificationChunkSize);
      chunks += 1;
      const timestamp = runtime.now();
      if (publicationIsDue(timestamp)) publish(verificationFrame(accumulator, verifier), false, timestamp);
      if (verifier.progress().done) break;
      if (timestamp - sliceStartedAt >= runtime.sliceBudgetMs) break;
    } while (chunks < runtime.maxChunksPerSlice);
    if (!verifier.progress().done) await runtime.yieldToHost();
  }

  const result = verifier.finalize();
  frame = verificationFrame(accumulator, verifier, result.candidates);
  publish(frame, true);
  return Object.freeze({ status: "completed", frame, result });
}

export class SeedExplorerRuntime {
  #nextRunId = 1;
  #active?: Readonly<{ runId: number; controller: AbortController }>;
  #lastCompleteResult?: SeedSearchResult;
  #snapshot: SeedExplorerRuntimeSnapshot = Object.freeze({ runId: 0, status: "idle" });

  snapshot(): SeedExplorerRuntimeSnapshot {
    return this.#snapshot;
  }

  cancel(): void {
    this.#active?.controller.abort();
  }

  async start(request: SeedSearchRequest, options: SeedExplorerStartOptions = {}): Promise<SeedExplorerRunOutcome> {
    this.#active?.controller.abort();
    const runId = this.#nextRunId;
    this.#nextRunId += 1;
    const controller = new AbortController();
    this.#active = Object.freeze({ runId, controller });
    const detachExternalAbort = forwardAbort(options.signal, controller);
    const { onSnapshot, ...cooperativeOptions } = options;

    this.#setSnapshot(Object.freeze({
      runId,
      status: "running",
      lastCompleteResult: this.#lastCompleteResult,
    }), onSnapshot);

    let latestFrame: SeedExplorerRuntimeFrame | undefined;
    try {
      const outcome = await runSeedSearchCooperatively(request, {
        ...cooperativeOptions,
        signal: controller.signal,
        onProgress: (frame) => {
          latestFrame = frame;
          if (this.#active?.runId !== runId) return;
          this.#setSnapshot(Object.freeze({
            runId,
            status: "running",
            frame,
            lastCompleteResult: this.#lastCompleteResult,
          }), onSnapshot);
          cooperativeOptions.onProgress?.(frame);
        },
      });

      if (this.#active?.runId !== runId) {
        return Object.freeze({ runId, status: "superseded", frame: outcome.frame });
      }
      this.#active = undefined;
      if (outcome.status === "completed") {
        this.#lastCompleteResult = outcome.result;
        this.#setSnapshot(Object.freeze({
          runId,
          status: "completed",
          frame: outcome.frame,
          result: outcome.result,
          lastCompleteResult: outcome.result,
        }), onSnapshot);
        return Object.freeze({ runId, status: "completed", result: outcome.result });
      }
      this.#setSnapshot(Object.freeze({
        runId,
        status: "cancelled",
        frame: outcome.frame,
        lastCompleteResult: this.#lastCompleteResult,
      }), onSnapshot);
      return Object.freeze({ runId, status: "cancelled", frame: outcome.frame });
    } catch (error) {
      if (this.#active?.runId !== runId) {
        return Object.freeze({
          runId,
          status: "superseded",
          frame: latestFrame ?? emptyFrame(request),
        });
      }
      this.#active = undefined;
      this.#setSnapshot(Object.freeze({
        runId,
        status: "failed",
        frame: latestFrame,
        lastCompleteResult: this.#lastCompleteResult,
        error: error instanceof Error ? error.message : String(error),
      }), onSnapshot);
      throw error;
    } finally {
      detachExternalAbort();
    }
  }

  #setSnapshot(snapshot: SeedExplorerRuntimeSnapshot, listener?: (snapshot: SeedExplorerRuntimeSnapshot) => void): void {
    this.#snapshot = snapshot;
    listener?.(snapshot);
  }
}

function searchFrame(accumulator: SeedSearchAccumulator): SeedExplorerRuntimeFrame {
  return Object.freeze({
    phase: "searching",
    search: accumulator.progress(),
    partialCandidates: accumulator.previewCandidates(),
  });
}

function verificationFrame(
  accumulator: SeedSearchAccumulator,
  verifier: SeedSearchVerifier,
  candidates = verifier.previewCandidates(),
): SeedExplorerRuntimeFrame {
  return Object.freeze({
    phase: "verifying",
    search: accumulator.progress(),
    verification: verifier.progress(),
    partialCandidates: candidates,
  });
}

function emptyFrame(request: SeedSearchRequest): SeedExplorerRuntimeFrame {
  const startIndex = request.startIndex ?? 0;
  return Object.freeze({
    phase: "searching",
    search: Object.freeze({
      examined: 0,
      total: request.count,
      passedFilters: 0,
      nextIndex: startIndex,
      done: false,
    }),
    partialCandidates: Object.freeze([]),
  });
}

function normalizeRuntimeOptions(options: CooperativeSeedSearchOptions): NormalizedRuntimeOptions {
  const now = options.now ?? defaultNow;
  return Object.freeze({
    signal: options.signal,
    sliceBudgetMs: positiveFinite(options.sliceBudgetMs ?? DEFAULT_SLICE_BUDGET_MS, "slice budget"),
    progressIntervalMs: nonNegativeFinite(
      options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS,
      "progress interval",
    ),
    searchChunkSize: positiveSafeInteger(
      options.searchChunkSize ?? DEFAULT_SEARCH_CHUNK_SIZE,
      "search chunk size",
    ),
    verificationChunkSize: positiveSafeInteger(
      options.verificationChunkSize ?? DEFAULT_VERIFICATION_CHUNK_SIZE,
      "verification chunk size",
    ),
    maxChunksPerSlice: positiveSafeInteger(
      options.maxChunksPerSlice ?? DEFAULT_MAX_CHUNKS_PER_SLICE,
      "maximum chunks per slice",
    ),
    now,
    yieldToHost: options.yieldToHost ?? defaultYieldToHost,
    onProgress: options.onProgress,
  });
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Seed Explorer ${label} must be positive.`);
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Seed Explorer ${label} cannot be negative.`);
  return value;
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Seed Explorer ${label} must be a positive safe integer.`);
  }
  return value;
}

function defaultNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function defaultYieldToHost(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function forwardAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => undefined;
  const abort = (): void => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}
