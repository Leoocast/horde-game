import { performance } from "node:perf_hooks";
import path from "node:path";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: path.resolve(process.cwd(), "vite.config.ts"),
  logLevel: "silent",
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  const { searchSeedRange } = await server.ssrLoadModule("/src/playground/seedExplorerSearch.ts");
  const baseRequest = {
    playerDeckKey: "pact_of_elarion",
    hostDeckKey: "uprising_of_the_graveless",
    difficulty: "normal",
    evaluateMulligan: true,
    avoidEarlySpikes: true,
    top: 20,
  };

  for (const count of [10_000, 100_000, 500_000]) {
    const startedAt = performance.now();
    const result = searchSeedRange({ ...baseRequest, count });
    const elapsedMs = performance.now() - startedAt;
    const seedsPerSecond = Math.round(count / elapsedMs * 1_000);
    console.log(JSON.stringify({
      count,
      elapsedMs: Math.round(elapsedMs),
      seedsPerSecond,
      passedFilters: result.passedFilters,
      verificationPoolSize: result.verificationPoolSize,
      finalists: result.candidates.length,
      verificationFailures: result.verificationFailures.length,
    }));
  }
} finally {
  await server.close();
}
