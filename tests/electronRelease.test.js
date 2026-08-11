import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import runtimeAudioAssets from "../src/audio/runtimeAudioAssets.json";
import { collectRuntimeResourcePlan, createStaging, stagingRoot, verifyStaging } from "../scripts/electron-release-assets.mjs";
import { comparePackageManifests } from "../scripts/electron-release-manifest.mjs";
import { rendererViteConfig } from "../vite.renderer.config";

test("Electron development ignores generated staging media in the Vite watcher", () => {
  assert.deepEqual(rendererViteConfig("serve").server?.watch?.ignored, ["**/.electron-staging/**"]);
});

test("Electron development serves bundled fonts without copying public authoring assets into release", () => {
  const developmentPublicDir = rendererViteConfig("serve").publicDir;
  assert.equal(developmentPublicDir, "public");
  assert.equal(
    fs.existsSync(path.resolve(String(developmentPublicDir), "fonts/pact-of-elarion/cinzel-decorative-latin.woff2")),
    true,
  );
  assert.equal(rendererViteConfig("build").publicDir, false);
});

test("Electron release staging is an exact generated allowlist", () => {
  const plan = collectRuntimeResourcePlan();
  assert.equal(plan.length, 185);
  assert.equal(plan.filter((entry) => entry.path.startsWith("audio/")).length, 57);
  assert.equal(plan.filter((entry) => entry.path.startsWith("cards/")).length, 122);
  assert.equal(plan.filter((entry) => entry.path.startsWith("cards/") && entry.path.endsWith(".png")).length, 61);
  assert.equal(plan.filter((entry) => entry.path.startsWith("cards/") && entry.path.includes("/art/")).length, 61);
  assert.equal(plan.filter((entry) => entry.path.startsWith("fonts/")).length, 6);
  assert.equal(plan.some((entry) => /hunters|exported-png|\.DS_Store/iu.test(entry.path)), false);
  assert.ok(plan.every((entry) => fs.statSync(entry.sourcePath).isFile()));
});

test("staged Electron resources match paths, hashes and category totals", () => {
  const created = createStaging();
  const manifest = verifyStaging();
  assert.deepEqual(manifest, created);
  assert.deepEqual(manifest.categories.audio.files, 57);
  assert.deepEqual(manifest.categories.cards.files, 122);
  assert.deepEqual(manifest.categories.fonts.files, 6);
  assert.ok(fs.statSync(stagingRoot).isDirectory());
});

test("runtime audio manifest is declarative and maps only to local media", () => {
  const strings = collectStrings(runtimeAudioAssets);
  assert.equal(new Set(strings).size, 57);
  assert.ok(strings.every((asset) => /^\/audio\/.+\.(?:mp3|ogg|wav)$/u.test(asset)));
  assert.ok(strings.every((asset) => fs.existsSync(path.resolve("assets", asset.slice("/audio/".length)))));
});

test("package manifest comparison reports only actual path/hash changes", () => {
  const original = { files: [{ path: "resources/cards/a.png", bytes: 10, sha256: "a" }, { path: "resources/app.asar", bytes: 20, sha256: "b" }] };
  const changed = structuredClone(original);
  changed.files[0] = { ...changed.files[0], bytes: 11, sha256: "c" };
  assert.deepEqual(comparePackageManifests(original, original), []);
  assert.deepEqual(comparePackageManifests(original, changed), [{
    path: "resources/cards/a.png",
    change: "modified",
    leftBytes: 10,
    rightBytes: 11,
  }]);
});

function collectStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, output));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, output));
  return output;
}
