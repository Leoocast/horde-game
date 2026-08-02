import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBoardFile, parseScenarioFile, toBoardFile, toScenarioFile } from "../src/playground/scenarioStorage";
import { BLANK_SCENARIO } from "../src/playground/scenario";

function storedEntry(overrides = {}) {
  return {
    id: "scenario-1",
    name: "Zombie test",
    savedAt: "2026-07-24T10:00:00.000Z",
    definition: { ...BLANK_SCENARIO, name: "Zombie test", zones: { hostField: [{ definitionId: "last_knell_dead", amount: 2 }] } },
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

test("scenario v4 replay steps use Hostfall-native discriminants", () => {
  const entry = storedEntry({
    steps: [
      { kind: "hostTurn" },
      { kind: "hostTurnExact", count: 2 },
      { kind: "clearBattlefield", side: "host" },
    ],
  });

  const parsed = parseScenarioFile(toScenarioFile(entry));
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.entry.steps, entry.steps);
});

test("an exported board JSON round-trips as Hand and Fields only", () => {
  const definition = {
    ...BLANK_SCENARIO,
    name: "Board JSON",
    zones: {
      playerHand: [{ definitionId: "first_tree_sap" }],
      playerField: [{ definitionId: "first_dew_gatherers" }],
      hostField: [{ definitionId: "last_knell_dead" }],
      playerMemory: [{ definitionId: "roots_touched_sky" }],
    },
  };
  const board = { id: "board-1", name: definition.name, savedAt: "2026-07-24T10:00:00.000Z", definition };

  const parsed = parseBoardFile(toBoardFile(board));

  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.board.name, "Board JSON");
  assert.deepEqual(parsed.board.definition.zones.playerHand, definition.zones.playerHand);
  assert.deepEqual(parsed.board.definition.zones.playerField, definition.zones.playerField);
  assert.deepEqual(parsed.board.definition.zones.hostField, definition.zones.hostField);
  assert.equal(parsed.board.definition.zones.playerMemory, undefined);
});

test("a retired board wrapper is rejected without migration", () => {
  const definition = { ...BLANK_SCENARIO, name: "Retired board" };
  const retiredFile = JSON.stringify({
    id: "old-board",
    name: definition.name,
    savedAt: "2026-07-24T10:00:00.000Z",
    definition,
    version: 1,
  });

  const parsed = parseBoardFile(retiredFile);
  assert.equal(parsed.board, undefined);
  assert.match(parsed.problems[0], /retired.*requires 3/i);
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

test("a file from a retired scenario version is rejected without migration", () => {
  const entry = storedEntry({ definition: { ...BLANK_SCENARIO, version: 2 } });

  const parsed = parseScenarioFile(JSON.stringify(entry));
  assert.equal(parsed.entry, undefined);
  assert.match(parsed.problems[0], /retired.*requires 4/i);
});

test("a file from a newer scenario version is rejected", () => {
  const entry = storedEntry({ definition: { ...BLANK_SCENARIO, version: 99 } });

  const parsed = parseScenarioFile(toScenarioFile(entry));
  assert.equal(parsed.entry, undefined);
  assert.match(parsed.problems[0], /newer than this build/i);
});
