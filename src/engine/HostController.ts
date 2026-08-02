import type { CardInstance, GameState } from "./GameTypes";
import { drainEventQueue, enqueue } from "./EventQueue";
import { resolveEffects, runInvokedTriggers } from "./EffectResolver";
import { recordFieldEntry } from "./GameState";
import { prepareHostAttackers } from "./CombatResolver";
import { hostInSurge, hostSurgeTurn } from "./StaticEffects";
import { cleanupEndStep, readySide, startPlayerTurnReady } from "./TurnManager";
import { releasePendingStoredEnergy } from "./EnergySystem";

type HostMainOptions = {
  deferInvokedTriggers?: boolean;
};

export function runHostMain(game: GameState, options: HostMainOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const rules = next.hostRules;
  const wasInSurge = hostInSurge(next);
  next.fieldEntriesThisTurn = [];
  next.hostTurnNumber += 1;
  next.activeSide = "host";
  next.phase = "host";
  next.setupCompletePendingHost = false;
  readySide(next, "host");
  next.log.unshift("Host readies its Field.");
  revealNormal(next, options);
  if (next.hostTurnNumber === rules.miniSurgeTurn && rules.miniSurgeExtraReveals > 0) {
    next.log.unshift(`Host Mini Surge on turn ${rules.miniSurgeTurn} reveals ${rules.miniSurgeExtraReveals} extra card(s).`);
    revealAndPlay(next, rules.miniSurgeExtraReveals, options);
  }
  if (hostInSurge(next)) {
    next.log.unshift(
      wasInSurge
        ? `Host Surge reveals ${rules.surgeExtraReveals} extra card(s).${surgeBonusText(next, " have ")}`
        : `Host enters Surge on turn ${hostSurgeTurn(next)} and reveals ${rules.surgeExtraReveals} extra card(s).${surgeBonusText(next, " get ")}`,
    );
    revealAndPlay(next, rules.surgeExtraReveals, options);
  }
  resolveRequestedRevealRounds(next, options);
  if (!options.deferInvokedTriggers) drainEventQueue(next);
  return next;
}

function surgeBonusText(game: GameState, verb: string): string {
  const bonus = game.hostRules.surgeBonus;
  if (!bonus) return "";
  const sign = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
  return ` Host ${bonus.subtypes.join("/")}s${verb}${sign(bonus.power)}/${sign(bonus.endurance)}.`;
}

export function runFullHostTurn(game: GameState): GameState {
  let next = runHostMain(game);
  next = prepareHostAttackers(next);
  return next;
}

/**
 * Reveals and plays exactly ONE card off the top of the Host Archive, through the same path the
 * Host's turn uses — reveal, ETB, triggers, Tithe of Flesh and Root parking and all. No ready step, reveal count,
 * no surge, no combat: this is a single card entering play, not a turn.
 *
 * Only the Playground needs it. A match never plays one Host card in isolation, but a lab does:
 * putting a card on the board to look at it must not drag a whole Host turn along with it.
 */
export function revealHostCardFromTop(game: GameState, options: HostMainOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  if (next.host.archive.length === 0) {
    next.lastActionResult = { ok: false, reason: "The Host Archive is empty." };
    return next;
  }
  revealAndPlayOne(next, options);
  resolveRequestedRevealRounds(next, options);
  if (!options.deferInvokedTriggers) drainEventQueue(next);
  next.lastActionResult = { ok: true };
  return next;
}

export function finishHostTurn(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  cleanupEndStep(next);
  readySide(next, "host");
  const releasedEnergy = releasePendingStoredEnergy(next);
  startPlayerTurnReady(next);
  if (releasedEnergy > 0) next.log.unshift(`Player gains ${releasedEnergy} Stored Energy.`);
  next.log.unshift("Host turn ends.");
  return next;
}

function revealNormal(game: GameState, options: HostMainOptions): void {
  let played = 0;
  while (played < game.hostRules.revealCount && game.host.archive.length > 0) {
    const card = revealAndPlayOne(game, options);
    played += 1;
    if (game.hostRules.stopOnNonToken && card && !card.isToken) {
      game.log.unshift(`Host reveals ${card.name} and stops revealing.`);
      break;
    }
  }
}

function revealAndPlay(game: GameState, amount: number, options: HostMainOptions): void {
  for (let i = 0; i < amount; i += 1) {
    if (game.host.archive.length === 0) break;
    revealAndPlayOne(game, options);
  }
}

function resolveRequestedRevealRounds(game: GameState, options: HostMainOptions): void {
  while ((game.host.pendingRevealRounds ?? 0) > 0 && game.host.archive.length > 0) {
    game.host.pendingRevealRounds = Math.max(0, (game.host.pendingRevealRounds ?? 0) - 1);
    game.log.unshift("Host begins an extra reveal round.");
    revealNormal(game, options);
  }
  if ((game.host.pendingRevealRounds ?? 0) > 0 && game.host.archive.length === 0) {
    game.host.pendingRevealRounds = 0;
  }
}

function revealAndPlayOne(game: GameState, options: HostMainOptions): CardInstance | undefined {
  const card = game.host.archive.shift();
  if (!card) return undefined;
  game.log.unshift(`Host reveals ${card.name}.`);
  // Bridge: Tithe of Flesh and Root needs a bespoke, player-interactive multi-step resolution (Host sacrifices,
  // then the player chooses life/discard/creature/land) that can't run inside this synchronous
  // reveal. Park it unresolved; the store drives the sequence and moves it to Memory itself.
  if (card.definitionId === "flesh_root_tithe") {
    game.host.pendingCard = card;
    return card;
  }
  if (card.kinds.includes("SPELL")) {
    resolveEffects(game, card.effects, { source: card, side: "host" });
    card.zone = "memory";
    game.host.memory.push(card);
    enqueue(game, { type: "CARD_PLAYED", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
    return card;
  }
  card.zone = "field";
  card.exhausted = false;
  card.stabilizing = card.kinds.includes("ECHO") && !game.hostRules.hostEchosHaveImpetus;
  for (const counter of card.effects.filter((effect) => effect.type === "ENTERS_WITH_COUNTERS")) {
    card.counters[String(counter.counterType ?? "+1/+1")] = Number(counter.amount ?? 1);
  }
  game.host.field.push(card);
  recordFieldEntry(game, card);
  if (!options.deferInvokedTriggers) runInvokedTriggers(game, card);
  enqueue(game, { type: "CARD_PLAYED", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  return card;
}
