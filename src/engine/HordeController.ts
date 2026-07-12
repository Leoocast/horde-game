import type { CardInstance, GameState } from "./GameTypes";
import { drainEventQueue, enqueue } from "./EventQueue";
import { resolveEffects, runEnterBattlefieldTriggers } from "./EffectResolver";
import { prepareHordeAttackers } from "./CombatResolver";
import { hordeInSurge } from "./StaticEffects";
import { cleanupEndStep, startPlayerTurnReady, untapSide } from "./TurnManager";

export function runHordeMain(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  next.activeSide = "horde";
  next.phase = "horde";
  next.setupCompletePendingHorde = false;
  untapSide(next, "horde");
  next.log.unshift("Horde untaps.");
  revealNormal(next);
  if (hordeInSurge(next)) {
    next.log.unshift("Horde enters Surge and reveals 2 extra cards.");
    revealAndPlay(next, 2);
  }
  drainEventQueue(next);
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
  startPlayerTurnReady(next);
  next.log.unshift("Horde turn ends.");
  return next;
}

function revealNormal(game: GameState): void {
  let played = 0;
  while (played < 3 && game.horde.library.length > 0) {
    const card = revealAndPlayOne(game);
    played += 1;
    if (card && !card.isToken) {
      game.log.unshift(`Horde reveals ${card.name} and stops revealing.`);
      break;
    }
  }
}

function revealAndPlay(game: GameState, amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    if (game.horde.library.length === 0) break;
    revealAndPlayOne(game);
  }
}

function revealAndPlayOne(game: GameState): CardInstance | undefined {
  const card = game.horde.library.shift();
  if (!card) return undefined;
  game.log.unshift(`Horde reveals ${card.name}.`);
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
  runEnterBattlefieldTriggers(game, card);
  enqueue(game, { type: "CARD_CAST", sourceId: card.instanceId, payload: { nonToken: !card.isToken } });
  return card;
}
