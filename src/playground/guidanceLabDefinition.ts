import { contentCatalog } from "../content/bootstrap";
import { buildGuidedScenario, GUIDED_LESSON_SCHEMA_VERSION, type GuidedLessonDefinition } from "../guidance";

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
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "card", alias: "source_to_play" }],
      nextStepId: "play-source",
    },
    {
      id: "play-source",
      kind: "act",
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "card", alias: "source_to_play" }],
      allowedIntent: { kind: "card.play", cardAlias: "source_to_play" },
      nextStepId: "observe-source",
    },
    {
      id: "observe-source",
      kind: "observe",
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
      expectedReceipt: { kind: "source.played", cardAlias: "source_to_play" },
      nextStepId: "source-settled",
    },
    {
      id: "source-settled",
      kind: "explain",
      copy: { titleKey: "mulligan.title", bodyKey: "mulligan.accept" },
      highlights: [{ kind: "surface", anchor: "player.sources" }],
    },
  ],
};

export function buildGuidanceLabBoard() {
  const built = buildGuidedScenario(GUIDANCE_LAB_LESSON, contentCatalog);
  return {
    ...built,
    playerDeckId: contentCatalog.requireDeck(built.playerDeckKey, "player").deck.id,
    hostDeckId: contentCatalog.requireDeck(built.hostDeckKey, "host").deck.id,
  };
}
