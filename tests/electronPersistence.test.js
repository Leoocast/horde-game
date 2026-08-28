import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DesktopJsonStore,
  desktopPersistenceFailureReason,
  desktopDataPaths,
  parseWindowState,
} from "../electron/persistence";
import { DesktopHistoryPersistenceAdapter } from "../src/history/desktopHistoryAdapter";
import { createEmptyHistoryEnvelopeV1 } from "../src/history/historyDomain";
import { parseHistoryEnvelopeV1 } from "../src/history/historyParser";

test("desktop persistence keeps cloud-worthy and local-only files separate", () => {
  const paths = desktopDataPaths(path.join("C:", "Users", "Tester", "Hostfall"));
  assert.match(paths.preferences.replaceAll("\\", "/"), /\/profile\/preferences-v1\.json$/u);
  assert.match(paths.resumeSave.replaceAll("\\", "/"), /\/profile\/saves\/resume-v1\.json$/u);
  assert.match(paths.seedHistory.replaceAll("\\", "/"), /\/profile\/seed-history-v1\.json$/u);
  assert.match(paths.diagnostics.replaceAll("\\", "/"), /\/profile\/diagnostics$/u);
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

test("desktop history adapter round-trips its dedicated v1 envelope", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hostfall-history-roundtrip-"));
  const paths = desktopDataPaths(directory);
  const store = new DesktopJsonStore();
  const bridge = {
    readSeedHistory: () => store.readCandidates(paths.seedHistory),
    writeSeedHistory: async (value) => {
      try {
        await store.write(paths.seedHistory, value);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: desktopPersistenceFailureReason(error) };
      }
    },
    promoteSeedHistoryBackup: () => store.promoteBackup(paths.seedHistory),
    resetSeedHistory: () => store.resetWithDiagnostics(paths.seedHistory, paths.diagnostics),
  };
  try {
    const first = new DesktopHistoryPersistenceAdapter(bridge);
    const history = createEmptyHistoryEnvelopeV1();
    await first.initialize();
    await first.write(history);

    const second = new DesktopHistoryPersistenceAdapter(bridge);
    const initialized = await second.initialize();
    const parsed = parseHistoryEnvelopeV1(initialized.candidates.primary);
    assert.equal(initialized.writable, true);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.history, history);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup promotion preserves the only valid copy across every injected cut", async () => {
  for (const failureStep of ["temporary-synced", "primary-sheltered", "primary-replaced"]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), `hostfall-promote-${failureStep}-`));
    const filePath = path.join(directory, "seed-history-v1.json");
    const safe = { kind: "hostfall-history", formatVersion: 1, nextSequence: 1, attempts: [] };
    let injected = false;
    const failingStore = new DesktopJsonStore({
      onPromotionStep: (step) => {
        if (!injected && step === failureStep) {
          injected = true;
          throw new Error(`Injected ${step}`);
        }
      },
    });
    try {
      await writeFile(filePath, "not-json", "utf8");
      await writeFile(`${filePath}.bak`, JSON.stringify(safe), "utf8");
      await assert.rejects(() => failingStore.promoteBackup(filePath), new RegExp(`Injected ${failureStep}`, "u"));
      assert.deepEqual(JSON.parse(await readFile(`${filePath}.bak`, "utf8")), safe, failureStep);

      await new DesktopJsonStore().promoteBackup(filePath);
      assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), safe, failureStep);
      assert.deepEqual(JSON.parse(await readFile(`${filePath}.bak`, "utf8")), safe, failureStep);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("desktop history reset preserves primary and backup as diagnostics before deletion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hostfall-history-reset-"));
  const filePath = path.join(directory, "profile", "seed-history-v1.json");
  const diagnostics = path.join(directory, "profile", "diagnostics");
  const store = new DesktopJsonStore({ now: () => new Date("2026-08-21T14:00:00.000Z") });
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "bad-primary", "utf8");
    await writeFile(`${filePath}.bak`, "bad-backup", "utf8");
    const result = await store.resetWithDiagnostics(filePath, diagnostics);
    assert.equal(result.preservedDiagnostic, true);
    assert.deepEqual((await readdir(diagnostics)).sort(), [
      "seed-history-reset-2026-08-21T14-00-00.000Z-backup.json",
      "seed-history-reset-2026-08-21T14-00-00.000Z-primary.json",
    ]);
    assert.equal((await store.readCandidates(filePath)).primary, undefined);
    assert.equal(await readFile(path.join(diagnostics, "seed-history-reset-2026-08-21T14-00-00.000Z-primary.json"), "utf8"), "bad-primary");
    assert.equal(await readFile(path.join(diagnostics, "seed-history-reset-2026-08-21T14-00-00.000Z-backup.json"), "utf8"), "bad-backup");
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
