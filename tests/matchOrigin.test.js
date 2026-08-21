import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCanonMatchOrigin,
  createOpaqueMatchOrigin,
  generateCanonSeedEntropy,
  importCanonMatchOrigin,
  matchOriginCanonCode,
  matchOriginVisualSeed,
} from "../src/content/MatchOrigin";
import {
  createLearnToPlayFirstMatchOrigin,
  LEARN_TO_PLAY_FIRST_CANON_SEED,
} from "../src/guidance/learnToPlayHandoff";

test("standard generation and explicit Canon import round-trip the complete match origin", () => {
  const generated = createCanonMatchOrigin({
    entropy: "LEGPT",
    playerDeckKey: "pact_of_elarion",
    hostDeckKey: "uprising_of_the_graveless",
    difficulty: "normal",
  });
  const imported = importCanonMatchOrigin(generated.canonCode);

  assert.deepEqual(imported, generated);
  assert.equal(generated.canonCode, "HF1-ELA-GRV-LE2-GPT");
  assert.equal(generated.rngSeed, "LEGPT");
  assert.equal(generated.playerDeckId, "pact_of_elarion");
  assert.equal(generated.hostDeckId, "uprising_of_the_graveless");
  assert.equal(generated.preparationTurns, 3);
  assert.equal(generated.gameMode, "standard");
  assert.equal(matchOriginVisualSeed(generated), generated.canonCode);
});

test("a Canon code applies decks, difficulty, and Preparation encoded in the code", () => {
  const imported = importCanonMatchOrigin("HF1-CEC-VRK-Z93-Y8X");
  assert.deepEqual(
    {
      playerDeckId: imported.playerDeckId,
      hostDeckId: imported.hostDeckId,
      difficulty: imported.difficulty,
      preparationTurns: imported.preparationTurns,
      rngSeed: imported.rngSeed,
    },
    {
      playerDeckId: "court_of_the_crimson_eclipse",
      hostDeckId: "legion_of_varka",
      difficulty: "hard",
      preparationTurns: 2,
      rngSeed: "Z9Y8X",
    },
  );
});

test("Learn to Play always hands off to the approved first Canon Seed", () => {
  const origin = createLearnToPlayFirstMatchOrigin();
  assert.equal(LEARN_TO_PLAY_FIRST_CANON_SEED, "HF1-ELA-GRV-082-QC5");
  assert.deepEqual(
    {
      canonCode: origin.canonCode,
      rngSeed: origin.rngSeed,
      playerDeckId: origin.playerDeckId,
      hostDeckId: origin.hostDeckId,
      difficulty: origin.difficulty,
      preparationTurns: origin.preparationTurns,
      gameMode: origin.gameMode,
    },
    {
      canonCode: "HF1-ELA-GRV-082-QC5",
      rngSeed: "08QC5",
      playerDeckId: "pact_of_elarion",
      hostDeckId: "uprising_of_the_graveless",
      difficulty: "normal",
      preparationTurns: 3,
      gameMode: "standard",
    },
  );
});

test("recoding configuration retains entropy while changing the public Canon identity", () => {
  const first = createCanonMatchOrigin({
    entropy: "A1B2C",
    playerDeckKey: "pact_of_elarion",
    hostDeckKey: "uprising_of_the_graveless",
    difficulty: "easy",
  });
  const changed = createCanonMatchOrigin({
    entropy: first.rngSeed,
    playerDeckKey: "court_of_the_crimson_eclipse",
    hostDeckKey: "legion_of_varka",
    difficulty: "hard",
  });
  assert.equal(changed.rngSeed, first.rngSeed);
  assert.notEqual(changed.canonCode, first.canonCode);
  assert.equal(changed.canonCode, "HF1-CEC-VRK-A13-B2C");
});

test("HF1 is rejected when the deterministic compatibility registry retires it", () => {
  assert.throws(
    () => importCanonMatchOrigin("HF1-ELA-GRV-LE2-GPT", undefined, {
      HF1: {
        format: "HF1",
        rulesetVersion: 1,
        deterministicRevision: "retired-hf1",
        supported: false,
      },
    }),
    /not reproducible/u,
  );
});

test("an HF1-shaped free seed remains opaque and never gains a public identity", () => {
  const opaque = createOpaqueMatchOrigin({
    rngSeed: "HF1-ELA-GRV-LE2-GPT",
    playerDeckKey: "pact_of_elarion",
    hostDeckKey: "uprising_of_the_graveless",
    difficulty: "normal",
    preparationTurns: 3,
    gameMode: "standard",
  });
  assert.equal(opaque.seedKind, "opaque");
  assert.equal(opaque.rngSeed, "HF1-ELA-GRV-LE2-GPT");
  assert.equal(matchOriginCanonCode(opaque), undefined);
  assert.equal(matchOriginVisualSeed(opaque), opaque.rngSeed);
  assert.equal("canonCode" in opaque, false);
});

test("Canon entropy generation uses unbiased accepted bytes", () => {
  const bytes = [252, 0, 1, 35, 36, 37];
  assert.equal(generateCanonSeedEntropy(() => bytes.shift()), "01Z01");
});

test("public Canon surfaces copy canonCode while opaque controls stay conditional", async () => {
  const [menu, header, copyButton, rewrite, result, app] = await Promise.all([
    readFile(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DestinyCopyIdentityButton.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/DestinyRewriteControl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GameOutcomeDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(menu, /writeClipboardText\(activeOrigin\.canonCode\)/u);
  assert.match(menu, /importCanonMatchOrigin\(canonDraft\)/u);
  assert.match(menu, /seedKind === "opaque"/u);
  assert.match(menu, /t\("setup\.freeSeedDescription"\)/u);
  assert.match(menu, /developerMode[\s\S]*?onCopyInternalSeed/u);
  assert.match(header, /matchOrigin!\.seedKind === "canon"/u);
  assert.match(copyButton, /writeClipboardText\(canonCode\)/u);
  assert.match(rewrite, /canonCode && <GameTooltip/u);
  assert.match(rewrite, /writeClipboardText\(canonCode\)/u);
  assert.match(result, /matchOrigin\.seedKind === "canon" && <button/u);
  assert.match(result, /writeClipboardText\(matchOrigin\.canonCode\)/u);
  assert.doesNotMatch(result, /writeClipboardText\(game\.seed\)/u);
  assert.match(app, /seed: matchOriginVisualSeed\(options\.origin\)/u);
  assert.match(app, /reset\([\s\S]*?options\.origin\.rngSeed/u);
  assert.match(app, /origin,\s*destination,/u);
  assert.match(app, /setMatchOrigin\(origin\)/u);
});
