import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  GUIDED_LESSON_BOARD_SESSION,
  LEARN_TO_PLAY_BOARD_SESSION,
  NORMAL_BOARD_SESSION,
} from "../src/components/boardSessionPolicies";
import { contentCatalog } from "../src/content/bootstrap";
import { GuidedBeatBarrier } from "../src/guidance/beatBarrier";
import { AuthoredHostTurnGate } from "../src/guidance/authoredHostTurn";
import { buildGuidedScenario } from "../src/guidance/buildGuidedScenario";
import { FIRST_SEED_LESSON } from "../src/guidance/firstSeedLesson";
import {
  HOW_TO_PLAY_CATALOG,
  LEARN_TO_PLAY_JOURNEY_ID,
  PREPARATION_LESSON_ID,
} from "../src/guidance/howToPlayCatalog";
import { GuidedInteractionGate } from "../src/guidance/interactionGate";
import { GuidedInterventionOrchestrator } from "../src/guidance/interventionOrchestrator";
import { GuidedJourneyLifecycle } from "../src/guidance/journeyLifecycle";
import { JourneyIntentGate, journeyIntentGate } from "../src/guidance/journeyIntentGate";
import {
  LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION,
  LEARN_TO_PLAY_PROLOGUE_SCENARIO,
} from "../src/guidance/learnToPlayPrologue";
import { translate } from "../src/i18n/translations";
import {
  LearnToPlayPrologueDirector,
  learnToPlayFirstDefenseReady,
  learnToPlayHarvesterInspectionReady,
  learnToPlayPlayerTurnActionCueReady,
  learnToPlayReturnSourceRequired,
} from "../src/guidance/learnToPlayDirector";
import { PRODUCT_CONTEXTUAL_CONCEPTS } from "../src/guidance/contextualProductConcepts";
import {
  emptyGuidedProgress,
  GuidedProgressStore,
  guidedJourneyCompleted,
  nextRequiredGuidedLesson,
} from "../src/guidance/progress";
import { GuidedSessionStore } from "../src/guidance/sessionStore";

test("How to Play catalogs the main journey before optional Preparation", () => {
  assert.deepEqual(HOW_TO_PLAY_CATALOG.map(({ id }) => id), [
    LEARN_TO_PLAY_JOURNEY_ID,
    PREPARATION_LESSON_ID,
  ]);
  assert.equal(HOW_TO_PLAY_CATALOG[0].launcher.kind, "journey");
  assert.equal(HOW_TO_PLAY_CATALOG[1].launcher.kind, "guided-lesson");
  assert.equal(FIRST_SEED_LESSON.mode, "optional");
  assert.equal(nextRequiredGuidedLesson([FIRST_SEED_LESSON], emptyGuidedProgress()), undefined);
});

test("Learn to Play keeps the revised Spanish teaching copy exact", () => {
  assert.equal(translate("es", "guided.learnToPlay.intro.beatOne"), "¡Cronista… ayuda!");
  assert.equal(
    translate("es", "guided.learnToPlay.intro.beatFour"),
    "Contemplemos este Futuro. Quizá todavía estemos a tiempo.",
  );
  assert.equal(translate("es", "guided.learnToPlay.intro.evy"), "Evy");
  assert.equal(
    translate("es", "guided.learnToPlay.intro.beatFive"),
    "Esta Visión ya está en marcha. Hay tres Fuentes preparadas, Maela aún resiste y la Hueste se dispone a avanzar. Contempla lo que sucede a partir de aquí.",
  );
  assert.equal(
    translate("es", "guided.learnToPlay.fourthSourceBriefingBody"),
    "Has llegado. Preparemos una Fuente más antes de que la Hueste vuelva a avanzar. Será la cuarta; con ella llenaremos por completo el contenedor de Energía.",
  );
  assert.equal(
    translate("es", "guided.glossary.source.definition"),
    "Al jugar una Fuente, su Energía se acumula en el contenedor de la esquina inferior izquierda. Puedes reunir hasta cuatro para Invocar Ecos y activar Acciones.",
  );
  assert.equal(
    translate("es", "guided.glossary.energy.definition"),
    "Para Invocar Ecos o lanzar Hechizos.",
  );
  assert.equal(
    translate("es", "guided.glossary.echoes.definition"),
    "Combatientes que el Cronista y la Hueste Invocan al Campo. Pueden atacar y defender.",
  );
  assert.equal(
    translate("es", "guided.glossary.host.definition"),
    "Una fuerza implacable que avanza sin esperar órdenes. Invoca sus propios Ecos y los lanza contra el Cronista.",
  );
  assert.equal(
    translate("es", "guided.learnToPlay.fourthSourceBody"),
    "Arrastra la carta hacia el Campo para agregar su Energía al contenedor de la esquina inferior izquierda.",
  );
  assert.equal(
    translate("es", "guided.learnToPlay.invokeAelyraBody"),
    "Aelyra, Heredera de Elarion, necesita 1 de Energía para ser Invocada. Ya tienes suficiente Energía.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.attackArchiveBody"),
    "Tus Ecos atacan únicamente el Archivo de la Hueste. Vacía el Archivo de la Hueste para derrotarla.",
  );
  assert.equal(
    translate("es", "guided.learnToPlay.attackArchiveBody"),
    "Tus Ecos atacan el Archivo, no a los Ecos enemigos. Por cada 3 de daño de ataque, se descarta 1 carta del Archivo de la Hueste a su Memoria. Vacía el Archivo para vencer.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.defenseOrderBody"),
    "La Hueste resuelve sus ataques de izquierda a derecha; un combate anterior puede cambiar lo que sucede después.\n\nHaz clic en un Eco aliado y arrastra el cursor hasta un atacante.\n\nTambién puedes elegir no defender.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.attackExhaustsBody"),
    "Es opcional atacar. Si un Eco ataca, se Agota, por lo que no estará disponible para defender durante el siguiente turno de la Hueste.",
  );
  assert.equal(translate("es", "guided.glossary.hostArchive.label"), "Archivo de la Hueste");
  assert.equal(translate("es", "guided.glossary.hostArchive.definition"), "La pila de Ecos aún no Invocados.");
  assert.equal(translate("es", "guided.glossary.chroniclerArchive.label"), "Archivo del Cronista");
  assert.equal(
    translate("es", "guided.glossary.chroniclerArchive.definition"),
    "La pila de Ecos y Fuentes aún no robados.",
  );
  assert.equal(translate("es", "guided.glossary.life.definition"), "La supervivencia del Cronista.");
  assert.equal(
    translate("es", "guided.glossary.reserve.definition"),
    "Guarda hasta 3 de Energía que no usaste para tu siguiente turno. Esa Energía se utiliza antes que la de tus Fuentes.",
  );
  assert.equal(translate("es", "guided.cardComparison.powerGloss"), "El daño que inflige");
  assert.equal(
    translate("es", "guided.cardComparison.enduranceGloss"),
    "Lo que resiste antes de ser destruido",
  );
  assert.equal(
    translate("es", "guided.contextual.product.surgeBody"),
    "A partir de este turno, la Hueste desata todo su poder e Invoca más Ecos con cada avance.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.emptyHandDrawBody"),
    "Si comienzas tu turno sin Ecos o Fuentes en la Mano, robas 2 cartas en lugar de 1.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.returnSourceBody"),
    "No puedes reunir más de 4 Fuentes. Arrastra Río de Elarion hacia el Archivo del Cronista para colocarlo al fondo y robar otra carta. Jugar o devolver una Fuente consume tu Acción de Fuente del turno.",
  );
  assert.equal(
    translate("es", "guided.learnToPlay.combatStatsBody"),
    "La Fuerza indica cuánto daño inflige un Eco. El Aguante indica cuánto daño puede recibir antes de ser destruido. Cuando dos Ecos combaten, ambos se infligen daño al mismo tiempo.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.assignDefendersBody"),
    "Haz clic en un Eco aliado y arrastra el cursor hasta un Eco atacante. También puedes elegir no defender.",
  );
  assert.equal(translate("es", "guided.contextual.product.markedDamageTitle"), "El daño no permanece");
  assert.equal(
    translate("es", "guided.contextual.product.markedDamageBody"),
    "Al final de cada turno, los Ecos supervivientes recuperan todo su Aguante.",
  );
  assert.equal(translate("es", "guided.contextual.product.attackExhaustsTitle"), "Atacar");
  assert.equal(translate("es", "guided.learnToPlay.playerTurnTitle"), "Ahora es tu turno");
  assert.equal(translate("es", "guided.learnToPlay.playerTurnBody"), "Mira lo que pasa con la Energía.");
  assert.equal(translate("es", "guided.learnToPlay.useEnergyTitle"), "Usa tu Energía para Invocar nuevos Ecos");
  assert.equal(
    translate("es", "guided.learnToPlay.inspectHarvesterBody"),
    "Haz clic derecho sobre Cosechadora de los Caídos para revisar los detalles del Eco y descubrir por qué se activaron sus efectos.",
  );
  assert.equal(
    translate("es", "guided.contextual.product.harvesterInspectionBody"),
    "Haz clic derecho sobre Cosechadora de los Caídos para revisar los detalles del Eco y descubrir por qué se activaron sus efectos.",
  );
});

test("contemplating another future records Learn to Play completion once", () => {
  const progress = new GuidedProgressStore();
  assert.equal(guidedJourneyCompleted(progress.snapshot(), { id: LEARN_TO_PLAY_JOURNEY_ID, revision: 1 }), false);
  assert.equal(progress.markJourneyCompleted(LEARN_TO_PLAY_JOURNEY_ID, 1, "2026-08-17T00:00:00.000Z"), true);
  assert.equal(guidedJourneyCompleted(progress.snapshot(), { id: LEARN_TO_PLAY_JOURNEY_ID, revision: 1 }), true);
  assert.equal(progress.markJourneyCompleted(LEARN_TO_PLAY_JOURNEY_ID, 1, "2026-08-17T01:00:00.000Z"), false);
  assert.equal(progress.snapshot().journeys.length, 1);
});

test("board session policies isolate persistence, outcomes, and guided controls", () => {
  assert.equal(NORMAL_BOARD_SESSION.autosave, true);
  assert.equal(NORMAL_BOARD_SESSION.showStandardOutcome, true);
  assert.equal(NORMAL_BOARD_SESSION.showJourneyDefeat, false);
  assert.equal(GUIDED_LESSON_BOARD_SESSION.autosave, false);
  assert.equal(GUIDED_LESSON_BOARD_SESSION.showPhaseBanner, false);
  assert.equal(GUIDED_LESSON_BOARD_SESSION.showJourneyDefeat, false);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.autosave, false);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.showPhaseBanner, true);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.showStandardOutcome, false);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.showJourneyDefeat, true);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.hostStartDelayMs, 550);
  assert.equal(NORMAL_BOARD_SESSION.hostStartDelayMs, 0);
  assert.equal(LEARN_TO_PLAY_BOARD_SESSION.leaveCopy, "journey");
});

test("journey attempts rebuild from the opening with isolated contextual progress", () => {
  const calls = [];
  let boardRevision = 0;
  const lifecycle = new GuidedJourneyLifecycle(
    { id: LEARN_TO_PLAY_JOURNEY_ID, revision: 1, setupTurns: 0 },
    {
      loadInitialBoard() {
        calls.push("load");
        boardRevision += 1;
        return `game-${boardRevision}`;
      },
      stopPresentation() {
        calls.push("stop-presentation");
      },
    },
    {
      beginSession(gameSessionId, mode) {
        calls.push(`begin:${gameSessionId}:${mode}`);
      },
      rollbackProvisional() {
        calls.push("rollback");
      },
      setProgressMode(mode) {
        calls.push(`mode:${mode}`);
      },
    },
    { stop: () => calls.push("stop-intervention") },
  );

  assert.equal(lifecycle.start(), true);
  assert.equal(lifecycle.snapshot().status, "running");
  assert.equal(lifecycle.snapshot().gameSessionId, "game-1");
  assert.equal(lifecycle.snapshot().attempt, 1);
  assert.equal(lifecycle.restart(), true);
  assert.equal(lifecycle.snapshot().gameSessionId, "game-2");
  assert.equal(lifecycle.snapshot().attempt, 2);
  lifecycle.stop();
  assert.equal(lifecycle.snapshot().status, "aborted");
  assert.equal(calls.filter((call) => call === "load").length, 2);
  assert.equal(calls.includes("mode:immediate"), true);
  assert.ok(calls.indexOf("mode:immediate") < calls.lastIndexOf("stop-presentation"));
  assert.equal(calls.includes("begin:game-1:isolated"), true);
  assert.equal(calls.includes("begin:game-2:isolated"), true);
});

test("a strict intervention attaches to the current board without rebuilding it", () => {
  const built = buildGuidedScenario(FIRST_SEED_LESSON, contentCatalog);
  const currentGame = built.game;
  const gate = new GuidedInteractionGate();
  const session = new GuidedSessionStore(gate, new GuidedBeatBarrier());
  let presentationStops = 0;
  const intervention = new GuidedInterventionOrchestrator(session, {
    readGame: () => currentGame,
    stopPresentation: () => { presentationStops += 1; },
  });
  const definition = {
    id: "learn-to-play.play-card",
    revision: 1,
    startStepId: "explain-card",
    steps: [{
      id: "explain-card",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.firstSourceTitle",
        bodyKey: "guided.firstSeed.firstSourceBody",
      },
      highlights: [{ kind: "card", alias: "first_source" }],
    }],
  };
  const bindings = { first_source: built.bindings.first_source.instanceId };

  const sessionId = intervention.start(definition, bindings, "attached-intervention");
  assert.equal(sessionId, "attached-intervention");
  assert.equal(session.snapshot().status, "running");
  assert.equal(session.snapshot().lessonId, definition.id);
  assert.equal(session.snapshot().currentStep.id, "explain-card");
  assert.strictEqual(currentGame, built.game);
  assert.equal(presentationStops, 0);

  intervention.stop();
  assert.equal(session.snapshot().status, "aborted");
  assert.equal(presentationStops, 1);
  assert.throws(
    () => intervention.start(definition, { first_source: "missing-instance" }),
    /is not on the current board/u,
  );
});

test("journey limits are ephemeral and product concepts cover every prologue explanation", () => {
  const gate = new JourneyIntentGate();
  gate.activate({
    journeyId: LEARN_TO_PLAY_JOURNEY_ID,
    authorize: (intent) => intent.kind === "phase.endTurn"
      ? { allowed: false, guidanceId: "fixture", relatedCardIds: ["vaelor"] }
      : { allowed: true },
  });
  assert.deepEqual(gate.authorize({ kind: "phase.endTurn" }), {
    allowed: false,
    guidanceId: "fixture",
    relatedCardIds: ["vaelor"],
  });
  assert.equal(gate.authorize({ kind: "phase.chooseAttackers" }).allowed, true);
  gate.deactivate(LEARN_TO_PLAY_JOURNEY_ID);
  assert.equal(gate.authorize({ kind: "phase.endTurn" }).allowed, true);

  assert.deepEqual(PRODUCT_CONTEXTUAL_CONCEPTS.map((concept) => concept.id), [
    "host-defense-order",
    "assign-defenders",
    "flying-defense-restriction",
    "chronicler-life",
    "marked-damage-clears",
    "reserve-and-ready",
    "stabilizing-restriction",
    "attack-the-host-archive",
    "attack-exhausts-echo",
    "host-surge",
    "empty-hand-draw",
    "return-source",
    "learn-to-play-vaelor-required",
  ]);
});

test("normal matches teach one defender directly and combine assignment with order for multiple attackers", () => {
  const attack = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "attack-the-host-archive");
  const defense = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "assign-defenders");
  const order = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "host-defense-order");
  assert.equal(attack.policy, "preventive");
  assert.deepEqual(
    attack.prevent({ kind: "combat.confirmArchiveAttack", targetIds: ["maela"] }, {}),
    {
      highlights: [{ kind: "surface", anchor: "host.archive" }],
    },
  );
  const singleAttack = { kind: "host.attackersDeclared", attackerIds: ["thief"] };
  const multipleAttacks = { kind: "host.attackersDeclared", attackerIds: ["thief", "harvester"] };
  assert.deepEqual(defense.evaluate(singleAttack, {}), {
    highlights: [{ kind: "surface", anchor: "player.field", showHighlight: false }],
    placement: "left",
  });
  assert.equal(defense.evaluate(multipleAttacks, {}), undefined);
  assert.deepEqual(order.signalKinds, ["host.attackersDeclared"]);
  assert.equal(order.persistWhenAcknowledgedInIsolated, true);
  assert.equal(order.evaluate(singleAttack, {}), undefined);
  assert.deepEqual(order.evaluate(multipleAttacks, {}), {
    highlights: [{ kind: "surface", anchor: "player.field", showHighlight: false }],
    placement: "left",
  });
});

test("marked combat damage highlights every affected Echo and owns the next-turn handoff", () => {
  const concept = PRODUCT_CONTEXTUAL_CONCEPTS.find((candidate) => candidate.id === "marked-damage-clears");
  const life = PRODUCT_CONTEXTUAL_CONCEPTS.find((candidate) => candidate.id === "chronicler-life");
  assert.equal(concept.revision, 2);
  assert.ok(concept.priority < life.priority, "Endurance recovery must be the final help before Mi Turno");
  const game = buildGuidedScenario(LEARN_TO_PLAY_PROLOGUE_SCENARIO, contentCatalog).game;
  const playerEcho = game.player.field.find((card) => card.kinds.includes("ECHO"));
  const hostEcho = game.host.field.find((card) => card.kinds.includes("ECHO"));
  playerEcho.damageMarked = 1;
  hostEcho.damageMarked = 2;
  const signal = {
    kind: "combat.echoesDamaged",
    cardIds: [playerEcho.instanceId, hostEcho.instanceId],
    amount: 2,
    turnNumber: game.turnNumber,
  };
  const context = { game };

  assert.equal(concept.policy, "preventive");
  assert.equal(concept.persistWhenAcknowledgedInIsolated, true);
  assert.deepEqual(concept.evaluate(signal, context), {
    highlights: [
      { kind: "card", instanceId: playerEcho.instanceId, padding: 18 },
      { kind: "card", instanceId: hostEcho.instanceId, padding: 18 },
    ],
    placement: "center",
  });
  assert.deepEqual(concept.prevent({ kind: "phase.startPlayerTurn" }, context), {
    highlights: [
      { kind: "card", instanceId: playerEcho.instanceId, padding: 18 },
      { kind: "card", instanceId: hostEcho.instanceId, padding: 18 },
    ],
    placement: "center",
  });
  assert.equal(concept.prevent({ kind: "phase.endTurn" }, context), undefined);

  playerEcho.damageMarked = 0;
  hostEcho.damageMarked = 0;
  assert.equal(concept.revalidate(concept.evaluate(signal, context), context), false);
});

test("dragging a ground Echo onto a Flying attacker preserves the denied target for contextual guidance", async () => {
  const battlefield = await readFile(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  assert.match(battlefield, /return reason \? \{ attackerId: candidateId, reason \} : \{ attackerId: candidateId \};/u);
  assert.match(
    battlefield,
    /if \(dropResult\.attackerId && dropResult\.reason\) \{\s*useGameStore\.getState\(\)\.declareBlocker\(blockerId, dropResult\.attackerId\);/u,
  );
  const flying = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "flying-defense-restriction");
  assert.deepEqual(flying.signalKinds, ["action.denied"]);
  assert.equal(flying.copy.titleKey, "guided.contextual.product.flyingDefenseTitle");
  assert.deepEqual(flying.evaluate({
    kind: "action.denied",
    code: "BLOCK_REQUIRES_FLYING_OR_SKYGUARD",
    intent: { kind: "combat.assignBlocker", cardId: "ground:1", targetId: "flying:1" },
  }, {}), {
    highlights: [
      { kind: "card", instanceId: "ground:1" },
      { kind: "card", instanceId: "flying:1", padding: 18, offsetX: 16 },
    ],
    placement: "center",
  });
});

test("the Vaelor reminder expires as soon as Vaelor leaves the Hand", () => {
  const reminder = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "learn-to-play-vaelor-required");
  const match = reminder.evaluate({
    kind: "intent.attempted",
    authorization: "journey-blocked",
    guidanceId: "learn-to-play.vaelor-required",
    relatedCardIds: ["vaelor:1"],
  }, {});
  assert.ok(match);
  assert.equal(reminder.revalidate(match, { game: { player: { hand: [{ instanceId: "vaelor:1" }] } } }), true);
  assert.equal(reminder.revalidate(match, { game: { player: { hand: [] } } }), false);
});

test("the Harvester inspection cannot block combat after the prologue has entered post-Surge play", () => {
  const game = {
    hostTurnNumber: 10,
    activeSide: "player",
    hostRules: { surgeTurn: 10 },
    player: {
      hand: [],
      field: [{ instanceId: "vaelor:1" }],
      energyActionUsedThisTurn: true,
    },
    host: { field: [{ instanceId: "harvester:1" }] },
  };
  const director = new LearnToPlayPrologueDirector(
    { readStore: () => ({ game }) },
    { start() {}, stop() {} },
  );
  director.start({
    vaelor: "vaelor:1",
    harvester: "harvester:1",
    return_to_memory: "gone:return",
    first_winged_stalker: "gone:stalker-a",
    second_winged_stalker: "gone:stalker-b",
    stitched_wing_spawn: "gone:spawn",
    post_surge_source: "gone:source",
  }, "post-surge-regression");
  try {
    assert.deepEqual(journeyIntentGate.authorize({ kind: "phase.chooseAttackers" }), { allowed: true });
  } finally {
    director.stop();
  }
});

test("journey-authored milestones ignore global contextual progress and remain fact-driven", () => {
  const bindings = {
    vaelor: "vaelor:1",
    harvester: "harvester:1",
    return_to_memory: "gone:return",
    first_winged_stalker: "gone:stalker-a",
    second_winged_stalker: "gone:stalker-b",
    stitched_wing_spawn: "gone:spawn",
    post_surge_source: "river:5",
  };
  const beforeSurge = {
    hostTurnNumber: 9,
    hostRules: { surgeTurn: 10 },
    player: {
      field: [{ instanceId: "vaelor:1" }],
      hand: [],
      energyActionUsedThisTurn: false,
    },
    host: { field: [{ instanceId: "harvester:1" }] },
  };
  const firstDefense = {
    ...beforeSurge,
    activeSide: "host",
    combat: { hostAttackers: ["stalker:1"] },
  };
  assert.equal(learnToPlayFirstDefenseReady(firstDefense, false, false), true);
  assert.equal(learnToPlayFirstDefenseReady(firstDefense, true, false), false);
  assert.equal(learnToPlayFirstDefenseReady(firstDefense, false, true), false);
  assert.equal(learnToPlayHarvesterInspectionReady(beforeSurge, bindings, false), true);
  assert.equal(learnToPlayHarvesterInspectionReady({
    ...beforeSurge,
    eventQueue: [{
      id: "vaelor-volley:1",
      type: "COUNTER_VOLLEY",
      sourceId: "vaelor:1",
      payload: { deferForPresentation: true },
    }],
  }, bindings, false), false, "the Harvester prompt must wait for Vaelor's queued Invoked effect");
  assert.equal(learnToPlayHarvesterInspectionReady({
    ...beforeSurge,
    host: { field: [{ instanceId: "harvester:1" }, { instanceId: "unexpected-survivor:1" }] },
  }, bindings, false), true);
  assert.equal(learnToPlayHarvesterInspectionReady(beforeSurge, bindings, true), false);
  assert.equal(learnToPlayHarvesterInspectionReady({
    ...beforeSurge,
    hostTurnNumber: 10,
  }, bindings, false), false);

  const sourceTurn = {
    ...beforeSurge,
    hostTurnNumber: 10,
    activeSide: "player",
    player: {
      ...beforeSurge.player,
      hand: [{ instanceId: "river:5" }],
      energyActionUsedThisTurn: false,
    },
  };
  assert.equal(learnToPlayReturnSourceRequired(sourceTurn, bindings), true);
  assert.equal(learnToPlayReturnSourceRequired({
    ...sourceTurn,
    player: { ...sourceTurn.player, energyActionUsedThisTurn: true },
  }, bindings), false);
});

test("post-Surge concepts react only to the real empty-Hand draw and the required Source", () => {
  const emptyHand = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "empty-hand-draw");
  const returnSource = PRODUCT_CONTEXTUAL_CONCEPTS.find((concept) => concept.id === "return-source");
  const context = {
    game: {
      player: {
        hand: [
          { instanceId: "river:1", kinds: ["SOURCE"] },
          { instanceId: "spell:1", kinds: ["SPELL"] },
        ],
      },
    },
  };

  assert.deepEqual(emptyHand.evaluate({
    kind: "player.cardsDrawn",
    amount: 2,
    reason: "empty-hand",
    cardIds: ["river:1", "spell:1"],
  }, context), { placement: "center" });
  assert.equal(emptyHand.blocksGameplayWhileVisible, true);
  assert.deepEqual(emptyHand.copy.glossaryTerms ?? [], []);
  assert.equal(emptyHand.evaluate({
    kind: "player.cardsDrawn",
    amount: 2,
    reason: "easy",
    cardIds: ["river:1", "spell:1"],
  }, context), undefined);

  const fifthSource = returnSource.evaluate({
    kind: "action.denied",
    code: "SOURCE_LIMIT_REACHED",
    intent: { kind: "card.play", cardId: "river:1" },
  }, context);
  assert.deepEqual(fifthSource, {
    highlights: [
      { kind: "card", instanceId: "river:1" },
      { kind: "surface", anchor: "player.archive" },
    ],
  });
  assert.equal(returnSource.evaluate({
    kind: "intent.attempted",
    authorization: "journey-blocked",
    guidanceId: "learn-to-play.return-source-required",
    relatedCardIds: ["river:1"],
  }, context), undefined);
  assert.equal(returnSource.revalidate(fifthSource, context), true);
  assert.equal(returnSource.revalidate(fifthSource, {
    game: { player: { hand: [{ instanceId: "spell:1", kinds: ["SPELL"] }] } },
  }), false);
});

test("authored Host-turn policies are scoped and reject invalid reveal plans", () => {
  const gate = new AuthoredHostTurnGate();
  gate.activate({
    journeyId: "learn-to-play",
    plan: () => ({ revealCount: 4, reason: "lost-future" }),
  });
  assert.deepEqual(gate.plan({}), { revealCount: 4, reason: "lost-future" });
  gate.deactivate("another-journey");
  assert.equal(gate.plan({}).revealCount, 4);
  gate.deactivate("learn-to-play");
  assert.equal(gate.plan({}), undefined);

  gate.activate({
    journeyId: "learn-to-play",
    plan: () => ({ revealCount: 0, reason: "invalid" }),
  });
  assert.throws(() => gate.plan({}), /Invalid authored Host reveal count/u);
});

test("App exposes both launchers, disables Continue, and hands the journey to its approved first Canon future", async () => {
  const [app, menu, board, intro] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/StartMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/LearnToPlayIntroModal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /HOW_TO_PLAY_CATALOG\.map/u);
  assert.match(app, /onLaunch: launchLearnToPlayJourney/u);
  assert.match(app, /function launchLearnToPlayJourney\(\)\s*\{\s*setLearnToPlayIntroOpen\(true\);\s*\}/u);
  assert.match(app, /chroniclerName=\{playerName\}/u);
  assert.match(app, /onComplete=\{beginLearnToPlayJourney\}/u);
  assert.match(app, /function beginLearnToPlayJourney\(\)[\s\S]*?learnToPlayJourneyLifecycle\.start\(\)[\s\S]*?setScreen\("journey"\)/u);
  assert.match(app, /howToPlayEntries=\{howToPlayEntries\}/u);
  assert.match(app, /continueDisabled/u);
  assert.match(app, /if \(!productResumeRuntime\.enabled \|\| !boardSessionPolicy\.autosave \|\| screen !== "game"\) return;/u);
  assert.match(app, /guidedProgressStore\.markJourneyCompleted\(LEARN_TO_PLAY_JOURNEY\.id, LEARN_TO_PLAY_JOURNEY\.revision\)/u);
  assert.match(app, /createLearnToPlayFirstMatchOrigin\(\)/u);
  assert.match(app, /beginDestinyTransition\("contemplate", "learn-to-play-first-seed"\)/u);
  assert.match(app, /transition\.destination === "learn-to-play-first-seed"/u);
  assert.match(app, /screen === "journey"[\s\S]*?continueLearnToPlayIntoFirstCanonFuture/u);
  assert.match(menu, /howToPlayEntries\.map/u);
  assert.match(menu, /disabled=\{continueDisabled \|\| !onContinue\}/u);
  assert.match(board, /sessionPolicy\.showStandardOutcome && defeatReady/u);
  assert.match(board, /sessionPolicy\.showJourneyDefeat && defeatReady && onContemplateFuture/u);
  assert.match(board, /!sessionPolicy\.showPhaseBanner/u);
  assert.equal((intro.match(/body: "guided\.learnToPlay\.intro\.beat(?:One|Two|Three|Four|Five)"/gu) ?? []).length, 5);
  assert.match(intro, /chroniclerName\.trim\(\) \|\| t\("guided\.learnToPlay\.intro\.chronicler"\)/u);
  assert.match(intro, /finalBeat[\s\S]*?onComplete\(\)/u);
  assert.match(intro, /<GuidedTutorialDialog/u);
  assert.match(intro, /learn-to-play-intro-progress/u);
  assert.doesNotMatch(intro, /old-panel|old-title|game-home-dialog/u);
});

test("Learn to Play explains Reserve before drawing Flor and only then opens free Echo play", () => {
  const step = (id) => LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.steps.find((candidate) => candidate.id === id);

  assert.equal(LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.revision, 4);
  assert.deepEqual(LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION.steps.map(({ id }) => id), [
    "player-turn-returned",
    "explain-renewed-energy",
    "wait-for-energy-renewal",
    "use-energy-for-echoes",
  ]);
  assert.deepEqual(step("player-turn-returned").highlights, [
    { kind: "surface", anchor: "player.sources" },
  ]);
  assert.equal(step("player-turn-returned").nextStepId, "explain-renewed-energy");
  assert.deepEqual(step("explain-renewed-energy").highlights, [
    { kind: "surface", anchor: "player.sources" },
    { kind: "surface", anchor: "player.reserve" },
  ]);
  assert.equal(step("explain-renewed-energy").nextStepId, "wait-for-energy-renewal");
  assert.equal(step("wait-for-energy-renewal").nextStepId, "use-energy-for-echoes");
});

test("Learn to Play highlights Mi Turno only at the settled pre-Surge handoff", () => {
  const built = buildGuidedScenario(LEARN_TO_PLAY_PROLOGUE_SCENARIO, contentCatalog);
  const game = structuredClone(built.game);
  game.activeSide = "host";
  game.hostTurnNumber = game.hostRules.surgeTurn - 1;
  game.combat.hostAttackers = [];

  assert.equal(learnToPlayPlayerTurnActionCueReady(game, "free-play", false), true);
  assert.equal(learnToPlayPlayerTurnActionCueReady(game, "free-play", true), false);
  assert.equal(learnToPlayPlayerTurnActionCueReady(game, "defense-intro", false), false);

  game.combat.hostAttackers = [game.host.field[0].instanceId];
  assert.equal(learnToPlayPlayerTurnActionCueReady(game, "free-play", false), false);
  game.combat.hostAttackers = [];
  game.hostTurnNumber = game.hostRules.surgeTurn;
  assert.equal(learnToPlayPlayerTurnActionCueReady(game, "free-play", false), false);
});
