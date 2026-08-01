import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBoardFile, parseScenarioFile, toBoardFile, toScenarioFile } from "../src/playground/scenarioStorage";
import { BLANK_SCENARIO } from "../src/playground/scenario";

function storedEntry(overrides = {}) {
  return {
    id: "scenario-1",
    name: "Zombie test",
    savedAt: "2026-07-24T10:00:00.000Z",
    definition: { ...BLANK_SCENARIO, name: "Zombie test", zones: { hordeBattlefield: [{ definitionId: "zombie_token", amount: 2 }] } },
    steps: [{ kind: "draw" }, { kind: "addEnergySource" }],
    ...overrides,
  };
}

test("an exported scenario round-trips with its recorded flow", () => {
  const entry = storedEntry();

  const parsed = parseScenarioFile(toScenarioFile(entry));
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.entry.name, "Zombie test");
  assert.deepEqual(parsed.entry.definition, entry.definition);
  assert.deepEqual(parsed.entry.steps, entry.steps);
});

test("scenario v2 replay steps keep their legacy Host boundary discriminants", () => {
  const entry = storedEntry({
    steps: [
      { kind: "hordeTurn" },
      { kind: "hordeTurnExact", count: 2 },
      { kind: "clearBattlefield", side: "horde" },
    ],
  });

  const parsed = parseScenarioFile(toScenarioFile(entry));
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.entry.steps, entry.steps);
});

test("an exported board JSON round-trips as hand and battlefield only", () => {
  const definition = {
    ...BLANK_SCENARIO,
    name: "Board JSON",
    zones: {
      playerHand: [{ definitionId: "giant_growth" }],
      playerBattlefield: [{ definitionId: "llanowar_elves" }],
      hordeBattlefield: [{ definitionId: "zombie_token" }],
      playerGraveyard: [{ definitionId: "broken_wings" }],
    },
  };
  const board = { id: "board-1", name: definition.name, savedAt: "2026-07-24T10:00:00.000Z", definition };

  const parsed = parseBoardFile(toBoardFile(board));

  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.board.name, "Board JSON");
  assert.deepEqual(parsed.board.definition.zones.playerHand, definition.zones.playerHand);
  assert.deepEqual(parsed.board.definition.zones.playerBattlefield, definition.zones.playerBattlefield);
  assert.deepEqual(parsed.board.definition.zones.hordeBattlefield, definition.zones.hordeBattlefield);
  assert.equal(parsed.board.definition.zones.playerGraveyard, undefined);
});

test("a bare scenario definition is accepted as a file too", () => {
  const parsed = parseScenarioFile(JSON.stringify(BLANK_SCENARIO));

  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.entry.definition.seed, BLANK_SCENARIO.seed);
  assert.deepEqual(parsed.entry.steps, []);
});

test("garbage input reports a problem instead of loading half a scenario", () => {
  for (const input of ["not json at all", "[]", "null", '{"hello":"world"}', '"a string"']) {
    const parsed = parseScenarioFile(input);
    assert.equal(parsed.entry, undefined, `should have rejected: ${input}`);
    assert.ok(parsed.problems.length > 0);
  }
});

test("a file naming an unknown card is rejected with that card's name", () => {
  const entry = storedEntry({
    definition: { ...BLANK_SCENARIO, zones: { playerHand: [{ definitionId: "totally_made_up" }] } },
  });

  const parsed = parseScenarioFile(toScenarioFile(entry));
  assert.equal(parsed.entry, undefined);
  assert.match(parsed.problems[0], /totally_made_up/);
});

test("a file from a newer scenario version is rejected", () => {
  const entry = storedEntry({ definition: { ...BLANK_SCENARIO, version: 99 } });

  const parsed = parseScenarioFile(toScenarioFile(entry));
  assert.equal(parsed.entry, undefined);
  assert.match(parsed.problems[0], /newer than this build/i);
});
