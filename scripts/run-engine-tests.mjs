import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  await server.ssrLoadModule("/tests/engine.test.js");
} finally {
  await server.close();
}
