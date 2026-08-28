import assert from "node:assert/strict";
import { test } from "node:test";

import { createInitialGame, mulliganOpeningHand } from "../src/engine/GameState";
import {
  ANY_SEED_VARIATION_ID,
  FIRST_APPROACH_PROFILE,
  FIRST_APPROACH_PROFILE_ID,
  HIGH_PRESSURE_PROFILE_ID,
  MULLIGAN_USEFUL_VARIATION_ID,
  PROGRESSIVE_PRESSURE_PROFILE_ID,
  SEED_SEARCH_PROFILE_IDS,
  SEED_SEARCH_PROFILES,
  analyzeSeedEntropy,
  classifySeedVariation,
  createSeedAnalysisContext,
  firstApproachFilterReasons,
  projectPotentialHostWindows,
  scoreSeedProfile,
  scoreFirstApproach,
  seedProfileFilterReasons,
  selectDiverseSeedCandidates,
  verifySeedAnalysis,
} from "../src/playground/seedExplorer";
import {
  CANON_ENTROPY_SPACE_SIZE,
  SeedSearchAccumulator,
  canonEntropyFromIndex,
  canonEntropyIndex,
  compareSeedResults,
  searchSeedRange,
} from "../src/playground/seedExplorerSearch";
import {
  SeedExplorerRuntime,
  runSeedSearchCooperatively,
} from "../src/playground/seedExplorerRuntime";
import {
  parseStoredSeedFavorites,
  seedSearchResultToCsv,
  seedSearchResultToJson,
  serializeStoredSeedFavorites,
  setStoredSeedFavoriteNote,
} from "../src/playground/seedExplorerStorage";

const DEFAULT_CONFIG = Object.freeze({
  playerDeckKey: "pact_of_elarion",
  hostDeckKey: "uprising_of_the_graveless",
  difficulty: "normal",
  profileId: FIRST_APPROACH_PROFILE_ID,
  evaluateMulligan: true,
  avoidEarlySpikes: true,
});

test("base-36 Canon entropy covers 00000 through ZZZZZ without wrapping", () => {
  assert.equal(CANON_ENTROPY_SPACE_SIZE, 60_466_176);
  assert.equal(canonEntropyFromIndex(0), "00000");
  assert.equal(canonEntropyFromIndex(1), "00001");
  assert.equal(canonEntropyFromIndex(35), "0000Z");
  assert.equal(canonEntropyFromIndex(36), "00010");
  assert.equal(canonEntropyFromIndex(CANON_ENTROPY_SPACE_SIZE - 1), "ZZZZZ");
  for (const index of [0, 1, 35, 36, 12_345, 999_999, CANON_ENTROPY_SPACE_SIZE - 1]) {
    assert.equal(canonEntropyIndex(canonEntropyFromIndex(index)), index);
  }
  assert.throws(() => canonEntropyFromIndex(-1), /between/u);
  assert.throws(() => canonEntropyFromIndex(CANON_ENTROPY_SPACE_SIZE), /between/u);
});

test("the cheap projection matches the exact opening, mulligan and visible tops", () => {
  const context = createSeedAnalysisContext(DEFAULT_CONFIG);
  const fast = analyzeSeedEntropy(context, "LEGPT");
  const game = createInitialGame(
    context.playerDeck,
    context.hostDeck,
    "LEGPT",
    context.identityTemplate.preparationTurns,
    context.identityTemplate.difficulty,
    "standard",
  );
  const mulligan = mulliganOpeningHand(game);

  assert.deepEqual(
    fast.result.preview.openingHand.map(({ instanceId }) => instanceId),
    game.player.hand.map(({ instanceId }) => instanceId),
  );
  assert.deepEqual(
    fast.result.preview.mulliganHand.map(({ instanceId }) => instanceId),
    mulligan.player.hand.map(({ instanceId }) => instanceId),
  );
  const selected = fast.result.mulligan.recommendation === "mulligan" ? mulligan : game;
  assert.deepEqual(
    fast.result.preview.nextPlayerDraws.map(({ instanceId }) => instanceId),
    selected.player.archive.slice(0, 5).map(({ instanceId }) => instanceId),
  );
  assert.deepEqual(
    fast.result.preview.hostArchiveTop.map(({ instanceId }) => instanceId),
    game.host.archive.slice(0, fast.result.preview.hostArchiveTop.length).map(({ instanceId }) => instanceId),
  );

  const exact = verifySeedAnalysis(context, fast.result);
  assert.equal(fast.result.solvability.status, "unchecked");
  assert.equal(exact.solvability.status, "structurally-valid");
  assert.equal(exact.score, fast.result.score);
  assert.deepEqual(exact.metrics, fast.result.metrics);
  assert.deepEqual(exact.preview, fast.result.preview);
});

test("fast mulligan verification holds for every builtin matchup", () => {
  for (const playerDeckKey of ["pact_of_elarion", "court_of_the_crimson_eclipse"]) {
    for (const hostDeckKey of ["uprising_of_the_graveless", "legion_of_varka"]) {
      const context = createSeedAnalysisContext({
        ...DEFAULT_CONFIG,
        playerDeckKey,
        hostDeckKey,
      });
      for (const entropy of ["00000", "Z9Y8X"]) {
        const fast = analyzeSeedEntropy(context, entropy).result;
        assert.doesNotThrow(() => verifySeedAnalysis(context, fast), `${playerDeckKey}/${hostDeckKey}/${entropy}`);
      }
    }
  }
});

test("first-approach scoring rewards stable resources and gradual pressure", () => {
  const ideal = scoreFirstApproach({
    openingRating: 100,
    resourceRating: 100,
    curveRating: 100,
    pressureRating: 42,
    escalationRating: 100,
  });
  const resourceStarved = scoreFirstApproach({
    openingRating: 25,
    resourceRating: 0,
    curveRating: 20,
    pressureRating: 42,
    escalationRating: 50,
  });
  const earlySpike = scoreFirstApproach({
    openingRating: 100,
    resourceRating: 100,
    curveRating: 100,
    pressureRating: 100,
    escalationRating: 50,
  });

  assert.equal(ideal, 100);
  assert.ok(ideal > earlySpike);
  assert.ok(earlySpike > resourceStarved);
  const totalWeight = Object.values(FIRST_APPROACH_PROFILE.weights).reduce((total, weight) => total + weight, 0);
  assert.ok(Math.abs(totalWeight - 1) < Number.EPSILON);
});

test("search profiles apply distinct versioned preferences over the same raw metrics", () => {
  const gentle = {
    openingRating: 95,
    resourceRating: 100,
    curveRating: 95,
    pressureRating: 42,
    escalationRating: 80,
  };
  const intense = {
    openingRating: 60,
    resourceRating: 55,
    curveRating: 65,
    pressureRating: 85,
    escalationRating: 80,
  };

  assert.ok(scoreSeedProfile(FIRST_APPROACH_PROFILE_ID, gentle) > scoreSeedProfile(FIRST_APPROACH_PROFILE_ID, intense));
  assert.ok(scoreSeedProfile(HIGH_PRESSURE_PROFILE_ID, intense) > scoreSeedProfile(HIGH_PRESSURE_PROFILE_ID, gentle));
  assert.deepEqual(Object.keys(SEED_SEARCH_PROFILES).sort(), [...SEED_SEARCH_PROFILE_IDS].sort());
  for (const profileId of SEED_SEARCH_PROFILE_IDS) {
    const profile = SEED_SEARCH_PROFILES[profileId];
    const totalWeight = Object.values(profile.weights).reduce((total, weight) => total + weight, 0);
    assert.equal(profile.id, profileId);
    assert.ok(Math.abs(totalWeight - 1) < Number.EPSILON, profileId);
  }

  const first = analyzeSeedEntropy(createSeedAnalysisContext(DEFAULT_CONFIG), "LEGPT").result;
  const pressured = analyzeSeedEntropy(createSeedAnalysisContext({
    ...DEFAULT_CONFIG,
    profileId: HIGH_PRESSURE_PROFILE_ID,
    avoidEarlySpikes: false,
  }), "LEGPT").result;
  assert.equal(first.profileId, FIRST_APPROACH_PROFILE_ID);
  assert.equal(pressured.profileId, HIGH_PRESSURE_PROFILE_ID);
  assert.deepEqual(first.metrics, pressured.metrics);
  assert.notEqual(first.score, pressured.score);
});

test("pressure and escalation profiles reject futures that miss their defining shape", () => {
  const metrics = {
    selectedHand: "keep",
    openingHand: {
      sourceCoverageTurns: 3,
      sourceCount: 3,
      accessibleNonSourceCount: 3,
    },
    host: {
      firstWindowPressure: 10,
      earlyPressure: 12,
      escalation: 1,
      windows: [{ pressure: 10 }, { pressure: 14 }],
    },
  };
  assert.deepEqual(seedProfileFilterReasons(HIGH_PRESSURE_PROFILE_ID, metrics, false), [
    "host-pressure-too-low",
  ]);
  assert.deepEqual(seedProfileFilterReasons(PROGRESSIVE_PRESSURE_PROFILE_ID, metrics, true), [
    "host-escalation-too-low",
  ]);
});

test("first-approach filters expose explicit structural rejection reasons", () => {
  const metrics = {
    selectedHand: "keep",
    openingHand: {
      sourceCoverageTurns: 1,
      sourceCount: 5,
      accessibleNonSourceCount: 1,
    },
    host: {
      firstWindowPressure: 20,
      windows: [{ pressure: 20 }, { pressure: 23 }],
    },
  };
  assert.deepEqual(firstApproachFilterReasons(metrics, true), [
    "too-few-sources-before-host",
    "too-many-sources-in-hand",
    "too-few-accessible-cards",
    "early-host-spike",
  ]);
  assert.deepEqual(firstApproachFilterReasons(metrics, false), [
    "too-few-sources-before-host",
    "too-many-sources-in-hand",
    "too-few-accessible-cards",
  ]);
});

test("potential Host windows honor stop, Mini Surge and Surge reveal counts", () => {
  const context = createSeedAnalysisContext(DEFAULT_CONFIG);
  const token = context.pools.host.find((card) => card.isToken);
  const nonToken = context.pools.host.find((card) => !card.isToken);
  assert.ok(token);
  assert.ok(nonToken);
  const archive = [token, nonToken, token, token, nonToken, token, nonToken, token, token];
  const windows = projectPotentialHostWindows(archive, {
    ...context.hostRules,
    revealCount: 3,
    stopOnNonToken: true,
    miniSurgeTurn: 2,
    miniSurgeExtraReveals: 1,
    surgeTurn: 3,
    surgeExtraReveals: 2,
  }, 3);

  assert.deepEqual(windows.map(({ metrics }) => metrics.cardCount), [2, 4, 3]);
  assert.deepEqual(windows.map(({ metrics }) => metrics.hostTurn), [1, 2, 3]);
  assert.equal(windows[0].cards.at(-1).isToken, false);
  assert.equal(windows[1].cards.at(-1).isToken, true);
});

test("equal scores use the full Canon code as a stable tie-break", () => {
  const result = analyzeSeedEntropy(createSeedAnalysisContext(DEFAULT_CONFIG), "LEGPT").result;
  const later = { ...result, identity: { ...result.identity, canonCode: "HF1-ELA-GRV-ZZ2-ZZZ" } };
  const earlier = { ...result, identity: { ...result.identity, canonCode: "HF1-ELA-GRV-AA2-AAA" } };
  assert.deepEqual([later, earlier].sort(compareSeedResults).map(({ identity }) => identity.canonCode), [
    earlier.identity.canonCode,
    later.identity.canonCode,
  ]);
});

test("diverse selection keeps the best result and reaches structurally different candidates", () => {
  const base = analyzeSeedEntropy(createSeedAnalysisContext(DEFAULT_CONFIG), "LEGPT").result;
  const ranked = Array.from({ length: 6 }, (_, index) => ({
    ...base,
    score: 100 - index,
    identity: { ...base.identity, canonCode: `HF1-ELA-GRV-${String(index).padStart(2, "0")}2-AAA` },
    metrics: {
      ...base.metrics,
      ratings: {
        opening: 50,
        resources: 100 - index * 20,
        curve: index * 20,
        pressure: 100 - index * 20,
        escalation: index * 20,
      },
    },
  }));

  const selected = selectDiverseSeedCandidates(ranked, 3);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].identity.canonCode, ranked[0].identity.canonCode);
  assert.ok(selected.some(({ identity }) => identity.canonCode === ranked.at(-1).identity.canonCode));
  assert.deepEqual(selectDiverseSeedCandidates(ranked, 3), selected);
  assert.equal(new Set(selected.map(({ identity }) => identity.canonCode)).size, selected.length);
});

test("variation classification is intrinsic, deterministic and gives useful mulligans priority", () => {
  const base = analyzeSeedEntropy(createSeedAnalysisContext(DEFAULT_CONFIG), "LEGPT").result;
  const candidate = (ratings, mulligan = { recommendation: "keep", delta: 0 }) => ({
    ...base,
    metrics: { ...base.metrics, ratings: { ...base.metrics.ratings, ...ratings } },
    mulligan,
  });

  assert.equal(classifySeedVariation(candidate({ resources: 92, curve: 50, pressure: 50, escalation: 50 })), "stable");
  assert.equal(classifySeedVariation(candidate({ resources: 50, curve: 92, pressure: 50, escalation: 50 })), "curve");
  assert.equal(classifySeedVariation(candidate({ resources: 50, curve: 50, pressure: 8, escalation: 50 })), "gentle");
  assert.equal(classifySeedVariation(candidate({ resources: 50, curve: 50, pressure: 50, escalation: 92 })), "escalation");
  assert.equal(classifySeedVariation(candidate({ resources: 54, curve: 50, pressure: 48, escalation: 53 })), "balanced");
  assert.equal(classifySeedVariation(candidate(
    { resources: 92, curve: 50, pressure: 50, escalation: 50 },
    { recommendation: "mulligan", delta: 4 },
  )), MULLIGAN_USEFUL_VARIATION_ID);
});

test("a search variation filters the full enumeration before ranking", () => {
  const request = {
    ...DEFAULT_CONFIG,
    variationId: MULLIGAN_USEFUL_VARIATION_ID,
    startIndex: 0,
    count: 2_000,
    top: 8,
  };
  const result = searchSeedRange(request);

  assert.equal(result.request.variationId, MULLIGAN_USEFUL_VARIATION_ID);
  assert.equal(result.candidates.length, request.top);
  assert.ok(result.candidates.every((candidate) => classifySeedVariation(candidate) === MULLIGAN_USEFUL_VARIATION_ID));
  assert.ok(result.rejectedByReason["variation-mismatch"] > 0);
  assert.deepEqual(searchSeedRange(request), result);
  assert.equal(createSeedAnalysisContext(DEFAULT_CONFIG).config.variationId, ANY_SEED_VARIATION_ID);
  assert.throws(
    () => createSeedAnalysisContext({ ...DEFAULT_CONFIG, variationId: "unknown-variation" }),
    /variation/u,
  );
});

test("one search request is deterministic, bounded and fully verified", () => {
  const request = { ...DEFAULT_CONFIG, startIndex: 700, count: 1_500, top: 12 };
  const first = searchSeedRange(request);
  const second = searchSeedRange(request);

  assert.deepEqual(second, first);
  assert.equal(first.examined, request.count);
  assert.equal(first.verificationFailures.length, 0);
  assert.ok(first.passedFilters > 0);
  assert.equal(first.candidates.length, request.top);
  assert.ok(first.verificationPoolSize >= first.candidates.length);
  assert.ok(first.candidatePool.length >= first.candidates.length);
  assert.ok(first.candidatePool.length <= request.top * 4);
  assert.deepEqual(first.candidatePool.slice(0, request.top), first.candidates);
  assert.ok(first.candidates.every(({ solvability }) => solvability.status === "structurally-valid"));
  assert.deepEqual([...first.candidates].sort(compareSeedResults), first.candidates);
  assert.equal(new Set(first.candidates.map(({ identity }) => identity.canonCode)).size, first.candidates.length);
});

test("processing one range in uneven batches produces the same shortlist and cursor", () => {
  const request = { ...DEFAULT_CONFIG, startIndex: 4_000, count: 1_200, top: 8 };
  const single = searchSeedRange(request);
  const batched = new SeedSearchAccumulator(request);
  let previousNextIndex = request.startIndex;
  while (!batched.progress().done) {
    const progress = batched.process(17);
    assert.ok(progress.nextIndex > previousNextIndex);
    assert.equal(progress.nextIndex, request.startIndex + progress.examined);
    previousNextIndex = progress.nextIndex;
  }
  assert.deepEqual(batched.finalize(), single);
});

test("cooperative slices preserve the pure result and throttle partial publications", async () => {
  const request = { ...DEFAULT_CONFIG, startIndex: 5_000, count: 600, top: 6 };
  const expected = searchSeedRange(request);
  const frames = [];
  let clock = 0;
  let yields = 0;
  const outcome = await runSeedSearchCooperatively(request, {
    sliceBudgetMs: 3,
    progressIntervalMs: 5,
    searchChunkSize: 11,
    verificationChunkSize: 2,
    maxChunksPerSlice: 3,
    now: () => {
      clock += 1;
      return clock;
    },
    yieldToHost: async () => {
      yields += 1;
    },
    onProgress: (frame) => frames.push(frame),
  });

  assert.equal(outcome.status, "completed");
  assert.deepEqual(outcome.result, expected);
  assert.ok(yields > 1);
  assert.equal(frames[0].phase, "searching");
  assert.equal(frames[0].search.examined, 0);
  assert.equal(frames.at(-1).phase, "verifying");
  assert.equal(frames.at(-1).verification.done, true);
  assert.ok(frames.length < request.count / 2);
  assert.ok(frames.every(({ partialCandidates }) => partialCandidates.length <= request.top));
  assert.ok(frames
    .filter(({ phase }) => phase === "searching")
    .flatMap(({ partialCandidates }) => partialCandidates)
    .every(({ solvability }) => solvability.status === "unchecked"));
  assert.ok(frames
    .filter(({ phase }) => phase === "verifying")
    .flatMap(({ partialCandidates }) => partialCandidates)
    .every(({ solvability }) => solvability.status === "structurally-valid"));
});

test("AbortSignal stops before another cooperative slice is processed", async () => {
  const controller = new AbortController();
  let yields = 0;
  const outcome = await runSeedSearchCooperatively({
    ...DEFAULT_CONFIG,
    startIndex: 8_000,
    count: 1_000,
    top: 5,
  }, {
    signal: controller.signal,
    sliceBudgetMs: 1_000,
    progressIntervalMs: 1_000,
    searchChunkSize: 10,
    maxChunksPerSlice: 2,
    now: () => 0,
    yieldToHost: async () => {
      yields += 1;
      controller.abort();
    },
  });

  assert.equal(outcome.status, "cancelled");
  assert.equal(outcome.frame.phase, "searching");
  assert.equal(outcome.frame.search.examined, 20);
  assert.equal(yields, 1);
});

test("the runtime supersedes stale searches and preserves the last complete result after cancel", async () => {
  const runtime = new SeedExplorerRuntime();
  let releaseFirstYield;
  let announceFirstYield;
  const firstYielded = new Promise((resolve) => {
    announceFirstYield = resolve;
  });
  const firstRun = runtime.start({
    ...DEFAULT_CONFIG,
    startIndex: 10_000,
    count: 2_000,
    top: 5,
  }, {
    sliceBudgetMs: 1_000,
    searchChunkSize: 10,
    maxChunksPerSlice: 1,
    now: () => 0,
    yieldToHost: () => new Promise((resolve) => {
      releaseFirstYield = resolve;
      announceFirstYield();
    }),
  });
  await firstYielded;

  const secondRun = runtime.start({
    ...DEFAULT_CONFIG,
    startIndex: 20_000,
    count: 120,
    top: 4,
  }, {
    sliceBudgetMs: 1_000,
    searchChunkSize: 30,
    verificationChunkSize: 30,
    maxChunksPerSlice: 10,
    now: () => 0,
    yieldToHost: async () => undefined,
  });
  const secondOutcome = await secondRun;
  assert.equal(secondOutcome.status, "completed");
  releaseFirstYield();
  const firstOutcome = await firstRun;

  assert.equal(firstOutcome.status, "superseded");
  assert.equal(runtime.snapshot().runId, secondOutcome.runId);
  assert.equal(runtime.snapshot().status, "completed");
  assert.deepEqual(runtime.snapshot().result, secondOutcome.result);

  let releaseThirdYield;
  let announceThirdYield;
  const thirdYielded = new Promise((resolve) => {
    announceThirdYield = resolve;
  });
  const thirdRun = runtime.start({
    ...DEFAULT_CONFIG,
    startIndex: 30_000,
    count: 2_000,
    top: 5,
  }, {
    sliceBudgetMs: 1_000,
    searchChunkSize: 10,
    maxChunksPerSlice: 1,
    now: () => 0,
    yieldToHost: () => new Promise((resolve) => {
      releaseThirdYield = resolve;
      announceThirdYield();
    }),
  });
  await thirdYielded;
  runtime.cancel();
  releaseThirdYield();
  const thirdOutcome = await thirdRun;

  assert.equal(thirdOutcome.status, "cancelled");
  assert.equal(runtime.snapshot().status, "cancelled");
  assert.deepEqual(runtime.snapshot().lastCompleteResult, secondOutcome.result);
  assert.equal(runtime.snapshot().result, undefined);
});

test("favorite storage round-trips Canon identities and fails closed on stale data", () => {
  const entries = [
    {
      canonCode: "HF1-ELA-GRV-LE2-GPT",
      savedAt: "2026-08-18T12:00:00.000Z",
      profileId: FIRST_APPROACH_PROFILE_ID,
      evaluateMulligan: true,
      avoidEarlySpikes: true,
    },
    {
      canonCode: "HF1-CEC-VRK-AA1-001",
      savedAt: "2026-08-17T12:00:00.000Z",
      profileId: HIGH_PRESSURE_PROFILE_ID,
      evaluateMulligan: false,
      avoidEarlySpikes: false,
    },
  ];
  const serialized = serializeStoredSeedFavorites(entries);
  assert.deepEqual(parseStoredSeedFavorites(serialized), entries);
  assert.deepEqual(parseStoredSeedFavorites("not-json"), []);
  assert.deepEqual(parseStoredSeedFavorites(JSON.stringify({ version: 99, entries })), []);
  assert.deepEqual(parseStoredSeedFavorites(JSON.stringify({
    version: 1,
    entries: [
      entries[0],
      entries[0],
      { ...entries[1], canonCode: "HF1-ELA-NOPE-LE2-GPT" },
      { ...entries[1], canonCode: entries[1].canonCode.toLowerCase() },
    ],
  })), [entries[0]]);
  const { profileId: _legacyProfile, ...legacyEntry } = entries[0];
  assert.deepEqual(parseStoredSeedFavorites(JSON.stringify({ version: 1, entries: [legacyEntry] })), [
    { ...legacyEntry, profileId: FIRST_APPROACH_PROFILE_ID },
  ]);
});

test("favorite notes round-trip, remain attached to their exact Canon Seed and can be cleared", () => {
  const entries = [{
    canonCode: "HF1-ELA-GRV-082-QC5",
    savedAt: "2026-08-19T12:00:00.000Z",
    profileId: FIRST_APPROACH_PROFILE_ID,
    evaluateMulligan: true,
    avoidEarlySpikes: true,
  }];
  const noted = setStoredSeedFavoriteNote(entries, entries[0].canonCode, "  Seed elegida para primer acercamiento.  ");

  assert.equal(entries[0].note, undefined);
  assert.equal(noted[0].note, "Seed elegida para primer acercamiento.");
  assert.deepEqual(parseStoredSeedFavorites(serializeStoredSeedFavorites(noted)), noted);
  assert.deepEqual(setStoredSeedFavoriteNote(noted, entries[0].canonCode, ""), entries);
  assert.deepEqual(setStoredSeedFavoriteNote(noted, "HF1-ELA-GRV-LE2-GPT", "No corresponde"), noted);
});

test("JSON and CSV exports are stable, complete and solver-free", () => {
  const result = searchSeedRange({ ...DEFAULT_CONFIG, startIndex: 40_000, count: 240, top: 3 });
  const json = seedSearchResultToJson(result);
  const csv = seedSearchResultToCsv(result);

  assert.equal(seedSearchResultToJson(result), json);
  assert.equal(seedSearchResultToCsv(result), csv);
  const parsed = JSON.parse(json);
  assert.equal(parsed.exportedBy, "hostfall-seed-explorer");
  assert.equal(parsed.version, 3);
  assert.deepEqual(parsed.result, result);
  assert.equal(csv.split("\n").length, result.candidates.length + 1);
  assert.match(csv, /^rank,canonCode,score,profileId,variationId,/u);
  for (const candidate of result.candidates) assert.match(csv, new RegExp(candidate.identity.canonCode, "u"));
  assert.doesNotMatch(`${json}\n${csv}`, /winning-line-found|impossible/u);
});

test("disabling mulligan keeps the opening hand and omits its projection", () => {
  const context = createSeedAnalysisContext({ ...DEFAULT_CONFIG, evaluateMulligan: false });
  const result = analyzeSeedEntropy(context, "LEGPT").result;
  assert.equal(result.mulligan.recommendation, "keep");
  assert.equal(result.mulligan.delta, 0);
  assert.equal(result.preview.mulliganHand, undefined);
  assert.equal(result.metrics.mulliganHand, undefined);
  assert.deepEqual(result.preview.recommendedHand, result.preview.openingHand);
});

test("search bounds fail closed instead of wrapping or producing duplicate entropies", () => {
  assert.throws(() => searchSeedRange({ ...DEFAULT_CONFIG, count: 0, top: 10 }), /positive/u);
  assert.throws(() => searchSeedRange({ ...DEFAULT_CONFIG, count: 10, top: 101 }), /between 1 and 100/u);
  assert.throws(
    () => searchSeedRange({ ...DEFAULT_CONFIG, startIndex: CANON_ENTROPY_SPACE_SIZE - 5, count: 10, top: 5 }),
    /exceeds/u,
  );
});
