import type { CardInstance, GameState } from "../engine/GameTypes";
import { destroyPermanent, losePlayerLife } from "../engine/EffectResolver";
import { weakestCreature } from "../engine/Targeting";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { useGameStore, type TributeOfTheFourSorrowsSelectionState } from "./useGameStore";
import { hostSequenceEpoch, scheduleQueuedHostTriggers, startHostCombatSequence } from "./hostBeats";
import { appendHostMillAnimations, uiCardName, uiText } from "./presentationEffects";
import { hasQueuedPlayerTriggers, scheduleQueuedPlayerTriggers } from "./playerBeats";

// Tribute of the Four Sorrows: revealed by the Host but parked unresolved by HostController (see `pendingCard`)
// because it needs a bespoke, multi-step, player-interactive resolution — first the Host afflicts
// itself (sacrifice its weakest creature), then it turns on the player (lose 1 life, choose
// a card to discard, choose a creature to sacrifice, choose a land to sacrifice). Everything here is
// sequential and blocks the board via `hostAutoTriggerCount`, same as other Host reactions.
export function runTributeOfTheFourSorrowsSequence(card: CardInstance): void {
  if (useGameStore.getState().game.winner) return;
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
    if (useGameStore.getState().game.winner) {
      finishTributeOfTheFourSorrowsSequence(false);
      return;
    }
    let sacrificedId: string | undefined;
    useGameStore.setState((state) => {
      const next = structuredClone(state.game) as GameState;
      sacrificedId = weakestCreature(next, "host")?.instanceId;
      return { game: next };
    });
    if (!sacrificedId) {
      window.setTimeout(() => {
        if (resetEpoch !== hostSequenceEpoch()) return;
        if (useGameStore.getState().game.winner) {
          finishTributeOfTheFourSorrowsSequence(false);
          return;
        }
        beginTributeOfTheFourSorrowsPlayerRound(resetEpoch);
      }, 200);
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
        if (useGameStore.getState().game.winner) {
          finishTributeOfTheFourSorrowsSequence(false);
          return;
        }
        window.setTimeout(() => {
          if (resetEpoch !== hostSequenceEpoch()) return;
          if (useGameStore.getState().game.winner) {
            finishTributeOfTheFourSorrowsSequence(false);
            return;
          }
          beginTributeOfTheFourSorrowsPlayerRound(resetEpoch);
        }, 320);
      });
    }, 260);
  }, 700);
}

function beginTributeOfTheFourSorrowsPlayerRound(resetEpoch: number): void {
  if (resetEpoch !== hostSequenceEpoch()) return;
  if (useGameStore.getState().game.winner) {
    finishTributeOfTheFourSorrowsSequence(false);
    return;
  }
  const card = useGameStore.getState().tributeOfTheFourSorrowsCard;
  useAudioStore.getState().playSfx("activateEffect");
  if (card) useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
  useToastStore.getState().pushToast({ title: uiText("toast.hostEffect"), message: uiText("toast.turnsAgainst", { card: card ? uiCardName(card) : "Tribute of the Four Sorrows" }), tone: "host" });
  window.setTimeout(() => {
    if (resetEpoch !== hostSequenceEpoch()) return;
    if (useGameStore.getState().game.winner) {
      finishTributeOfTheFourSorrowsSequence(false);
      return;
    }
    useGameStore.setState((state) => {
      const next = structuredClone(state.game) as GameState;
      losePlayerLife(next, 1, card?.instanceId);
      next.log.unshift("Player loses 1 life.");
      return { game: next, lifeDamageAnimationId: Date.now() };
    });
    if (useGameStore.getState().game.winner === "host") {
      // La derrota cancela la parte interactiva del Tributo, pero conserva el beat de impacto
      // completo. Sin esta rama el contador quedaría esperando una selección que la pantalla de
      // derrota bloquea, por lo que nunca podría tomarse la captura final.
      window.setTimeout(() => {
        if (resetEpoch !== hostSequenceEpoch()) return;
        finishTributeOfTheFourSorrowsSequence(false);
      }, 480);
      return;
    }
    const continueAfterLifeLoss = () => window.setTimeout(() => {
      if (resetEpoch !== hostSequenceEpoch()) return;
      const current = useGameStore.getState();
      if (current.game.winner) {
        finishTributeOfTheFourSorrowsSequence(false);
        return;
      }
      if (current.game.player.hand.length > 0) startTributeOfTheFourSorrowsSelectionStep("discard");
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
  if (useGameStore.getState().game.winner) {
    finishTributeOfTheFourSorrowsSequence(false);
    return;
  }
  useGameStore.setState({
    tributeOfTheFourSorrowsSelection: { kind, targetId: undefined, x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 },
  });
}

export function advanceTributeOfTheFourSorrowsSequence(from: "after-discard" | "after-sacrifice-creature" | "after-sacrifice-land"): void {
  const game = useGameStore.getState().game;
  if (game.winner) {
    finishTributeOfTheFourSorrowsSequence(false);
    return;
  }
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

function finishTributeOfTheFourSorrowsSequence(startCombat = true): void {
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
      tributeOfTheFourSorrowsSelection: undefined,
      hostAutoTriggerCount: Math.max(0, state.hostAutoTriggerCount - 1),
      hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
    };
  });
  if (startCombat) startHostCombatSequence();
}

/** Terminal hand-off used when another visible Tribute beat caused defeat. */
export function finishTributeOfTheFourSorrowsAfterDefeat(): void {
  finishTributeOfTheFourSorrowsSequence(false);
}
