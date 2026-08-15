import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { futureCodeFromSeed } from "../src/utils/futureIdentity";

test("a Future code is stable, compact, and presentation-only", () => {
  assert.equal(futureCodeFromSeed("hostfall-test"), "678·753");
  assert.equal(futureCodeFromSeed("same-seed"), futureCodeFromSeed("same-seed"));
  assert.notEqual(futureCodeFromSeed("same-seed"), futureCodeFromSeed("another-seed"));

  for (const seed of ["", "a", "developer", "hostfall-very-long-seed-value"]) {
    assert.match(futureCodeFromSeed(seed), /^\d{3}·\d{3}$/u);
  }
});

test("the narrative Future control owns normal rewrites outside Settings", async () => {
  const [header, settings, result, transition, app] = await Promise.all([
    readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/SettingsMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DefeatModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DestinyRewriteTransition.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.ok(header.indexOf("<DestinyRewriteControl") < header.indexOf("<MusicPlayerMenu"));
  assert.match(header, /futureSeed\?\.trim\(\)\.toLowerCase\(\) !== "developer"/u);
  assert.doesNotMatch(settings, /settings\.battleSeed|game-seed-input|setSeed/u);
  assert.match(settings, /!tutorial && isDeveloperMode/u);

  assert.match(result, /futureCodeFromSeed\(game\.seed\)/u);
  assert.match(result, /navigator\.clipboard\.writeText\(game\.seed\)/u);
  assert.doesNotMatch(result, /<input|generateRandomSeed/u);

  assert.match(transition, /prefers-reduced-motion: reduce/u);
  assert.match(transition, /document\.body\.classList\.remove/u);
  assert.match(app, /reset\(destinyTransition\.seed, setupTurns\)/u);
  assert.match(app, /setMenuReturnScreen\("setup"\)/u);
});
