import { CANON_SEED_ENTROPY_ALPHABET } from "../content/CanonSeed";
import {
  analyzeSeedEntropy,
  createSeedAnalysisContext,
  verifySeedAnalysis,
  type SeedAnalysisContext,
  type SeedAnalysisResult,
  type SeedExplorerConfig,
  type SeedFilterReason,
} from "./seedExplorer";

export const CANON_ENTROPY_SPACE_SIZE = 36 ** 5;

export type SeedSearchRequest = SeedExplorerConfig & Readonly<{
  startIndex?: number;
  count: number;
  top: number;
}>;

export type SeedSearchProgress = Readonly<{
  examined: number;
  total: number;
  passedFilters: number;
  nextIndex: number;
  done: boolean;
}>;

export type SeedVerificationFailure = Readonly<{
  canonCode: string;
  reason: string;
}>;

export type SeedVerificationProgress = Readonly<{
  examined: number;
  total: number;
  failures: number;
  done: boolean;
}>;

export type SeedSearchResult = Readonly<{
  request: Readonly<{
    playerDeckKey: string;
    hostDeckKey: string;
    difficulty: SeedAnalysisContext["config"]["difficulty"];
    evaluateMulligan: boolean;
    avoidEarlySpikes: boolean;
    startIndex: number;
    count: number;
    top: number;
  }>;
  examined: number;
  passedFilters: number;
  rejectedByReason: Readonly<Record<SeedFilterReason, number>>;
  verificationPoolSize: number;
  verificationFailures: readonly SeedVerificationFailure[];
  candidates: readonly SeedAnalysisResult[];
}>;

export class SeedSearchAccumulator {
  readonly context: SeedAnalysisContext;
  readonly request: SeedSearchResult["request"];
  readonly #heap: BoundedResultHeap;
  readonly #rejectedByReason = emptyRejectionCounts();
  #examined = 0;
  #passedFilters = 0;

  constructor(request: SeedSearchRequest) {
    const startIndex = request.startIndex ?? 0;
    validateSearchBounds(startIndex, request.count, request.top);
    this.context = createSeedAnalysisContext(request);
    this.request = Object.freeze({
      ...this.context.config,
      startIndex,
      count: request.count,
      top: request.top,
    });
    this.#heap = new BoundedResultHeap(Math.min(request.count, Math.max(request.top * 20, 250)));
  }

  process(batchSize: number): SeedSearchProgress {
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new Error("Seed Explorer batch size must be a positive safe integer.");
    }
    const amount = Math.min(batchSize, this.request.count - this.#examined);
    for (let offset = 0; offset < amount; offset += 1) {
      const index = this.request.startIndex + this.#examined;
      const evaluation = analyzeSeedEntropy(this.context, canonEntropyFromIndex(index));
      this.#examined += 1;
      if (evaluation.accepted) {
        this.#passedFilters += 1;
        this.#heap.push(evaluation.result);
      } else {
        for (const reason of evaluation.filterReasons) this.#rejectedByReason[reason] += 1;
      }
    }
    return this.progress();
  }

  progress(): SeedSearchProgress {
    return Object.freeze({
      examined: this.#examined,
      total: this.request.count,
      passedFilters: this.#passedFilters,
      nextIndex: this.request.startIndex + this.#examined,
      done: this.#examined === this.request.count,
    });
  }

  previewCandidates(limit = this.request.top): readonly SeedAnalysisResult[] {
    validatePreviewLimit(limit);
    return Object.freeze(this.#heap.sortedBestFirst().slice(0, limit));
  }

  createVerifier(): SeedSearchVerifier {
    if (this.#examined !== this.request.count) {
      throw new Error(`Seed Explorer search is incomplete: ${this.#examined}/${this.request.count}.`);
    }
    return new SeedSearchVerifier({
      context: this.context,
      request: this.request,
      examined: this.#examined,
      passedFilters: this.#passedFilters,
      rejectedByReason: Object.freeze({ ...this.#rejectedByReason }),
      fastCandidates: Object.freeze(this.#heap.sortedBestFirst()),
    });
  }

  finalize(): SeedSearchResult {
    const verifier = this.createVerifier();
    const { total } = verifier.progress();
    if (total > 0) verifier.process(total);
    return verifier.finalize();
  }
}

type SeedSearchVerifierInput = Readonly<{
  context: SeedAnalysisContext;
  request: SeedSearchResult["request"];
  examined: number;
  passedFilters: number;
  rejectedByReason: Readonly<Record<SeedFilterReason, number>>;
  fastCandidates: readonly SeedAnalysisResult[];
}>;

export class SeedSearchVerifier {
  readonly #input: SeedSearchVerifierInput;
  readonly #verified: SeedAnalysisResult[] = [];
  readonly #failures: SeedVerificationFailure[] = [];
  #examined = 0;

  constructor(input: SeedSearchVerifierInput) {
    this.#input = input;
  }

  process(batchSize: number): SeedVerificationProgress {
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new Error("Seed Explorer verification batch size must be a positive safe integer.");
    }
    const amount = Math.min(batchSize, this.#input.fastCandidates.length - this.#examined);
    for (let offset = 0; offset < amount; offset += 1) {
      const candidate = this.#input.fastCandidates[this.#examined];
      this.#examined += 1;
      try {
        this.#verified.push(verifySeedAnalysis(this.#input.context, candidate));
      } catch (error) {
        this.#failures.push(Object.freeze({
          canonCode: candidate.identity.canonCode,
          reason: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    return this.progress();
  }

  progress(): SeedVerificationProgress {
    return Object.freeze({
      examined: this.#examined,
      total: this.#input.fastCandidates.length,
      failures: this.#failures.length,
      done: this.#examined === this.#input.fastCandidates.length,
    });
  }

  previewCandidates(limit = this.#input.request.top): readonly SeedAnalysisResult[] {
    validatePreviewLimit(limit);
    return Object.freeze([...this.#verified].sort(compareSeedResults).slice(0, limit));
  }

  finalize(): SeedSearchResult {
    if (this.#examined !== this.#input.fastCandidates.length) {
      throw new Error(
        `Seed Explorer verification is incomplete: ${this.#examined}/${this.#input.fastCandidates.length}.`,
      );
    }
    const candidates = [...this.#verified].sort(compareSeedResults).slice(0, this.#input.request.top);
    return Object.freeze({
      request: this.#input.request,
      examined: this.#input.examined,
      passedFilters: this.#input.passedFilters,
      rejectedByReason: this.#input.rejectedByReason,
      verificationPoolSize: this.#input.fastCandidates.length,
      verificationFailures: Object.freeze([...this.#failures]),
      candidates: Object.freeze(candidates),
    });
  }
}

export function searchSeedRange(request: SeedSearchRequest): SeedSearchResult {
  const accumulator = new SeedSearchAccumulator(request);
  accumulator.process(request.count);
  return accumulator.finalize();
}

export function canonEntropyFromIndex(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= CANON_ENTROPY_SPACE_SIZE) {
    throw new Error(`Canon entropy index must be between 0 and ${CANON_ENTROPY_SPACE_SIZE - 1}.`);
  }
  let remainder = index;
  const characters = Array.from({ length: 5 }, () => "0");
  for (let position = characters.length - 1; position >= 0; position -= 1) {
    characters[position] = CANON_SEED_ENTROPY_ALPHABET[remainder % 36];
    remainder = Math.floor(remainder / 36);
  }
  return characters.join("");
}

export function canonEntropyIndex(entropy: string): number {
  const normalized = entropy.toUpperCase();
  if (!/^[A-Z0-9]{5}$/u.test(normalized)) throw new Error("Canon entropy must contain exactly five A-Z or 0-9 characters.");
  let value = 0;
  for (const character of normalized) {
    const digit = CANON_SEED_ENTROPY_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`Unknown Canon entropy character "${character}".`);
    value = value * 36 + digit;
  }
  return value;
}

export function compareSeedResults(left: SeedAnalysisResult, right: SeedAnalysisResult): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.identity.canonCode < right.identity.canonCode) return -1;
  if (left.identity.canonCode > right.identity.canonCode) return 1;
  return 0;
}

function validateSearchBounds(startIndex: number, count: number, top: number): void {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
    throw new Error("Seed Explorer startIndex must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Seed Explorer count must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(top) || top <= 0 || top > 100) {
    throw new Error("Seed Explorer top must be an integer between 1 and 100.");
  }
  if (startIndex + count > CANON_ENTROPY_SPACE_SIZE) {
    throw new Error("Seed Explorer range exceeds the five-character Canon entropy space.");
  }
}

function validatePreviewLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("Seed Explorer preview limit must be a positive safe integer.");
  }
}

function compareQuality(left: SeedAnalysisResult, right: SeedAnalysisResult): number {
  return -compareSeedResults(left, right);
}

class BoundedResultHeap {
  readonly #capacity: number;
  readonly #items: SeedAnalysisResult[] = [];

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  push(result: SeedAnalysisResult): void {
    if (this.#capacity === 0) return;
    if (this.#items.length < this.#capacity) {
      this.#items.push(result);
      this.#siftUp(this.#items.length - 1);
      return;
    }
    if (compareQuality(result, this.#items[0]) <= 0) return;
    this.#items[0] = result;
    this.#siftDown(0);
  }

  sortedBestFirst(): SeedAnalysisResult[] {
    return [...this.#items].sort(compareSeedResults);
  }

  #siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareQuality(this.#items[index], this.#items[parent]) >= 0) break;
      [this.#items[index], this.#items[parent]] = [this.#items[parent], this.#items[index]];
      index = parent;
    }
  }

  #siftDown(start: number): void {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < this.#items.length && compareQuality(this.#items[left], this.#items[worst]) < 0) worst = left;
      if (right < this.#items.length && compareQuality(this.#items[right], this.#items[worst]) < 0) worst = right;
      if (worst === index) return;
      [this.#items[index], this.#items[worst]] = [this.#items[worst], this.#items[index]];
      index = worst;
    }
  }
}

function emptyRejectionCounts(): Record<SeedFilterReason, number> {
  return {
    "too-few-sources-before-host": 0,
    "too-many-sources-in-hand": 0,
    "too-few-accessible-cards": 0,
    "early-host-spike": 0,
  };
}
