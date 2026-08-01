import type { CardInstance, EventItem, GameState } from "../engine/GameTypes";
import { checkWinLoss } from "../engine/CombatResolver";
import { pendingTriggerSources, resolveTriggeredEvent } from "../engine/EffectResolver";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { useGameStore } from "./useGameStore";
import { playerBuffSfxForAnimation } from "./playerAudioPolicy";
import {
  BUFF_ANIMATION_MS,
  appendHordeMillAnimations,
  findTemporaryBuffedCardIds,
  notifyDiscardEffects,
  startBuffBeat,
  startLifeBuffBeat,
  uiCardName,
  uiText,
} from "./presentationEffects";
import { buffAnimationVariantForCard } from "./buffAnimation";

// Automatic player reactions use the same contract as Horde beats: one source announces itself,
// then the engine commits that source's effect exactly when the presentation lands. The sequence
// is intentionally separate from hordeBeats because each runner owns a different side's queued
// triggers and uses a different tone/blocking state.
const PLAYER_TRIGGER_RESOLVE_MS = 460;
const PLAYER_TRIGGER_HANDOFF_MS = 620;
const PLAYER_TRIGGER_NO_BUFF_HANDOFF_MS = 180;

let playerTriggerSequenceId = 0;

/** Invalidates callbacks from the previous game before its timers can touch a reset board. */
export function resetPlayerTriggerSequence(): void {
  playerTriggerSequenceId += 1;
}

export function hasQueuedPlayerTriggers(game: GameState): boolean {
  const event = game.eventQueue[0];
  return Boolean(event && pendingTriggerSources(game, event).some((source) => source.controller === "player"));
}

/** Starts a fresh automatic player-trigger sequence. Recursive handoffs retain one epoch so a
 *  reset or a newer sequence can invalidate every timer from the old one at once. */
export function scheduleQueuedPlayerTriggers(onComplete?: () => void): void {
  const sequenceId = ++playerTriggerSequenceId;
  scheduleNextPlayerTrigger(sequenceId, onComplete);
}

function scheduleNextPlayerTrigger(sequenceId: number, onComplete?: () => void): void {
  if (sequenceId !== playerTriggerSequenceId) return;

  let event: EventItem | undefined;
  let source: CardInstance | undefined;

  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    while (next.eventQueue.length > 0) {
      const candidate = next.eventQueue[0];
      const candidateSource = pendingTriggerSources(next, candidate).find(
        (item) => item.controller === "player",
      );
      if (candidateSource) {
        event = candidate;
        source = candidateSource;
        break;
      }
      // Queue order is shared with Horde reactions. A player runner must yield when the event at
      // the front belongs elsewhere; consuming it here would make that reaction resolve invisibly.
      break;
    }
    if (!event) checkWinLoss(next);
    return {
      game: next,
      playerAutoTriggerCount: event ? 1 : 0,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
    };
  });

  const claimedEvent = event;
  const claimedSource = source;
  if (!claimedEvent || !claimedSource) {
    onComplete?.();
    return;
  }

  useAudioStore.getState().playSfx("activateEffect");
  useGameStore.getState().triggerEffectActivationPulse(claimedSource.instanceId);
  useToastStore.getState().pushToast({
    title: uiText("toast.chroniclerEffect"),
    message: uiText("toast.cardTrigger", { card: uiCardName(claimedSource) }),
    tone: "success",
  });

  window.setTimeout(() => {
    if (sequenceId !== playerTriggerSequenceId) return;
    const result = resolvePlayerTriggerBeat(claimedEvent.id, claimedSource.instanceId);
    const handoffMs = result.presentationLanded
      ? result.hasMore
        ? PLAYER_TRIGGER_HANDOFF_MS
        : BUFF_ANIMATION_MS
      : PLAYER_TRIGGER_NO_BUFF_HANDOFF_MS;
    window.setTimeout(() => {
      if (sequenceId === playerTriggerSequenceId) {
        scheduleNextPlayerTrigger(sequenceId, onComplete);
      }
    }, handoffMs);
  }, PLAYER_TRIGGER_RESOLVE_MS);
}

function resolvePlayerTriggerBeat(eventId: string, sourceId: string): {
  presentationLanded: boolean;
  hasMore: boolean;
} {
  let presentationLanded = false;
  let hasMore = false;

  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    const queued = next.eventQueue.find((event) => event.id === eventId);
    if (!queued) return {};

    const knownEventIds = new Set(next.eventQueue.map((event) => event.id));
    resolveTriggeredEvent(next, queued, undefined, sourceId);
    if (pendingTriggerSources(next, queued).length === 0) {
      next.eventQueue = next.eventQueue.filter((event) => event.id !== eventId);
    }

    // Follow-ups created by this source stay attached to its beat instead of falling behind
    // another reactor that was already waiting on the parent event.
    const spawned = next.eventQueue.filter((event) => !knownEventIds.has(event.id));
    if (spawned.length > 0) {
      next.eventQueue = [
        ...spawned,
        ...next.eventQueue.filter((event) => knownEventIds.has(event.id)),
      ];
    }

    const buffedCardIds = findTemporaryBuffedCardIds(previous, next);
    const buffLanded = buffedCardIds.length > 0;
    const lifeGainLanded = next.player.life > previous.player.life;
    presentationLanded = buffLanded || lifeGainLanded;
    hasMore = hasQueuedPlayerTriggers(next);
    const source =
      previous.player.field.find((card) => card.instanceId === sourceId) ??
      next.player.field.find((card) => card.instanceId === sourceId);
    const buffVariant = buffAnimationVariantForCard(source?.definitionId);
    if (presentationLanded) {
      useAudioStore.getState().playSfx(playerBuffSfxForAnimation(buffVariant));
    }
    const buffBeat = buffLanded
      ? startBuffBeat(
          buffedCardIds,
          buffVariant,
        )
      : undefined;
    const lifeBuffBeat = lifeGainLanded ? startLifeBuffBeat() : undefined;
    notifyDiscardEffects(previous, next);
    return {
      game: next,
      playerAutoTriggerCount: 1,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
      ...(buffBeat ?? {}),
      ...(lifeBuffBeat ?? {}),
    };
  });

  return { presentationLanded, hasMore };
}
