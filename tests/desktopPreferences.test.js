import assert from "node:assert/strict";
import test from "node:test";
import { parseDesktopPreferences } from "../src/persistence/desktopPreferences";

const validPreferences = {
  kind: "hostfall-preferences",
  formatVersion: 1,
  savedAt: "2026-08-09T00:00:00.000Z",
  values: {
    language: "es",
    audio: { sfxEnabled: true, sfxVolume: 0.75, musicEnabled: false, musicVolume: 0.4 },
  },
};

test("desktop preferences v1 round-trip their bounded public settings", () => {
  assert.deepEqual(parseDesktopPreferences(JSON.parse(JSON.stringify(validPreferences))), validPreferences);
});

test("desktop preferences reject unknown schemas and unsafe volumes", () => {
  assert.equal(parseDesktopPreferences({ ...validPreferences, formatVersion: 2 }), undefined);
  assert.equal(parseDesktopPreferences({ ...validPreferences, values: { ...validPreferences.values, audio: { ...validPreferences.values.audio, musicVolume: 12 } } }), undefined);
});

test("desktop preferences migrate additive guided progress v1 into the contextual v2 envelope", () => {
  const guidedLessons = {
    kind: "hostfall-guided-progress",
    formatVersion: 1,
    completions: [{ lessonId: "first-seed", completedRevision: 1, completedAt: "2026-08-11T00:00:00.000Z" }],
  };
  const withGuidance = {
    ...validPreferences,
    values: { ...validPreferences.values, guidedLessons },
  };
  const parsed = parseDesktopPreferences(JSON.parse(JSON.stringify(withGuidance)));
  assert.equal(parsed?.values.guidedLessons?.formatVersion, 2);
  assert.deepEqual(parsed?.values.guidedLessons?.completions, guidedLessons.completions);
  assert.deepEqual(parsed?.values.guidedLessons?.concepts, []);
  assert.equal(parsed?.values.guidedLessons?.preferences.hideSeenContextualHelp, true);
  assert.equal(
    parseDesktopPreferences({ ...withGuidance, values: { ...withGuidance.values, guidedLessons: { ...guidedLessons, formatVersion: 3 } } }),
    undefined,
  );
});
