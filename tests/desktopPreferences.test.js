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
