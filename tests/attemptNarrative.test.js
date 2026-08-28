import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_ATTEMPT_NARRATIVE_MARK_LENGTH,
  MAX_ATTEMPT_NARRATIVE_MARKS,
  MAX_ATTEMPT_NARRATIVE_PARAGRAPH_LENGTH,
  SUPPORTED_ATTEMPT_MILESTONE_KINDS,
  selectAttemptNarrativeFacts,
  summarizeAttempt,
} from "../src/history/attemptNarrative";
import {
  ATTEMPT_NARRATIVE_FIXTURES,
  renderAttemptNarrativeReviewDocument,
} from "./fixtures/attemptNarrativeFixtures";

test("the Phase 1 vocabulary stays closed and intentionally small", () => {
  assert.ok(SUPPORTED_ATTEMPT_MILESTONE_KINDS.length >= 8);
  assert.ok(SUPPORTED_ATTEMPT_MILESTONE_KINDS.length <= 12);
  assert.equal(new Set(SUPPORTED_ATTEMPT_MILESTONE_KINDS).size, 8);
});

test("the summarizer is deterministic and does not mutate frozen facts", () => {
  for (const fixture of ATTEMPT_NARRATIVE_FIXTURES) {
    const first = summarizeAttempt(fixture.facts, "es");
    const second = summarizeAttempt(fixture.facts, "es");
    assert.deepEqual(second, first, fixture.id);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.marks), true);
    assert.equal(Object.isFrozen(first.selectedMilestones), true);
  }
});

test("language changes wording without changing factual selection", () => {
  for (const fixture of ATTEMPT_NARRATIVE_FIXTURES) {
    const spanish = summarizeAttempt(fixture.facts, "es");
    const english = summarizeAttempt(fixture.facts, "en");
    assert.deepEqual(english.selectedMilestones, spanish.selectedMilestones, fixture.id);
    assert.equal(english.fallback, spanish.fallback, fixture.id);
  }
});

test("every output respects the paragraph and mark limits", () => {
  for (const fixture of ATTEMPT_NARRATIVE_FIXTURES) {
    for (const language of ["es", "en"]) {
      const output = summarizeAttempt(fixture.facts, language);
      assert.ok(output.paragraph.length <= MAX_ATTEMPT_NARRATIVE_PARAGRAPH_LENGTH, fixture.id);
      assert.ok(output.marks.length <= MAX_ATTEMPT_NARRATIVE_MARKS, fixture.id);
      assert.ok(
        output.marks.every((mark) => mark.length <= MAX_ATTEMPT_NARRATIVE_MARK_LENGTH),
        fixture.id,
      );
    }
  }

  const veryLongName = { es: "Nombre ".repeat(200), en: "Name ".repeat(200) };
  const output = summarizeAttempt(
    {
      outcome: "victory",
      turnNumber: 11,
      milestones: [
        {
          kind: "victory-source",
          sourceKind: "echo-effect",
          sourceName: veryLongName,
          turnNumber: 11,
        },
        {
          kind: "multi-target-effect",
          sourceName: veryLongName,
          targetCount: 8,
          effect: "damage",
          turnNumber: 10,
        },
      ],
    },
    "es",
  );
  assert.ok(output.paragraph.length <= MAX_ATTEMPT_NARRATIVE_PARAGRAPH_LENGTH);
  assert.ok(output.marks.every((mark) => mark.length <= MAX_ATTEMPT_NARRATIVE_MARK_LENGTH));
});

test("fallback remains in-world for empty, unknown and invalid milestones", () => {
  const unknownFacts = {
    outcome: "interrupted",
    turnNumber: 4,
    milestones: [
      { kind: "future-telemetry", hero: "NEVER_RENDER_THIS_NAME", amount: 999 },
      { kind: "direct-life-loss", amount: -3 },
    ],
  };
  const selection = selectAttemptNarrativeFacts(unknownFacts);
  const spanish = summarizeAttempt(unknownFacts, "es");
  const english = summarizeAttempt(unknownFacts, "en");

  assert.deepEqual(selection.selectedMilestones, []);
  assert.equal(selection.fallback, true);
  assert.equal(spanish.fallback, true);
  assert.equal(english.fallback, true);
  assert.equal(spanish.paragraph, "La historia de este Futuro quedó inconclusa.");
  assert.equal(english.paragraph, "The story of this Future remained unfinished.");
  assert.deepEqual(spanish.marks, []);
  assert.deepEqual(english.marks, []);
  assert.doesNotMatch(
    `${spanish.paragraph} ${english.paragraph}`,
    /generad|generated|datos|data|factual|registrad|recorded/i,
  );
});

test("templates use supplied facts while omitting technical closure details", () => {
  const facts = {
    outcome: "victory",
    turnNumber: 17,
    milestones: [
      {
        kind: "victory-source",
        sourceKind: "archive-attack",
        sourceName: { es: "NOMBRE_ES_17", en: "NAME_EN_17" },
        amount: 13,
        turnNumber: 17,
      },
      {
        kind: "multi-target-effect",
        sourceName: { es: "EFECTO_ES_19", en: "EFFECT_EN_19" },
        targetCount: 19,
        effect: "return",
        turnNumber: 16,
      },
      { kind: "host-archive-threshold", remainingEchoes: 7, turnNumber: 15 },
    ],
  };
  const spanish = summarizeAttempt(facts, "es");
  const english = summarizeAttempt(facts, "en");
  const spanishText = `${spanish.paragraph} ${spanish.marks.join(" ")}`;
  const englishText = `${english.paragraph} ${english.marks.join(" ")}`;

  assert.match(spanishText, /NOMBRE_ES_17/);
  assert.match(spanishText, /EFECTO_ES_19/);
  assert.match(spanishText, /19/);
  assert.match(spanishText, /7/);
  assert.doesNotMatch(spanishText, /13/);
  assert.doesNotMatch(spanishText, /NAME_EN_17|EFFECT_EN_19/);
  assert.match(englishText, /NAME_EN_17/);
  assert.match(englishText, /EFFECT_EN_19/);
  assert.doesNotMatch(englishText, /13/);
  assert.doesNotMatch(englishText, /NOMBRE_ES_17|EFECTO_ES_19/);

  const allFixtureText = ATTEMPT_NARRATIVE_FIXTURES.flatMap((fixture) =>
    ["es", "en"].map((language) => {
      const output = summarizeAttempt(fixture.facts, language);
      return `${output.paragraph} ${output.marks.join(" ")}`;
    }),
  ).join(" ");
  assert.doesNotMatch(
    allFixtureText,
    /\bsalv[oó]\b|caus[oó]|demasiado tarde|\bsaved\b|\bcaused\b|too late/i,
  );
  assert.doesNotMatch(allFixtureText, /registrad|\brecorded\b|\bturno\b|\bturn\b/i);
  assert.doesNotMatch(allFixtureText, /\bcarta(?:s)?\b|\bcard(?:s)?\b/i);
});

test("technical metadata and outcome-specific milestones cannot become a story", () => {
  const victory = summarizeAttempt(
    {
      outcome: "victory",
      turnNumber: 3,
      milestones: [{ kind: "unused-reserve", amount: 99 }],
    },
    "es",
  );
  const defeat = summarizeAttempt(
    {
      outcome: "defeat",
      turnNumber: 3,
      milestones: [
        {
          kind: "victory-source",
          sourceKind: "echo-effect",
          sourceName: { es: "NO DEBE APARECER", en: "MUST NOT APPEAR" },
        },
      ],
    },
    "en",
  );

  assert.equal(victory.fallback, true);
  assert.equal(
    victory.paragraph,
    "Este Futuro fue preservado sin dejar un único momento para la Crónica.",
  );
  assert.equal(defeat.fallback, true);
  assert.equal(defeat.paragraph, "This Future faded without leaving a moment for the Chronicle.");

  const technicalDefeat = summarizeAttempt(
    {
      outcome: "defeat",
      turnNumber: 5,
      milestones: [{ kind: "unused-reserve", amount: 3 }],
    },
    "es",
  );
  assert.equal(technicalDefeat.fallback, true);
  assert.equal(
    technicalDefeat.paragraph,
    "Este Futuro se desvaneció sin dejar un momento para la Crónica.",
  );
  assert.doesNotMatch(technicalDefeat.paragraph, /Reserva|3/);
  assert.deepEqual(technicalDefeat.marks, []);
});

test("the review artifact is generated from the exercised fixtures", () => {
  const artifact = readFileSync(
    new URL("../docs/plans/seeds_of_destiny_narrative_samples.md", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  assert.equal(artifact, renderAttemptNarrativeReviewDocument());
});
