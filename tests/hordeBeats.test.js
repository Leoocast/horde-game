import assert from "node:assert/strict";
import { test } from "node:test";

test("a throttled Chainwhirler volley consumes its event before the beat finishes", async () => {
  const originalWindow = globalThis.window;
  const timers = createThrottledTimerHarness();
  const storage = new Map();
  globalThis.window = {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    navigator: { language: "en" },
  };

  const [
    { enqueue },
    { resetHordeSequence, scheduleQueuedHordeTriggers },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/EventQueue"),
    import("../src/store/hordeBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHordeSequence();
    const game = createTestGame("chainwhirler-throttled-beat");
    const fragile = addCard(game, customCard("fragile_player_creature", "player", { toughness: 1 }));
    const sturdy = addCard(game, customCard("sturdy_player_creature", "player", { toughness: 2 }));
    const chainwhirler = addCard(game, cardFromDeck("goblin_chainwhirler", "horde"));
    enqueue(game, {
      type: "BURN_VOLLEY_DAMAGE",
      sourceId: chainwhirler.instanceId,
      payload: {
        sourceSide: "horde",
        targetPlayer: true,
        targetIds: [fragile.instanceId, sturdy.instanceId],
        amount: 1,
      },
    });

    let completed = false;
    useGameStore.setState({
      game,
      burnAnimation: undefined,
      burnImpactCardId: undefined,
      burnImpactCardIds: [],
      hordeAutoTriggerCount: 0,
      specialDeadCardIds: [],
      summoningAnimationCount: 0,
    });
    scheduleQueuedHordeTriggers(() => {
      completed = true;
    });

    // Simulate a background/busy tab: impact, delayed death commit and animation finish
    // have all expired before the browser gets a chance to run any callback.
    timers.releaseExpiredAt(10_000);

    const afterStall = useGameStore.getState();
    assert.equal(afterStall.game.eventQueue.some((event) => event.type === "BURN_VOLLEY_DAMAGE"), false);
    assert.equal(afterStall.game.player.battlefield.some((card) => card.instanceId === fragile.instanceId), false);
    assert.equal(afterStall.game.player.battlefield.find((card) => card.instanceId === sturdy.instanceId)?.damageMarked, 1);

    // The board-settle handoff is scheduled relative to the resumed clock.
    timers.releaseExpiredAt(11_000);
    assert.equal(useGameStore.getState().hordeAutoTriggerCount, 0);
    assert.equal(completed, true);
  } finally {
    resetHordeSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

function createThrottledTimerHarness() {
  let now = 0;
  let nextId = 1;
  const queue = [];

  const setTimeout = (callback, delay = 0) => {
    const id = nextId;
    nextId += 1;
    queue.push({ id, dueAt: now + Number(delay), callback });
    return id;
  };

  const clearTimeout = (id) => {
    const index = queue.findIndex((timer) => timer.id === id);
    if (index >= 0) queue.splice(index, 1);
  };

  const releaseExpiredAt = (time) => {
    now = time;
    while (true) {
      const expired = queue
        .filter((timer) => timer.dueAt <= now)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);
      const next = expired[0];
      if (!next) return;
      queue.splice(queue.findIndex((timer) => timer.id === next.id), 1);
      next.callback();
    }
  };

  return { setTimeout, clearTimeout, releaseExpiredAt };
}
