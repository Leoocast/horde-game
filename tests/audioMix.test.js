import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  dbToGain,
  parseAudioMix,
  projectAudioMix,
  projectAudioMixProblems,
  serializeAudioMix,
} from "../src/audio/audioMix.ts";
import { musicCollectionIds } from "../src/audio/musicManifest.ts";
import { sfxManifest, sfxMetadata } from "../src/audio/soundManifest.ts";
import { AUDIO_FEATURE_FLAGS, audioFeatureEnabled } from "../src/config/featureFlags.ts";

const newFeatureSfx = [
  "selectAttacker",
  "stoneCrash",
  "vaelorLinePlay",
];

test("the checked-in audio mix covers every manifest entry", () => {
  assert.deepEqual(projectAudioMixProblems, []);
  assert.deepEqual(Object.keys(projectAudioMix.sfx), Object.keys(sfxManifest));
  assert.deepEqual(Object.keys(projectAudioMix.music), musicCollectionIds);
  for (const id of musicCollectionIds) {
    assert.deepEqual(Object.keys(projectAudioMix.music[id]), ["battle", "climax"]);
  }
});

test("an exported audio mix round-trips without corrections", () => {
  const parsed = parseAudioMix(serializeAudioMix(projectAudioMix));
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.config, projectAudioMix);
});

test("new gameplay cues remain individually flagged and visible in Audio Lab", () => {
  assert.deepEqual(Object.keys(AUDIO_FEATURE_FLAGS), newFeatureSfx);
  for (const id of newFeatureSfx) {
    assert.equal(audioFeatureEnabled(id), true);
    assert.equal(sfxMetadata[id].group, "new");
    assert.equal(typeof sfxManifest[id], "string");
    assert.equal(Number.isFinite(projectAudioMix.sfx[id]), true);
  }
  assert.equal(audioFeatureEnabled("click"), true);
});

test("invalid or missing trims fall back safely and are reported", () => {
  const input = JSON.parse(serializeAudioMix(projectAudioMix));
  delete input.sfx.click;
  input.sfx.draw = 8;
  input.music.zombiesBattle1.battle = -80;
  input.music.zombiesBattle1.typo = -2;

  const parsed = parseAudioMix(input);
  assert.ok(parsed.config);
  assert.equal(parsed.config.sfx.click, 0);
  assert.equal(parsed.config.sfx.draw, 0);
  assert.equal(parsed.config.music.zombiesBattle1.battle, -30);
  assert.ok(parsed.problems.some((problem) => problem.includes("sfx.click")));
  assert.ok(parsed.problems.some((problem) => problem.includes("sfx.draw was clamped")));
  assert.ok(parsed.problems.some((problem) => problem.includes("music.zombiesBattle1.battle was clamped")));
  assert.ok(parsed.problems.some((problem) => problem.includes("music.zombiesBattle1.typo")));
});

test("decibel trims convert to linear gain", () => {
  assert.equal(dbToGain(0), 1);
  assert.ok(Math.abs(dbToGain(-6) - 0.501187) < 0.000001);
});

test("playSfx call sites cannot hide volume outside audioMix.json", () => {
  const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
  const offenders = [];

  for (const path of listTypeScriptFiles(sourceRoot)) {
    const sourceText = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isCallExpression(node) && callName(node.expression) === "playSfx") {
        const options = node.arguments[1];
        if (options && ts.isObjectLiteralExpression(options)) {
          const volume = options.properties.find((property) => property.name?.getText(source) === "volume");
          if (volume) offenders.push(`${path}:${source.getLineAndCharacterOfPosition(volume.getStart(source)).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(offenders, []);
  const engineSource = readFileSync(fileURLToPath(new URL("../src/audio/AudioEngine.ts", import.meta.url)), "utf8");
  const optionsContract = engineSource.match(/type PlayOptions = \{[\s\S]*?\};/)?.[0] ?? "";
  assert.doesNotMatch(optionsContract, /\bvolume\??\s*:/);
});

function listTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}
