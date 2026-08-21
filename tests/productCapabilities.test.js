import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEMO_CAPABILITIES,
  EARLY_ACCESS_RESUME_REGRESSION_CAPABILITIES,
  PRODUCT_CAPABILITIES,
} from "../src/product/productCapabilities";
import { createResumeRuntime } from "../src/persistence/resumeRuntime";

test("the active product preset is the demo and Early Access changes only resume", () => {
  assert.equal(PRODUCT_CAPABILITIES, DEMO_CAPABILITIES);
  assert.deepEqual(DEMO_CAPABILITIES, {
    edition: "demo",
    resumeGame: false,
    seedHistory: false,
  });
  assert.deepEqual(EARLY_ACCESS_RESUME_REGRESSION_CAPABILITIES, {
    edition: "early-access-resume-regression",
    resumeGame: true,
    seedHistory: false,
  });
  assert.equal(Object.isFrozen(DEMO_CAPABILITIES), true);
  assert.equal(Object.isFrozen(EARLY_ACCESS_RESUME_REGRESSION_CAPABILITIES), true);
});

test("the demo runtime neither reads, writes nor deletes a seeded resume", async () => {
  const calls = { load: 0, clear: 0, checkpoint: 0, dispose: 0 };
  const runtime = createResumeRuntime(DEMO_CAPABILITIES, {
    load: async () => {
      calls.load += 1;
      return { status: "available" };
    },
    clear: async () => {
      calls.clear += 1;
    },
    startCheckpointing: () => {
      calls.checkpoint += 1;
      return () => {
        calls.dispose += 1;
      };
    },
  });

  assert.equal(runtime.enabled, false);
  assert.deepEqual(await runtime.load(), { status: "none" });
  await runtime.clear();
  await runtime.clear();
  const dispose = runtime.startCheckpointing({ setupTurns: 3, playerName: "Chronicler" });
  dispose();
  assert.deepEqual(calls, { load: 0, clear: 0, checkpoint: 0, dispose: 0 });
});

test("the Early Access regression preset preserves the existing resume operations", async () => {
  const calls = { load: 0, clear: 0, checkpoint: 0, dispose: 0 };
  let checkpointOptions;
  const runtime = createResumeRuntime(EARLY_ACCESS_RESUME_REGRESSION_CAPABILITIES, {
    load: async () => {
      calls.load += 1;
      return { status: "recovered" };
    },
    clear: async () => {
      calls.clear += 1;
    },
    startCheckpointing: (options) => {
      calls.checkpoint += 1;
      checkpointOptions = options;
      return () => {
        calls.dispose += 1;
      };
    },
  });

  assert.equal(runtime.enabled, true);
  assert.deepEqual(await runtime.load(), { status: "recovered" });
  await runtime.clear();
  const dispose = runtime.startCheckpointing({ setupTurns: 2, playerName: "Mara" });
  dispose();
  assert.deepEqual(checkpointOptions, { setupTurns: 2, playerName: "Mara" });
  assert.deepEqual(calls, { load: 1, clear: 1, checkpoint: 1, dispose: 1 });
});

test("App and StartMenu expose resume only through the product runtime gate", async () => {
  const [app, menu] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /productResumeRuntime\.load\(\)/u);
  assert.match(app, /productResumeRuntime\.startCheckpointing/u);
  assert.match(app, /productResumeRuntime\.clear\(\)/u);
  assert.match(app, /resumeEnabled=\{productResumeRuntime\.enabled\}/u);
  assert.match(app, /continueDisabled=\{Boolean\(requiredLesson\)\}/u);
  assert.match(
    app,
    /onContinue=\{productResumeRuntime\.enabled && !requiredLesson && desktopResume\.save/u,
  );
  assert.match(app, /const restoredGame = restoreResumeGame\(save\)/u);
  assert.match(app, /loadScenario\(restoredGame, deckIds\)/u);
  assert.doesNotMatch(
    app,
    /\b(?:deleteDesktopResume|loadDesktopResume|startDesktopResumeCheckpointing)\b/u,
  );

  assert.match(
    menu,
    /resumeEnabled && \(resumeStatus === "available" \|\| resumeStatus === "recovered"\)/u,
  );
  assert.match(menu, /resumeEnabled && resumeStatus === "corrupt"/u);
  assert.match(menu, /resumeEnabled = false/u);
});
