import {
  CANON_SEED_ENTROPY_LENGTH,
  decodeCanonSeed,
  encodeCanonSeed,
  normalizeCanonSeedEntropy,
  type SeedFutureIdentity,
} from "../content/CanonSeed";
import { contentCatalog } from "../content/bootstrap";
import type { CardInstance, DeckList, DifficultyMode, HostRulesProfile } from "../engine/GameTypes";
import { createInitialGame, mulliganOpeningHand } from "../engine/GameState";
import { buildHostRules } from "../engine/HostRules";
import {
  prepareInitialDeckPools,
  shuffleInitialDeckOrder,
  type InitialDeckPools,
} from "../engine/InitialDeckOrder";
import { shuffleWithState } from "../engine/RNG";

export const SEED_ANALYSIS_REVISION = 1 as const;
export const FIRST_APPROACH_PROFILE_ID = "first-approach-v1" as const;
export const BALANCED_PROFILE_ID = "balanced-v1" as const;
export const EXPERIENCED_PROFILE_ID = "experienced-v1" as const;
export const HIGH_PRESSURE_PROFILE_ID = "high-pressure-v1" as const;
export const PROGRESSIVE_PRESSURE_PROFILE_ID = "progressive-pressure-v1" as const;
export const SEED_SEARCH_PROFILE_IDS = Object.freeze([
  FIRST_APPROACH_PROFILE_ID,
  BALANCED_PROFILE_ID,
  EXPERIENCED_PROFILE_ID,
  HIGH_PRESSURE_PROFILE_ID,
  PROGRESSIVE_PRESSURE_PROFILE_ID,
] as const);
export type SeedSearchProfileId = (typeof SEED_SEARCH_PROFILE_IDS)[number];
export const PLAYER_DRAW_PREVIEW_COUNT = 5;
export const HOST_WINDOW_PREVIEW_COUNT = 5;

export type SeedExplorerConfig = Readonly<{
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
  profileId?: SeedSearchProfileId;
  evaluateMulligan?: boolean;
  avoidEarlySpikes?: boolean;
}>;

export type SeedCardPreviewV1 = Readonly<{
  instanceId: string;
  definitionId: string;
  name: string;
  displayNameEs?: string;
  energyCost: number;
  kinds: readonly string[];
  isToken: boolean;
  power: number;
  endurance: number;
  contextual: boolean;
}>;

export type SeedHandMetricsV1 = Readonly<{
  cardCount: number;
  sourceCount: number;
  nonSourceCount: number;
  /** Zero-based positions in the inspected hand. */
  sourcePositions: readonly number[];
  /** Buckets 0, 1, 2, 3, 4 and 5+. Sources are excluded. */
  costHistogram: readonly [number, number, number, number, number, number];
  averageNonSourceCost: number;
  preparationDrawCount: number;
  sourcesSeenBeforeHost: number;
  sourceCoverageTurns: number;
  sourceCoverageRatio: number;
  accessibleNonSourceCount: number;
  flexibleAccessibleCount: number;
  contextualAccessibleCount: number;
  resourceRating: number;
  curveRating: number;
  qualityRating: number;
  stuckRisk: number;
}>;

export type SeedHostWindowMetricsV1 = Readonly<{
  hostTurn: number;
  cardCount: number;
  tokenCount: number;
  nonTokenCount: number;
  echoCount: number;
  printedPower: number;
  printedEndurance: number;
  maximumThreat: number;
  pressure: number;
}>;

export type SeedHostMetricsV1 = Readonly<{
  windows: readonly SeedHostWindowMetricsV1[];
  firstWindowPressure: number;
  earlyPressure: number;
  peakPressure: number;
  escalation: number;
  pressureRating: number;
  escalationRating: number;
}>;

export type SeedMetricsV1 = Readonly<{
  openingHand: SeedHandMetricsV1;
  mulliganHand?: SeedHandMetricsV1;
  selectedHand: "keep" | "mulligan";
  host: SeedHostMetricsV1;
  ratings: Readonly<{
    opening: number;
    resources: number;
    curve: number;
    pressure: number;
    escalation: number;
  }>;
}>;

export type SeedHostWindowPreviewV1 = Readonly<{
  hostTurn: number;
  cards: readonly SeedCardPreviewV1[];
  pressure: number;
}>;

export type SeedPreviewV1 = Readonly<{
  openingHand: readonly SeedCardPreviewV1[];
  mulliganHand?: readonly SeedCardPreviewV1[];
  recommendedHand: readonly SeedCardPreviewV1[];
  nextPlayerDraws: readonly SeedCardPreviewV1[];
  hostArchiveTop: readonly SeedCardPreviewV1[];
  hostWindows: readonly SeedHostWindowPreviewV1[];
}>;

export type SeedAnalysisResult = Readonly<{
  identity: SeedFutureIdentity;
  analysisRevision: typeof SEED_ANALYSIS_REVISION;
  score: number;
  profileId: SeedSearchProfileId;
  metrics: SeedMetricsV1;
  preview: SeedPreviewV1;
  mulligan: Readonly<{
    recommendation: "keep" | "mulligan";
    delta: number;
  }>;
  solvability: Readonly<{ status: "unchecked" | "structurally-valid" }>;
}>;

/**
 * Greedy max-min selection over the verified top pool. The best score is always retained; each
 * following slot balances quality rank with distance from the candidates already selected.
 */
export function selectDiverseSeedCandidates(
  rankedCandidates: readonly SeedAnalysisResult[],
  limit: number,
): readonly SeedAnalysisResult[] {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("Diverse Seed Explorer limit must be a non-negative safe integer.");
  }
  if (limit === 0 || rankedCandidates.length === 0) return Object.freeze([]);
  const target = Math.min(limit, rankedCandidates.length);
  const selected = [rankedCandidates[0]];
  const remaining = rankedCandidates.slice(1).map((candidate, rank) => ({ candidate, rank: rank + 1 }));
  while (selected.length < target && remaining.length > 0) {
    let bestIndex = 0;
    let bestPriority = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index];
      const minimumDistance = Math.min(...selected.map((chosen) => seedCandidateDistance(entry.candidate, chosen)));
      const quality = rankedCandidates.length <= 1 ? 1 : 1 - entry.rank / (rankedCandidates.length - 1);
      const priority = minimumDistance * 0.72 + quality * 0.28;
      const currentBest = remaining[bestIndex];
      if (
        priority > bestPriority
        || (priority === bestPriority && entry.rank < currentBest.rank)
        || (priority === bestPriority && entry.rank === currentBest.rank
          && entry.candidate.identity.canonCode < currentBest.candidate.identity.canonCode)
      ) {
        bestPriority = priority;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0].candidate);
  }
  return Object.freeze(selected);
}

function seedCandidateDistance(left: SeedAnalysisResult, right: SeedAnalysisResult): number {
  const leftVector = seedCandidateVector(left);
  const rightVector = seedCandidateVector(right);
  const squared = leftVector.reduce((total, value, index) => total + (value - rightVector[index]) ** 2, 0);
  return Math.sqrt(squared / leftVector.length);
}

function seedCandidateVector(candidate: SeedAnalysisResult): readonly number[] {
  const ratings = candidate.metrics.ratings;
  return [
    ratings.opening / 100,
    ratings.resources / 100,
    ratings.curve / 100,
    ratings.pressure / 100,
    ratings.escalation / 100,
    candidate.mulligan.recommendation === "mulligan" ? 1 : 0,
  ];
}

export type SeedFilterReason =
  | "too-few-sources-before-host"
  | "too-many-sources-in-hand"
  | "too-few-accessible-cards"
  | "early-host-spike"
  | "host-pressure-too-low"
  | "host-escalation-too-low";

export type SeedCandidateEvaluation = Readonly<{
  accepted: boolean;
  filterReasons: readonly SeedFilterReason[];
  result: SeedAnalysisResult;
}>;

export type SeedProfileScoreFeatures = Readonly<{
  openingRating: number;
  resourceRating: number;
  curveRating: number;
  pressureRating: number;
  escalationRating: number;
}>;

export type FirstApproachScoreFeatures = SeedProfileScoreFeatures;

export type SeedSearchProfile = Readonly<{
  id: SeedSearchProfileId;
  mulliganMinimumGain: number;
  defaultAvoidEarlySpikes: boolean;
  pressureTarget: number;
  pressureDeviationPenalty: number;
  weights: Readonly<{
    opening: number;
    resources: number;
    curve: number;
    pressureFit: number;
    escalation: number;
  }>;
  filters: Readonly<{
    minimumSourceCoverageTurns: number;
    maximumSourcesInHand: number;
    minimumAccessibleNonSources: number;
    minimumFirstWindowPressure?: number;
    minimumEarlyWindowPressure?: number;
    minimumEscalation?: number;
    maximumFirstWindowPressure: number;
    maximumEarlyWindowPressure: number;
  }>;
}>;

export const FIRST_APPROACH_PROFILE = Object.freeze({
  id: FIRST_APPROACH_PROFILE_ID,
  mulliganMinimumGain: 4,
  defaultAvoidEarlySpikes: true,
  pressureTarget: 42,
  pressureDeviationPenalty: 1.7,
  weights: Object.freeze({
    opening: 0.25,
    resources: 0.25,
    curve: 0.2,
    pressureFit: 0.18,
    escalation: 0.12,
  }),
  filters: Object.freeze({
    minimumSourceCoverageTurns: 2,
    maximumSourcesInHand: 4,
    minimumAccessibleNonSources: 2,
    maximumFirstWindowPressure: 19,
    maximumEarlyWindowPressure: 22,
  }),
}) satisfies SeedSearchProfile;

export const BALANCED_PROFILE = Object.freeze({
  id: BALANCED_PROFILE_ID,
  mulliganMinimumGain: 4,
  defaultAvoidEarlySpikes: true,
  pressureTarget: 55,
  pressureDeviationPenalty: 1.25,
  weights: Object.freeze({
    opening: 0.2,
    resources: 0.18,
    curve: 0.2,
    pressureFit: 0.25,
    escalation: 0.17,
  }),
  filters: Object.freeze({
    minimumSourceCoverageTurns: 2,
    maximumSourcesInHand: 4,
    minimumAccessibleNonSources: 2,
    maximumFirstWindowPressure: 23,
    maximumEarlyWindowPressure: 26,
  }),
}) satisfies SeedSearchProfile;

export const EXPERIENCED_PROFILE = Object.freeze({
  id: EXPERIENCED_PROFILE_ID,
  mulliganMinimumGain: 4,
  defaultAvoidEarlySpikes: false,
  pressureTarget: 68,
  pressureDeviationPenalty: 1.1,
  weights: Object.freeze({
    opening: 0.12,
    resources: 0.12,
    curve: 0.16,
    pressureFit: 0.36,
    escalation: 0.24,
  }),
  filters: Object.freeze({
    minimumSourceCoverageTurns: 1,
    maximumSourcesInHand: 5,
    minimumAccessibleNonSources: 1,
    minimumEarlyWindowPressure: 11,
    maximumFirstWindowPressure: 28,
    maximumEarlyWindowPressure: 30,
  }),
}) satisfies SeedSearchProfile;

export const HIGH_PRESSURE_PROFILE = Object.freeze({
  id: HIGH_PRESSURE_PROFILE_ID,
  mulliganMinimumGain: 4,
  defaultAvoidEarlySpikes: false,
  pressureTarget: 85,
  pressureDeviationPenalty: 0.9,
  weights: Object.freeze({
    opening: 0.1,
    resources: 0.08,
    curve: 0.12,
    pressureFit: 0.58,
    escalation: 0.12,
  }),
  filters: Object.freeze({
    minimumSourceCoverageTurns: 1,
    maximumSourcesInHand: 5,
    minimumAccessibleNonSources: 1,
    minimumFirstWindowPressure: 12,
    minimumEarlyWindowPressure: 15,
    maximumFirstWindowPressure: 35,
    maximumEarlyWindowPressure: 35,
  }),
}) satisfies SeedSearchProfile;

export const PROGRESSIVE_PRESSURE_PROFILE = Object.freeze({
  id: PROGRESSIVE_PRESSURE_PROFILE_ID,
  mulliganMinimumGain: 4,
  defaultAvoidEarlySpikes: true,
  pressureTarget: 50,
  pressureDeviationPenalty: 1.25,
  weights: Object.freeze({
    opening: 0.16,
    resources: 0.14,
    curve: 0.17,
    pressureFit: 0.18,
    escalation: 0.35,
  }),
  filters: Object.freeze({
    minimumSourceCoverageTurns: 2,
    maximumSourcesInHand: 4,
    minimumAccessibleNonSources: 2,
    minimumEscalation: 2,
    maximumFirstWindowPressure: 20,
    maximumEarlyWindowPressure: 24,
  }),
}) satisfies SeedSearchProfile;

export const SEED_SEARCH_PROFILES: Readonly<Record<SeedSearchProfileId, SeedSearchProfile>> = Object.freeze({
  [FIRST_APPROACH_PROFILE_ID]: FIRST_APPROACH_PROFILE,
  [BALANCED_PROFILE_ID]: BALANCED_PROFILE,
  [EXPERIENCED_PROFILE_ID]: EXPERIENCED_PROFILE,
  [HIGH_PRESSURE_PROFILE_ID]: HIGH_PRESSURE_PROFILE,
  [PROGRESSIVE_PRESSURE_PROFILE_ID]: PROGRESSIVE_PRESSURE_PROFILE,
});

export type SeedAnalysisContext = Readonly<{
  config: Readonly<Required<SeedExplorerConfig>>;
  playerDeck: DeckList;
  hostDeck: DeckList;
  pools: InitialDeckPools;
  hostRules: HostRulesProfile;
  identityTemplate: SeedFutureIdentity;
  canonBlocks: Readonly<{
    format: string;
    player: string;
    host: string;
    difficulty: string;
  }>;
}>;

type OrderedFuture = Readonly<{
  openingHand: readonly CardInstance[];
  playerArchive: readonly CardInstance[];
  hostArchive: readonly CardInstance[];
  randomState: number;
  exactMulligan?: Readonly<{
    hand: readonly CardInstance[];
    archive: readonly CardInstance[];
  }>;
}>;

export type ProjectedHostWindow = Readonly<{
  metrics: SeedHostWindowMetricsV1;
  cards: readonly CardInstance[];
}>;

export function createSeedAnalysisContext(config: SeedExplorerConfig): SeedAnalysisContext {
  const profile = seedSearchProfile(config.profileId ?? FIRST_APPROACH_PROFILE_ID);
  const canonCode = encodeCanonSeed({
    entropy: "00000",
    playerDeckKey: config.playerDeckKey,
    hostDeckKey: config.hostDeckKey,
    difficulty: config.difficulty,
  });
  const identityTemplate = decodeCanonSeed(canonCode);
  const playerDeck = contentCatalog.requireDeck(identityTemplate.playerDeckKey, "player").deck;
  const hostDeck = contentCatalog.requireDeck(identityTemplate.hostDeckKey, "host").deck;
  const [format, player, host, middle] = canonCode.split("-");

  return Object.freeze({
    config: Object.freeze({
      playerDeckKey: identityTemplate.playerDeckKey,
      hostDeckKey: identityTemplate.hostDeckKey,
      difficulty: identityTemplate.difficulty,
      profileId: profile.id,
      evaluateMulligan: config.evaluateMulligan ?? true,
      avoidEarlySpikes: config.avoidEarlySpikes ?? profile.defaultAvoidEarlySpikes,
    }),
    playerDeck,
    hostDeck,
    pools: prepareInitialDeckPools(playerDeck, hostDeck),
    hostRules: buildHostRules(hostDeck.rulesProfile),
    identityTemplate,
    canonBlocks: Object.freeze({ format, player, host, difficulty: middle[2] }),
  });
}

export function analyzeSeedEntropy(
  context: SeedAnalysisContext,
  inputEntropy: string,
): SeedCandidateEvaluation {
  const entropy = normalizeCanonSeedEntropy(inputEntropy);
  const order = shuffleInitialDeckOrder(context.pools, entropy);
  return analyzeOrderedFuture(context, entropy, {
    openingHand: order.playerArchive.slice(0, 7),
    playerArchive: order.playerArchive.slice(7),
    hostArchive: order.hostArchive,
    randomState: order.randomState,
  }, "unchecked");
}

export function verifySeedAnalysis(
  context: SeedAnalysisContext,
  fastResult: SeedAnalysisResult,
): SeedAnalysisResult {
  const { entropy } = fastResult.identity;
  if (entropy.length !== CANON_SEED_ENTROPY_LENGTH) {
    throw new Error(`Cannot verify invalid Canon entropy "${entropy}".`);
  }
  const game = createInitialGame(
    context.playerDeck,
    context.hostDeck,
    entropy,
    context.identityTemplate.preparationTurns,
    context.identityTemplate.difficulty,
    "standard",
  );
  const mulligan = context.config.evaluateMulligan ? mulliganOpeningHand(game) : undefined;
  const exact = analyzeOrderedFuture(context, entropy, {
    openingHand: game.player.hand,
    playerArchive: game.player.archive,
    hostArchive: game.host.archive,
    randomState: game.currentRandomState,
    exactMulligan: mulligan
      ? { hand: mulligan.player.hand, archive: mulligan.player.archive }
      : undefined,
  }, "structurally-valid").result;

  if (comparableAnalysis(fastResult) !== comparableAnalysis(exact)) {
    throw new Error(`Fast Seed Explorer projection diverged from createInitialGame for ${fastResult.identity.canonCode}.`);
  }
  return exact;
}

export function scoreFirstApproach(features: FirstApproachScoreFeatures): number {
  return scoreSeedProfile(FIRST_APPROACH_PROFILE_ID, features);
}

export function scoreSeedProfile(
  profileId: SeedSearchProfileId,
  features: SeedProfileScoreFeatures,
): number {
  const profile = seedSearchProfile(profileId);
  const pressureFit = clampRating(
    100
    - Math.abs(clampRating(features.pressureRating) - profile.pressureTarget)
      * profile.pressureDeviationPenalty,
  );
  const weights = profile.weights;
  return round1(
    clampRating(features.openingRating) * weights.opening
      + clampRating(features.resourceRating) * weights.resources
      + clampRating(features.curveRating) * weights.curve
      + pressureFit * weights.pressureFit
      + clampRating(features.escalationRating) * weights.escalation,
  );
}

export function firstApproachFilterReasons(
  metrics: SeedMetricsV1,
  avoidEarlySpikes = true,
): readonly SeedFilterReason[] {
  return seedProfileFilterReasons(FIRST_APPROACH_PROFILE_ID, metrics, avoidEarlySpikes);
}

export function seedProfileFilterReasons(
  profileId: SeedSearchProfileId,
  metrics: SeedMetricsV1,
  avoidEarlySpikes = seedSearchProfile(profileId).defaultAvoidEarlySpikes,
): readonly SeedFilterReason[] {
  const reasons: SeedFilterReason[] = [];
  const hand = metrics.selectedHand === "mulligan" ? metrics.mulliganHand ?? metrics.openingHand : metrics.openingHand;
  const thresholds = seedSearchProfile(profileId).filters;
  if (hand.sourceCoverageTurns < thresholds.minimumSourceCoverageTurns) {
    reasons.push("too-few-sources-before-host");
  }
  if (hand.sourceCount > thresholds.maximumSourcesInHand) {
    reasons.push("too-many-sources-in-hand");
  }
  if (hand.accessibleNonSourceCount < thresholds.minimumAccessibleNonSources) {
    reasons.push("too-few-accessible-cards");
  }
  const earlyPeak = Math.max(0, ...metrics.host.windows.slice(0, 2).map(({ pressure }) => pressure));
  if (
    (thresholds.minimumFirstWindowPressure !== undefined
      && metrics.host.firstWindowPressure < thresholds.minimumFirstWindowPressure)
    || (thresholds.minimumEarlyWindowPressure !== undefined
      && metrics.host.earlyPressure < thresholds.minimumEarlyWindowPressure)
  ) {
    reasons.push("host-pressure-too-low");
  }
  if (thresholds.minimumEscalation !== undefined && metrics.host.escalation < thresholds.minimumEscalation) {
    reasons.push("host-escalation-too-low");
  }
  if (
    avoidEarlySpikes
    && (metrics.host.firstWindowPressure > thresholds.maximumFirstWindowPressure
      || earlyPeak > thresholds.maximumEarlyWindowPressure)
  ) {
    reasons.push("early-host-spike");
  }
  return Object.freeze(reasons);
}

export function isSeedSearchProfileId(value: unknown): value is SeedSearchProfileId {
  return typeof value === "string" && (SEED_SEARCH_PROFILE_IDS as readonly string[]).includes(value);
}

export function seedSearchProfile(profileId: SeedSearchProfileId): SeedSearchProfile {
  const profile = SEED_SEARCH_PROFILES[profileId];
  if (!profile) throw new Error(`Unknown Seed Explorer profile "${String(profileId)}".`);
  return profile;
}

function analyzeOrderedFuture(
  context: SeedAnalysisContext,
  entropy: string,
  future: OrderedFuture,
  solvabilityStatus: SeedAnalysisResult["solvability"]["status"],
): SeedCandidateEvaluation {
  const profile = seedSearchProfile(context.config.profileId);
  const mulliganProjection = context.config.evaluateMulligan
    ? future.exactMulligan ?? projectMulligan(future)
    : undefined;
  const openingMetrics = analyzeHand(
    future.openingHand,
    future.playerArchive,
    context.identityTemplate.preparationTurns,
  );
  const mulliganMetrics = mulliganProjection
    ? analyzeHand(mulliganProjection.hand, mulliganProjection.archive, context.identityTemplate.preparationTurns)
    : undefined;
  const mulliganDelta = round1((mulliganMetrics?.qualityRating ?? openingMetrics.qualityRating) - openingMetrics.qualityRating);
  const recommendation = mulliganMetrics && mulliganDelta >= profile.mulliganMinimumGain
    ? "mulligan"
    : "keep";
  const selectedMetrics = recommendation === "mulligan" ? mulliganMetrics ?? openingMetrics : openingMetrics;
  const selectedHand = recommendation === "mulligan" ? mulliganProjection?.hand ?? future.openingHand : future.openingHand;
  const selectedArchive = recommendation === "mulligan" ? mulliganProjection?.archive ?? future.playerArchive : future.playerArchive;
  const hostWindows = projectPotentialHostWindows(future.hostArchive, context.hostRules, HOST_WINDOW_PREVIEW_COUNT);
  const hostMetrics = analyzeHost(hostWindows);
  const ratings = Object.freeze({
    opening: selectedMetrics.qualityRating,
    resources: selectedMetrics.resourceRating,
    curve: selectedMetrics.curveRating,
    pressure: hostMetrics.pressureRating,
    escalation: hostMetrics.escalationRating,
  });
  const metrics: SeedMetricsV1 = Object.freeze({
    openingHand: openingMetrics,
    mulliganHand: mulliganMetrics,
    selectedHand: recommendation,
    host: hostMetrics,
    ratings,
  });
  const identity = identityForEntropy(context, entropy);
  const score = scoreSeedProfile(profile.id, {
    openingRating: ratings.opening,
    resourceRating: ratings.resources,
    curveRating: ratings.curve,
    pressureRating: ratings.pressure,
    escalationRating: ratings.escalation,
  });
  const preview: SeedPreviewV1 = Object.freeze({
    openingHand: Object.freeze(future.openingHand.map(toCardPreview)),
    mulliganHand: mulliganProjection ? Object.freeze(mulliganProjection.hand.map(toCardPreview)) : undefined,
    recommendedHand: Object.freeze(selectedHand.map(toCardPreview)),
    nextPlayerDraws: Object.freeze(selectedArchive.slice(0, PLAYER_DRAW_PREVIEW_COUNT).map(toCardPreview)),
    hostArchiveTop: Object.freeze(
      future.hostArchive.slice(0, Math.max(PLAYER_DRAW_PREVIEW_COUNT, context.hostRules.revealCount)).map(toCardPreview),
    ),
    hostWindows: Object.freeze(hostWindows.map(({ metrics: windowMetrics, cards }) => Object.freeze({
      hostTurn: windowMetrics.hostTurn,
      cards: Object.freeze(cards.map(toCardPreview)),
      pressure: windowMetrics.pressure,
    }))),
  });
  const result: SeedAnalysisResult = Object.freeze({
    identity,
    analysisRevision: SEED_ANALYSIS_REVISION,
    score,
    profileId: profile.id,
    metrics,
    preview,
    mulligan: Object.freeze({ recommendation, delta: mulliganDelta }),
    solvability: Object.freeze({ status: solvabilityStatus }),
  });
  const filterReasons = seedProfileFilterReasons(profile.id, metrics, context.config.avoidEarlySpikes);
  return Object.freeze({ accepted: filterReasons.length === 0, filterReasons, result });
}

function projectMulligan(future: OrderedFuture): { hand: CardInstance[]; archive: CardInstance[] } {
  const shuffled = shuffleWithState(
    [...future.openingHand, ...future.playerArchive],
    future.randomState,
  );
  return {
    hand: shuffled.items.slice(0, Math.max(0, future.openingHand.length - 1)),
    archive: shuffled.items.slice(Math.max(0, future.openingHand.length - 1)),
  };
}

function analyzeHand(
  hand: readonly CardInstance[],
  archive: readonly CardInstance[],
  preparationTurns: number,
): SeedHandMetricsV1 {
  const preparationDrawCount = Math.max(0, preparationTurns - 1);
  const preparationDraws = archive.slice(0, preparationDrawCount);
  const seen = [...hand, ...preparationDraws];
  const available = [...hand];
  let sourceCoverageTurns = 0;
  for (let turn = 0; turn < preparationTurns; turn += 1) {
    if (turn > 0) {
      const draw = preparationDraws[turn - 1];
      if (draw) available.push(draw);
    }
    const sourceIndex = available.findIndex(isSource);
    if (sourceIndex >= 0) {
      available.splice(sourceIndex, 1);
      sourceCoverageTurns += 1;
    }
  }

  const sourcePositions = hand.flatMap((card, index) => isSource(card) ? [index] : []);
  const nonSources = hand.filter((card) => !isSource(card));
  const seenNonSources = seen.filter((card) => !isSource(card));
  const accessible = seenNonSources.filter((card) => card.energyCost <= sourceCoverageTurns);
  const contextualAccessibleCount = accessible.filter(isContextual).length;
  const flexibleAccessibleCount = accessible.length - contextualAccessibleCount;
  const histogram: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const card of nonSources) histogram[Math.min(5, Math.max(0, card.energyCost))] += 1;
  const averageNonSourceCost = nonSources.length > 0
    ? round1(nonSources.reduce((total, card) => total + card.energyCost, 0) / nonSources.length)
    : 0;
  const sourcesSeenBeforeHost = seen.filter(isSource).length;
  const sourceCoverageRatio = preparationTurns > 0
    ? round1(sourceCoverageTurns / preparationTurns)
    : 0;
  const sourceTarget = Math.min(3, Math.max(2, preparationTurns));
  const sourceBalance = clampRating(100 - Math.abs(sourcePositions.length - sourceTarget) * 28);
  const resourceRating = round1(clampRating(sourceCoverageRatio * 70 + sourceBalance * 0.3));
  const accessibleProgress = clampRating(accessible.length / 3 * 85);
  const flexibility = accessible.length > 0 ? flexibleAccessibleCount / accessible.length * 15 : 0;
  const curveRating = round1(clampRating(accessibleProgress + flexibility));
  const qualityRating = round1(resourceRating * 0.58 + curveRating * 0.42);
  const stuckRisk = round1(clampRating(100 - resourceRating * 0.62 - curveRating * 0.38));

  return Object.freeze({
    cardCount: hand.length,
    sourceCount: sourcePositions.length,
    nonSourceCount: nonSources.length,
    sourcePositions: Object.freeze(sourcePositions),
    costHistogram: Object.freeze(histogram),
    averageNonSourceCost,
    preparationDrawCount,
    sourcesSeenBeforeHost,
    sourceCoverageTurns,
    sourceCoverageRatio,
    accessibleNonSourceCount: accessible.length,
    flexibleAccessibleCount,
    contextualAccessibleCount,
    resourceRating,
    curveRating,
    qualityRating,
    stuckRisk,
  });
}

export function projectPotentialHostWindows(
  archive: readonly CardInstance[],
  rules: HostRulesProfile,
  count: number,
): readonly ProjectedHostWindow[] {
  const windows: ProjectedHostWindow[] = [];
  let cursor = 0;
  for (let hostTurn = 1; hostTurn <= count && cursor < archive.length; hostTurn += 1) {
    const cards: CardInstance[] = [];
    let normalReveals = 0;
    while (normalReveals < rules.revealCount && cursor < archive.length) {
      const card = archive[cursor++];
      cards.push(card);
      normalReveals += 1;
      if (rules.stopOnNonToken && !card.isToken) break;
    }
    const extraReveals = (hostTurn === rules.miniSurgeTurn ? rules.miniSurgeExtraReveals : 0)
      + (hostTurn >= rules.surgeTurn ? rules.surgeExtraReveals : 0);
    for (let extra = 0; extra < extraReveals && cursor < archive.length; extra += 1) {
      cards.push(archive[cursor++]);
    }
    const echoes = cards.filter((card) => card.kinds.includes("ECHO"));
    const printedPower = echoes.reduce((total, card) => total + card.basePower, 0);
    const printedEndurance = echoes.reduce((total, card) => total + card.baseEndurance, 0);
    const maximumThreat = Math.max(0, ...echoes.map((card) => card.basePower + card.baseEndurance));
    const pressure = round1(printedPower + printedEndurance * 0.4 + maximumThreat * 0.25);
    windows.push(Object.freeze({
      cards: Object.freeze(cards),
      metrics: Object.freeze({
        hostTurn,
        cardCount: cards.length,
        tokenCount: cards.filter((card) => card.isToken).length,
        nonTokenCount: cards.filter((card) => !card.isToken).length,
        echoCount: echoes.length,
        printedPower,
        printedEndurance,
        maximumThreat,
        pressure,
      }),
    }));
  }
  return Object.freeze(windows);
}

function analyzeHost(windows: readonly ProjectedHostWindow[]): SeedHostMetricsV1 {
  const windowMetrics = windows.map(({ metrics }) => metrics);
  const pressures = windowMetrics.map(({ pressure }) => pressure);
  const firstWindowPressure = pressures[0] ?? 0;
  const earlyPressure = round1(average(pressures.slice(0, 2)));
  const peakPressure = Math.max(0, ...pressures);
  const latePressure = average(pressures.slice(Math.max(0, pressures.length - 2)));
  const escalation = round1(latePressure - earlyPressure);
  const pressureRating = round1(clampRating(earlyPressure / 22 * 100));
  const escalationRating = round1(clampRating(50 + escalation * 6));
  return Object.freeze({
    windows: Object.freeze(windowMetrics),
    firstWindowPressure,
    earlyPressure,
    peakPressure,
    escalation,
    pressureRating,
    escalationRating,
  });
}

function identityForEntropy(context: SeedAnalysisContext, entropy: string): SeedFutureIdentity {
  const blocks = context.canonBlocks;
  const canonCode = `${blocks.format}-${blocks.player}-${blocks.host}-${entropy.slice(0, 2)}${blocks.difficulty}-${entropy.slice(2)}`;
  return Object.freeze({
    ...context.identityTemplate,
    canonCode,
    entropy,
  });
}

function toCardPreview(card: CardInstance): SeedCardPreviewV1 {
  return Object.freeze({
    instanceId: card.instanceId,
    definitionId: card.definitionId,
    name: card.name,
    displayNameEs: card.displayNameEs,
    energyCost: card.energyCost,
    kinds: Object.freeze([...card.kinds]),
    isToken: card.isToken,
    power: card.basePower,
    endurance: card.baseEndurance,
    contextual: isContextual(card),
  });
}

function comparableAnalysis(result: SeedAnalysisResult): string {
  return JSON.stringify({
    identity: result.identity,
    analysisRevision: result.analysisRevision,
    score: result.score,
    profileId: result.profileId,
    metrics: result.metrics,
    preview: result.preview,
    mulligan: result.mulligan,
  });
}

function isSource(card: CardInstance): boolean {
  return card.kinds.includes("SOURCE");
}

function isContextual(card: CardInstance): boolean {
  return card.requiresTargets.length > 0 || Boolean(card.additionalCost) || Boolean(card.variableCost);
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function clampRating(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
