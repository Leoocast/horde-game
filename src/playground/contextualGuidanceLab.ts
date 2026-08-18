import type { CardInstance, GameState } from "../engine/GameTypes";
import type { ContextualConceptDefinition } from "../guidance";

export const CONTEXTUAL_GUIDANCE_LAB_SCOPE = "playground-contextual-lab";

export const CONTEXTUAL_GUIDANCE_LAB_CONCEPTS = [
  {
    id: "lab-contextual-reserve",
    revision: 1,
    policy: "informative",
    priority: 20,
    copy: {
      titleKey: "guided.contextual.lab.reserveTitle",
      bodyKey: "guided.contextual.lab.reserveBody",
      glossaryTerms: ["energy", "reserve"],
    },
    signalKinds: ["player.reserveReleased"],
    evaluate: () => ({ highlights: [{ kind: "surface", anchor: "player.reserve" }] }),
  },
  {
    id: "lab-contextual-stabilizing",
    revision: 1,
    policy: "reactive",
    priority: 80,
    copy: {
      titleKey: "guided.contextual.lab.stabilizingTitle",
      bodyKey: "guided.contextual.lab.stabilizingBody",
      glossaryTerms: ["echoes", "stabilizing"],
    },
    signalKinds: ["action.denied"],
    evaluate: (signal) => signal.kind === "action.denied" && signal.code === "STABILIZING" && "cardId" in signal.intent
      ? { highlights: [{ kind: "card", instanceId: signal.intent.cardId }] }
      : undefined,
    revalidate: (match, context) => {
      const cardId = match.highlights?.find((highlight) => highlight.kind === "card")?.instanceId;
      return Boolean(cardId && findCard(context.game, cardId));
    },
  },
  {
    id: "lab-contextual-source-limit",
    revision: 1,
    policy: "preventive",
    priority: 100,
    copy: {
      titleKey: "guided.contextual.lab.sourceLimitTitle",
      bodyKey: "guided.contextual.lab.sourceLimitBody",
      glossaryTerms: ["source", "sourceAction"],
    },
    signalKinds: ["intent.attempted"],
    evaluate: () => undefined,
    prevent: (intent) => intent.kind === "card.play"
      ? { highlights: [{ kind: "card", instanceId: intent.cardId }] }
      : undefined,
    revalidate: (match, context) => {
      const cardId = match.highlights?.find((highlight) => highlight.kind === "card")?.instanceId;
      return Boolean(cardId && findCard(context.game, cardId));
    },
  },
] satisfies readonly ContextualConceptDefinition[];

function findCard(game: GameState, instanceId: string): CardInstance | undefined {
  return [
    ...game.player.hand,
    ...game.player.archive,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.archive,
    ...game.host.field,
    ...game.host.memory,
    ...game.host.oblivion,
  ].find((card) => card.instanceId === instanceId);
}
