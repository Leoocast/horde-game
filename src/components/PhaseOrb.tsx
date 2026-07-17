import { Check, FastForward, Shield, Swords, X } from "lucide-react";
import { useState } from "react";
import { canPayWithAutomaticMana, parseManaCost } from "../engine/ManaSystem";
import { canPlayerPutAnotherLand } from "../engine/GameRules";
import type { CardInstance } from "../engine/GameTypes";
import type { GameState } from "../engine/GameTypes";
import { canAttack, hasKeyword } from "../engine/Keywords";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialAwaitingContinue, isTutorialSeed } from "../engine/Tutorial";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { GameTooltip } from "./GameTooltip";

const SKIP_ACTION_WARNING_KEY = "horde-skip-action-warning-disabled";

export function PhaseOrb({ game }: { game: GameState }) {
  const [showActionWarning, setShowActionWarning] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | undefined>();
  const playSfx = useAudioStore((state) => state.playSfx);
  const advancePhase = useGameStore((state) => state.advancePhase);
  const endPlayerTurn = useGameStore((state) => state.endPlayerTurn);
  const runHordeMain = useGameStore((state) => state.runHordeMain);
  const finishPlayerCombat = useGameStore((state) => state.finishPlayerCombat);
  const resolveHordeCombat = useGameStore((state) => state.resolveHordeCombat);
  const finishHordeTurn = useGameStore((state) => state.finishHordeTurn);
  const cancelBlocks = useGameStore((state) => state.cancelBlocks);
  const cancelPlayerAttackers = useGameStore((state) => state.cancelPlayerAttackers);
  const attackAll = useGameStore((state) => state.attackAll);
  const hordeAttackAnimating = useGameStore((state) => Boolean(state.hordeAttackAnimation));
  const playerAttackAnimating = useGameStore((state) => Boolean(state.playerAttackAnimation));
  const hordeMillAnimating = useGameStore((state) => state.hordeMillAnimationQueue.length > 0);
  const playerDiscardAnimating = useGameStore((state) => state.playerDiscardAnimationQueue.length > 0);
  const summoningAnimationCount = useGameStore((state) => state.summoningAnimationCount);
  const pendingTriggeredEffectCount = useGameStore((state) => state.pendingTriggeredEffectCount);
  const hordeAutoTriggerCount = useGameStore((state) => state.hordeAutoTriggerCount);
  const targetingActive = useGameStore((state) => Boolean(state.counterTargeting || state.spellTargeting || state.smallpoxSelection));
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const attackAnimating = hordeAttackAnimating || playerAttackAnimating || hordeMillAnimating || playerDiscardAnimating;
  const defendBlockedReason = getDefendBlockedReason(game);
  const actionBlockedReason = defendBlockedReason ?? getPendingActionBlockedReason(summoningAnimationCount, pendingTriggeredEffectCount, hordeAutoTriggerCount);
  const tutorialAwaitingContinue = isTutorialAwaitingContinue(game, tutorialAcknowledgedStepId);
  const orbDisabled = Boolean(game.winner) || attackAnimating || Boolean(actionBlockedReason) || tutorialAwaitingContinue;
  const hasAssignedBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
  const showCancelDefense = game.activeSide === "horde" && game.combat.hordeAttackers.length > 0 && hasAssignedBlocks;
  const showCancelAttack = game.activeSide === "player" && game.phase === "combat" && game.combat.playerAttackers.length > 0;
  const showAttackAll = game.activeSide === "player" && game.phase === "combat" && hasAvailableAttackers(game);
  const finishPlayerTurnAndRunHorde = () => {
    endPlayerTurn();
    const latest = useGameStore.getState().game;
    if (latest.activeSide === "horde" && latest.phase === "horde") {
      useGameStore.getState().runHordeMain();
    }
  };
  const finishSetupAndRunHorde = () => {
    endPlayerTurn();
    useGameStore.getState().runHordeMain();
  };

  const state = getOrbState(game, {
    startPlayerCombat: () => advancePhase("combat"),
    goToEndStep: () => advancePhase("end"),
    endPlayerTurn,
    finishPlayerTurnAndRunHorde,
    finishSetupAndRunHorde,
    runHordeMain,
    finishPlayerCombat,
    resolveHordeCombat,
    finishHordeTurn,
  });
  const orbTooltip = targetingActive ? undefined : actionBlockedReason;
  const tutorialStepId = isTutorialSeed(game) ? getTutorialStepId(game) : null;
  const tutorialZones = tutorialStepId ? getTutorialSpotlightZones(game, tutorialStepId, tutorialAcknowledgedStepId === tutorialStepId) : [];
  const tutorialOrbTarget = tutorialZones.some((zone) => zone.zone === "phase-orb");

  function runOrbAction() {
    if (state.warnIfActionsAvailable && hasAvailablePlayerActions(game) && !skipActionWarningDisabled()) {
      setPendingAction(() => state.action);
      setDontShowAgain(false);
      setShowActionWarning(true);
      return;
    }
    playSfx("skipNextBattle");
    state.action();
  }

  function confirmPendingAction() {
    if (dontShowAgain) window.localStorage.setItem(SKIP_ACTION_WARNING_KEY, "true");
    setShowActionWarning(false);
    playSfx("skipNextBattle");
    pendingAction?.();
    setPendingAction(undefined);
  }

  return (
    <>
      <div className={["game-phase-orb fixed right-4 top-[46%] -translate-y-1/2", tutorialOrbTarget ? "z-[97]" : "z-[80]"].join(" ")}>
        <GameTooltip content={orbTooltip} visible={Boolean(orbTooltip)}>
          <button
            data-audio-click="off"
            data-tone={state.tone}
            onClick={runOrbAction}
            disabled={orbDisabled}
            className="game-phase-button relative flex h-20 w-60 items-center justify-center overflow-hidden border text-[#f1e6c2] disabled:cursor-default disabled:saturate-75"
          >
            <span className="game-phase-button-shade pointer-events-none absolute inset-0" />
            <span className="relative z-10 flex w-full items-center justify-between gap-4 px-5 text-left">
              <strong className="game-phase-label">{state.label}</strong>
              <state.Icon size={28} strokeWidth={2.2} />
            </span>
          </button>
        </GameTooltip>
        {(showAttackAll || showCancelAttack || showCancelDefense) && (
          <div className="game-phase-secondary">
            {showAttackAll && (
              <GameTooltip content="Sends every available creature to attack." className="game-phase-secondary-tooltip">
                <button data-audio-click="valid" onClick={attackAll} disabled={Boolean(game.winner) || attackAnimating || tutorialAwaitingContinue} className="game-phase-secondary-button is-all">
                  <Swords size={17} /> <span>All</span>
                </button>
              </GameTooltip>
            )}
            {showCancelDefense && (
              <button data-audio-click="valid" onClick={cancelBlocks} disabled={Boolean(game.winner) || attackAnimating || tutorialAwaitingContinue} className="game-phase-secondary-button is-cancel" title="Cancel blocks">
                <X size={17} /> <span>Cancel</span>
              </button>
            )}
            {showCancelAttack && (
              <button data-audio-click="valid" onClick={cancelPlayerAttackers} disabled={Boolean(game.winner) || attackAnimating || tutorialAwaitingContinue} className="game-phase-secondary-button is-cancel" title="Cancel attackers">
                <X size={17} /> <span>Cancel</span>
              </button>
            )}
          </div>
        )}
      </div>
      {showActionWarning && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#090604]/85 p-6 text-[#f6e6b8]">
          <section className="old-panel w-full max-w-md p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#d8a154] bg-[#5a2b0d] text-[#ffd59b] shadow-[0_0_28px_rgba(214,112,26,0.45)]">
              <FastForward size={32} />
            </div>
            <h2 className="old-title mt-4 text-2xl font-black uppercase tracking-wide">Continue?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#d6b879]">You still have available actions. Are you sure you want to continue?</p>

            <label className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-[#d6b879]">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(event) => setDontShowAgain(event.target.checked)}
                className="h-4 w-4 accent-[#d8a154]"
              />
              Don't show this again
            </label>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="old-button flex h-11 items-center justify-center text-sm font-black uppercase tracking-wide"
                onClick={() => {
                  setShowActionWarning(false);
                  setPendingAction(undefined);
                }}
              >
                Cancel
              </button>
              <button className="old-button-green flex h-11 items-center justify-center text-sm font-black uppercase tracking-wide" onClick={confirmPendingAction}>
                Continue
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function getOrbState(
  game: GameState,
  actions: {
    startPlayerCombat: () => void;
    goToEndStep: () => void;
    endPlayerTurn: () => void;
    finishPlayerTurnAndRunHorde: () => void;
    finishSetupAndRunHorde: () => void;
    runHordeMain: () => void;
    finishPlayerCombat: () => void;
    resolveHordeCombat: () => void;
    finishHordeTurn: () => void;
  },
) {
  if (game.activeSide === "horde" && game.combat.hordeAttackers.length > 0) {
    const hasBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
    return { label: hasBlocks ? "Defend" : "No Defend", Icon: Shield, action: actions.resolveHordeCombat, tone: "defend" as const };
  }
  if (game.activeSide === "horde" && game.phase === "horde") {
    return { label: "Horde Turn", Icon: FastForward, action: actions.runHordeMain, tone: "horde" as const };
  }
  if (game.activeSide === "horde") {
    return { label: "My Turn", Icon: Check, action: actions.finishHordeTurn, tone: "horde" as const };
  }
  if (game.setupTurnsRemaining > 0) {
    if (game.setupTurnsRemaining === 1) {
      return { label: "End Turn", Icon: Check, action: actions.finishSetupAndRunHorde, tone: "horde" as const, warnIfActionsAvailable: true };
    }
    return { label: "Next Turn", Icon: FastForward, action: actions.endPlayerTurn, tone: "skip" as const, warnIfActionsAvailable: true };
  }
  if (game.setupCompletePendingHorde) {
    return { label: "End Turn", Icon: Check, action: actions.runHordeMain, tone: "horde" as const };
  }
  if (game.phase === "combat" && game.combat.playerAttackers.length > 0) {
    return { label: "Confirm", Icon: Check, action: actions.finishPlayerCombat, tone: "confirm" as const };
  }
  if (game.phase === "combat") {
    return { label: "No Attack", Icon: Check, action: actions.finishPlayerTurnAndRunHorde, tone: "horde" as const, warnIfActionsAvailable: true };
  }
  if (game.phase === "end") {
    return { label: "End Turn", Icon: Check, action: actions.finishPlayerTurnAndRunHorde, tone: "horde" as const };
  }
  return { label: "To Battle", Icon: Swords, action: actions.startPlayerCombat, tone: "default" as const };
}

function skipActionWarningDisabled(): boolean {
  return window.localStorage.getItem(SKIP_ACTION_WARNING_KEY) === "true";
}

function hasAvailablePlayerActions(game: GameState): boolean {
  if (game.winner || game.activeSide !== "player") return false;
  if (game.phase !== "main" && game.phase !== "combat") return false;
  if (!game.player.landPlayedThisTurn && canPlayerPutAnotherLand(game) && game.player.hand.some((card) => card.cardTypes.includes("Land"))) return true;
  if (game.phase === "combat") {
    return game.player.battlefield.some((card) => card.cardTypes.includes("Creature") && !card.tapped && !card.summoningSickness);
  }
  return game.player.hand.some((card) => !card.cardTypes.includes("Land") && canCastWithAvailableResources(game, card));
}

function canCastWithAvailableResources(game: GameState, card: CardInstance): boolean {
  const cost = parseManaCost(card.manaCost, 0);
  return canPayWithAutomaticMana(game, cost);
}

function getDefendBlockedReason(game: GameState): string | undefined {
  if (game.activeSide !== "horde" || game.combat.hordeAttackers.length === 0) return undefined;
  for (const attackerId of game.combat.hordeAttackers) {
    const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker || !hasKeyword(game, attacker, "MENACE")) continue;
    const blockerCount = game.combat.blockers[attackerId]?.length ?? 0;
    if (blockerCount === 1) return "Menace requires two or more blockers.";
  }
  return undefined;
}

function hasAvailableAttackers(game: GameState): boolean {
  return game.player.battlefield.some((card) => card.cardTypes.includes("Creature") && !game.combat.playerAttackers.includes(card.instanceId) && canAttack(game, card));
}

function getPendingActionBlockedReason(summoningAnimationCount: number, pendingTriggeredEffectCount: number, hordeAutoTriggerCount: number): string | undefined {
  if (hordeAutoTriggerCount > 0) return "Horde is resolving triggered effects.";
  if (pendingTriggeredEffectCount > 0) return "Resolve the triggered effect before continuing.";
  if (summoningAnimationCount > 0) return "Wait for the summon animation to finish.";
  return undefined;
}
