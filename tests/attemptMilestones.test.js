import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AttemptMilestoneCollector } from "../src/history/attemptMilestones";

function signal(cursor, draft, sessionId = "game:1") {
  return { ...draft, cursor, sessionId };
}

test("the milestone collector keeps only the strongest direct facts per session", () => {
  const collector = new AttemptMilestoneCollector();
  collector.beginSession("game:1");
  collector.observe(signal(1, {
    kind: "host.surgeStarted",
    hostTurnNumber: 10,
    turnNumber: 5,
    playerEchoCount: 2,
    playerSourceCount: 3,
  }));
  collector.observe(signal(2, {
    kind: "host.surgeStarted",
    hostTurnNumber: 20,
    turnNumber: 10,
    playerEchoCount: 0,
    playerSourceCount: 1,
  }));

  const titan = { es: "Titán Sinsepulcro", en: "Graveless Titan" };
  collector.observe(signal(3, {
    kind: "player.lifeLost",
    amount: 3,
    lifeBefore: 20,
    lifeAfter: 17,
    turnNumber: 5,
    sourceId: "titan",
    sourceName: titan,
    unblockedAttack: true,
  }));
  collector.observe(signal(4, {
    kind: "player.lifeLost",
    amount: 5,
    lifeBefore: 17,
    lifeAfter: 12,
    turnNumber: 6,
    sourceId: "titan",
    sourceName: titan,
    unblockedAttack: true,
  }));
  collector.observe(signal(5, {
    kind: "player.lifeLost",
    amount: 2,
    lifeBefore: 12,
    lifeAfter: 10,
    turnNumber: 6,
    sourceId: "effect-source",
    sourceName: { es: "Nerezh", en: "Nerezh" },
    unblockedAttack: false,
  }));

  const milestones = collector.snapshot("game:1");
  assert.deepEqual(milestones.map(({ kind }) => kind), [
    "first-surge-field",
    "unblocked-attack",
    "direct-life-loss",
  ]);
  assert.deepEqual(milestones[0], {
    kind: "first-surge-field",
    turnNumber: 5,
    echoCount: 2,
    sourceCount: 3,
  });
  assert.equal(milestones[1].totalDamage, 5);
  assert.equal(milestones[2].amount, 2);
});

test("multi-target effects, Archive pressure and the exact victory source are bounded and immutable", () => {
  const collector = new AttemptMilestoneCollector();
  collector.beginSession("game:1");
  const vaelor = { es: "Vaelor, Guardián Esmeralda", en: "Vaelor, Emerald Guardian" };
  collector.observe(signal(1, {
    kind: "effect.multiTargetResolved",
    turnNumber: 3,
    sourceId: "vaelor",
    sourceName: vaelor,
    targetIds: ["one", "two", "three"],
    effect: "minus-one-counters",
  }));
  vaelor.es = "mutated by caller";
  collector.observe(signal(2, {
    kind: "host.archiveDiscarded",
    cardIds: ["a"],
    amount: 1,
    turnNumber: 7,
    hostArchiveRemaining: 9,
    endedGame: false,
  }));
  collector.observe(signal(3, {
    kind: "host.archiveDiscarded",
    cardIds: ["b", "c", "d"],
    amount: 3,
    turnNumber: 9,
    hostArchiveRemaining: 0,
    sourceKind: "archive-attack",
    sourceIds: ["vaelor"],
    sourceName: { es: "Vaelor, Guardián Esmeralda", en: "Vaelor, Emerald Guardian" },
    endedGame: true,
  }));

  const milestones = collector.snapshot("game:1");
  assert.equal(Object.isFrozen(milestones), true);
  assert.equal(Object.isFrozen(milestones[0].sourceName), true);
  assert.equal(milestones[0].sourceName.es, "Vaelor, Guardián Esmeralda");
  assert.deepEqual(milestones.map(({ kind }) => kind), [
    "multi-target-effect",
    "host-archive-threshold",
    "victory-source",
  ]);
  assert.equal(milestones[1].remainingEchoes, 0);
  assert.equal(milestones[2].sourceName.es, "Vaelor, Guardián Esmeralda");
});

test("session resets discard old facts and foreign signals cannot contaminate the current attempt", () => {
  const collector = new AttemptMilestoneCollector();
  collector.beginSession("game:1");
  collector.observe(signal(1, {
    kind: "host.surgeStarted",
    hostTurnNumber: 10,
    turnNumber: 5,
    playerEchoCount: 1,
    playerSourceCount: 2,
  }));
  collector.beginSession("game:2");
  collector.observe(signal(2, { kind: "game.ended", winner: "host" }, "game:1"));
  assert.deepEqual(collector.snapshot("game:1"), []);
  assert.deepEqual(collector.snapshot("game:2"), []);
});

test("the collector depends on semantic signals and never parses the gameplay log", async () => {
  const source = await readFile(new URL("../src/history/attemptMilestones.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /game\.log|\.log\b/u);
});
