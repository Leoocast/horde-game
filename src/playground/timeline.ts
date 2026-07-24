import type { Color } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import {
  addPlayerMana,
  clearPlayerMana,
  destroyCard,
  drawPlayerCard,
  grantManaForCard,
  resolveAllEvents,
  resolveNextEvent,
  sendCardToGraveyard,
  type PlaygroundActionResult,
} from "./actions";
import { addScenarioCard, type ScenarioCard, type ScenarioZoneKey } from "./scenario";

/**
 * A recorded playground action. This is the whole timeline format — recording is just appending
 * one of these, and replaying is running them in order over a freshly rebuilt scenario. The future
 * flow authoring tool edits this same list instead of needing a second representation.
 *
 * Card ids are safe to record: `buildScenarioGame` is deterministic, so a restarted scenario hands
 * out the exact same instance ids in the exact same order.
 */
export type TimelineStep =
  | { kind: "advancePhase" }
  | { kind: "endTurn" }
  | { kind: "hordeTurn" }
  | { kind: "resolveNextEvent" }
  | { kind: "resolveAllEvents" }
  | { kind: "draw" }
  | { kind: "addMana"; color: Color }
  | { kind: "clearMana" }
  | { kind: "place"; zone: ScenarioZoneKey; entry: ScenarioCard }
  | { kind: "play"; handId: string; cardName: string; free: boolean }
  | { kind: "destroy"; cardId: string; cardName: string }
  | { kind: "toGraveyard"; cardId: string; cardName: string };

export type StepOutcome = { ok: boolean; reason?: string; message?: string };

export function describeStep(step: TimelineStep): string {
  switch (step.kind) {
    case "advancePhase": return "Advance phase";
    case "endTurn": return "Advance turn";
    case "hordeTurn": return "Run Horde turn";
    case "resolveNextEvent": return "Resolve next event";
    case "resolveAllEvents": return "Resolve all events";
    case "draw": return "Draw card";
    case "addMana": return `Add ${step.color} mana`;
    case "clearMana": return "Clear mana";
    case "place": return `Place ${step.entry.amount ?? 1}× ${step.entry.definitionId} → ${step.zone}`;
    case "play": return `${step.free ? "Play free" : "Play"} ${step.cardName}`;
    case "destroy": return `Destroy ${step.cardName}`;
    case "toGraveyard": return `To graveyard: ${step.cardName}`;
  }
}

/** Runs a step through the same code paths the panels use — there is no replay-only branch. */
export function executeStep(step: TimelineStep): StepOutcome {
  const store = useGameStore.getState();
  switch (step.kind) {
    case "advancePhase":
      store.advancePhase();
      return readEngineOutcome("Phase advanced.");
    case "endTurn":
      store.endPlayerTurn();
      return readEngineOutcome("Turn advanced.");
    case "hordeTurn":
      store.runHordeMain();
      return readEngineOutcome("Horde turn running.");
    case "resolveNextEvent":
      return applyToGame(resolveNextEvent);
    case "resolveAllEvents":
      return applyToGame(resolveAllEvents);
    case "draw":
      return applyToGame(drawPlayerCard);
    case "addMana":
      return applyToGame((game) => addPlayerMana(game, step.color));
    case "clearMana":
      return applyToGame(clearPlayerMana);
    case "place":
      return applyPlacement(step.zone, step.entry);
    case "destroy":
      return applyToGame((game) => destroyCard(game, step.cardId));
    case "toGraveyard":
      return applyToGame((game) => sendCardToGraveyard(game, step.cardId));
    case "play":
      return playCard(step);
  }
}

function playCard(step: Extract<TimelineStep, { kind: "play" }>): StepOutcome {
  const store = useGameStore.getState();
  const card = store.game.player.hand.find((item) => item.instanceId === step.handId);
  if (!card) return { ok: false, reason: `${step.cardName} is no longer in hand.` };

  if (step.free) {
    const granted = grantManaForCard(store.game, step.handId);
    useGameStore.setState({ game: granted.game });
    if (!granted.ok) return granted;
  }
  // A spell with targets goes through the real targeting overlay — never a synthetic resolution.
  // Replay stops here until the targets are picked on the board.
  if (!card.cardTypes.includes("Land") && card.requiresTargets.length > 0) {
    store.startSpellTargeting(step.handId, window.innerWidth * 0.5, window.innerHeight * 0.5);
    return { ok: true, message: `Targeting started for ${card.name}. Pick targets on the board.` };
  }
  if (card.cardTypes.includes("Land")) store.playLand(step.handId);
  else store.castCard(step.handId);
  return readEngineOutcome(`${card.name} played.`);
}

function applyToGame(action: (game: import("../engine/GameTypes").GameState) => PlaygroundActionResult): StepOutcome {
  const result = action(useGameStore.getState().game);
  useGameStore.setState({ game: result.game });
  return result;
}

function applyPlacement(zone: ScenarioZoneKey, entry: ScenarioCard): StepOutcome {
  const next = addScenarioCard(useGameStore.getState().game, zone, entry);
  useGameStore.setState({ game: next });
  return next.lastActionResult?.ok
    ? { ok: true, message: `${entry.amount ?? 1}× ${entry.definitionId} placed into ${zone}.` }
    : { ok: false, reason: next.lastActionResult?.reason ?? "Could not place that card." };
}

/** Store actions report through the engine's `lastActionResult`, never through log strings. */
function readEngineOutcome(message: string): StepOutcome {
  const outcome = useGameStore.getState().game.lastActionResult;
  return outcome?.ok === false ? { ok: false, reason: outcome.reason } : { ok: true, message };
}

/**
 * True while the board is mid-animation. Replay waits for this to clear between steps so each step
 * is seen resolving, instead of the whole script collapsing into one frame.
 */
export function isPlaygroundBusy(): boolean {
  const state = useGameStore.getState();
  return (
    state.resolvingHordeCombat ||
    state.summoningAnimationCount > 0 ||
    state.hordeAutoTriggerCount > 0 ||
    state.pendingTriggeredEffectCount > 0 ||
    state.hordeMillAnimationQueue.length > 0 ||
    state.playerDiscardAnimationQueue.length > 0 ||
    state.landPlayAnimationQueue.length > 0 ||
    state.surgeTransitionActive ||
    Boolean(state.hordeAttackAnimation) ||
    Boolean(state.playerAttackAnimation) ||
    Boolean(state.spellFightAnimation) ||
    Boolean(state.burnAnimation) ||
    Boolean(state.energyRecycleAnimation)
  );
}

/** True while the game is waiting for a human choice (targeting, discard, blockers). Auto-play
 *  pauses instead of trying to answer for the player. */
export function isWaitingForInput(): boolean {
  const state = useGameStore.getState();
  return (
    Boolean(state.spellTargeting) ||
    Boolean(state.counterTargeting) ||
    Boolean(state.smallpoxSelection) ||
    state.handLimitDiscardActive
  );
}
