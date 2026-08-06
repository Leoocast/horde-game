import assert from "node:assert/strict";
import { test } from "node:test";

test("a lethal Host impact stops the remaining attack sequence immediately", async () => {
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const originalStopAllSfx = useAudioStore.getState().stopAllSfx;
  useAudioStore.setState({ playSfx: () => undefined, stopAllSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("lethal-host-impact-stops-sequence");
    game.player.life = 2;
    game.activeSide = "host";
    game.phase = "combat";
    const lethalAttacker = addCard(game, customCard("lethal_attacker", "host", { power: 3 }));
    const queuedAttacker = addCard(game, customCard("queued_attacker", "host", { power: 4 }));
    game.combat.hostAttackers = [lethalAttacker.instanceId, queuedAttacker.instanceId];

    useGameStore.setState({
      game,
      hostAttackAnimation: undefined,
      resolvingHostCombat: false,
      hostAutoTriggerCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().resolveHostCombat();
    assert.equal(useGameStore.getState().hostAttackAnimation?.attackerId, lethalAttacker.instanceId);
    assert.equal(useGameStore.getState().resolvingHostCombat, true);

    timers.releaseExpiredAt(465);
    const atDefeat = useGameStore.getState();
    assert.equal(atDefeat.game.winner, "host");
    assert.equal(atDefeat.game.player.life, -1);
    assert.equal(atDefeat.hostAttackAnimation, undefined);
    assert.equal(atDefeat.resolvingHostCombat, false);
    assert.equal(atDefeat.hostAutoTriggerCount, 0);
    assert.equal(atDefeat.playerAutoTriggerCount, 0);

    timers.releaseExpiredAt(10_000);
    assert.equal(useGameStore.getState().game.player.life, -1);
    assert.equal(useGameStore.getState().hostAttackAnimation, undefined);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx, stopAllSfx: originalStopAllSfx });
    globalThis.window = originalWindow;
  }
});

test("Vaelor's winning defense lands on the personal emerald fireball impact", async () => {
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const originalStopAllSfx = useAudioStore.getState().stopAllSfx;
  useAudioStore.setState({ playSfx: () => undefined, stopAllSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("vaelor-personal-defense-animation");
    game.activeSide = "host";
    game.phase = "combat";
    const attacker = addCard(game, customCard("attacker", "host", { power: 3, endurance: 4 }));
    addCard(game, customCard("host-bystander", "host"));
    const vaelor = addCard(game, cardFromDeck("vaelor_emerald_guardian", "player"));
    game.combat.hostAttackers = [attacker.instanceId];
    game.combat.blockers = { [attacker.instanceId]: [vaelor.instanceId] };

    useGameStore.setState({
      game,
      hostAttackAnimation: undefined,
      burnAnimation: undefined,
      resolvingHostCombat: false,
      hostAutoTriggerCount: 0,
      playerAutoTriggerCount: 0,
      hostCombatDeadCardIds: [],
      hostCombatVisualDamage: {},
    });

    useGameStore.getState().resolveHostCombat();
    const started = useGameStore.getState();
    assert.equal(started.hostAttackAnimation?.customAnimation?.preset, "emerald-fireball");
    assert.equal(started.hostAttackAnimation?.customAnimation?.suppressDefaultMotion, true);
    assert.match(started.burnAnimation?.id ?? "", /^personal-combat-\d+-0$/u);
    assert.deepEqual({ ...started.burnAnimation, id: undefined }, {
      id: undefined,
      sourceId: vaelor.instanceId,
      targetId: attacker.instanceId,
      targetKind: "card",
      amount: 6,
      variant: "emerald",
      scale: 1.5,
      sourceMoves: false,
    });

    timers.releaseExpiredAt(637);
    assert.equal(useGameStore.getState().game.host.field.some((card) => card.instanceId === attacker.instanceId), true);
    assert.equal(useGameStore.getState().game.player.field.some((card) => card.instanceId === vaelor.instanceId), true);

    timers.releaseExpiredAt(638);
    const atImpact = useGameStore.getState();
    assert.equal(atImpact.game.host.field.some((card) => card.instanceId === attacker.instanceId), false);
    assert.equal(atImpact.game.player.field.some((card) => card.instanceId === vaelor.instanceId), true);
    assert.equal(atImpact.burnAnimation?.variant, "emerald");

    timers.releaseExpiredAt(1220);
    assert.equal(useGameStore.getState().hostAttackAnimation, undefined);
    assert.equal(useGameStore.getState().burnAnimation, undefined);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx, stopAllSfx: originalStopAllSfx });
    globalThis.window = originalWindow;
  }
});

test("Vaelor attacks the Host panel with his personal emerald fireball", async () => {
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
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("vaelor-personal-attack-animation");
    game.activeSide = "player";
    game.phase = "combat";
    game.setupTurnsRemaining = 0;
    const vaelor = addCard(game, cardFromDeck("vaelor_emerald_guardian", "player"));
    for (let index = 0; index < 3; index += 1) {
      addCard(game, customCard(`host-archive-${index}`, "host", { zone: "archive" }));
    }
    game.combat.playerAttackers = [vaelor.instanceId];

    useGameStore.setState({
      game,
      playerAttackAnimation: undefined,
      burnAnimation: undefined,
      hostMillAnimationQueue: [],
      hostMillPreviewCards: [],
    });

    useGameStore.getState().finishPlayerCombat();
    timers.releaseExpiredAt(0);
    const started = useGameStore.getState();
    assert.equal(started.playerAttackAnimation?.customAnimation?.preset, "emerald-fireball");
    assert.equal(started.burnAnimation?.sourceId, vaelor.instanceId);
    assert.equal(started.burnAnimation?.targetKind, "hostLife");
    assert.equal(started.burnAnimation?.variant, "emerald");
    assert.equal(started.burnAnimation?.scale, 1.5);

    timers.releaseExpiredAt(637);
    assert.deepEqual(useGameStore.getState().hostMillPreviewCards, []);
    assert.equal(useGameStore.getState().game.host.archive.length, 3);

    timers.releaseExpiredAt(638);
    assert.equal(useGameStore.getState().hostMillPreviewCards.length, 1);
    assert.equal(useGameStore.getState().game.host.archive.length, 3);

    timers.releaseExpiredAt(1220);
    assert.equal(useGameStore.getState().burnAnimation, undefined);

    timers.releaseExpiredAt(1903);
    const completed = useGameStore.getState();
    assert.equal(completed.game.host.archive.length, 1);
    assert.equal(completed.game.host.memory.length, 2);
    assert.equal(completed.playerAttackAnimation, undefined);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Varka attacks the Chronicler life panel with two smaller infernal fireballs", async () => {
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const originalStopAllSfx = useAudioStore.getState().stopAllSfx;
  useAudioStore.setState({ playSfx: () => undefined, stopAllSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("varka-personal-direct-attack-animation");
    game.activeSide = "host";
    game.phase = "combat";
    const varka = addCard(game, cardFromDeck("varka_infernal_matriarch", "host"));
    game.combat.hostAttackers = [varka.instanceId];

    useGameStore.setState({
      game,
      hostAttackAnimation: undefined,
      burnAnimation: undefined,
      resolvingHostCombat: false,
      hostAutoTriggerCount: 0,
      playerAutoTriggerCount: 0,
      hostCombatDeadCardIds: [],
      hostCombatVisualDamage: {},
    });

    useGameStore.getState().resolveHostCombat();
    const started = useGameStore.getState();
    assert.equal(started.hostAttackAnimation?.customAnimation?.preset, "infernal-fireball");
    assert.equal(started.burnAnimation?.sourceId, varka.instanceId);
    assert.equal(started.burnAnimation?.targetKind, "playerLife");
    assert.equal(started.burnAnimation?.variant, "golden");
    assert.equal(started.burnAnimation?.scale, 0.85);
    assert.equal(started.burnAnimation?.projectileCount, 2);
    assert.equal(started.burnAnimation?.projectileOrigin, "split-horizontal");
    assert.equal(started.burnAnimation?.projectileGapMs, 0);
    assert.equal(started.burnAnimation?.amount, 4);

    timers.releaseExpiredAt(637);
    assert.equal(useGameStore.getState().game.player.life, 30);

    timers.releaseExpiredAt(638);
    assert.equal(useGameStore.getState().game.player.life, 26);

    timers.releaseExpiredAt(1220);
    assert.equal(useGameStore.getState().burnAnimation, undefined);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx, stopAllSfx: originalStopAllSfx });
    globalThis.window = originalWindow;
  }
});

test("Vaelor's entry volley waits for the summon and applies all counters at one impact", async () => {
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addSources, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const originalStopAllSfx = useAudioStore.getState().stopAllSfx;
  useAudioStore.setState({ playSfx: () => undefined, stopAllSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("vaelor-entry-volley-presentation");
    game.activeSide = "player";
    game.phase = "main";
    game.setupTurnsRemaining = 0;
    addSources(game, 6);
    const firstEnemy = addCard(game, customCard("vaelor-entry-first-enemy", "host", { power: 3, endurance: 3 }));
    const secondEnemy = addCard(game, customCard("vaelor-entry-second-enemy", "host", { power: 4, endurance: 4 }));
    const vaelor = addCard(game, cardFromDeck("vaelor_emerald_guardian", "player", "hand"), "player", "hand");

    useGameStore.setState({
      game,
      burnAnimation: undefined,
      burnImpactCardIds: [],
      hostAutoTriggerCount: 0,
      playerAutoTriggerCount: 0,
      summoningAnimationCount: 0,
      specialDeadCardIds: [],
    });

    useGameStore.getState().castCard(vaelor.instanceId);
    assert.equal(useGameStore.getState().game.eventQueue[0]?.type, "COUNTER_VOLLEY");
    assert.equal(useGameStore.getState().game.host.field[0].counters["-1/-1"] ?? 0, 0);
    assert.equal(useGameStore.getState().burnAnimation, undefined);

    useGameStore.getState().endSummoningAnimation();
    timers.releaseExpiredAt(40);
    const started = useGameStore.getState();
    assert.equal(started.burnAnimation?.sourceId, vaelor.instanceId);
    assert.equal(started.burnAnimation?.variant, "emerald");
    assert.equal(started.burnAnimation?.scale, 1.5);
    assert.equal(started.burnAnimation?.sourceMoves, false);
    assert.equal(started.burnAnimation?.projectileGapMs, 0);
    assert.equal(started.burnAnimation?.impactLabel, "-1/-1");
    assert.deepEqual(started.burnAnimation?.targets, [
      { targetKind: "card", targetId: firstEnemy.instanceId },
      { targetKind: "card", targetId: secondEnemy.instanceId },
    ]);

    timers.releaseExpiredAt(677);
    assert.equal(useGameStore.getState().game.host.field[0].counters["-1/-1"] ?? 0, 0);

    timers.releaseExpiredAt(678);
    assert.equal(useGameStore.getState().game.host.field.find((card) => card.instanceId === firstEnemy.instanceId)?.counters["-1/-1"], 1);
    assert.equal(useGameStore.getState().game.host.field.find((card) => card.instanceId === secondEnemy.instanceId)?.counters["-1/-1"], 1);

    timers.releaseExpiredAt(1260);
    assert.equal(useGameStore.getState().burnAnimation, undefined);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx, stopAllSfx: originalStopAllSfx });
    globalThis.window = originalWindow;
  }
});

test("a throttled Varka volley consumes its event before the beat finishes", async () => {
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
    { resetHostSequence, scheduleQueuedHostTriggers },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/EventQueue"),
    import("../src/store/hostBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHostSequence();
    const game = createTestGame("chainwhirler-throttled-beat");
    const fragile = addCard(game, customCard("fragile_player_creature", "player", { endurance: 1 }));
    const sturdy = addCard(game, customCard("sturdy_player_creature", "player", { endurance: 3 }));
    const chainwhirler = addCard(game, cardFromDeck("varka_infernal_matriarch", "host"));
    enqueue(game, {
      type: "BURN_VOLLEY_DAMAGE",
      sourceId: chainwhirler.instanceId,
      payload: {
        sourceSide: "host",
        targetPlayer: true,
        targetIds: [fragile.instanceId, sturdy.instanceId],
        amount: 2,
      },
    });

    let completed = false;
    useGameStore.setState({
      game,
      burnAnimation: undefined,
      burnImpactCardId: undefined,
      burnImpactCardIds: [],
      hostAutoTriggerCount: 0,
      specialDeadCardIds: [],
      summoningAnimationCount: 0,
    });
    scheduleQueuedHostTriggers(() => {
      completed = true;
    });

    // Simulate a background/busy tab: impact, delayed death commit and animation finish
    // have all expired before the browser gets a chance to run any callback.
    timers.releaseExpiredAt(10_000);

    const afterStall = useGameStore.getState();
    assert.equal(afterStall.game.eventQueue.some((event) => event.type === "BURN_VOLLEY_DAMAGE"), false);
    assert.equal(afterStall.game.player.field.some((card) => card.instanceId === fragile.instanceId), false);
    assert.equal(afterStall.game.player.field.find((card) => card.instanceId === sturdy.instanceId)?.damageMarked, 2);

    // The board-settle handoff is scheduled relative to the resumed clock.
    timers.releaseExpiredAt(11_000);
    assert.equal(useGameStore.getState().hostAutoTriggerCount, 0);
    assert.equal(completed, true);
  } finally {
    resetHostSequence();
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
    { applyHostAttackEvent, buildHostAttackEvents },
    { resetHostSequence, scheduleQueuedHostTriggers },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/CombatResolver"),
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("crypt-guardian-reaction-order");
    game.player.life = 10;
    const attacker = addCard(game, customCard("crypt_reaction_attacker", "host", {
      power: 1,
      endurance: 2,
    }));
    const guardian = addCard(game, cardFromDeck("guardian_of_the_night_threshold", "player"));
    game.activeSide = "host";
    game.phase = "combat";
    game.combat.hostAttackers = [attacker.instanceId];
    game.combat.blockers = { [attacker.instanceId]: [guardian.instanceId] };
    const [impact] = buildHostAttackEvents(game);
    const afterImpact = applyHostAttackEvent(game, impact);

    useGameStore.setState({
      game: afterImpact,
      hostAutoTriggerCount: 0,
      playerAutoTriggerCount: 0,
      lifeBuffAnimationId: undefined,
      summoningAnimationCount: 0,
    });

    let sharedRunnerCompleted = false;
    scheduleQueuedHostTriggers(() => {
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
      ["THIS_DIES", "ECHO_DIED"],
    );
    assert.equal(sharedRunnerCompleted, false);

    timers.releaseExpiredAt(2_000);
    assert.equal(useGameStore.getState().playerAutoTriggerCount, 0);
    assert.deepEqual(useGameStore.getState().game.eventQueue, []);
    assert.equal(sharedRunnerCompleted, true);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("a Lifesteal attacker bites the Host life panel at its combat impact", async () => {
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
    { addCard, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("lifesteal-attack-bite-presentation");
    game.player.life = 10;
    game.activeSide = "player";
    game.phase = "combat";
    game.setupTurnsRemaining = 0;
    const bat = addCard(game, cardFromDeck("herald_of_the_eclipse", "player"));
    game.combat.playerAttackers = [bat.instanceId];

    useGameStore.setState({
      game,
      playerAttackAnimation: undefined,
      lifestealAttackAnimations: [],
      lifeBuffAnimationId: undefined,
    });

    useGameStore.getState().finishPlayerCombat();
    timers.releaseExpiredAt(0);
    assert.equal(useGameStore.getState().playerAttackAnimation?.attackerId, bat.instanceId);

    timers.releaseExpiredAt(89);
    assert.equal(useGameStore.getState().game.player.life, 10);
    assert.deepEqual(useGameStore.getState().lifestealAttackAnimations, []);

    timers.releaseExpiredAt(90);
    const atImpact = useGameStore.getState();
    assert.equal(atImpact.game.player.life, 12);
    assert.equal(atImpact.lifestealAttackAnimations.length, 1);
    assert.equal(atImpact.lifestealAttackAnimations[0].attackerId, bat.instanceId);
    assert.equal(atImpact.lifestealAttackAnimations[0].amount, 2);

    atImpact.completeLifestealAttackAnimation(atImpact.lifestealAttackAnimations[0].id);
    assert.deepEqual(useGameStore.getState().lifestealAttackAnimations, []);
    timers.releaseExpiredAt(1_000);
    assert.equal(useGameStore.getState().playerAttackAnimation, undefined);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("a Toxic attacker poisons the Host HUD at its combat impact without doubling the counter", async () => {
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
    { addCard, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("toxic-attack-presentation");
    game.activeSide = "player";
    game.phase = "combat";
    game.setupTurnsRemaining = 0;
    const basilisk = addCard(game, cardFromDeck("hydra_of_the_black_bough", "player"));
    game.combat.playerAttackers = [basilisk.instanceId];

    useGameStore.setState({
      game,
      playerAttackAnimation: undefined,
      poisonAttackAnimation: undefined,
    });

    useGameStore.getState().finishPlayerCombat();
    timers.releaseExpiredAt(0);
    assert.equal(useGameStore.getState().playerAttackAnimation?.attackerId, basilisk.instanceId);

    timers.releaseExpiredAt(89);
    assert.equal(useGameStore.getState().game.host.poisonCounters, 0);
    assert.equal(useGameStore.getState().poisonAttackAnimation, undefined);

    timers.releaseExpiredAt(90);
    const atImpact = useGameStore.getState();
    assert.equal(atImpact.game.host.poisonCounters, 1);
    assert.equal(atImpact.poisonAttackAnimation?.attackerId, basilisk.instanceId);
    assert.equal(atImpact.poisonAttackAnimation?.amount, 1);

    atImpact.completePoisonAttackAnimation(atImpact.poisonAttackAnimation.id);
    assert.equal(useGameStore.getState().poisonAttackAnimation, undefined);

    timers.releaseExpiredAt(1_000);
    const afterCombat = useGameStore.getState();
    assert.equal(afterCombat.game.host.poisonCounters, 1);
    assert.equal(afterCombat.playerAttackAnimation, undefined);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("three poison counters animate their consumption before the Host card is milled", async () => {
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
    { addCard, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("poison-consume-presentation");
    game.activeSide = "player";
    game.phase = "end";
    game.setupTurnsRemaining = 0;
    game.host.poisonCounters = 3;
    const milledCard = addCard(
      game,
      cardFromDeck("graveless_soldier", "host", "archive"),
      "host",
      "archive",
    );
    addCard(
      game,
      cardFromDeck("graveless_soldier", "host", "archive"),
      "host",
      "archive",
    );

    useGameStore.setState({
      game,
      poisonConsumeAnimation: undefined,
      hostMillAnimationQueue: [],
    });

    useGameStore.getState().endPlayerTurn();
    const beforeConsume = useGameStore.getState();
    assert.equal(beforeConsume.game.activeSide, "player");
    assert.equal(beforeConsume.game.host.poisonCounters, 3);
    assert.equal(beforeConsume.game.host.archive.some((card) => card.instanceId === milledCard.instanceId), true);
    assert.equal(beforeConsume.game.host.memory.length, 0);
    assert.equal(beforeConsume.hostMillAnimationQueue.length, 0);
    assert.equal(beforeConsume.poisonConsumeAnimation?.amount, 3);
    assert.equal(beforeConsume.poisonConsumeAnimation?.millCount, 1);

    beforeConsume.completePoisonConsumeAnimation(beforeConsume.poisonConsumeAnimation.id);
    const afterConsume = useGameStore.getState();
    assert.equal(afterConsume.poisonConsumeAnimation, undefined);
    assert.equal(afterConsume.game.activeSide, "host");
    assert.equal(afterConsume.game.host.poisonCounters, 0);
    assert.equal(afterConsume.game.host.memory.some((card) => card.instanceId === milledCard.instanceId), true);
    assert.equal(afterConsume.hostMillAnimationQueue.length, 1);
    assert.equal(afterConsume.hostMillAnimationQueue[0].card.instanceId, milledCard.instanceId);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Midnight Pact presents its life payment, two-card draw, and queued Blood Page trigger", async () => {
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
    { addCard, addSources, cardFromDeck, createTestGame, customCard },
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
    addSources(game, 1);
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const pact = addCard(game, cardFromDeck("midnight_pact", "player", "hand"), "player", "hand");
    addCard(game, customCard("midnight_pact_store_draw_one", "player", { zone: "archive" }), "player", "archive");
    addCard(game, customCard("midnight_pact_store_draw_two", "player", { zone: "archive" }), "player", "archive");
    useGameStore.setState({
      game,
      lifeDamageAnimationId: undefined,
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().castCard(pact.instanceId);

    const result = useGameStore.getState();
    assert.equal(result.game.player.life, 5);
    assert.equal(result.game.player.lifePaidThisTurn, 5);
    assert.equal(result.lifeDamageAnimationId, undefined);
    assert.equal(result.lifePaymentAnimation, undefined);
    assert.equal(result.game.player.hand.length, 2);
    assert.equal(
      result.game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      0,
    );
    assert.equal(result.bloodPactAnimation?.card.instanceId, pact.instanceId);
    assert.equal(result.bloodPactAnimation?.phase, "casting");
    assert.equal(result.bloodPactAnimation?.drawnCardIds.length, 2);
    assert.equal(
      result.bloodPactAnimation?.drawnCardIds.every((id) =>
        result.game.player.hand.some((card) => card.instanceId === id)),
      true,
    );
    assert.equal(result.bloodPactAnimation?.lifeBefore, 10);
    assert.equal(result.bloodPactAnimation?.lifeAfter, 5);
    assert.equal(result.activatingEffectCardId, undefined);
    assert.equal(playedSfx.includes("activateEffect"), false);
    assert.equal(playedSfx.includes("drawOne"), false);

    useGameStore.getState().setBloodPactAnimationPhase(result.bloodPactAnimation.id, "impact");
    assert.equal(useGameStore.getState().bloodPactAnimation?.phase, "impact");
    assert.equal(playedSfx.includes("drawOne"), false);
    useGameStore.getState().setBloodPactAnimationPhase(result.bloodPactAnimation.id, "consumed");
    assert.equal(useGameStore.getState().bloodPactAnimation?.phase, "consumed");
    assert.equal(playedSfx.includes("drawOne"), true);
    useGameStore.getState().completeBloodPactAnimation(result.bloodPactAnimation.id);
    assert.equal(useGameStore.getState().bloodPactAnimation, undefined);
    assert.equal(playedSfx.filter((sfx) => sfx === "drawOne").length, 1);
    assert.equal(useGameStore.getState().activatingEffectCardId, page.instanceId);
    assert.equal(playedSfx.includes("activateEffect"), true);

    timers.releaseExpiredAt(460);
    const afterPageTrigger = useGameStore.getState();
    assert.equal(
      afterPageTrigger.game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      2,
    );
    assert.equal(afterPageTrigger.buffAnimationCardIds.includes(page.instanceId), true);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("targeted life-cost spells queue Blood Page after their target buff during the Host turn", async () => {
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
    { addCard, addSources, cardFromDeck, createTestGame, customCard },
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
    addSources(game, 1);
    const ally = addCard(game, customCard("crimson_impulse_store_ally", "player", {
      power: 2,
      endurance: 2,
    }));
    const attacker = addCard(game, customCard("crimson_impulse_store_attacker", "host"), "host");
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const impulse = addCard(game, cardFromDeck("crimson_impulse", "player", "hand"), "player", "hand");
    game.activeSide = "host";
    game.phase = "combat";
    game.combat.hostAttackers = [attacker.instanceId];
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: impulse.instanceId,
        stepIndex: 0,
        targets: { targetCreature: ally.instanceId },
        x: 0,
        y: 0,
      },
      lifeDamageAnimationId: undefined,
      lifePaymentAnimation: undefined,
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const afterCast = useGameStore.getState();
    assert.equal(afterCast.game.player.life, 8);
    assert.equal(afterCast.game.player.lifePaidThisTurn, 2);
    assert.equal(afterCast.lifeDamageAnimationId, undefined);
    assert.equal(afterCast.lifePaymentAnimation?.amount, 2);
    assert.equal(
      afterCast.game.player.field.find((card) => card.instanceId === ally.instanceId)?.temporaryPower,
      2,
    );
    assert.equal(
      afterCast.game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      0,
    );
    useGameStore.getState().completeLifePaymentAnimation(afterCast.lifePaymentAnimation.id);
    assert.equal(useGameStore.getState().lifePaymentAnimation, undefined);

    timers.releaseExpiredAt(0);
    assert.equal(useGameStore.getState().activatingEffectCardId, page.instanceId);

    timers.releaseExpiredAt(460);
    assert.equal(
      useGameStore.getState().game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower,
      2,
    );
  } finally {
    resetPlayerTriggerSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Midnight Collector presents its life payment while carrying stored Energy to the HUD", async () => {
  const [
    { useGameStore },
    { addCard, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const game = createTestGame("activated-life-payment-presentation");
  game.player.life = 10;
  const acolyte = addCard(game, cardFromDeck("midnight_collector", "player"));
  useGameStore.setState({
    game,
    lifeDamageAnimationId: undefined,
    lifePaymentAnimation: undefined,
    energyFlowAnimation: undefined,
    pendingTriggeredEffectCount: 0,
    playerAutoTriggerCount: 0,
  });

  useGameStore.getState().activateAbility(acolyte.instanceId, "midnight_collector_generate");

  const afterActivation = useGameStore.getState();
  assert.equal(afterActivation.game.player.life, 5);
  assert.equal(afterActivation.game.player.lifePaidThisTurn, 5);
  assert.equal(afterActivation.lifeDamageAnimationId, undefined);
  assert.equal(afterActivation.lifePaymentAnimation?.amount, 5);
  assert.equal(afterActivation.energyFlowAnimation?.sourceId, acolyte.instanceId);
  assert.equal(afterActivation.energyFlowAnimation?.phase, "travel");
  assert.equal(afterActivation.game.player.energyPool.stored, 0);
  assert.equal(
    afterActivation.game.player.field.find((card) => card.instanceId === acolyte.instanceId)?.exhausted,
    true,
  );

  const lifePaymentId = afterActivation.lifePaymentAnimation?.id;
  const energyFlowId = afterActivation.energyFlowAnimation?.id;
  assert.equal(typeof lifePaymentId, "string");
  assert.equal(typeof energyFlowId, "string");

  afterActivation.resolveEnergyFlowAnimation(energyFlowId);
  const atHud = useGameStore.getState();
  assert.equal(atHud.game.player.energyPool.stored, 1);
  assert.equal(atHud.energyFlowAnimation?.phase, "impact");
  assert.equal(atHud.lifePaymentAnimation?.id, lifePaymentId);

  atHud.completeEnergyFlowAnimation(energyFlowId);
  useGameStore.getState().completeLifePaymentAnimation(lifePaymentId);
  assert.equal(useGameStore.getState().energyFlowAnimation, undefined);
  assert.equal(useGameStore.getState().lifePaymentAnimation, undefined);
  assert.equal(useGameStore.getState().game.player.energyPool.stored, 1);
});

test("Hunt Beneath the Red Moon presents its temporary Lifesteal on every allied creature", async () => {
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
    { hasTrait },
    { useAudioStore },
    { useGameStore },
    { addCard, addSources, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/Traits"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("predatory-thirst-store");
    addSources(game, 2);
    const firstAlly = addCard(game, customCard("hunt_beneath_the_red_moon_store_ally_one", "player", {
      power: 2,
      endurance: 3,
    }));
    const secondAlly = addCard(game, customCard("hunt_beneath_the_red_moon_store_ally_two", "player", {
      power: 1,
      endurance: 2,
    }));
    const enemy = addCard(game, customCard("hunt_beneath_the_red_moon_store_enemy", "host"));
    const thirst = addCard(game, cardFromDeck("hunt_beneath_the_red_moon", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      spellTargeting: undefined,
      buffAnimationCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().castCard(thirst.instanceId);

    const result = useGameStore.getState();
    const firstBuffed = result.game.player.field.find((card) => card.instanceId === firstAlly.instanceId);
    const secondBuffed = result.game.player.field.find((card) => card.instanceId === secondAlly.instanceId);
    assert.equal(hasTrait(result.game, firstBuffed, "DRAIN"), true);
    assert.equal(hasTrait(result.game, secondBuffed, "DRAIN"), true);
    assert.equal(
      hasTrait(result.game, result.game.host.field.find((card) => card.instanceId === enemy.instanceId), "DRAIN"),
      false,
    );
    assert.deepEqual(result.buffAnimationCardIds, [firstAlly.instanceId, secondAlly.instanceId]);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Kaelor uses his storm animation when the first allied Echo is Invoked", async () => {
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
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("beast-kin-growth-presentation");
    const ranger = addCard(game, cardFromDeck("kaelor_stormcaller", "player"));
    const entrant = addCard(
      game,
      customCard("free_growth_entrant", "player", { zone: "hand" }),
      "player",
      "hand",
    );
    useGameStore.setState({
      game,
      buffAnimationCardIds: [],
      buffAnimationVariant: "default",
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().castCard(entrant.instanceId);

    const result = useGameStore.getState();
    const buffedKaelor = result.game.player.field.find((card) => card.instanceId === ranger.instanceId);
    assert.equal(buffedKaelor?.untilNextPlayerTurnPower, 1);
    assert.equal(buffedKaelor?.untilNextPlayerTurnEndurance, 1);
    assert.deepEqual(result.buffAnimationCardIds, [ranger.instanceId]);
    assert.equal(result.buffAnimationVariant, "storm-strong");
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("growth spells animate only after confirm, and Oath of the Clearing fights after the buff beat", async () => {
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
    { getPowerEndurance },
    { useAudioStore },
    { useGameStore },
    { addCard, addSources, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/engine/StaticEffects"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const playedSfx = [];
  useAudioStore.setState({ playSfx: (id) => playedSfx.push(id) });

  try {
    const game = createTestGame("ruthless-growth-before-fight");
    addSources(game, 2);
    const friendly = addCard(game, customCard("ruthless_store_friendly", "player", {
      power: 2,
      endurance: 2,
    }));
    const enemy = addCard(game, customCard("ruthless_store_enemy", "host", {
      power: 1,
      endurance: 5,
    }));
    const spell = addCard(game, cardFromDeck("shield_of_the_heir", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      playerDeckId: "pact_of_elarion",
      spellTargeting: undefined,
      spellFightAnimation: undefined,
      pendingSpellHandId: undefined,
      buffAnimationCardIds: [],
      buffAnimationVariant: "default",
      specialDeadCardIds: [],
    });

    useGameStore.getState().startSpellTargeting(spell.instanceId, 0, 0);
    useGameStore.getState().lockSpellTarget(friendly.instanceId);
    assert.deepEqual(useGameStore.getState().buffAnimationCardIds, []);
    assert.deepEqual(playedSfx, ["playLand"]);
    useGameStore.getState().lockSpellTarget(enemy.instanceId);
    assert.deepEqual(useGameStore.getState().buffAnimationCardIds, []);
    assert.deepEqual(playedSfx, ["playLand", "playLand"]);

    useGameStore.getState().confirmSpellTargeting();
    const afterConfirm = useGameStore.getState();
    const buffedFriendly = afterConfirm.game.player.field.find((card) => card.instanceId === friendly.instanceId);
    assert.deepEqual(getPowerEndurance(afterConfirm.game, buffedFriendly), { power: 3, endurance: 4 });
    assert.equal(buffedFriendly.damageMarked, 0);
    assert.deepEqual(afterConfirm.buffAnimationCardIds, [friendly.instanceId]);
    assert.equal(afterConfirm.buffAnimationVariant, "growth-strong");
    assert.equal(afterConfirm.spellFightAnimation, undefined);
    assert.equal(afterConfirm.pendingSpellHandId, spell.instanceId);
    assert.equal(playedSfx.filter((id) => id === "pactOfElarionBuff").length, 1);

    timers.releaseExpiredAt(1039);
    assert.equal(useGameStore.getState().spellFightAnimation, undefined);

    timers.releaseExpiredAt(1040);
    assert.equal(useGameStore.getState().spellFightAnimation?.friendlyId, friendly.instanceId);
    assert.equal(
      useGameStore.getState().game.player.field.find((card) => card.instanceId === friendly.instanceId)?.damageMarked,
      0,
    );

    timers.releaseExpiredAt(1560);
    const afterImpact = useGameStore.getState();
    assert.equal(afterImpact.spellFightAnimation, undefined);
    assert.equal(afterImpact.pendingSpellHandId, undefined);
    assert.equal(
      afterImpact.game.player.field.find((card) => card.instanceId === friendly.instanceId)?.damageMarked,
      1,
    );
    assert.equal(
      afterImpact.game.host.field.find((card) => card.instanceId === enemy.instanceId)?.damageMarked,
      3,
    );
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("El Juicio de Elarion cuts the target before its normal destruction fade", async () => {
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
    { addCard, addSources, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const playedSfx = [];
  useAudioStore.setState({ playSfx: (id) => playedSfx.push(id) });

  try {
    const game = createTestGame("roots-touched-sky-presentation");
    addSources(game, 3);
    const target = addCard(game, cardFromDeck("the_broken_headstone", "host"));
    const spell = addCard(game, cardFromDeck("the_judgment_of_elarion", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      playerDeckId: "pact_of_elarion",
      spellTargeting: {
        handId: spell.instanceId,
        stepIndex: 0,
        targets: { targetPermanent: target.instanceId },
        x: 0,
        y: 0,
      },
      rootsTouchedSkyAnimation: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
    });

    useGameStore.getState().confirmSpellTargeting();

    const duringCut = useGameStore.getState();
    assert.equal(duringCut.rootsTouchedSkyAnimation?.targetId, target.instanceId);
    assert.equal(duringCut.pendingSpellHandId, spell.instanceId);
    assert.deepEqual(duringCut.specialDeadCardIds, []);
    assert.equal(duringCut.game.host.field.some((card) => card.instanceId === target.instanceId), true);
    assert.equal(duringCut.game.player.hand.some((card) => card.instanceId === spell.instanceId), true);
    assert.deepEqual(playedSfx, []);

    timers.releaseExpiredAt(419);
    assert.deepEqual(useGameStore.getState().specialDeadCardIds, []);

    timers.releaseExpiredAt(420);
    const atImpact = useGameStore.getState();
    assert.deepEqual(atImpact.specialDeadCardIds, [target.instanceId]);
    assert.equal(atImpact.game.host.field.some((card) => card.instanceId === target.instanceId), true);
    assert.deepEqual(playedSfx, ["attack"]);

    timers.releaseExpiredAt(680);
    const afterFade = useGameStore.getState();
    assert.equal(afterFade.rootsTouchedSkyAnimation, undefined);
    assert.equal(afterFade.pendingSpellHandId, undefined);
    assert.deepEqual(afterFade.specialDeadCardIds, []);
    assert.equal(afterFade.game.host.field.some((card) => card.instanceId === target.instanceId), false);
    assert.equal(afterFade.game.host.memory.some((card) => card.instanceId === target.instanceId), true);
    assert.equal(afterFade.game.player.memory.some((card) => card.instanceId === spell.instanceId), true);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Energy Echoes Exhaust first and fill Stored Energy when their flow reaches the HUD", async () => {
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
    { addCard, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    const game = createTestGame("energy-flow-presentation");
    const gatherer = addCard(game, cardFromDeck("veiled_dawn_flower", "player"));
    const spring = addCard(game, cardFromDeck("river_of_elarion", "player"));
    useGameStore.setState({
      game,
      playerDeckId: "pact_of_elarion",
      energyFlowAnimation: undefined,
      playerAutoTriggerCount: 0,
    });

    useGameStore.getState().activateAbility(gatherer.instanceId, "veiled_dawn_flower_gain_energy");

    const duringTravel = useGameStore.getState();
    assert.equal(duringTravel.energyFlowAnimation?.sourceId, gatherer.instanceId);
    assert.equal(duringTravel.energyFlowAnimation?.phase, "travel");
    assert.equal(duringTravel.game.player.energyPool.stored, 0);
    assert.equal(
      duringTravel.game.player.field.find((card) => card.instanceId === gatherer.instanceId)?.exhausted,
      true,
    );

    const animationId = duringTravel.energyFlowAnimation?.id;
    assert.equal(typeof animationId, "string");
    duringTravel.resolveEnergyFlowAnimation(animationId);

    const atHud = useGameStore.getState();
    assert.equal(atHud.game.player.energyPool.stored, 1);
    assert.equal(atHud.energyFlowAnimation?.phase, "impact");

    atHud.completeEnergyFlowAnimation(animationId);
    assert.equal(useGameStore.getState().energyFlowAnimation, undefined);
    assert.equal(useGameStore.getState().game.player.energyPool.stored, 1);

    useGameStore.getState().activateAbility(spring.instanceId, "river_of_elarion_gain_energy");
    assert.equal(useGameStore.getState().energyFlowAnimation, undefined);
    assert.equal(useGameStore.getState().game.player.energyPool.available, 1);
  } finally {
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Verdict of the Eclipse siphons first, waits for its lightning strike, then presents death and Blood Page reactions", async () => {
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addSources, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("final-banquet-store");
    game.player.life = 10;
    addSources(game, 3);
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const caller = addCard(game, cardFromDeck("summoner_of_the_ranks", "host"));
    addCard(game, cardFromDeck("varkas_minion", "host", "archive"), "host", "archive");
    const banquet = addCard(game, cardFromDeck("verdict_of_the_eclipse", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      spellTargeting: {
        handId: banquet.instanceId,
        stepIndex: 0,
        targets: { targetCreature: caller.instanceId },
        x: 0,
        y: 0,
      },
      deathRevealCard: undefined,
      lifeDamageAnimationId: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      hostAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const beforeDeath = useGameStore.getState();
    assert.equal(beforeDeath.game.player.life, 10);
    assert.equal(beforeDeath.game.host.field.some((card) => card.instanceId === caller.instanceId), true);
    assert.deepEqual(beforeDeath.specialDeadCardIds, []);
    assert.equal(beforeDeath.pendingSpellHandId, banquet.instanceId);
    assert.equal(beforeDeath.finalBanquetAnimation?.phase, "siphon");
    assert.equal(beforeDeath.finalBanquetAnimation?.targetId, caller.instanceId);
    assert.equal(beforeDeath.finalBanquetAnimation?.amount, 1);

    beforeDeath.beginFinalBanquetStrike(beforeDeath.finalBanquetAnimation.id);
    const beforeRayImpact = useGameStore.getState();
    assert.equal(beforeRayImpact.finalBanquetAnimation?.phase, "strike");
    assert.equal(beforeRayImpact.game.player.life, 10);
    assert.equal(beforeRayImpact.game.host.field.some((card) => card.instanceId === caller.instanceId), true);

    beforeRayImpact.beginFinalBanquetImpact(beforeRayImpact.finalBanquetAnimation.id);
    const atLightningImpact = useGameStore.getState();
    assert.equal(atLightningImpact.finalBanquetAnimation?.phase, "impact");
    assert.deepEqual(atLightningImpact.specialDeadCardIds, [caller.instanceId]);
    assert.equal(atLightningImpact.game.host.field.some((card) => card.instanceId === caller.instanceId), true);

    atLightningImpact.completeFinalBanquetAnimation(atLightningImpact.finalBanquetAnimation.id);
    timers.releaseExpiredAt(0);

    const afterBanquet = useGameStore.getState();
    assert.equal(afterBanquet.game.player.life, 9);
    assert.equal(afterBanquet.game.player.lifePaidThisTurn, 0);
    assert.equal(afterBanquet.game.player.lifeLostThisTurn, 1);
    assert.equal(afterBanquet.game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 0);
    assert.equal(afterBanquet.game.host.memory.some((card) => card.instanceId === caller.instanceId), true);
    assert.equal(afterBanquet.lifeDamageAnimationId, undefined);
    assert.equal(afterBanquet.finalBanquetAnimation, undefined);
    assert.equal(afterBanquet.pendingSpellHandId, undefined);
    assert.equal(afterBanquet.hostAutoTriggerCount, 1);

    timers.releaseExpiredAt(120);
    assert.equal(useGameStore.getState().deathRevealCard?.instanceId, caller.instanceId);

    timers.releaseExpiredAt(1_080);
    const afterDeathTrigger = useGameStore.getState();
    assert.equal(afterDeathTrigger.game.host.field.filter((card) => card.definitionId === "varkas_minion").length, 1);
    assert.equal(afterDeathTrigger.game.host.archive.length, 0);
    assert.equal(afterDeathTrigger.game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 0);
    // Battlefield is not mounted in this store test, so release the summoned token's entry hold
    // exactly where the real card animation would decrement it.
    useGameStore.setState({ summoningAnimationCount: 0 });

    timers.releaseExpiredAt(1_640);
    assert.equal(useGameStore.getState().activatingEffectCardId, page.instanceId);
    assert.equal(useGameStore.getState().playerAutoTriggerCount, 1);

    timers.releaseExpiredAt(2_100);
    assert.equal(useGameStore.getState().game.player.field.find((card) => card.instanceId === page.instanceId)?.temporaryPower, 2);

    timers.releaseExpiredAt(3_240);
    assert.equal(useGameStore.getState().playerAutoTriggerCount, 0);
    assert.deepEqual(useGameStore.getState().game.eventQueue, []);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addSources, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  const playedSfx = [];
  useAudioStore.setState({ playSfx: (id) => playedSfx.push(id) });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("drain-essence-store");
    game.player.life = 10;
    addSources(game, 3);
    const page = addCard(game, cardFromDeck("blood_page", "player"));
    const drain = addCard(game, cardFromDeck("drain_essence", "player", "hand"), "player", "hand");
    useGameStore.setState({
      game,
      playerDeckId: "court_of_the_crimson_eclipse",
      spellTargeting: {
        handId: drain.instanceId,
        stepIndex: 0,
        targets: { targetCreature: page.instanceId },
        x: 0,
        y: 0,
      },
      lifeBuffAnimationId: undefined,
      drainEssenceAnimation: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      hostAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const beforeExtraction = useGameStore.getState();
    assert.equal(beforeExtraction.game.player.life, 10);
    assert.equal(
      beforeExtraction.game.player.field.find((card) => card.instanceId === page.instanceId)?.damageMarked,
      0,
    );
    assert.equal(beforeExtraction.game.player.hand.some((card) => card.instanceId === drain.instanceId), true);
    assert.equal(beforeExtraction.pendingSpellHandId, drain.instanceId);
    assert.equal(beforeExtraction.drainEssenceAnimation?.phase, "extracting");
    assert.equal(beforeExtraction.drainEssenceAnimation?.variant, "bite");

    const animationId = beforeExtraction.drainEssenceAnimation?.id;
    assert.equal(typeof animationId, "string");
    useGameStore.getState().resolveDrainEssenceAnimation(animationId);

    const afterImpact = useGameStore.getState();
    assert.equal(afterImpact.game.player.life, 12);
    assert.equal(typeof afterImpact.lifeBuffAnimationId, "number");
    assert.equal(
      afterImpact.game.player.field.find((card) => card.instanceId === page.instanceId)?.damageMarked,
      3,
    );
    assert.deepEqual(afterImpact.specialDeadCardIds, [page.instanceId]);
    assert.equal(playedSfx.includes("buff"), true);
    assert.equal(afterImpact.drainEssenceAnimation?.phase, "resolved");

    useGameStore.getState().completeDrainEssenceAnimation(animationId);

    const afterDeath = useGameStore.getState();
    assert.equal(afterDeath.game.player.field.some((card) => card.instanceId === page.instanceId), false);
    assert.equal(afterDeath.game.player.memory.some((card) => card.instanceId === page.instanceId), true);
    assert.deepEqual(afterDeath.specialDeadCardIds, []);
    assert.equal(afterDeath.drainEssenceAnimation, undefined);
    assert.equal(afterDeath.pendingSpellHandId, undefined);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
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
    { resetHostSequence },
    { resetPlayerTriggerSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, addSources, cardFromDeck, createTestGame },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/playerBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHostSequence();
    resetPlayerTriggerSequence();
    const game = createTestGame("drain-essence-guardian-trigger");
    game.player.life = 10;
    addSources(game, 3);
    const guardian = addCard(game, cardFromDeck("guardian_of_the_night_threshold", "player"));
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
      drainEssenceAnimation: undefined,
      pendingSpellHandId: undefined,
      specialDeadCardIds: [],
      pendingTriggeredEffectCount: 0,
      playerAutoTriggerCount: 0,
      hostAutoTriggerCount: 0,
      summoningAnimationCount: 0,
    });

    useGameStore.getState().confirmSpellTargeting();

    const duringExtraction = useGameStore.getState();
    assert.equal(duringExtraction.game.player.life, 10);
    assert.equal(duringExtraction.playerAutoTriggerCount, 0);
    const animationId = duringExtraction.drainEssenceAnimation?.id;
    assert.equal(typeof animationId, "string");

    useGameStore.getState().resolveDrainEssenceAnimation(animationId);
    const afterDrain = useGameStore.getState();
    assert.equal(afterDrain.game.player.life, 12);
    assert.equal(
      afterDrain.game.player.field.find((card) => card.instanceId === guardian.instanceId)?.damageMarked,
      3,
    );
    assert.equal(afterDrain.playerAutoTriggerCount, 1);
    assert.equal(afterDrain.activatingEffectCardId, undefined);

    useGameStore.getState().completeDrainEssenceAnimation(animationId);
    timers.releaseExpiredAt(0);
    assert.equal(useGameStore.getState().activatingEffectCardId, guardian.instanceId);

    timers.releaseExpiredAt(460);
    const afterGuardian = useGameStore.getState();
    assert.equal(afterGuardian.game.player.life, 14);
    assert.equal(typeof afterGuardian.lifeBuffAnimationId, "number");
    assert.equal(afterGuardian.game.player.field.some((card) => card.instanceId === guardian.instanceId), true);
  } finally {
    resetPlayerTriggerSequence();
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("a deferred vanilla Host arrival still notifies ECHO_INVOKED observers", async () => {
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
    { resetHostSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHostSequence();
    const game = createTestGame("deferred-vanilla-echo-invoked");
    addCard(game, cardFromDeck("marshal_of_the_wave", "host"));
    addCard(game, customCard("deferred_vanilla_echo", "host", {
      zone: "archive",
      power: 0,
    }), "host", "archive");
    useGameStore.setState({
      game,
      hostAutoTriggerCount: 0,
      summoningAnimationCount: 0,
      pendingStaticAuras: [],
      heldStaticAuraBonuses: {},
    });

    useGameStore.getState().resolveHostCardFromTop();
    assert.equal(useGameStore.getState().summoningAnimationCount, 1);
    useGameStore.setState({ summoningAnimationCount: 0 });
    timers.releaseExpiredAt(60);

    const awaitingGeneral = useGameStore.getState();
    assert.equal(awaitingGeneral.hostAutoTriggerCount, 1);
    assert.equal(awaitingGeneral.game.eventQueue[0]?.type, "ECHO_INVOKED");
  } finally {
    resetHostSequence();
    useAudioStore.setState({ playSfx: originalPlaySfx });
    globalThis.window = originalWindow;
  }
});

test("Tribute of the Four Sorrows sacrifices the weakest Host Echo without discarding its Archive", async () => {
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
    innerWidth: 1280,
    innerHeight: 720,
  };

  const [
    { resetHostSequence },
    { runTributeOfTheFourSorrowsSequence },
    { useAudioStore },
    { useGameStore },
    { addCard, cardFromDeck, createTestGame, customCard },
  ] = await Promise.all([
    import("../src/store/hostBeats"),
    import("../src/store/tributeOfTheFourSorrowsSequence"),
    import("../src/store/useAudioStore"),
    import("../src/store/useGameStore"),
    import("./engineTestUtils"),
  ]);

  const originalPlaySfx = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: () => undefined });

  try {
    resetHostSequence();
    const game = createTestGame("tribute-no-host-archive-discard");
    const tribute = cardFromDeck("tribute_of_the_four_sorrows", "host");
    const weakest = addCard(game, customCard("tribute_weakest", "host", { power: 1, endurance: 1 }));
    addCard(game, customCard("tribute_stronger", "host", { power: 3, endurance: 3 }));
    const archived = addCard(
      game,
      customCard("tribute_archive_witness", "host", { zone: "archive" }),
      "host",
      "archive",
    );
    game.host.pendingCard = tribute;
    useGameStore.setState({
      game,
      tributeOfTheFourSorrowsCard: undefined,
      tributeOfTheFourSorrowsSelection: undefined,
      hostAutoTriggerCount: 0,
      specialDeadCardIds: [],
      hostMillAnimationQueue: [],
    });

    runTributeOfTheFourSorrowsSequence(tribute);
    timers.releaseExpiredAt(700);

    const awaitingSacrifice = useGameStore.getState();
    assert.deepEqual(awaitingSacrifice.game.host.archive.map((card) => card.instanceId), [archived.instanceId]);
    assert.deepEqual(awaitingSacrifice.specialDeadCardIds, [weakest.instanceId]);

    timers.releaseExpiredAt(960);
    const afterSacrifice = useGameStore.getState();
    assert.deepEqual(afterSacrifice.game.host.archive.map((card) => card.instanceId), [archived.instanceId]);
    assert.equal(afterSacrifice.game.host.field.some((card) => card.instanceId === weakest.instanceId), false);
  } finally {
    resetHostSequence();
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
