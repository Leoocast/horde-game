import type { GameState } from "../engine/GameTypes";
import { isTranslationKey } from "../i18n/translations";
import { GUIDED_DIMMER_VISIBILITIES } from "./contracts";
import type { GuidedCardAlias, GuidedInterventionDefinition, GuidedStep } from "./contracts";
import type { GuidedSessionStore } from "./sessionStore";

export type GuidedInterventionHost = Readonly<{
  readGame(): GameState;
  stopPresentation(): void;
}>;

/** Starts strict steps over the current GameState. It never builds or replaces the board. */
export class GuidedInterventionOrchestrator {
  readonly #session: GuidedSessionStore;
  readonly #host: GuidedInterventionHost;
  #sessionId: string | undefined;

  constructor(session: GuidedSessionStore, host: GuidedInterventionHost) {
    this.#session = session;
    this.#host = host;
  }

  start(
    definition: GuidedInterventionDefinition,
    bindings: Readonly<Record<GuidedCardAlias, string>>,
    sessionId?: string,
  ): string {
    assertInterventionValid(definition, bindings, this.#host.readGame());
    this.#sessionId = this.#session.start({
      definition,
      bindings,
      sessionId,
      gameState: () => this.#host.readGame(),
    });
    return this.#sessionId;
  }

  stop(): void {
    if (!this.#sessionId || this.#session.snapshot().sessionId !== this.#sessionId) return;
    this.#session.stop();
    this.#host.stopPresentation();
    this.#sessionId = undefined;
  }
}

export function assertInterventionValid(
  definition: GuidedInterventionDefinition,
  bindings: Readonly<Record<GuidedCardAlias, string>>,
  game: GameState,
): void {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(definition.id)) problems.push("invalid intervention id");
  if (!Number.isInteger(definition.revision) || definition.revision < 1) problems.push("invalid intervention revision");
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) problems.push("intervention has no steps");
  const steps = new Map<string, GuidedStep>();
  const referencedAliases = new Set<string>();
  const dimmerVisibilities = new Set<string>(GUIDED_DIMMER_VISIBILITIES);
  for (const step of definition.steps ?? []) {
    if (steps.has(step.id)) problems.push(`duplicate step ${step.id}`);
    steps.set(step.id, step);
    if (!isTranslationKey(step.copy.titleKey) || !isTranslationKey(step.copy.bodyKey)) problems.push(`unknown copy in ${step.id}`);
    if (step.dimmer !== undefined && !dimmerVisibilities.has(step.dimmer)) problems.push(`unknown dimmer visibility in ${step.id}`);
    for (const highlight of step.highlights ?? []) if (highlight.kind === "card") referencedAliases.add(highlight.alias);
    if (step.presentation?.kind === "cardComparison") {
      for (const alias of step.presentation.cardAliases) referencedAliases.add(alias);
    }
    for (const condition of step.preconditions ?? []) if (condition.kind === "card.inZone") referencedAliases.add(condition.cardAlias);
    collectMatcherAliases(step.kind === "act" ? step.allowedIntent : step.kind === "observe" ? step.expectedReceipt : undefined, referencedAliases);
    if (step.nextStepId && !definition.steps.some((candidate) => candidate.id === step.nextStepId)) problems.push(`missing next step ${step.nextStepId}`);
  }
  if (!steps.has(definition.startStepId)) problems.push(`missing start step ${definition.startStepId}`);
  const liveIds = new Set(allGameCards(game).map(({ instanceId }) => instanceId));
  for (const alias of referencedAliases) {
    const instanceId = bindings[alias];
    if (!instanceId) problems.push(`missing binding ${alias}`);
    else if (!liveIds.has(instanceId)) problems.push(`binding ${alias} is not on the current board`);
  }
  if (problems.length > 0) throw new Error(`Invalid guided intervention "${definition.id}": ${problems.join("; ")}.`);
}

function collectMatcherAliases(matcher: unknown, aliases: Set<string>): void {
  if (!matcher || typeof matcher !== "object") return;
  const value = matcher as Record<string, unknown>;
  for (const key of ["cardAlias", "targetAlias"] as const) if (typeof value[key] === "string") aliases.add(value[key]);
  if (Array.isArray(value.targetAliases)) for (const alias of value.targetAliases) if (typeof alias === "string") aliases.add(alias);
  if (Array.isArray(value.targetAliasOptions)) for (const alias of value.targetAliasOptions) if (typeof alias === "string") aliases.add(alias);
  if (Array.isArray(value.assignments)) for (const assignment of value.assignments) {
    if (!assignment || typeof assignment !== "object") continue;
    const record = assignment as Record<string, unknown>;
    if (typeof record.blockerAlias === "string") aliases.add(record.blockerAlias);
    if (typeof record.attackerAlias === "string") aliases.add(record.attackerAlias);
  }
}

function allGameCards(game: GameState) {
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
    ...(game.host.pendingCard ? [game.host.pendingCard] : []),
  ];
}
