import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  await server.ssrLoadModule("/tests/engine.test.js");
  await server.ssrLoadModule("/tests/hordeBeats.test.js");
  await server.ssrLoadModule("/tests/deckLint.test.js");
  await server.ssrLoadModule("/tests/battlefieldLayout.test.js");
  await server.ssrLoadModule("/tests/playgroundScenario.test.js");
  await server.ssrLoadModule("/tests/playgroundActions.test.js");
  await server.ssrLoadModule("/tests/playgroundStorage.test.js");
} finally {
  await server.close();
}
