import type { CardInstance, GameState } from "../engine/GameTypes";
import { hostInSurge } from "../engine/StaticEffects";
import type { ContextualConceptDefinition, ContextualConceptMatch } from "./contextualContracts";

export const PRODUCT_CONTEXTUAL_CONCEPTS = [
  {
    id: "host-defense-order",
    revision: 2,
    policy: "informative",
    priority: 80,
    copy: {
      titleKey: "guided.contextual.product.defenseOrderTitle",
      bodyKey: "guided.contextual.product.defenseOrderBody",
      glossaryTerms: ["host", "echoes"],
    },
    // Reserved for a later contextual attempt that demonstrates left-to-right resolution. Merely
    // reaching defense does not mean the player has learned this rule.
    signalKinds: [],
    evaluate: () => undefined,
    revalidate: (_match, context) => context.game.activeSide === "host" && context.game.combat.hostAttackers.length > 0,
  },
  {
    id: "assign-defenders",
    revision: 3,
    policy: "informative",
    priority: 85,
    copy: {
      titleKey: "guided.contextual.product.assignDefendersTitle",
      bodyKey: "guided.contextual.product.assignDefendersBody",
      glossaryTerms: ["echoes"],
    },
    signalKinds: ["host.attackersDeclared"],
    evaluate: () => ({
      highlights: [{ kind: "surface", anchor: "player.field", showHighlight: false }],
      placement: "left",
    }),
    revalidate: (_match, context) => context.game.activeSide === "host" && context.game.combat.hostAttackers.length > 0,
  },
  {
    id: "flying-defense-restriction",
    revision: 2,
    policy: "reactive",
    priority: 120,
    copy: {
      titleKey: "guided.contextual.product.flyingDefenseTitle",
      bodyKey: "guided.contextual.product.flyingDefenseBody",
      glossaryTerms: ["flying", "skyguard"],
    },
    signalKinds: ["action.denied"],
    evaluate: (signal) => signal.kind === "action.denied"
      && signal.code === "BLOCK_REQUIRES_FLYING_OR_SKYGUARD"
      && signal.intent.kind === "combat.assignBlocker"
      ? {
          highlights: [
            { kind: "card", instanceId: signal.intent.cardId },
            {
              kind: "card",
              instanceId: signal.intent.targetId,
              padding: 18,
              offsetX: 16,
            },
          ],
          placement: "center",
        }
      : undefined,
    revalidate: cardsRemainRelevant,
  },
  {
    id: "chronicler-life",
    revision: 2,
    policy: "informative",
    priority: 70,
    copy: {
      titleKey: "guided.contextual.product.lifeTitle",
      bodyKey: "guided.contextual.product.lifeBody",
      glossaryTerms: ["life"],
    },
    signalKinds: ["player.lifeLost"],
    evaluate: () => ({ highlights: [{ kind: "surface", anchor: "player.life" }] }),
  },
  {
    id: "reserve-and-ready",
    revision: 3,
    policy: "informative",
    priority: 90,
    copy: {
      titleKey: "guided.contextual.product.reserveTitle",
      bodyKey: "guided.contextual.product.reserveBody",
      glossaryTerms: ["source", "energy", "reserve"],
    },
    signalKinds: ["player.reserveReleased"],
    evaluate: (signal) => signal.kind === "player.reserveReleased" && signal.amount > 0
      ? {
          highlights: [
            { kind: "surface", anchor: "player.sources" },
            { kind: "surface", anchor: "player.reserve" },
          ],
          occurrenceKey: String(signal.amount),
        }
      : undefined,
    revalidate: (_match, context) => context.game.player.energyPool.stored > 0,
  },
  {
    id: "stabilizing-restriction",
    revision: 1,
    policy: "reactive",
    priority: 110,
    copy: {
      titleKey: "guided.contextual.product.stabilizingTitle",
      bodyKey: "guided.contextual.product.stabilizingBody",
      glossaryTerms: ["stabilizing"],
    },
    signalKinds: ["action.denied"],
    evaluate: (signal) => signal.kind === "action.denied"
      && signal.code === "STABILIZING"
      && "cardId" in signal.intent
      ? { highlights: [{ kind: "card", instanceId: signal.intent.cardId }] }
      : undefined,
    revalidate: cardsRemainRelevant,
  },
  {
    id: "attack-the-host-archive",
    revision: 3,
    policy: "preventive",
    priority: 60,
    copy: {
      titleKey: "guided.contextual.product.attackArchiveTitle",
      bodyKey: "guided.contextual.product.attackArchiveBody",
      glossaryTerms: ["hostArchive", "echoes"],
    },
    signalKinds: [],
    evaluate: () => undefined,
    prevent: (intent) => intent.kind === "combat.confirmArchiveAttack" && intent.targetIds.length > 0
      ? {
          highlights: [{ kind: "surface", anchor: "host.archive" }],
        }
      : undefined,
    revalidate: (_match, context) => context.game.activeSide === "player" && context.game.phase === "combat",
  },
  {
    id: "attack-exhausts-echo",
    revision: 2,
    policy: "informative",
    priority: 55,
    copy: {
      titleKey: "guided.contextual.product.attackExhaustsTitle",
      bodyKey: "guided.contextual.product.attackExhaustsBody",
      glossaryTerms: ["exhausted"],
    },
    signalKinds: ["action.committed"],
    evaluate: (signal) => signal.kind === "action.committed" && signal.receipt.kind === "archiveAttack.confirmed"
      ? {
          highlights: (signal.receipt.targetIds ?? []).map((instanceId) => ({
            kind: "card",
            instanceId,
            padding: 18,
          })),
        }
      : undefined,
    revalidate: (match, context) => highlightedCards(match)
      .some((instanceId) => context.game.player.field.some((card) => card.instanceId === instanceId && card.exhausted)),
  },
  {
    id: "host-surge",
    revision: 2,
    policy: "informative",
    priority: 130,
    copy: {
      titleKey: "guided.contextual.product.surgeTitle",
      bodyKey: "guided.contextual.product.surgeBody",
      glossaryTerms: ["host"],
    },
    signalKinds: ["host.surgeStarted"],
    evaluate: (_signal, context) => hostInSurge(context.game)
      ? { highlights: [] }
      : undefined,
    revalidate: (_match, context) => hostInSurge(context.game),
  },
  {
    id: "empty-hand-draw",
    revision: 2,
    policy: "informative",
    priority: 95,
    copy: {
      titleKey: "guided.contextual.product.emptyHandDrawTitle",
      bodyKey: "guided.contextual.product.emptyHandDrawBody",
    },
    signalKinds: ["player.cardsDrawn"],
    evaluate: (signal) => signal.kind === "player.cardsDrawn"
      && signal.reason === "empty-hand"
      && signal.amount === 2
      ? {
          placement: "center",
        }
      : undefined,
  },
  {
    id: "return-source",
    revision: 2,
    policy: "reactive",
    priority: 150,
    copy: {
      titleKey: "guided.contextual.product.returnSourceTitle",
      bodyKey: "guided.contextual.product.returnSourceBody",
      glossaryTerms: ["source", "chroniclerArchive"],
    },
    signalKinds: ["action.denied"],
    evaluate: (signal, context) => {
      const sourceId = signal.kind === "action.denied"
        && signal.code === "SOURCE_LIMIT_REACHED"
        && signal.intent.kind === "card.play"
        ? signal.intent.cardId
        : undefined;
      if (!sourceId || !context.game.player.hand.some((card) => card.instanceId === sourceId && card.kinds.includes("SOURCE"))) {
        return undefined;
      }
      return {
        highlights: [
          { kind: "card", instanceId: sourceId },
          { kind: "surface", anchor: "player.archive" },
        ],
      };
    },
    revalidate: (match, context) => highlightedCards(match).some((instanceId) =>
      context.game.player.hand.some((card) => card.instanceId === instanceId && card.kinds.includes("SOURCE"))),
  },
  {
    id: "learn-to-play-vaelor-required",
    revision: 1,
    policy: "reactive",
    priority: 140,
    copy: {
      titleKey: "guided.contextual.product.vaelorRequiredTitle",
      bodyKey: "guided.contextual.product.vaelorRequiredBody",
      glossaryTerms: ["invoke"],
    },
    signalKinds: ["intent.attempted"],
    evaluate: (signal) => signal.kind === "intent.attempted"
      && signal.authorization === "journey-blocked"
      && signal.guidanceId === "learn-to-play.vaelor-required"
      ? { highlights: (signal.relatedCardIds ?? []).map((instanceId) => ({ kind: "card", instanceId })) }
      : undefined,
    revalidate: (match, context) => highlightedCards(match).every((instanceId) =>
      context.game.player.hand.some((card) => card.instanceId === instanceId)),
  },
] satisfies readonly ContextualConceptDefinition[];

function cardsRemainRelevant(match: ContextualConceptMatch, context: Readonly<{ game: GameState }>): boolean {
  const cardIds = highlightedCards(match);
  if (cardIds.length === 0) return true;
  return cardIds.every((instanceId) => Boolean(findCard(context.game, instanceId)));
}

function highlightedCards(match: ContextualConceptMatch): string[] {
  return (match.highlights ?? []).flatMap((highlight) => highlight.kind === "card" ? [highlight.instanceId] : []);
}

function findCard(game: GameState, instanceId: string): CardInstance | undefined {
  return [
    ...game.player.archive,
    ...game.player.hand,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.archive,
    ...game.host.field,
    ...game.host.memory,
    ...game.host.oblivion,
  ].find((card) => card.instanceId === instanceId);
}
