import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { destroyPermanent } from "../src/engine/EffectResolver";
import { useGameStore } from "../src/store/useGameStore";
import {
  temporalDialTransform,
  uprightTemporalDialLabelTransform,
} from "../src/components/temporalDialPresentation";
import { futureCodeFromSeed, futureVisualSignature } from "../src/utils/futureIdentity";
import { addCard, createTestGame, customCard } from "./engineTestUtils";

const TEST_DECK_IDS = {
  playerDeckId: "pact_of_elarion",
  hostDeckId: "uprising_of_the_graveless",
};

test("a Future code is stable, compact, and presentation-only", () => {
  assert.equal(futureCodeFromSeed("hostfall-test"), "678·753");
  assert.equal(futureCodeFromSeed("same-seed"), futureCodeFromSeed("same-seed"));
  assert.notEqual(futureCodeFromSeed("same-seed"), futureCodeFromSeed("another-seed"));

  for (const seed of ["", "a", "developer", "hostfall-very-long-seed-value"]) {
    assert.match(futureCodeFromSeed(seed), /^\d{3}·\d{3}$/u);
  }
});

test("a Future keeps a deterministic visual signature distinct from its public code", () => {
  const signature = futureVisualSignature("same-seed");
  assert.equal(signature, futureVisualSignature("same-seed"));
  assert.notEqual(signature, futureVisualSignature("another-seed"));
  assert.ok(signature >= 0 && signature < 1);
});

test("the degree dial tracks every card death outside the battle phase", () => {
  const game = createTestGame("destiny-dial-deaths");
  addCard(game, customCard("host-death-one", "host"));
  addCard(game, customCard("host-death-two", "host"));
  addCard(game, customCard("player-death", "player"));
  useGameStore.getState().loadScenario(game, TEST_DECK_IDS);
  useGameStore.setState({ destinyDial: 0, destinyDialRevision: 0 });

  const afterHostDeaths = structuredClone(useGameStore.getState().game);
  for (const card of [...afterHostDeaths.host.field]) destroyPermanent(afterHostDeaths, card);
  useGameStore.setState({ game: afterHostDeaths });
  assert.equal(useGameStore.getState().destinyDial, 14);
  assert.equal(useGameStore.getState().destinyDialRevision, 1);

  const afterPlayerDeath = structuredClone(useGameStore.getState().game);
  destroyPermanent(afterPlayerDeath, afterPlayerDeath.player.field[0]);
  useGameStore.setState({ game: afterPlayerDeath });
  assert.equal(useGameStore.getState().destinyDial, 7);
  assert.equal(useGameStore.getState().destinyDialRevision, 2);
});

test("rewriting or loading a new game resets the degree dial to zero", () => {
  useGameStore.setState({ destinyDial: 35, destinyDialRevision: 4 });
  useGameStore.getState().reset("destiny-dial-rewrite", 3);
  assert.equal(useGameStore.getState().destinyDial, 0);
  assert.equal(useGameStore.getState().destinyDialRevision, 0);

  useGameStore.setState({ destinyDial: -21, destinyDialRevision: 7 });
  useGameStore.getState().loadScenario(createTestGame("destiny-dial-new-game"), TEST_DECK_IDS);
  assert.equal(useGameStore.getState().destinyDial, 0);
  assert.equal(useGameStore.getState().destinyDialRevision, 0);
});

test("degree labels counter-rotate around their anchors and stay horizontal", () => {
  assert.equal(temporalDialTransform(47.125), "translate(500 281) rotate(47.13)");
  assert.equal(
    uprightTemporalDialLabelTransform(47.125, { x: 160, y: -155 }),
    "rotate(-47.13 160 -155)",
  );
});

test("the narrative Future control owns normal rewrites outside Settings", async () => {
  const [header, settings, result, transition, shader, warmup, app] = await Promise.all([
    readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/SettingsMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DefeatModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DestinyRewriteTransition.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/destinyVortexShader.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/vfxWarmup.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.ok(header.indexOf("<DestinyRewriteControl") < header.indexOf("<MusicPlayerMenu"));
  assert.match(header, /futureSeed\?\.trim\(\)\.toLowerCase\(\) !== "developer"/u);
  assert.doesNotMatch(settings, /settings\.battleSeed|game-seed-input|setSeed/u);
  assert.match(settings, /!guided && isDeveloperMode/u);

  assert.match(result, /futureCodeFromSeed\(game\.seed\)/u);
  assert.match(result, /navigator\.clipboard\.writeText\(game\.seed\)/u);
  assert.doesNotMatch(result, /<input|generateRandomSeed/u);

  assert.match(transition, /prefers-reduced-motion: reduce/u);
  assert.match(transition, /futureVisualSignature\(seed\)/u);
  assert.match(transition, /document\.body\.classList\.remove/u);
  assert.match(shader, /uniform float uSeed/u);
  assert.match(warmup, /uSeed/u);
  assert.match(app, /resolvedDestinyIdRef\.current === transitionId/u);
  assert.match(app, /seed: gameStore\.game\.seed,\s*setupTurns,\s*destination,/u);
  assert.match(app, /reset\(transition\.seed, transition\.setupTurns\)/u);
  assert.match(app, /\}, \[reset, startBattleMusic\]\);/u);
  assert.match(app, /setMenuReturnScreen\("setup"\)/u);

  const lifecycleEffectAt = transition.indexOf("  useEffect(() => {");
  const shardEffectAt = transition.indexOf("  /* La escena no cae", lifecycleEffectAt);
  const lifecycleEffect = transition.slice(lifecycleEffectAt, shardEffectAt);
  const completeTimerAt = transition.indexOf("const completeTimer");
  const synchronousCleanupAt = transition.indexOf("clearDestinyTransitionBodyClasses();", completeTimerAt);
  const completeCallbackAt = transition.indexOf("completeCallbackRef.current(transitionId);", completeTimerAt);
  assert.match(transition, /coveredCallbackRef\.current = onCovered/u);
  assert.match(transition, /completeCallbackRef\.current = onComplete/u);
  assert.match(lifecycleEffect, /coveredCallbackRef\.current\(transitionId\)/u);
  assert.match(lifecycleEffect, /\}, \[transitionId\]\);/u);
  assert.doesNotMatch(lifecycleEffect, /\[[^\]]*(?:onCovered|onComplete|playSfx)[^\]]*\]/u);
  assert.ok(completeTimerAt >= 0);
  assert.ok(synchronousCleanupAt > completeTimerAt);
  assert.ok(completeCallbackAt > synchronousCleanupAt);
});
