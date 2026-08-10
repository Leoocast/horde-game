import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DesktopJsonStore,
  desktopDataPaths,
  parseWindowState,
} from "../electron/persistence";

test("desktop persistence keeps cloud-worthy and local-only files separate", () => {
  const paths = desktopDataPaths(path.join("C:", "Users", "Tester", "Hostfall"));
  assert.match(paths.preferences.replaceAll("\\", "/"), /\/profile\/preferences-v1\.json$/u);
  assert.match(paths.resumeSave.replaceAll("\\", "/"), /\/profile\/saves\/resume-v1\.json$/u);
  assert.match(paths.windowState.replaceAll("\\", "/"), /\/local\/window-state-v1\.json$/u);
});

test("atomic JSON writes preserve the previous primary as a backup", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hostfall-persistence-"));
  const filePath = path.join(directory, "saves", "resume-v1.json");
  const store = new DesktopJsonStore();
  try {
    await store.write(filePath, { revision: 1 });
    await store.write(filePath, { revision: 2 });
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { revision: 2 });
    assert.deepEqual(JSON.parse(await readFile(`${filePath}.bak`, "utf8")), { revision: 1 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("corrupt primary JSON remains recoverable from its backup", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hostfall-corrupt-save-"));
  const filePath = path.join(directory, "resume-v1.json");
  const store = new DesktopJsonStore();
  try {
    await writeFile(filePath, "not-json", "utf8");
    await writeFile(`${filePath}.bak`, JSON.stringify({ safe: true }), "utf8");
    const candidates = await store.readCandidates(filePath);
    assert.equal(candidates.primaryCorrupted, true);
    assert.deepEqual(candidates.backup, { safe: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("window state rejects unknown versions and invalid dimensions", () => {
  assert.equal(parseWindowState({ formatVersion: 2, width: 1280, height: 720, maximized: false, fullscreen: false }), undefined);
  assert.equal(parseWindowState({ formatVersion: 1, width: 20, height: 20, maximized: false, fullscreen: false }), undefined);
  assert.deepEqual(
    parseWindowState({ formatVersion: 1, x: 20.2, y: 40.8, width: 1280, height: 720, maximized: true, fullscreen: false }),
    { formatVersion: 1, x: 20, y: 41, width: 1280, height: 720, maximized: true, fullscreen: false },
  );
});
