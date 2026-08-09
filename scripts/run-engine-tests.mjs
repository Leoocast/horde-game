import { createServer } from "vite";
import path from "node:path";

const server = await createServer({
  appType: "custom",
  configFile: path.resolve(process.cwd(), "vite.config.ts"),
  logLevel: "silent",
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  await server.ssrLoadModule("/tests/engine.test.js");
  await server.ssrLoadModule("/tests/hostBeats.test.js");
  await server.ssrLoadModule("/tests/deckLint.test.js");
  await server.ssrLoadModule("/tests/deckCardText.test.js");
  await server.ssrLoadModule("/tests/battlefieldLayout.test.js");
  await server.ssrLoadModule("/tests/targetingGeometry.test.js");
  await server.ssrLoadModule("/tests/tacticalArrowGeometry.test.js");
  await server.ssrLoadModule("/tests/attackChevronGeometry.test.js");
  await server.ssrLoadModule("/tests/cardVoiceInteractions.test.js");
  await server.ssrLoadModule("/tests/playgroundScenario.test.js");
  await server.ssrLoadModule("/tests/playgroundActions.test.js");
  await server.ssrLoadModule("/tests/playgroundStorage.test.js");
  await server.ssrLoadModule("/tests/audioMix.test.js");
  await server.ssrLoadModule("/tests/vocabulary.test.js");
  await server.ssrLoadModule("/tests/uiPresentation.test.js");
  await server.ssrLoadModule("/tests/contentCatalog.test.js");
  await server.ssrLoadModule("/tests/electronSecurity.test.js");
} finally {
  await server.close();
}
