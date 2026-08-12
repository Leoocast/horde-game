import { contentCatalog } from "../content/bootstrap";
import {
  GUIDED_LESSON_SCHEMA_VERSION,
  GuidedLessonRegistry,
  type GuidedLessonDefinition,
} from "../guidance";

/** Dev-only vertical slice. It validates the pause cycle without becoming the First Seed's copy. */
export const GUIDANCE_LAB_LESSON: GuidedLessonDefinition = {
  schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
  id: "guidance-lab-source-entry",
  revision: 1,
  mode: "optional",
  startStepId: "explain-source",
  scenario: {
    seed: "guidance-lab-source-entry-v1",
    playerDeckKey: "hostfall.core/pact_of_elarion",
    hostDeckKey: "hostfall.core/uprising_of_the_graveless",
    difficulty: "normal",
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    hostTurnNumber: 0,
    setupTurnsTotal: 3,
    setupTurnsRemaining: 0,
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
      openingDeal: ["source_to_play"],
      playerArchiveTopToBottom: ["next_player_card"],
      playerField: [],
      playerMemory: [],
      playerOblivion: [],
      hostArchiveTopToBottom: ["host_archive_card"],
      hostField: [],
      hostMemory: [],
      hostOblivion: [],
    },
    combat: { playerAttackers: [], hostAttackers: [], blockers: {} },
  },
  cards: {
    source_to_play: { cardKey: "hostfall.core/pact_of_elarion/river_of_elarion" },
    next_player_card: { cardKey: "hostfall.core/pact_of_elarion/veiled_dawn_flower" },
    host_archive_card: { cardKey: "hostfall.core/uprising_of_the_graveless/graveless_soldier" },
  },
  steps: [
    {
      id: "explain-source",
      kind: "explain",
      copy: { titleKey: "guided.lab.explainSourceTitle", bodyKey: "guided.lab.explainSourceBody" },
      highlights: [{ kind: "card", alias: "source_to_play" }],
      preconditions: [
        { kind: "card.inZone", cardAlias: "source_to_play", side: "player", zone: "hand" },
        { kind: "phase.is", phase: "main" },
        { kind: "side.isActive", side: "player" },
      ],
      nextStepId: "play-source",
    },
    {
      id: "play-source",
      kind: "act",
      copy: { titleKey: "guided.lab.playSourceTitle", bodyKey: "guided.lab.playSourceBody" },
      highlights: [
        { kind: "card", alias: "source_to_play", role: "origin" },
        { kind: "surface", anchor: "player.field", role: "destination" },
      ],
      allowedIntent: { kind: "card.play", cardAlias: "source_to_play" },
      preconditions: [
        { kind: "card.inZone", cardAlias: "source_to_play", side: "player", zone: "hand" },
        { kind: "energy.available", amount: 0 },
      ],
      nextStepId: "observe-source",
    },
    {
      id: "observe-source",
      kind: "observe",
      copy: { titleKey: "guided.lab.observeSourceTitle", bodyKey: "guided.lab.observeSourceBody" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      expectedReceipt: { kind: "source.played", cardAlias: "source_to_play" },
      preconditions: [
        { kind: "card.inZone", cardAlias: "source_to_play", side: "player", zone: "field" },
      ],
      nextStepId: "source-settled",
    },
    {
      id: "source-settled",
      kind: "explain",
      copy: { titleKey: "guided.lab.sourceSettledTitle", bodyKey: "guided.lab.sourceSettledBody" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      preconditions: [
        { kind: "card.inZone", cardAlias: "source_to_play", side: "player", zone: "field" },
      ],
    },
  ],
};

export const GUIDANCE_LAB_REGISTRY = new GuidedLessonRegistry(contentCatalog, [GUIDANCE_LAB_LESSON]);
