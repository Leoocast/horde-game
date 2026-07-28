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

test("the shared reaction runner hands surviving damage to the player and animates life gain", async () => {
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
    { applyHordeAttackEvent, buildHordeAttackEvents },
    { resetHordeSequence, scheduleQueuedHordeTriggers },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/CombatResolver"),
    import("../src/store/hordeBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHordeSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("crypt-guardian-reaction-order");
    game.player.life = 10;
    const attacker = addCard(game, customCard("crypt_reaction_attacker", "horde", {
      power: 1,
      toughness: 2,
    }));
    const guardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
    game.activeSide = "horde";
    game.phase = "combat";
    game.combat.hordeAttackers = [attacker.instanceId];
    game.combat.blockers = { [attacker.instanceId]: [guardian.instanceId] };
    const [impact] = buildHordeAttackEvents(game);
    const afterImpact = applyHordeAttackEvent(game, impact);

    useGameStore.setState({
      game: afterImpact,
      hordeAutoTriggerCount: 0,
      playerAutoTriggerCount: 0,
      lifeBuffAnimationId: undefined,
      summoningAnimationCount: 0,
    });

    let sharedRunnerCompleted = false;
    scheduleQueuedHordeTriggers(() => {
      sharedRunnerCompleted = true;
    });
    assert.equal(sharedRunnerCompleted, false);
    assert.equal(useGameStore.getState().game.player.life, 10);
    assert.equal(useGameStore.getState().game.eventQueue[0]?.type, "SURVIVED_DAMAGE");
    assert.equal(useGameStore.getState().activatingEffectCardId, guardian.instanceId);
    timers.releaseExpiredAt(460);

    const afterRecovery = useGameStore.getState();
    assert.equal(afterRecovery.game.player.life, 12);
    assert.equal(typeof afterRecovery.lifeBuffAnimationId, "number");
    assert.deepEqual(
      afterRecovery.game.eventQueue.map((event) => event.type),
      ["THIS_DIES", "CREATURE_DIED"],
    );
    assert.equal(sharedRunnerCompleted, false);

    timers.releaseExpiredAt(2_000);
    assert.equal(useGameStore.getState().playerAutoTriggerCount, 0);
    assert.deepEqual(useGameStore.getState().game.eventQueue, []);
    assert.equal(sharedRunnerCompleted, true);
  } finally {
    resetPlayerTriggerSequence();
    resetHordeSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Blood Pact presents its life payment, two-card draw, and queued Blood Page trigger", async () => {
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
    { useAudioStore },
    { useGameStore },
    { addCard, addForests, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const playedSfx = [];
  useAudioStore.setState({ playSfx: (id) => playedSfx.push(id) });

  try {
    const game = createTestGame("blood-pact-store-presentation");
    game.player.life = 10;
    addForests(game, 2);
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const pact = addCard(game, cardFromDeck("blood_pact", "player", "hand"), "player", "hand");
    addCard(game, customCard("blood_pact_store_draw_one", "player", { zone: "library" }), "player", "library");
    addCard(game, customCard("blood_pact_store_draw_two", "player", { zone: "library" }), "player", "library");
    useGameStore.setState({
      game,
      lifeDamageAnimationId: undefined,
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().castCard(pact.instanceId);

    const result = useGameStore.getState();
    assert.equal(result.game.player.life, 6);
    assert.equal(result.game.player.lifePaidThisTurn, 4);
    assert.equal(typeof result.lifeDamageAnimationId, "number");
    assert.equal(result.game.player.hand.length, 2);
    assert.equal(
      result.game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      0,
    );
    assert.equal(result.activatingEffectCardId, page.instanceId);
    assert.equal(playedSfx.includes("activateEffect"), true);
    assert.equal(playedSfx.includes("defend"), true);
    assert.equal(playedSfx.includes("drawOne"), true);

    timers.releaseExpiredAt(460);
    const afterPageTrigger = useGameStore.getState();
    assert.equal(
      afterPageTrigger.game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      2,
    );
    assert.equal(afterPageTrigger.buffAnimationCardIds.includes(page.instanceId), true);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("targeted life-cost spells queue Blood Page after their target buff during the Horde turn", async () => {
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
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addForests, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetPlayerTriggerSequence();
    const game = createTestGame("crimson-impulse-store-trigger");
    game.player.life = 10;
    addForests(game, 2);
    const ally = addCard(game, customCard("crimson_impulse_store_ally", "player", {
      power: 2,
      toughness: 2,
    }));
    const attacker = addCard(game, customCard("crimson_impulse_store_attacker", "horde"), "horde");
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const impulse = addCard(game, cardFromDeck("crimson_impulse", "player", "hand"), "player", "hand");
    game.activeSide = "horde";
    game.phase = "combat";
    game.combat.hordeAttackers = [attacker.instanceId];
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: impulse.instanceId,
        stepIndex: 0,
        targets: { targetCreature: ally.instanceId },
        x: 0,
        y: 0,
      },
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const afterCast = useGameStore.getState();
    assert.equal(afterCast.game.player.life, 8);
    assert.equal(afterCast.game.player.lifePaidThisTurn, 2);
    assert.equal(
      afterCast.game.player.battlefield.find((card) => card.instanceId === ally.instanceId)?.temporaryPower,
      2,
    );
    assert.equal(
      afterCast.game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      0,
    );

    timers.releaseExpiredAt(0);
    assert.equal(useGameStore.getState().activatingEffectCardId, page.instanceId);

    timers.releaseExpiredAt(460);
    assert.equal(
      useGameStore.getState().game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      2,
    );
  } finally {
    resetPlayerTriggerSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Predatory Thirst presents one allied buff containing its stat and temporary Lifesteal", async () => {
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
    { hasKeyword },
    { useAudioStore },
    { useGameStore },
    { addCard, addForests, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/Keywords"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("predatory-thirst-store");
    addForests(game, 3);
    const ally = addCard(game, customCard("predatory_thirst_store_ally", "player", {
      power: 2,
      toughness: 3,
    }));
    const thirst = addCard(game, cardFromDeck("predatory_thirst", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: thirst.instanceId,
        stepIndex: 0,
        targets: { targetCreature: ally.instanceId },
        x: 0,
        y: 0,
      },
      buffAnimationCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const result = useGameStore.getState();
    const buffed = result.game.player.battlefield.find((card) => card.instanceId === ally.instanceId);
    assert.equal(buffed?.temporaryPower, 1);
    assert.equal(hasKeyword(result.game, buffed, "LIFESTEAL"), true);
    assert.deepEqual(result.buffAnimationCardIds, [ally.instanceId]);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Final Banquet fades the target, presents its death reaction, then triggers Blood Page from life loss", async () => {
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
    { resetHordeSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addForests, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hordeBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHordeSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("final-banquet-store");
    game.player.life = 10;
    addForests(game, 5);
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const rundvelt = addCard(game, cardFromDeck("rundvelt_hordemaster", "horde"));
    addCard(game, cardFromDeck("goblin_token_1_1_red", "horde", "library"), "horde", "library");
    const banquet = addCard(game, cardFromDeck("final_banquet", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: banquet.instanceId,
        stepIndex: 0,
        targets: { targetCreature: rundvelt.instanceId },
        x: 0,
        y: 0,
      },
      deathRevealCard: undefined,
      lifeDamageAnimationId: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      hordeAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const beforeDeath = useGameStore.getState();
    assert.equal(beforeDeath.game.player.life, 10);
    assert.equal(beforeDeath.game.horde.battlefield.some((card) => card.instanceId === rundvelt.instanceId), true);
    assert.deepEqual(beforeDeath.specialDeadCardIds, [rundvelt.instanceId]);
    assert.equal(beforeDeath.pendingSpellHandId, banquet.instanceId);

    timers.releaseExpiredAt(260);

    const afterBanquet = useGameStore.getState();
    assert.equal(afterBanquet.game.player.life, 9);
    assert.equal(afterBanquet.game.player.lifePaidThisTurn, 0);
    assert.equal(afterBanquet.game.player.lifeLostThisTurn, 1);
    assert.equal(afterBanquet.game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 0);
    assert.equal(afterBanquet.game.horde.graveyard.some((card) => card.instanceId === rundvelt.instanceId), true);
    assert.equal(typeof afterBanquet.lifeDamageAnimationId, "number");
    assert.equal(afterBanquet.hordeAutoTriggerCount, 1);

    timers.releaseExpiredAt(380);
    assert.equal(useGameStore.getState().deathRevealCard?.instanceId, rundvelt.instanceId);

    timers.releaseExpiredAt(1_340);
    const afterDeathTrigger = useGameStore.getState();
    assert.equal(afterDeathTrigger.game.horde.battlefield.filter((card) => card.definitionId === "goblin_token_1_1_red").length, 1);
    assert.equal(afterDeathTrigger.game.horde.library.length, 0);
    assert.equal(afterDeathTrigger.game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 0);
    // Battlefield is not mounted in this store test, so release the summoned token's entry hold
    // exactly where the real card animation would decrement it.
    useGameStore.setState({ summoningAnimationCount: 0 });

    timers.releaseExpiredAt(1_900);
    assert.equal(useGameStore.getState().activatingEffectCardId, page.instanceId);
    assert.equal(useGameStore.getState().playerAutoTriggerCount, 1);

    timers.releaseExpiredAt(2_360);
    assert.equal(useGameStore.getState().game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 2);

    timers.releaseExpiredAt(3_500);
    assert.equal(useGameStore.getState().playerAutoTriggerCount, 0);
    assert.deepEqual(useGameStore.getState().game.eventQueue, []);
  } finally {
    resetPlayerTriggerSequence();
    resetHordeSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Drain Essence heals through the HUD and can kill an allied creature", async () => {
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
    { resetHordeSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addForests, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hordeBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const playedSfx = [];
  useAudioStore.setState({ playSfx: (id) => playedSfx.push(id) });

  try {
    resetHordeSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("drain-essence-store");
    game.player.life = 10;
    addForests(game, 3);
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const drain = addCard(game, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: drain.instanceId,
        stepIndex: 0,
        targets: { targetCreature: page.instanceId },
        x: 0,
        y: 0,
      },
      lifeBuffAnimationId: undefined,
      specialDeadCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      hordeAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const afterImpact = useGameStore.getState();
    assert.equal(afterImpact.game.player.life, 12);
    assert.equal(typeof afterImpact.lifeBuffAnimationId, "number");
    assert.equal(
      afterImpact.game.player.battlefield.find((card) => card.instanceId === page.instanceId)?.damageMarked,
      3,
    );
    assert.deepEqual(afterImpact.specialDeadCardIds, [page.instanceId]);
    assert.equal(playedSfx.includes("attack"), true);
    assert.equal(playedSfx.includes("buff"), true);

    timers.releaseExpiredAt(260);

    const afterDeath = useGameStore.getState();
    assert.equal(afterDeath.game.player.battlefield.some((card) => card.instanceId === page.instanceId), false);
    assert.equal(afterDeath.game.player.graveyard.some((card) => card.instanceId === page.instanceId), true);
    assert.deepEqual(afterDeath.specialDeadCardIds, []);
  } finally {
    resetPlayerTriggerSequence();
    resetHordeSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Drain Essence presents the Guardian trigger after its own recovery", async () => {
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
    { resetHordeSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addForests, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hordeBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHordeSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("drain-essence-guardian-trigger");
    game.player.life = 10;
    addForests(game, 3);
    const guardian = addCard(game, cardFromDeck("crypt_guardian", "player"));
    const drain = addCard(game, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: drain.instanceId,
        stepIndex: 0,
        targets: { targetCreature: guardian.instanceId },
        x: 0,
        y: 0,
      },
      activatingEffectCardId: undefined,
      lifeBuffAnimationId: undefined,
      specialDeadCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      hordeAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const afterDrain = useGameStore.getState();
    assert.equal(afterDrain.game.player.life, 12);
    assert.equal(
      afterDrain.game.player.battlefield.find((card) => card.instanceId === guardian.instanceId)?.damageMarked,
      3,
    );
    assert.equal(afterDrain.playerAutoTriggerCount, 1);

    timers.releaseExpiredAt(0);
    assert.equal(useGameStore.getState().activatingEffectCardId, guardian.instanceId);

    timers.releaseExpiredAt(460);
    const afterGuardian = useGameStore.getState();
    assert.equal(afterGuardian.game.player.life, 14);
    assert.equal(typeof afterGuardian.lifeBuffAnimationId, "number");
    assert.equal(afterGuardian.game.player.battlefield.some((card) => card.instanceId === guardian.instanceId), true);
  } finally {
    resetPlayerTriggerSequence();
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
