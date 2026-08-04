import type { CardInstance, GameState } from "../engine/GameTypes";
import { destroyPermanent, discardHostArchiveToMemory, losePlayerLife } from "../engine/EffectResolver";
import { weakestCreature } from "../engine/Targeting";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { useGameStore, type TributeOfTheFourSorrowsSelectionState } from "./useGameStore";
import { hostSequenceEpoch, scheduleQueuedHostTriggers, startHostCombatSequence } from "./hostBeats";
import { appendHostMillAnimations, uiCardName, uiText } from "./presentationEffects";
import { hasQueuedPlayerTriggers, scheduleQueuedPlayerTriggers } from "./playerBeats";

// Tribute of the Four Sorrows: revealed by the Host but parked unresolved by HostController (see `pendingCard`)
// because it needs a bespoke, multi-step, player-interactive resolution — first the Host afflicts
// itself (mill 1, sacrifice its weakest creature), then it turns on the player (lose 1 life, choose
// a card to discard, choose a creature to sacrifice, choose a land to sacrifice). Everything here is
// sequential and blocks the board via `hostAutoTriggerCount`, same as other Host reactions.
export function runTributeOfTheFourSorrowsSequence(card: CardInstance): void {
  const resetEpoch = hostSequenceEpoch();
  useGameStore.setState((state) => {
    const next = structuredClone(state.game) as GameState;
    next.host.pendingCard = undefined;
    return { game: next, tributeOfTheFourSorrowsCard: card, hostAutoTriggerCount: state.hostAutoTriggerCount + 1 };
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
        window.setTimeout(() => beginTributeOfTheFourSorrowsPlayerRound(resetEpoch), 200);
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
          window.setTimeout(() => beginTributeOfTheFourSorrowsPlayerRound(resetEpoch), 320);
        });
      }, 260);
    }, 650);
  }, 700);
}

function beginTributeOfTheFourSorrowsPlayerRound(resetEpoch: number): void {
  if (resetEpoch !== hostSequenceEpoch()) return;
  const card = useGameStore.getState().tributeOfTheFourSorrowsCard;
  useAudioStore.getState().playSfx("activateEffect");
  if (card) useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: uiText("toast.hostEffect"), message: uiText("toast.turnsAgainst", { card: card ? uiCardName(card) : "Tribute of the Four Sorrows" }), tone: "host" });
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
      if (useGameStore.getState().game.player.hand.length > 0) startTributeOfTheFourSorrowsSelectionStep("discard");
      else advanceTributeOfTheFourSorrowsSequence("after-discard");
    }, 480);
    if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
      scheduleQueuedPlayerTriggers(continueAfterLifeLoss);
    } else {
      continueAfterLifeLoss();
    }
  }, 700);
}

function startTributeOfTheFourSorrowsSelectionStep(kind: TributeOfTheFourSorrowsSelectionState["kind"]): void {
  useGameStore.setState({
    tributeOfTheFourSorrowsSelection: { kind, targetId: undefined, x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 },
  });
}

export function advanceTributeOfTheFourSorrowsSequence(from: "after-discard" | "after-sacrifice-creature" | "after-sacrifice-land"): void {
  const game = useGameStore.getState().game;
  if (from === "after-discard") {
    const hasCreature = game.player.field.some((card) => card.kinds.includes("ECHO"));
    if (hasCreature) startTributeOfTheFourSorrowsSelectionStep("sacrifice-creature");
    else advanceTributeOfTheFourSorrowsSequence("after-sacrifice-creature");
    return;
  }
  if (from === "after-sacrifice-creature") {
    const hasLand = game.player.field.some((card) => card.kinds.includes("SOURCE"));
    if (hasLand) startTributeOfTheFourSorrowsSelectionStep("sacrifice-land");
    else advanceTributeOfTheFourSorrowsSequence("after-sacrifice-land");
    return;
  }
  finishTributeOfTheFourSorrowsSequence();
}

function finishTributeOfTheFourSorrowsSequence(): void {
  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    const card = state.tributeOfTheFourSorrowsCard;
    if (card) {
      card.zone = "memory";
      next.host.memory.push(card);
      next.log.unshift(`${card.name} goes to the Host Memory.`);
      useAudioStore.getState().playSfx("draw");
    }
    return {
      game: next,
      tributeOfTheFourSorrowsCard: undefined,
      hostAutoTriggerCount: Math.max(0, state.hostAutoTriggerCount - 1),
      hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
    };
  });
  startHostCombatSequence();
}
