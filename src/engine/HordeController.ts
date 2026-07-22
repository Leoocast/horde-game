import type { CardInstance, GameState } from "./GameTypes";
import { drainEventQueue, enqueue } from "./EventQueue";
import { resolveEffects, runEnterBattlefieldTriggers } from "./EffectResolver";
import { prepareHordeAttackers } from "./CombatResolver";
import { HORDE_MINI_SURGE_TURN, hordeInSurge, hordeSurgeTurn } from "./StaticEffects";
import { cleanupEndStep, startPlayerTurnReady, untapSide } from "./TurnManager";
import { releasePendingStoredMana } from "./ManaSystem";

type HordeMainOptions = {
  deferEnterBattlefieldTriggers?: boolean;
};

export function runHordeMain(game: GameState, options: HordeMainOptions = {}): GameState {
  const next = structuredClone(game) as GameState;
  const wasInSurge = hordeInSurge(next);
  next.hordeTurnNumber += 1;
  next.activeSide = "horde";
  next.phase = "horde";
  next.setupCompletePendingHorde = false;
  untapSide(next, "horde");
  next.log.unshift("Horde untaps.");
  revealNormal(next, options);
  if (next.hordeTurnNumber === HORDE_MINI_SURGE_TURN) {
    next.log.unshift(`Horde Mini Surge on turn ${HORDE_MINI_SURGE_TURN} reveals 1 extra card.`);
    revealAndPlay(next, 1, options);
  }
  if (hordeInSurge(next)) {
    next.log.unshift(wasInSurge ? "Horde Surge reveals 2 extra cards." : `Horde enters Surge on turn ${hordeSurgeTurn(next)} and reveals 2 extra cards.`);
    revealAndPlay(next, 2, options);
  }
  if (!options.deferEnterBattlefieldTriggers) drainEventQueue(next);
  return next;
}

export function runFullHordeTurn(game: GameState): GameState {
  let next = runHordeMain(game);
  next = prepareHordeAttackers(next);
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
  while (played < 3 && game.horde.library.length > 0) {
    const card = revealAndPlayOne(game, options);
    played += 1;
    if (card && !card.isToken) {
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
  if (!options.deferEnterBattlefieldTriggers) runEnterBattlefieldTriggers(game, card);
  enqueue(game, { type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  return card;
}
