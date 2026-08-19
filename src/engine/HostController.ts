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

type HostRevealResult = {
  card: CardInstance;
  /** A duplicate Support returns to the Archive and does not consume the reveal it replaces. */
  replacedByExtraReveal: boolean;
};

export function runHostMain(game: GameState, options: HostMainOptions = {}): GameState {
  const next = beginHostMain(game);
  const rules = next.hostRules;
  const wasInSurge = hostInSurge(game);
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

/**
 * Opens a real Host turn without revealing cards. Authored encounters use this seam when the
 * number of arrivals is decided from the live board, while ordinary matches continue through
 * `runHostMain` and its deck rules.
 */
export function beginHostMain(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  next.fieldEntriesThisTurn = [];
  next.hostTurnNumber += 1;
  next.activeSide = "host";
  next.phase = "host";
  next.setupCompletePendingHost = false;
  readySide(next, "host");
  next.log.unshift("Host readies its Field.");
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
 * Reveals and plays exactly ONE eligible card off the top of the Host Archive, through the same path the
 * Host's turn uses — reveal, ETB, triggers, Tribute of the Four Sorrows parking and all. No ready step, reveal count,
 * no surge, no combat: this is a single card entering play, not a turn.
 * A duplicate Support may be returned to the bottom first and grants its normal replacement reveal.
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
  revealAndPlay(next, 1, options);
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
  let attempts = 0;
  const maxAttempts = game.host.archive.length;
  while (played < game.hostRules.revealCount && game.host.archive.length > 0 && attempts < maxAttempts) {
    const result = revealAndPlayOne(game, options);
    attempts += 1;
    if (!result || result.replacedByExtraReveal) continue;
    played += 1;
    if (game.hostRules.stopOnNonToken && !result.card.isToken) {
      game.log.unshift(`Host reveals ${result.card.name} and stops revealing.`);
      break;
    }
  }
}

function revealAndPlay(game: GameState, amount: number, options: HostMainOptions): void {
  let played = 0;
  let attempts = 0;
  const maxAttempts = game.host.archive.length;
  while (played < amount && game.host.archive.length > 0 && attempts < maxAttempts) {
    const result = revealAndPlayOne(game, options);
    attempts += 1;
    if (result && !result.replacedByExtraReveal) played += 1;
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

function revealAndPlayOne(game: GameState, options: HostMainOptions): HostRevealResult | undefined {
  const card = game.host.archive.shift();
  if (!card) return undefined;
  game.log.unshift(`Host reveals ${card.name}.`);
  if (
    card.kinds.includes("SUPPORT") &&
    game.host.field.some(
      (permanent) => permanent.kinds.includes("SUPPORT") && permanent.definitionId === card.definitionId,
    )
  ) {
    card.zone = "archive";
    game.host.archive.push(card);
    game.log.unshift(
      `${card.name} is already on the Field, so the revealed copy moves to the bottom of the Host Archive and grants one extra reveal.`,
    );
    return { card, replacedByExtraReveal: true };
  }
  // Bridge: Tribute of the Four Sorrows needs a bespoke, player-interactive multi-step resolution (Host sacrifices,
  // then the player chooses life/discard/creature/land) that can't run inside this synchronous
  // reveal. Park it unresolved; the store drives the sequence and moves it to Memory itself.
  if (card.definitionId === "tribute_of_the_four_sorrows") {
    game.host.pendingCard = card;
    return { card, replacedByExtraReveal: false };
  }
  if (card.kinds.includes("SPELL")) {
    resolveEffects(game, card.effects, { source: card, side: "host" });
    card.zone = "memory";
    game.host.memory.push(card);
    enqueue(game, { type: "CARD_PLAYED", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
    return { card, replacedByExtraReveal: false };
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
  return { card, replacedByExtraReveal: false };
}
