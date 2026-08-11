import assert from "node:assert/strict";
import test from "node:test";
import { isSafeResumeCheckpoint } from "../src/persistence/resumeCheckpoint";
import { selectDesktopResume } from "../src/persistence/resumeService";
import {
  createResumeSave,
  parseResumeSave,
  restoreResumeGame,
} from "../src/persistence/resumeSave";
import { useGameStore } from "../src/store/useGameStore";

test("resume v1 round-trips a deterministic domain snapshot without Zustand UI", () => {
  useGameStore.getState().reset("resume-round-trip", 3);
  const state = useGameStore.getState();
  const save = createResumeSave(state.game, {
    appVersion: "test",
    playerDeckId: state.playerDeckId,
    hostDeckId: state.hostDeckId,
    setupTurns: 3,
    playerName: "Chronicler",
    savedAt: "2026-08-09T00:00:00.000Z",
  });
  const parsed = parseResumeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(parsed.ok, true);
  assert.deepEqual(restoreResumeGame(parsed.save), JSON.parse(JSON.stringify(state.game)));
  assert.deepEqual(Object.keys(save.checkpoint), ["game"]);
  assert.equal("burnAnimation" in save.checkpoint, false);
  assert.equal("selectedHandId" in save.checkpoint, false);
});

test("resume parsing rejects unknown versions and never falls back from a missing deck", () => {
  useGameStore.getState().reset("resume-rejection", 3);
  const state = useGameStore.getState();
  const save = createResumeSave(state.game, {
    appVersion: "test",
    playerDeckId: state.playerDeckId,
    hostDeckId: state.hostDeckId,
    setupTurns: 3,
    playerName: "Chronicler",
  });
  assert.deepEqual(parseResumeSave({ ...save, formatVersion: 99 }), { ok: false, reason: "schema" });
  assert.deepEqual(parseResumeSave({ ...save, playerDeckKey: "missing.pack/missing.deck" }), { ok: false, reason: "deck" });
  assert.deepEqual(parseResumeSave({ ...save, contentRevision: "different" }), { ok: false, reason: "content" });
});

test("animations, Host beats and manual commitments preserve the previous checkpoint", () => {
  useGameStore.getState().reset("resume-checkpoint", 3);
  const stable = useGameStore.getState();
  assert.equal(isSafeResumeCheckpoint(stable), true);
  assert.equal(isSafeResumeCheckpoint({ ...stable, burnAnimation: {} }), false);
  assert.equal(isSafeResumeCheckpoint({ ...stable, resolvingHostCombat: true }), false);
  assert.equal(isSafeResumeCheckpoint({ ...stable, spellTargeting: {} }), false);
  assert.equal(isSafeResumeCheckpoint({
    ...stable,
    game: { ...stable.game, eventQueue: [{ id: "pending", type: "TEST" }] },
  }), false);
});

test("a rejected primary resume recovers from backup and two bad candidates surface corruption", () => {
  useGameStore.getState().reset("resume-backup", 3);
  const state = useGameStore.getState();
  const backup = createResumeSave(state.game, {
    appVersion: "test",
    playerDeckId: state.playerDeckId,
    hostDeckId: state.hostDeckId,
    setupTurns: 3,
    playerName: "Chronicler",
  });
  const recovered = selectDesktopResume({
    primary: { kind: "hostfall-resume", formatVersion: 99 },
    backup,
    primaryCorrupted: false,
    backupCorrupted: false,
  });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.save?.checkpoint.game.seed, "resume-backup");
  assert.deepEqual(selectDesktopResume({
    primary: { kind: "hostfall-resume", formatVersion: 99 },
    backup: { kind: "hostfall-resume", formatVersion: 98 },
    primaryCorrupted: false,
    backupCorrupted: false,
  }), { status: "corrupt" });
});
