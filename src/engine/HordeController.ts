import type { CardInstance, GameState } from "./GameTypes";
import { drainEventQueue, enqueue } from "./EventQueue";
import { resolveEffects, runEnterBattlefieldTriggers } from "./EffectResolver";
import { recordBattlefieldEntry } from "./GameState";
import { prepareHordeAttackers } from "./CombatResolver";
import { hordeInSurge, hordeSurgeTurn } from "./StaticEffects";
import { cleanupEndStep, startPlayerTurnReady, untapSide } from "./TurnManager";
import { releasePendingStoredMana } from "./ManaSystem";

type HordeMainOptions = {
  deferEnterBattlefieldTriggers?: boolean;
};

export function runHordeMain(game: GameState, options: HordeMainOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const rules = next.hordeRules;
  const wasInSurge = hordeInSurge(next);
  next.battlefieldEntriesThisTurn = [];
  next.hordeTurnNumber += 1;
  next.activeSide = "horde";
  next.phase = "horde";
  next.setupCompletePendingHorde = false;
  untapSide(next, "horde");
  next.log.unshift("Horde untaps.");
  revealNormal(next, options);
  if (next.hordeTurnNumber === rules.miniSurgeTurn && rules.miniSurgeExtraReveals > 0) {
    next.log.unshift(`Horde Mini Surge on turn ${rules.miniSurgeTurn} reveals ${rules.miniSurgeExtraReveals} extra card(s).`);
    revealAndPlay(next, rules.miniSurgeExtraReveals, options);
  }
  if (hordeInSurge(next)) {
    next.log.unshift(
      wasInSurge
        ? `Horde Surge reveals ${rules.surgeExtraReveals} extra card(s).${surgeBonusText(next, " have ")}`
        : `Horde enters Surge on turn ${hordeSurgeTurn(next)} and reveals ${rules.surgeExtraReveals} extra card(s).${surgeBonusText(next, " get ")}`,
    );
    revealAndPlay(next, rules.surgeExtraReveals, options);
  }
  resolveRequestedRevealRounds(next, options);
  if (!options.deferEnterBattlefieldTriggers) drainEventQueue(next);
  return next;
}

function surgeBonusText(game: GameState, verb: string): string {
  const bonus = game.hordeRules.surgeBonus;
  if (!bonus) return "";
  const sign = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
  return ` Horde ${bonus.subtypes.join("/")}s${verb}${sign(bonus.power)}/${sign(bonus.toughness)}.`;
}

export function runFullHordeTurn(game: GameState): GameState {
  let next = runHordeMain(game);
  next = prepareHordeAttackers(next);
  return next;
}

/**
 * Reveals and plays exactly ONE card off the top of the Horde library, through the same path the
 * Horde's turn uses — reveal, ETB, triggers, Smallpox parking and all. No untap, no reveal count,
 * no surge, no combat: this is a single card entering play, not a turn.
 *
 * Only the Playground needs it. A match never plays one Horde card in isolation, but a lab does:
 * putting a card on the board to look at it must not drag a whole Horde turn along with it.
 */
export function revealHordeCardFromTop(game: GameState, options: HordeMainOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  if (next.horde.library.length === 0) {
    next.lastActionResult = { ok: false, reason: "The Horde library is empty." };
    return next;
  }
  revealAndPlayOne(next, options);
  resolveRequestedRevealRounds(next, options);
  if (!options.deferEnterBattlefieldTriggers) drainEventQueue(next);
  next.lastActionResult = { ok: true };
  return next;
}

export function finishHordeTurn(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  cleanupEndStep(next);
  untapSide(next, "horde");
  const releasedMana = releasePendingStoredMana(next);
  startPlayerTurnReady(next);
  if (releasedMana > 0) next.log.unshift(`Player gains ${releasedMana} stored mana.`);
  next.log.unshift("Horde turn ends.");
  return next;
}

function revealNormal(game: GameState, options: HordeMainOptions): void {
  let played = 0;
  while (played < game.hordeRules.revealCount && game.horde.library.length > 0) {
    const card = revealAndPlayOne(game, options);
    played += 1;
    if (game.hordeRules.stopOnNonToken && card && !card.isToken) {
      game.log.unshift(`Horde reveals ${card.name} and stops revealing.`);
      break;
    }
  }
}

function revealAndPlay(game: GameState, amount: number, options: HordeMainOptions): void {
  for (let i = 0; i < amount; i += 1) {
    if (game.horde.library.length === 0) break;
    revealAndPlayOne(game, options);
  }
}

function resolveRequestedRevealRounds(game: GameState, options: HordeMainOptions): void {
  while ((game.horde.pendingRevealRounds ?? 0) > 0 && game.horde.library.length > 0) {
    game.horde.pendingRevealRounds = Math.max(0, (game.horde.pendingRevealRounds ?? 0) - 1);
    game.log.unshift("Horde begins an extra reveal round.");
    revealNormal(game, options);
  }
  if ((game.horde.pendingRevealRounds ?? 0) > 0 && game.horde.library.length === 0) {
    game.horde.pendingRevealRounds = 0;
  }
}

function revealAndPlayOne(game: GameState, options: HordeMainOptions): CardInstance | undefined {
  const card = game.horde.library.shift();
  if (!card) return undefined;
  game.log.unshift(`Horde reveals ${card.name}.`);
  // Bridge: Smallpox needs a bespoke, player-interactive multi-step resolution (Horde sacrifices,
  // then the player chooses life/discard/creature/land) that can't run inside this synchronous
  // reveal. Park it unresolved; the store drives the sequence and moves it to the graveyard itself.
  if (card.definitionId === "smallpox") {
    game.horde.pendingCard = card;
    return card;
  }
  if (card.cardTypes.includes("Instant") || card.cardTypes.includes("Sorcery")) {
    resolveEffects(game, card.effects, { source: card, side: "horde" });
    card.zone = "graveyard";
    game.horde.graveyard.push(card);
    enqueue(game, { type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
    return card;
  }
  card.zone = "battlefield";
  card.tapped = false;
  card.summoningSickness = false;
  for (const counter of card.effects.filter((effect) => effect.type === "ENTERS_WITH_COUNTERS")) {
    card.counters[String(counter.counterType ?? "+1/+1")] = Number(counter.amount ?? 1);
  }
  game.horde.battlefield.push(card);
  recordBattlefieldEntry(game, card);
  if (!options.deferEnterBattlefieldTriggers) runEnterBattlefieldTriggers(game, card);
  enqueue(game, { type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  return card;
}
