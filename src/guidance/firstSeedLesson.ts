import {
  GUIDED_LESSON_SCHEMA_VERSION,
  type GuidedLessonDefinition,
} from "./contracts";

const ELARION = "hostfall.core/pact_of_elarion";
const GRAVELESS = "hostfall.core/uprising_of_the_graveless";

const elarionCard = (id: string) => `${ELARION}/${id}`;
const gravelessCard = (id: string) => `${GRAVELESS}/${id}`;

/**
 * First Seed, opening section. It deliberately stops before the Host awakens so its novice-facing
 * Preparation pacing can be reviewed before combat teaching is appended.
 *
 * Pacing contract for this revision: a visible callout only appears when it teaches something the
 * player cannot read off the board. Silent `callout: "hidden"` checkpoints hold the stable wait
 * between actions, so two actions that form a single idea — gather, then Invoke — run back to back
 * without a text box between them.
 */
export const FIRST_SEED_LESSON: GuidedLessonDefinition = {
  schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
  id: "first-seed",
  revision: 4,
  mode: "optional",
  startStepId: "explain-objective",
  scenario: {
    seed: "first-seed-preparation-v2",
    playerDeckKey: ELARION,
    hostDeckKey: GRAVELESS,
    difficulty: "normal",
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    hostTurnNumber: 0,
    setupTurnsTotal: 3,
    setupTurnsRemaining: 3,
    setupCompletePendingHost: false,
    openingHandAccepted: true,
    mulligansTaken: 0,
    player: {
      life: 50,
      availableEnergy: 0,
      storedEnergy: 0,
      pendingStoredEnergy: 0,
      energyActionUsedThisTurn: false,
      lifePaidThisTurn: 0,
      lifeLostThisTurn: 0,
    },
    host: { poisonCounters: 0 },
    zones: {
      openingDeal: ["first_source", "second_source", "liora", "vaelor"],
      playerArchiveTopToBottom: ["maela", "heirs_shield"],
      playerField: [],
      playerMemory: [],
      playerOblivion: [],
      hostArchiveTopToBottom: [
        "host_archive_one",
        "host_archive_two",
        "host_archive_three",
        "host_archive_four",
        "host_archive_five",
        "host_archive_six",
      ],
      hostField: [],
      hostMemory: [],
      hostOblivion: [],
    },
    combat: { playerAttackers: [], hostAttackers: [], blockers: {} },
  },
  cards: {
    first_source: { cardKey: elarionCard("river_of_elarion") },
    second_source: { cardKey: elarionCard("river_of_elarion") },
    liora: { cardKey: elarionCard("liora_keeper_of_the_grove") },
    vaelor: { cardKey: elarionCard("vaelor_emerald_guardian") },
    maela: { cardKey: elarionCard("maela_watcher_of_the_heights") },
    heirs_shield: { cardKey: elarionCard("shield_of_the_heir") },
    host_archive_one: { cardKey: gravelessCard("graveless_soldier") },
    host_archive_two: { cardKey: gravelessCard("graveless_soldier") },
    host_archive_three: { cardKey: gravelessCard("graveless_soldier") },
    host_archive_four: { cardKey: gravelessCard("graveless_soldier") },
    host_archive_five: { cardKey: gravelessCard("graveless_soldier") },
    host_archive_six: { cardKey: gravelessCard("graveless_soldier") },
  },
  steps: [
    {
      id: "explain-objective",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.objectiveTitle",
        bodyKey: "guided.firstSeed.objectiveBody",
        glossaryTerms: ["host", "archive", "life", "invoke", "echoes"],
      },
      highlights: [{ kind: "surface", anchor: "host.archive" }],
      preconditions: [{ kind: "setup.remaining", amount: 3 }],
      nextStepId: "explain-preparation",
    },
    {
      id: "explain-preparation",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.preparationTitle",
        bodyKey: "guided.firstSeed.preparationBody",
        glossaryTerms: ["preparation", "host", "field"],
      },
      highlights: [{ kind: "surface", anchor: "setup.progress" }],
      nextStepId: "play-first-source",
    },
    {
      id: "play-first-source",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.firstSourceTitle",
        bodyKey: "guided.firstSeed.firstSourceBody",
        glossaryTerms: ["source", "energy", "echoes", "field"],
      },
      highlights: [
        { kind: "card", alias: "first_source", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      allowedIntent: { kind: "card.play", cardAlias: "first_source" },
      preconditions: [
        { kind: "setup.remaining", amount: 3 },
        { kind: "card.inZone", cardAlias: "first_source", side: "player", zone: "hand" },
      ],
      nextStepId: "observe-first-source",
    },
    {
      id: "observe-first-source",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      expectedReceipt: { kind: "source.played", cardAlias: "first_source" },
      preconditions: [{ kind: "card.inZone", cardAlias: "first_source", side: "player", zone: "field" }],
      nextStepId: "explain-source-energy",
    },
    {
      id: "explain-source-energy",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.sourceEnergyTitle",
        bodyKey: "guided.firstSeed.sourceEnergyBody",
        glossaryTerms: ["source", "energy", "sourceAction"],
      },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      preconditions: [{ kind: "card.inZone", cardAlias: "first_source", side: "player", zone: "field" }],
      nextStepId: "compare-first-costs",
    },
    {
      id: "compare-first-costs",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.compareCostsTitle",
        bodyKey: "guided.firstSeed.compareCostsBody",
        glossaryTerms: ["energy", "source", "invoke"],
      },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      presentation: {
        kind: "cardComparison",
        cardAliases: ["liora", "vaelor"],
        emphasis: "energyCost",
      },
      nextStepId: "continue-first-preparation",
    },
    {
      id: "continue-first-preparation",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.continueFirstTitle",
        bodyKey: "guided.firstSeed.continueFirstBody",
        glossaryTerms: ["preparation"],
      },
      highlights: [{ kind: "surface", anchor: "phase.primaryAction" }],
      allowedIntent: { kind: "phase.continueSetup" },
      preconditions: [{ kind: "setup.remaining", amount: 3 }],
      nextStepId: "draw-maela",
    },
    {
      id: "draw-maela",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [
        { kind: "surface", anchor: "player.archive", role: "origin" },
        { kind: "surface", anchor: "player.hand", role: "destination" },
      ],
      expectedReceipt: { kind: "player.drew", targetAliases: ["maela"], amount: 1, reason: "setup" },
      nextStepId: "begin-second-preparation",
    },
    {
      id: "begin-second-preparation",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.secondPreparationTitle",
        bodyKey: "guided.firstSeed.secondPreparationBody",
        glossaryTerms: ["source", "sourceAction"],
      },
      highlights: [
        { kind: "surface", anchor: "setup.progress" },
        { kind: "card", alias: "maela" },
      ],
      preconditions: [
        { kind: "setup.remaining", amount: 2 },
        { kind: "card.inZone", cardAlias: "maela", side: "player", zone: "hand" },
      ],
      nextStepId: "play-second-source",
    },
    {
      id: "play-second-source",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.secondSourceTitle",
        bodyKey: "guided.firstSeed.secondSourceBody",
        glossaryTerms: ["sourceAction", "source", "field"],
      },
      highlights: [
        { kind: "card", alias: "second_source", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      allowedIntent: { kind: "card.play", cardAlias: "second_source" },
      preconditions: [{ kind: "card.inZone", cardAlias: "second_source", side: "player", zone: "hand" }],
      nextStepId: "observe-second-source",
    },
    {
      // Placing the Source and Invoking Liora are one idea, so the checkpoint stays silent and
      // the affordability lesson travels inside the Invocation step itself.
      id: "observe-second-source",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      expectedReceipt: { kind: "source.played", cardAlias: "second_source" },
      preconditions: [{ kind: "card.inZone", cardAlias: "second_source", side: "player", zone: "field" }],
      nextStepId: "play-liora",
    },
    {
      id: "play-liora",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.playLioraTitle",
        bodyKey: "guided.firstSeed.playLioraBody",
        glossaryTerms: ["source", "energy", "invoke"],
      },
      highlights: [
        { kind: "card", alias: "liora", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      allowedIntent: { kind: "card.play", cardAlias: "liora" },
      preconditions: [
        { kind: "setup.remaining", amount: 2 },
        { kind: "card.inZone", cardAlias: "liora", side: "player", zone: "hand" },
      ],
      nextStepId: "observe-liora-entry",
    },
    {
      id: "observe-liora-entry",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [{ kind: "surface", anchor: "player.field" }],
      expectedReceipt: { kind: "card.played", cardAlias: "liora" },
      preconditions: [{ kind: "card.inZone", cardAlias: "liora", side: "player", zone: "field" }],
      nextStepId: "explain-liora-invoked",
    },
    {
      // Both consequences of the Invocation — channeled Sources and Stabilizing — are one checkpoint.
      id: "explain-liora-invoked",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.lioraInvokedTitle",
        bodyKey: "guided.firstSeed.lioraInvokedBody",
        glossaryTerms: ["exhausted", "stabilizing", "action"],
      },
      highlights: [
        { kind: "surface", anchor: "player.sources" },
        { kind: "card", alias: "liora" },
      ],
      preconditions: [{ kind: "card.inZone", cardAlias: "liora", side: "player", zone: "field" }],
      nextStepId: "continue-second-preparation",
    },
    {
      id: "continue-second-preparation",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.continueSecondTitle",
        bodyKey: "guided.firstSeed.continueSecondBody",
        glossaryTerms: ["energy"],
      },
      highlights: [{ kind: "surface", anchor: "phase.primaryAction" }],
      allowedIntent: { kind: "phase.continueSetup" },
      preconditions: [{ kind: "setup.remaining", amount: 2 }],
      nextStepId: "draw-heirs-shield",
    },
    {
      id: "draw-heirs-shield",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [
        { kind: "surface", anchor: "player.archive", role: "origin" },
        { kind: "surface", anchor: "player.hand", role: "destination" },
      ],
      expectedReceipt: { kind: "player.drew", targetAliases: ["heirs_shield"], amount: 1, reason: "setup" },
      nextStepId: "explain-third-preparation",
    },
    {
      // The draw, the ready Sources and the end of Stabilizing are all the same observation, and
      // this is where Reserve is named before the player is asked to create one.
      id: "explain-third-preparation",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.thirdPreparationTitle",
        bodyKey: "guided.firstSeed.thirdPreparationBody",
        glossaryTerms: ["source", "energy", "reserve"],
      },
      highlights: [
        { kind: "surface", anchor: "setup.progress" },
        { kind: "surface", anchor: "player.sources" },
        { kind: "card", alias: "liora" },
      ],
      preconditions: [
        { kind: "setup.remaining", amount: 1 },
        { kind: "card.inZone", cardAlias: "heirs_shield", side: "player", zone: "hand" },
      ],
      nextStepId: "activate-liora",
    },
    {
      id: "activate-liora",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.activateLioraTitle",
        bodyKey: "guided.firstSeed.activateLioraBody",
        glossaryTerms: ["action", "energy", "reserve", "preparation"],
      },
      highlights: [{ kind: "card", alias: "liora" }],
      allowedIntent: {
        kind: "ability.activate",
        cardAlias: "liora",
        abilityId: "liora_keeper_of_the_grove_gain_energy",
      },
      preconditions: [{ kind: "energy.stored", amount: 0 }],
      nextStepId: "observe-liora-action",
    },
    {
      // Making the Reserve and channeling it are one idea, so this checkpoint only holds the transfer
      // animation before the Invocation step states the arithmetic.
      //
      // It declares no preconditions on purpose. An observe step is entered the moment the action's
      // receipt lands, so its preconditions are checked before its own beat has resolved: asserting
      // the Reserve here would race the `energy.flow` animation. The state this checkpoint waits for
      // is asserted by "play-maela", which is only entered once the presentation has settled.
      id: "observe-liora-action",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [{ kind: "surface", anchor: "player.reserve" }],
      expectedReceipt: { kind: "ability.activated", cardAlias: "liora" },
      nextStepId: "play-maela",
    },
    {
      id: "play-maela",
      kind: "act",
      copy: {
        titleKey: "guided.firstSeed.playMaelaTitle",
        bodyKey: "guided.firstSeed.playMaelaBody",
        glossaryTerms: ["reserve", "source", "energy", "invoke"],
      },
      highlights: [
        { kind: "card", alias: "maela", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      allowedIntent: { kind: "card.play", cardAlias: "maela" },
      preconditions: [
        { kind: "energy.stored", amount: 1 },
        { kind: "card.inZone", cardAlias: "maela", side: "player", zone: "hand" },
      ],
      nextStepId: "observe-maela-entry",
    },
    {
      id: "observe-maela-entry",
      kind: "observe",
      callout: "hidden",
      copy: { titleKey: "guided.firstSeed.checkpointTitle", bodyKey: "guided.firstSeed.checkpointBody" },
      highlights: [{ kind: "surface", anchor: "player.field" }],
      expectedReceipt: { kind: "card.played", cardAlias: "maela" },
      preconditions: [{ kind: "card.inZone", cardAlias: "maela", side: "player", zone: "field" }],
      nextStepId: "preparation-ready",
    },
    {
      // Skyguard and the closing summary share the last checkpoint: the trait is what makes the
      // finished defense worth reading, not a separate rule to memorise.
      id: "preparation-ready",
      kind: "explain",
      copy: {
        titleKey: "guided.firstSeed.readyTitle",
        bodyKey: "guided.firstSeed.readyBody",
        glossaryTerms: ["skyguard", "flying", "echoes", "preparation", "stabilizing", "exhausted"],
      },
      highlights: [
        { kind: "card", alias: "maela" },
        { kind: "card", alias: "liora" },
      ],
      preconditions: [
        { kind: "card.inZone", cardAlias: "maela", side: "player", zone: "field" },
        { kind: "energy.stored", amount: 0 },
      ],
    },
  ],
};
