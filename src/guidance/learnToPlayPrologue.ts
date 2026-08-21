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
      // Hand order is also visual stacking order: later cards sit naturally above earlier ones.
      // Keep Aelyra between Vaelor and Río so her guided spotlight does not reveal Vaelor.
      openingDeal: ["vaelor", "aelyra", "fourth_source"],
      playerArchiveTopToBottom: [
        "dawn_flower",
        // The empty-Hand draw appends in this order, leaving Río at the right edge of the Hand.
        "clash_of_echoes",
        "post_surge_source",
        "forgotten_city",
      ],
      playerField: ["maela", "source_one", "source_two", "source_three"],
      playerMemory: [],
      playerOblivion: [],
      hostArchiveTopToBottom: [
        "second_winged_stalker",
        // Return to Memory consumes these two before the first Surge.
        "return_mill_one",
        "return_mill_two",
        // The next four cards are robust against the optional pre-Surge Archive discard.
        "memory_thief_a",
        "memory_thief_b",
        "surge_titan",
        "surge_soldier",
        // If the player attacks, combat takes this expendable Soldier from the authored bottom
        // instead of consuming the next reveal. Passing leaves it harmlessly behind the Surge line.
        "opening_attack_discard",
        // The collapse of the lost Future begins here. Once Surge is active, optional Archive
        // damage consumes the three marked Soldiers before it can touch the required Titan.
        "terminal_titan",
        "terminal_guard_one",
        "terminal_guard_two",
        "terminal_guard_three",
        "terminal_soldier_01",
        "terminal_soldier_02",
        "terminal_soldier_03",
        "terminal_soldier_04",
        "terminal_soldier_05",
        "terminal_soldier_06",
        "terminal_soldier_07",
        "terminal_soldier_08",
        "terminal_soldier_09",
        "terminal_soldier_10",
        "terminal_soldier_11",
        "terminal_soldier_12",
        "terminal_soldier_13",
        "terminal_soldier_14",
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
    post_surge_source: { cardKey: elarionCard("river_of_elarion") },
    clash_of_echoes: { cardKey: elarionCard("clash_of_echoes") },
    forgotten_city: { cardKey: elarionCard("echo_of_the_forgotten_city") },
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
    opening_attack_discard: {
      cardKey: gravelessCard("graveless_soldier"),
      state: { flags: { playerCombatArchiveDiscardPriority: true, learnToPlayTerminalCard: true } },
    },
    return_mill_one: { cardKey: gravelessCard("graveless_soldier") },
    return_mill_two: { cardKey: gravelessCard("graveless_soldier") },
    memory_thief_a: { cardKey: gravelessCard("memory_thief") },
    memory_thief_b: { cardKey: gravelessCard("memory_thief") },
    surge_titan: { cardKey: gravelessCard("graveless_titan") },
    surge_soldier: {
      cardKey: gravelessCard("graveless_soldier"),
      state: { flags: { learnToPlayTerminalCard: true } },
    },
    terminal_titan: {
      cardKey: gravelessCard("graveless_titan"),
      state: { flags: { learnToPlayTerminalCard: true, learnToPlayTerminalTitan: true } },
    },
    terminal_guard_one: {
      cardKey: gravelessCard("graveless_soldier"),
      state: { flags: { learnToPlayTerminalCard: true, playerCombatArchiveDiscardPriorityInSurge: true } },
    },
    terminal_guard_two: {
      cardKey: gravelessCard("graveless_soldier"),
      state: { flags: { learnToPlayTerminalCard: true, playerCombatArchiveDiscardPriorityInSurge: true } },
    },
    terminal_guard_three: {
      cardKey: gravelessCard("graveless_soldier"),
      state: { flags: { learnToPlayTerminalCard: true, playerCombatArchiveDiscardPriorityInSurge: true } },
    },
    ...Object.fromEntries(Array.from({ length: 14 }, (_, index) => [
      `terminal_soldier_${String(index + 1).padStart(2, "0")}`,
      {
        cardKey: gravelessCard("graveless_soldier"),
        state: { flags: { learnToPlayTerminalCard: true } },
      },
    ])),
  },
} satisfies GuidedScenarioDefinition);

/** Strict opening intervention. Target selection remains free between the engine's legal allies. */
export const LEARN_TO_PLAY_OPENING_INTERVENTION = Object.freeze({
  id: "learn-to-play.opening",
  revision: 2,
  startStepId: "evy-fourth-source-briefing",
  steps: [
    {
      id: "evy-fourth-source-briefing",
      kind: "explain",
      copy: {
        titleKey: "guided.learnToPlay.intro.evy",
        bodyKey: "guided.learnToPlay.fourthSourceBriefingBody",
        glossaryTerms: ["source", "energy"],
      },
      highlights: [],
      nextStepId: "play-fourth-source",
    },
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
      dimmer: "hidden",
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
      dimmer: "hidden",
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
    },
  ],
} satisfies GuidedInterventionDefinition);

/** First Battle explanation, opened by the phase transition rather than by an attack attempt. */
export const LEARN_TO_PLAY_FIRST_BATTLE_INTERVENTION = Object.freeze({
  id: "learn-to-play.first-battle",
  revision: 1,
  startStepId: "attack-host-archive",
  steps: [
    {
      id: "attack-host-archive",
      kind: "explain",
      copy: {
        titleKey: "guided.contextual.product.attackArchiveTitle",
        bodyKey: "guided.contextual.product.attackArchiveBody",
        glossaryTerms: ["hostArchive", "echoes"],
      },
      highlights: [{ kind: "surface", anchor: "host.archive" }],
      nextStepId: "attacking-is-optional",
    },
    {
      id: "attacking-is-optional",
      kind: "explain",
      copy: {
        titleKey: "guided.contextual.product.attackExhaustsTitle",
        bodyKey: "guided.contextual.product.attackExhaustsBody",
        glossaryTerms: ["exhausted", "echoes"],
      },
      highlights: [],
    },
  ],
} satisfies GuidedInterventionDefinition);

/** Silent hand-off shown after the first Battle and its authored explanations settle. */
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
  startStepId: "wait-for-host-arrivals",
  steps: [
    {
      id: "wait-for-host-arrivals",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.learnToPlay.checkpointTitle", bodyKey: "guided.learnToPlay.checkpointBody" },
      highlights: [],
      nextStepId: "host-turn",
    },
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

/** First player turn after defending: pause before the hand-off, observe Energy, then set the goal. */
export const LEARN_TO_PLAY_PLAYER_RETURN_INTERVENTION = Object.freeze({
  id: "learn-to-play.player-return",
  revision: 2,
  startStepId: "player-turn-returned",
  steps: [
    {
      id: "player-turn-returned",
      kind: "explain",
      copy: {
        titleKey: "guided.learnToPlay.playerTurnTitle",
        bodyKey: "guided.learnToPlay.playerTurnBody",
        glossaryTerms: ["energy"],
      },
      highlights: [],
      nextStepId: "wait-for-energy-renewal",
    },
    {
      id: "wait-for-energy-renewal",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.learnToPlay.checkpointTitle", bodyKey: "guided.learnToPlay.checkpointBody" },
      highlights: [],
      expectedReceipt: { kind: "reserve.released" },
      nextStepId: "explain-renewed-energy",
    },
    {
      id: "explain-renewed-energy",
      kind: "explain",
      copy: {
        titleKey: "guided.contextual.product.reserveTitle",
        bodyKey: "guided.contextual.product.reserveBody",
        glossaryTerms: ["source", "energy", "reserve"],
      },
      highlights: [
        { kind: "surface", anchor: "player.sources" },
        { kind: "surface", anchor: "player.reserve" },
      ],
      nextStepId: "use-energy-for-echoes",
    },
    {
      id: "use-energy-for-echoes",
      kind: "explain",
      copy: {
        titleKey: "guided.learnToPlay.useEnergyTitle",
        bodyKey: "guided.learnToPlay.useEnergyBody",
        glossaryTerms: ["energy", "invoke", "echoes"],
      },
      highlights: [],
    },
  ],
} satisfies GuidedInterventionDefinition);

export const LEARN_TO_PLAY_HARVESTER_INSPECTION = Object.freeze({
  id: "learn-to-play.inspect-harvester",
  revision: 1,
  startStepId: "wait-for-vaelor-aftermath",
  steps: [
    {
      id: "wait-for-vaelor-aftermath",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.learnToPlay.checkpointTitle", bodyKey: "guided.learnToPlay.checkpointBody" },
      highlights: [],
      nextStepId: "inspect-harvester",
    },
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

/** Strict only after the player tries to play the fifth Source or leave Main without returning it. */
export const LEARN_TO_PLAY_RETURN_SOURCE_INTERVENTION = Object.freeze({
  id: "learn-to-play.return-source",
  revision: 2,
  startStepId: "explain-return-source",
  steps: [
    {
      id: "explain-return-source",
      kind: "explain",
      copy: {
        titleKey: "guided.contextual.product.returnSourceTitle",
        bodyKey: "guided.contextual.product.returnSourceBody",
        glossaryTerms: ["source", "chroniclerArchive"],
      },
      highlights: [
        { kind: "card", alias: "post_surge_source", role: "origin" },
        { kind: "surface", anchor: "player.archive", role: "destination" },
      ],
      preconditions: [
        { kind: "card.inZone", cardAlias: "post_surge_source", side: "player", zone: "hand" },
      ],
      nextStepId: "return-source",
    },
    {
      id: "return-source",
      kind: "act",
      callout: "hidden",
      copy: {
        titleKey: "guided.contextual.product.returnSourceTitle",
        bodyKey: "guided.contextual.product.returnSourceBody",
        glossaryTerms: ["source", "chroniclerArchive"],
      },
      highlights: [
        { kind: "card", alias: "post_surge_source", role: "origin" },
        { kind: "surface", anchor: "player.archive", role: "destination" },
      ],
      presentation: { kind: "spotlight", tone: "gold" },
      allowedIntent: { kind: "source.recycle", cardAlias: "post_surge_source" },
      preconditions: [
        { kind: "card.inZone", cardAlias: "post_surge_source", side: "player", zone: "hand" },
      ],
    },
  ],
} satisfies GuidedInterventionDefinition);
