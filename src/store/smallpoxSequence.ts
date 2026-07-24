import type { CardInstance, GameState } from "../engine/GameTypes";
import { destroyPermanent, millHorde } from "../engine/EffectResolver";
import { weakestCreature } from "../engine/Targeting";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { useGameStore, type SmallpoxSelectionState } from "./useGameStore";
import { hordeSequenceEpoch, scheduleQueuedHordeTriggers, startHordeCombatSequence } from "./hordeBeats";
import { appendHordeMillAnimations, uiCardName, uiText } from "./presentationEffects";

// Smallpox: revealed by the Horde but parked unresolved by HordeController (see `pendingCard`)
// because it needs a bespoke, multi-step, player-interactive resolution — first the Horde afflicts
// itself (mill 1, sacrifice its weakest creature), then it turns on the player (lose 1 life, choose
// a card to discard, choose a creature to sacrifice, choose a land to sacrifice). Everything here is
// sequential and blocks the board via `hordeAutoTriggerCount`, same as other Horde reactions.
export function runSmallpoxSequence(card: CardInstance): void {
  const resetEpoch = hordeSequenceEpoch();
  useGameStore.setState((state) => {
    const next = structuredClone(state.game) as GameState;
    next.horde.pendingCard = undefined;
    return { game: next, smallpoxCard: card, hordeAutoTriggerCount: state.hordeAutoTriggerCount + 1 };
  });
  useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
  useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: uiText("toast.hordeEffect"), message: uiText("toast.afflictsHorde", { card: uiCardName(card) }), tone: "horde" });
  window.setTimeout(() => {
    if (resetEpoch !== hordeSequenceEpoch()) return;
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      millHorde(next, 1);
      return { game: next, hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next) };
    });
    window.setTimeout(() => {
      if (resetEpoch !== hordeSequenceEpoch()) return;
      let sacrificedId: string | undefined;
      useGameStore.setState((state) => {
        const next = structuredClone(state.game) as GameState;
        sacrificedId = weakestCreature(next, "horde")?.instanceId;
        return { game: next };
      });
      if (!sacrificedId) {
        window.setTimeout(() => beginSmallpoxPlayerRound(resetEpoch), 200);
        return;
      }
      useGameStore.setState({ specialDeadCardIds: [sacrificedId] });
      useAudioStore.getState().playSfx("attack", { volume: 0.72 });
      window.setTimeout(() => {
        if (resetEpoch !== hordeSequenceEpoch()) return;
        useGameStore.setState((state) => {
          const next = structuredClone(state.game) as GameState;
          const target = next.horde.battlefield.find((item) => item.instanceId === sacrificedId);
          if (target) destroyPermanent(next, target);
          return { game: next, specialDeadCardIds: [] };
        });
        scheduleQueuedHordeTriggers(() => {
          window.setTimeout(() => beginSmallpoxPlayerRound(resetEpoch), 320);
        });
      }, 260);
    }, 650);
  }, 700);
}

function beginSmallpoxPlayerRound(resetEpoch: number): void {
  if (resetEpoch !== hordeSequenceEpoch()) return;
  const card = useGameStore.getState().smallpoxCard;
  useAudioStore.getState().playSfx("activateEffect", { volume: 0.82 });
  if (card) useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: uiText("toast.hordeEffect"), message: uiText("toast.turnsAgainst", { card: card ? uiCardName(card) : "Smallpox" }), tone: "horde" });
  window.setTimeout(() => {
    if (resetEpoch !== hordeSequenceEpoch()) return;
    useGameStore.setState((state) => {
      const next = structuredClone(state.game) as GameState;
      next.player.life -= 1;
      next.log.unshift("Player loses 1 life.");
      return { game: next };
    });
    window.setTimeout(() => {
      if (resetEpoch !== hordeSequenceEpoch()) return;
      if (useGameStore.getState().game.player.hand.length > 0) startSmallpoxSelectionStep("discard");
      else advanceSmallpoxSequence("after-discard");
    }, 480);
  }, 700);
}

function startSmallpoxSelectionStep(kind: SmallpoxSelectionState["kind"]): void {
  useGameStore.setState({
    smallpoxSelection: { kind, targetId: undefined, x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 },
  });
}

export function advanceSmallpoxSequence(from: "after-discard" | "after-sacrifice-creature" | "after-sacrifice-land"): void {
  const game = useGameStore.getState().game;
  if (from === "after-discard") {
    const hasCreature = game.player.battlefield.some((card) => card.cardTypes.includes("Creature"));
    if (hasCreature) startSmallpoxSelectionStep("sacrifice-creature");
    else advanceSmallpoxSequence("after-sacrifice-creature");
    return;
  }
  if (from === "after-sacrifice-creature") {
    const hasLand = game.player.battlefield.some((card) => card.cardTypes.includes("Land"));
    if (hasLand) startSmallpoxSelectionStep("sacrifice-land");
    else advanceSmallpoxSequence("after-sacrifice-land");
    return;
  }
  finishSmallpoxSequence();
}

function finishSmallpoxSequence(): void {
  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    const card = state.smallpoxCard;
    if (card) {
      card.zone = "graveyard";
      next.horde.graveyard.push(card);
      next.log.unshift(`${card.name} goes to the Horde graveyard.`);
      useAudioStore.getState().playSfx("draw");
    }
    return {
      game: next,
      smallpoxCard: undefined,
      hordeAutoTriggerCount: Math.max(0, state.hordeAutoTriggerCount - 1),
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
    };
  });
  startHordeCombatSequence();
}
