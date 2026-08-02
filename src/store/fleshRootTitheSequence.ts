import type { CardInstance, GameState } from "../engine/GameTypes";
import { destroyPermanent, discardHostArchiveToMemory, losePlayerLife } from "../engine/EffectResolver";
import { weakestCreature } from "../engine/Targeting";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { useGameStore, type FleshRootTitheSelectionState } from "./useGameStore";
import { hostSequenceEpoch, scheduleQueuedHostTriggers, startHostCombatSequence } from "./hostBeats";
import { appendHostMillAnimations, uiCardName, uiText } from "./presentationEffects";
import { hasQueuedPlayerTriggers, scheduleQueuedPlayerTriggers } from "./playerBeats";

// Tithe of Flesh and Root: revealed by the Host but parked unresolved by HostController (see `pendingCard`)
// because it needs a bespoke, multi-step, player-interactive resolution — first the Host afflicts
// itself (mill 1, sacrifice its weakest creature), then it turns on the player (lose 1 life, choose
// a card to discard, choose a creature to sacrifice, choose a land to sacrifice). Everything here is
// sequential and blocks the board via `hostAutoTriggerCount`, same as other Host reactions.
export function runFleshRootTitheSequence(card: CardInstance): void {
  const resetEpoch = hostSequenceEpoch();
  useGameStore.setState((state) => {
    const next = structuredClone(state.game) as GameState;
    next.host.pendingCard = undefined;
    return { game: next, fleshRootTitheCard: card, hostAutoTriggerCount: state.hostAutoTriggerCount + 1 };
  });
  useAudioStore.getState().playSfx("activateEffect");
  useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: uiText("toast.hostEffect"), message: uiText("toast.afflictsHost", { card: uiCardName(card) }), tone: "host" });
  window.setTimeout(() => {
    if (resetEpoch !== hostSequenceEpoch()) return;
    useGameStore.setState((state) => {
      const previous = state.game;
      const next = structuredClone(previous) as GameState;
      discardHostArchiveToMemory(next, 1);
      return { game: next, hostMillAnimationQueue: appendHostMillAnimations(state, previous, next) };
    });
    window.setTimeout(() => {
      if (resetEpoch !== hostSequenceEpoch()) return;
      let sacrificedId: string | undefined;
      useGameStore.setState((state) => {
        const next = structuredClone(state.game) as GameState;
        sacrificedId = weakestCreature(next, "host")?.instanceId;
        return { game: next };
      });
      if (!sacrificedId) {
        window.setTimeout(() => beginFleshRootTithePlayerRound(resetEpoch), 200);
        return;
      }
      useGameStore.setState({ specialDeadCardIds: [sacrificedId] });
      useAudioStore.getState().playSfx("attack");
      window.setTimeout(() => {
        if (resetEpoch !== hostSequenceEpoch()) return;
        useGameStore.setState((state) => {
          const next = structuredClone(state.game) as GameState;
          const target = next.host.field.find((item) => item.instanceId === sacrificedId);
          if (target) destroyPermanent(next, target);
          return { game: next, specialDeadCardIds: [] };
        });
        scheduleQueuedHostTriggers(() => {
          window.setTimeout(() => beginFleshRootTithePlayerRound(resetEpoch), 320);
        });
      }, 260);
    }, 650);
  }, 700);
}

function beginFleshRootTithePlayerRound(resetEpoch: number): void {
  if (resetEpoch !== hostSequenceEpoch()) return;
  const card = useGameStore.getState().fleshRootTitheCard;
  useAudioStore.getState().playSfx("activateEffect");
  if (card) useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: uiText("toast.hostEffect"), message: uiText("toast.turnsAgainst", { card: card ? uiCardName(card) : "Tithe of Flesh and Root" }), tone: "host" });
  window.setTimeout(() => {
    if (resetEpoch !== hostSequenceEpoch()) return;
    useGameStore.setState((state) => {
      const next = structuredClone(state.game) as GameState;
      losePlayerLife(next, 1, card?.instanceId);
      next.log.unshift("Player loses 1 life.");
      return { game: next, lifeDamageAnimationId: Date.now() };
    });
    const continueAfterLifeLoss = () => window.setTimeout(() => {
      if (resetEpoch !== hostSequenceEpoch()) return;
      if (useGameStore.getState().game.player.hand.length > 0) startFleshRootTitheSelectionStep("discard");
      else advanceFleshRootTitheSequence("after-discard");
    }, 480);
    if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
      scheduleQueuedPlayerTriggers(continueAfterLifeLoss);
    } else {
      continueAfterLifeLoss();
    }
  }, 700);
}

function startFleshRootTitheSelectionStep(kind: FleshRootTitheSelectionState["kind"]): void {
  useGameStore.setState({
    fleshRootTitheSelection: { kind, targetId: undefined, x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 },
  });
}

export function advanceFleshRootTitheSequence(from: "after-discard" | "after-sacrifice-creature" | "after-sacrifice-land"): void {
  const game = useGameStore.getState().game;
  if (from === "after-discard") {
    const hasCreature = game.player.field.some((card) => card.kinds.includes("ECHO"));
    if (hasCreature) startFleshRootTitheSelectionStep("sacrifice-creature");
    else advanceFleshRootTitheSequence("after-sacrifice-creature");
    return;
  }
  if (from === "after-sacrifice-creature") {
    const hasLand = game.player.field.some((card) => card.kinds.includes("SOURCE"));
    if (hasLand) startFleshRootTitheSelectionStep("sacrifice-land");
    else advanceFleshRootTitheSequence("after-sacrifice-land");
    return;
  }
  finishFleshRootTitheSequence();
}

function finishFleshRootTitheSequence(): void {
  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    const card = state.fleshRootTitheCard;
    if (card) {
      card.zone = "memory";
      next.host.memory.push(card);
      next.log.unshift(`${card.name} goes to the Host Memory.`);
      useAudioStore.getState().playSfx("draw");
    }
    return {
      game: next,
      fleshRootTitheCard: undefined,
      hostAutoTriggerCount: Math.max(0, state.hostAutoTriggerCount - 1),
      hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
    };
  });
  startHostCombatSequence();
}
