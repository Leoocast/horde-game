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
  await server.ssrLoadModule("/tests/electronSecurity.test.js");
  await server.ssrLoadModule("/tests/electronPersistence.test.js");
} finally {
  await server.close();
}
