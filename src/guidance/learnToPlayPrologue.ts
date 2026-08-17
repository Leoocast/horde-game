import type { GuidedInterventionDefinition, GuidedScenarioDefinition } from "./contracts";

const ELARION = "hostfall.core/pact_of_elarion";
const GRAVELESS = "hostfall.core/uprising_of_the_graveless";
const elarionCard = (id: string) => `${ELARION}/${id}`;
const gravelessCard = (id: string) => `${GRAVELESS}/${id}`;

/**
 * Exact advanced Future used by the first playable section of Learn to Play. Host turn 9 is the
 * ordinary turn between the two Chronicler turns; Host turn 10 is the first Surge.
 */
export const LEARN_TO_PLAY_PROLOGUE_SCENARIO = Object.freeze({
  id: "learn-to-play-prologue",
  revision: 1,
  scenario: {
    seed: "learn-to-play-prologue-v1",
    playerDeckKey: ELARION,
    hostDeckKey: GRAVELESS,
    difficulty: "normal",
    activeSide: "player",
    phase: "main",
    turnNumber: 9,
    hostTurnNumber: 8,
    setupTurnsTotal: 0,
    setupTurnsRemaining: 0,
    setupCompletePendingHost: false,
    openingHandAccepted: true,
    mulligansTaken: 0,
    player: {
      life: 31,
      availableEnergy: 0,
      storedEnergy: 0,
      pendingStoredEnergy: 0,
      energyActionUsedThisTurn: false,
      lifePaidThisTurn: 0,
      lifeLostThisTurn: 0,
    },
    host: { poisonCounters: 0 },
    zones: {
      openingDeal: ["fourth_source", "aelyra", "vaelor"],
      playerArchiveTopToBottom: ["dawn_flower"],
      playerField: ["maela", "source_one", "source_two", "source_three"],
      playerMemory: [],
      playerOblivion: [],
      hostArchiveTopToBottom: [
        // Maela's required opening attack discards this Soldier without consuming a later beat.
        "opening_attack_discard",
        "second_winged_stalker",
        // Return to Memory consumes these two before the first Surge.
        "return_mill_one",
        "return_mill_two",
        // The next four cards are robust against the optional pre-Surge Archive discard.
        "memory_thief_a",
        "memory_thief_b",
        "surge_titan",
        "surge_soldier",
      ],
      hostField: [
        "return_to_memory",
        "first_winged_stalker",
        "stitched_wing_spawn",
        "harvester",
      ],
      hostMemory: [],
      hostOblivion: [],
    },
    combat: { playerAttackers: [], hostAttackers: [], blockers: {} },
  },
  cards: {
    fourth_source: { cardKey: elarionCard("river_of_elarion") },
    aelyra: { cardKey: elarionCard("aelyra_heir_of_elarion") },
    vaelor: { cardKey: elarionCard("vaelor_emerald_guardian") },
    dawn_flower: { cardKey: elarionCard("veiled_dawn_flower") },
    maela: { cardKey: elarionCard("maela_watcher_of_the_heights") },
    source_one: { cardKey: elarionCard("river_of_elarion") },
    source_two: { cardKey: elarionCard("river_of_elarion") },
    source_three: { cardKey: elarionCard("river_of_elarion") },
    return_to_memory: { cardKey: gravelessCard("return_to_memory") },
    first_winged_stalker: { cardKey: gravelessCard("winged_stalker_of_the_crypt") },
    stitched_wing_spawn: { cardKey: gravelessCard("stitched_wing_spawn") },
    harvester: {
      cardKey: gravelessCard("harvester_of_the_fallen"),
      state: { counters: { "+1/+1": 2 } },
    },
    second_winged_stalker: { cardKey: gravelessCard("winged_stalker_of_the_crypt") },
    opening_attack_discard: { cardKey: gravelessCard("graveless_soldier") },
    return_mill_one: { cardKey: gravelessCard("graveless_soldier") },
    return_mill_two: { cardKey: gravelessCard("graveless_soldier") },
    memory_thief_a: { cardKey: gravelessCard("memory_thief") },
    memory_thief_b: { cardKey: gravelessCard("memory_thief") },
    surge_titan: { cardKey: gravelessCard("graveless_titan") },
    surge_soldier: { cardKey: gravelessCard("graveless_soldier") },
  },
} satisfies GuidedScenarioDefinition);

/** Strict opening intervention. Target selection remains free between the engine's legal allies. */
export const LEARN_TO_PLAY_OPENING_INTERVENTION = Object.freeze({
  id: "learn-to-play.opening",
  revision: 1,
  startStepId: "play-fourth-source",
  steps: [
    {
      id: "play-fourth-source",
      kind: "act",
      copy: {
        titleKey: "guided.learnToPlay.fourthSourceTitle",
        bodyKey: "guided.learnToPlay.fourthSourceBody",
        glossaryTerms: ["source", "energy"],
      },
      highlights: [
        { kind: "card", alias: "fourth_source", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      presentation: { kind: "directionalCue", direction: "up", tone: "source" },
      allowedIntent: { kind: "card.play", cardAlias: "fourth_source" },
      preconditions: [{ kind: "card.inZone", cardAlias: "fourth_source", side: "player", zone: "hand" }],
      nextStepId: "observe-fourth-source",
    },
    {
      id: "observe-fourth-source",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.learnToPlay.checkpointTitle", bodyKey: "guided.learnToPlay.checkpointBody" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      expectedReceipt: { kind: "source.played", cardAlias: "fourth_source" },
      preconditions: [{ kind: "card.inZone", cardAlias: "fourth_source", side: "player", zone: "field" }],
      nextStepId: "invoke-aelyra",
    },
    {
      id: "invoke-aelyra",
      kind: "act",
      copy: {
        titleKey: "guided.learnToPlay.invokeAelyraTitle",
        bodyKey: "guided.learnToPlay.invokeAelyraBody",
        glossaryTerms: ["invoke", "energy"],
      },
      highlights: [
        { kind: "card", alias: "aelyra", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      presentation: { kind: "directionalCue", direction: "up", tone: "source" },
      allowedIntent: { kind: "card.play", cardAlias: "aelyra" },
      preconditions: [{ kind: "card.inZone", cardAlias: "aelyra", side: "player", zone: "hand" }],
      nextStepId: "choose-aelyra-target",
    },
    {
      id: "choose-aelyra-target",
      kind: "act",
      callout: "hidden",
      copy: {
        titleKey: "guided.learnToPlay.chooseAelyraTargetTitle",
        bodyKey: "guided.learnToPlay.chooseAelyraTargetBody",
      },
      highlights: [
        { kind: "card", alias: "aelyra" },
        { kind: "card", alias: "maela" },
      ],
      allowedIntent: {
        kind: "target.choose",
        context: "trigger",
        targetAliasOptions: ["aelyra", "maela"],
        targetCount: 1,
      },
      preconditions: [{ kind: "card.inZone", cardAlias: "aelyra", side: "player", zone: "field" }],
      nextStepId: "confirm-aelyra-target",
    },
    {
      id: "confirm-aelyra-target",
      kind: "act",
      callout: "hidden",
      copy: {
        titleKey: "guided.learnToPlay.confirmAelyraTargetTitle",
        bodyKey: "guided.learnToPlay.confirmAelyraTargetBody",
      },
      highlights: [{ kind: "surface", anchor: "selection.primaryAction" }],
      allowedIntent: {
        kind: "target.confirm",
        context: "trigger",
        targetAliasOptions: ["aelyra", "maela"],
        targetCount: 1,
      },
      nextStepId: "observe-aelyra",
    },
    {
      id: "observe-aelyra",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.learnToPlay.checkpointTitle", bodyKey: "guided.learnToPlay.checkpointBody" },
      highlights: [{ kind: "card", alias: "aelyra" }],
      expectedReceipt: { kind: "target.confirmed", reason: "trigger" },
      nextStepId: "enter-first-combat",
    },
    {
      id: "enter-first-combat",
      kind: "act",
      callout: "hidden",
      copy: {
        titleKey: "guided.learnToPlay.finishOpeningTurnTitle",
        bodyKey: "guided.learnToPlay.finishOpeningTurnBody",
      },
      highlights: [{ kind: "surface", anchor: "phase.primaryAction" }],
      presentation: { kind: "spotlight", tone: "gold" },
      allowedIntent: { kind: "phase.chooseAttackers" },
      nextStepId: "select-maela-attacker",
    },
    {
      id: "select-maela-attacker",
      kind: "act",
      callout: "hidden",
      copy: {
        titleKey: "guided.learnToPlay.passOpeningCombatTitle",
        bodyKey: "guided.learnToPlay.passOpeningCombatBody",
      },
      highlights: [{ kind: "card", alias: "maela", role: "origin" }],
      presentation: { kind: "directionalCue", direction: "up", tone: "attack" },
      allowedIntent: { kind: "combat.toggleAttacker", cardAlias: "maela", selected: true },
    },
  ],
} satisfies GuidedInterventionDefinition);

/** Silent hand-off shown after Maela's Archive attack and its contextual explanations settle. */
export const LEARN_TO_PLAY_END_OPENING_TURN_INTERVENTION = Object.freeze({
  id: "learn-to-play.end-opening-turn",
  revision: 1,
  startStepId: "end-opening-turn",
  steps: [
    {
      id: "end-opening-turn",
      kind: "act",
      callout: "hidden",
      copy: {
        titleKey: "guided.learnToPlay.endOpeningTurnTitle",
        bodyKey: "guided.learnToPlay.endOpeningTurnBody",
      },
      highlights: [{ kind: "surface", anchor: "phase.primaryAction" }],
      presentation: { kind: "spotlight", tone: "gold" },
      allowedIntent: { kind: "phase.endTurn" },
    },
  ],
} satisfies GuidedInterventionDefinition);

/** Confirmed first-defense introduction, started only after Host arrivals and attack beats settle. */
export const LEARN_TO_PLAY_FIRST_DEFENSE_INTERVENTION = Object.freeze({
  id: "learn-to-play.first-defense",
  revision: 1,
  startStepId: "host-turn",
  steps: [
    {
      id: "host-turn",
      kind: "explain",
      copy: {
        titleKey: "guided.learnToPlay.hostTurnTitle",
        bodyKey: "guided.learnToPlay.hostTurnBody",
        glossaryTerms: ["host"],
      },
      highlights: [],
      nextStepId: "explain-combat-stats",
    },
    {
      id: "explain-combat-stats",
      kind: "explain",
      copy: {
        titleKey: "guided.learnToPlay.combatStatsTitle",
        bodyKey: "guided.learnToPlay.combatStatsBody",
        glossaryTerms: ["echoes"],
      },
      highlights: [],
      presentation: {
        kind: "cardComparison",
        cardAliases: ["return_to_memory", "maela"],
        emphasis: "combatStats",
      },
    },
  ],
} satisfies GuidedInterventionDefinition);

export const LEARN_TO_PLAY_HARVESTER_INSPECTION = Object.freeze({
  id: "learn-to-play.inspect-harvester",
  revision: 1,
  startStepId: "inspect-harvester",
  steps: [
    {
      id: "inspect-harvester",
      kind: "act",
      copy: {
        titleKey: "guided.learnToPlay.inspectHarvesterTitle",
        bodyKey: "guided.learnToPlay.inspectHarvesterBody",
      },
      highlights: [{ kind: "card", alias: "harvester" }],
      allowedIntent: { kind: "card.inspect", cardAlias: "harvester" },
      preconditions: [{ kind: "card.inZone", cardAlias: "harvester", side: "host", zone: "field" }],
    },
  ],
} satisfies GuidedInterventionDefinition);
