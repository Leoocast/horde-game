import type { GameState, Side } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import {
  addEnergySource,
  addStoredEnergy,
  clearBattlefield,
  destroyCard,
  drainEnergy,
  drawPlayerCard,
  grantManaForCard,
  refillEnergy,
  resolveAllEvents,
  resolveNextEvent,
  sendCardToGraveyard,
  type PlaygroundActionResult,
} from "./actions";
import { addScenarioCard, configureExactHordeTurn, stageHordeQueue, type ScenarioCard, type ScenarioZoneKey } from "./scenario";

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
  | { kind: "hordeTurnExact"; entries?: ScenarioCard[]; count?: number }
  | { kind: "resolveNextEvent" }
  | { kind: "resolveAllEvents" }
  | { kind: "draw" }
  | { kind: "addEnergySource" }
  | { kind: "refillEnergy" }
  | { kind: "addStoredEnergy" }
  | { kind: "drainEnergy" }
  | { kind: "place"; zone: ScenarioZoneKey; entry: ScenarioCard }
  /** Pick a card from the catalog and let it happen for real: a player card goes to hand and casts
   *  through the normal path, a Horde card goes on top of the Horde library and the Horde plays it
   *  on its turn. There is no third way to put a card into play — that is the whole point. */
  | { kind: "playCard"; definitionId: string; cardName: string; side: Side }
  | { kind: "play"; handId: string; cardName: string; free: boolean }
  | { kind: "destroy"; cardId: string; cardName: string }
  | { kind: "toGraveyard"; cardId: string; cardName: string }
  | { kind: "clearBattlefield"; side: Side };

export type StepOutcome = { ok: boolean; reason?: string; message?: string };

export function describeStep(step: TimelineStep): string {
  switch (step.kind) {
    case "advancePhase": return "Advance phase";
    case "endTurn": return "Advance turn";
    case "hordeTurn": return "Run Host turn";
    case "hordeTurnExact": return `Run Host turn with exactly ${queuedCardCount(step)} queued card(s)`;
    case "resolveNextEvent": return "Resolve next event";
    case "resolveAllEvents": return "Resolve all events";
    case "draw": return "Draw card";
    case "addEnergySource": return "Add energy source";
    case "refillEnergy": return "Refill energy";
    case "addStoredEnergy": return "Store energy";
    case "drainEnergy": return "Drain energy";
    case "place": return `Put ${step.entry.amount ?? 1}× ${step.entry.definitionId} → ${step.zone}`;
    case "playCard": return `Play ${step.cardName}`;
    case "play": return `${step.free ? "Play free" : "Play"} ${step.cardName}`;
    case "destroy": return `Destroy ${step.cardName}`;
    case "toGraveyard": return `To Memory: ${step.cardName}`;
    case "clearBattlefield": return `Clear ${step.side} board`;
    // A flow saved before a step kind was renamed still lists it; say so instead of rendering blank.
    default: return `Unknown step "${(step as { kind: string }).kind}"`;
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
      return readEngineOutcome("Host turn running.");
    case "hordeTurnExact": {
      const originalRules = structuredClone(store.game.hordeRules);
      const withQueue = step.entries ? stageHordeQueue(store.game, step.entries) : store.game;
      if (withQueue.lastActionResult?.ok === false) {
        useGameStore.setState({ game: withQueue });
        return { ok: false, reason: withQueue.lastActionResult.reason };
      }
      const staged = configureExactHordeTurn(withQueue, queuedCardCount(step));
      useGameStore.setState({ game: staged });
      store.runHordeMain();
      useGameStore.setState(({ game }) => ({ game: { ...game, hordeRules: originalRules } }));
      return readEngineOutcome("Queued Host turn running.");
    }
    case "resolveNextEvent":
      return applyToGame(resolveNextEvent);
    case "resolveAllEvents":
      return applyToGame(resolveAllEvents);
    case "draw":
      return applyToGame(drawPlayerCard);
    case "addEnergySource":
      return applyToGame((game) => addEnergySource(game));
    case "refillEnergy":
      return applyToGame(refillEnergy);
    case "addStoredEnergy":
      return applyToGame((game) => addStoredEnergy(game));
    case "drainEnergy":
      return applyToGame(drainEnergy);
    case "place":
      return applyPlacement(step.zone, step.entry);
    case "playCard":
      return playFromCatalog(step);
    case "destroy":
      return applyToGame((game) => destroyCard(game, step.cardId));
    case "toGraveyard":
      return applyToGame((game) => sendCardToGraveyard(game, step.cardId));
    case "clearBattlefield":
      return applyToGame((game) => clearBattlefield(game, step.side));
    case "play":
      return playCard(step);
    default:
      return { ok: false, reason: `Unknown step "${(step as { kind: string }).kind}" — it was recorded by an older build.` };
  }
}

function queuedCardCount(step: Extract<TimelineStep, { kind: "hordeTurnExact" }>): number {
  return step.entries?.reduce((total, entry) => total + (entry.amount ?? 1), 0) ?? Math.max(0, step.count ?? 0);
}

/**
 * "Play this card", routed by whose card it is. Neither branch invents a path: the player's card
 * lands in hand and goes through the same cast the Hand does, and the Horde's card goes on top of
 * its library and is revealed by the Horde's own turn — which is the only way a Horde card ever
 * enters play in this game. That is why a sorcery like Smallpox cannot be "placed" on a
 * battlefield: nothing in the game does that, so the playground doesn't offer it.
 */
function playFromCatalog(step: Extract<TimelineStep, { kind: "playCard" }>): StepOutcome {
  const store = useGameStore.getState();

  if (step.side === "horde") {
    // Staged on top and revealed as a single card. Running a whole Horde turn instead would untap,
    // reveal the loaded deck's own cards and swing — playing one Goblin token would drag a Zombie
    // turn along with it, which is not what "play this card" means.
    const staged = addScenarioCard(store.game, "hordeLibraryTop", { definitionId: step.definitionId });
    if (!staged.lastActionResult?.ok) {
      return { ok: false, reason: staged.lastActionResult?.reason ?? "Could not stage that card." };
    }
    useGameStore.setState({ game: staged });
    store.resolveHordeCardFromTop();
    return readEngineOutcome(`${step.cardName} is Invoked for the Host.`);
  }

  const withCard = addScenarioCard(store.game, "playerHand", { definitionId: step.definitionId });
  if (!withCard.lastActionResult?.ok) {
    return { ok: false, reason: withCard.lastActionResult?.reason ?? "Could not put that card in hand." };
  }
  const handId = lastHandId(withCard, step.definitionId);
  if (!handId) return { ok: false, reason: `${step.cardName} did not reach the hand.` };
  useGameStore.setState({ game: withCard });
  return playCard({ kind: "play", handId, cardName: step.cardName, free: true });
}

function lastHandId(game: GameState, definitionId: string): string | undefined {
  return [...game.player.hand].reverse().find((card) => card.definitionId === definitionId)?.instanceId;
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
  if (!card.cardTypes.includes("SOURCE") && card.requiresTargets.length > 0) {
    store.startSpellTargeting(step.handId, window.innerWidth * 0.5, window.innerHeight * 0.5);
    return { ok: true, message: `Targeting started for ${card.name}. Pick targets on the board.` };
  }
  if (card.cardTypes.includes("SOURCE")) store.playLand(step.handId);
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
    state.playerAutoTriggerCount > 0 ||
    state.pendingTriggeredEffectCount > 0 ||
    state.hordeMillAnimationQueue.length > 0 ||
    state.playerDiscardAnimationQueue.length > 0 ||
    state.landPlayAnimationQueue.length > 0 ||
    state.surgeTransitionActive ||
    Boolean(state.hordeAttackAnimation) ||
    Boolean(state.playerAttackAnimation) ||
    Boolean(state.spellFightAnimation) ||
    Boolean(state.brokenWingsAnimation) ||
    Boolean(state.manaFlowAnimation) ||
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
