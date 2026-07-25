import { Check, FastForward, Shield, Swords, X } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { canAttack, hasKeyword } from "../engine/Keywords";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialAwaitingContinue, isTutorialSeed } from "../engine/Tutorial";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { useTranslation } from "../i18n/useTranslation";
import { GameTooltip } from "./GameTooltip";

export function PhaseOrb({ game }: { game: GameState }) {
  const t = useTranslation();
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
  const burnAnimating = useGameStore((state) => Boolean(state.burnAnimation));
  const resolvingHordeCombat = useGameStore((state) => state.resolvingHordeCombat);
  const summoningAnimationCount = useGameStore((state) => state.summoningAnimationCount);
  const pendingTriggeredEffectCount = useGameStore((state) => state.pendingTriggeredEffectCount);
  const hordeAutoTriggerCount = useGameStore((state) => state.hordeAutoTriggerCount);
  const targetingActive = useGameStore((state) => Boolean(state.counterTargeting || state.spellTargeting || state.smallpoxSelection));
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const attackAnimating = hordeAttackAnimating || playerAttackAnimating || hordeMillAnimating || playerDiscardAnimating || burnAnimating || resolvingHordeCombat;
  const defendBlockedReason = getDefendBlockedReason(game, t);
  const actionBlockedReason = defendBlockedReason ?? getPendingActionBlockedReason(summoningAnimationCount, pendingTriggeredEffectCount, hordeAutoTriggerCount, t);
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
  }, t);
  const orbTooltip = targetingActive ? undefined : actionBlockedReason;
  const tutorialStepId = isTutorialSeed(game) ? getTutorialStepId(game) : null;
  const tutorialZones = tutorialStepId ? getTutorialSpotlightZones(game, tutorialStepId, tutorialAcknowledgedStepId === tutorialStepId) : [];
  const tutorialOrbTarget = tutorialZones.some((zone) => zone.zone === "phase-orb");

  function runOrbAction() {
    playSfx("skipNextBattle");
    state.action();
  }

  return (
    <>
      <div className={["game-phase-orb fixed right-4 top-[46%] -translate-y-1/2", game.gameMode === "chaos" ? "is-chaos" : "", tutorialOrbTarget ? "z-[97]" : "z-[80]"].join(" ")}>
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
              <GameTooltip content={t("orb.allTooltip")} className="game-phase-secondary-tooltip">
                <button data-audio-click="valid" onClick={attackAll} disabled={Boolean(game.winner) || attackAnimating || tutorialAwaitingContinue} className="game-phase-secondary-button is-all">
                  <Swords size={17} /> <span>{t("orb.all")}</span>
                </button>
              </GameTooltip>
            )}
            {showCancelDefense && (
              <button data-audio-click="valid" onClick={cancelBlocks} disabled={Boolean(game.winner) || attackAnimating || tutorialAwaitingContinue} className="game-phase-secondary-button is-cancel" title={t("orb.cancelBlocks")}>
                <X size={17} /> <span>{t("common.cancel")}</span>
              </button>
            )}
            {showCancelAttack && (
              <button data-audio-click="valid" onClick={cancelPlayerAttackers} disabled={Boolean(game.winner) || attackAnimating || tutorialAwaitingContinue} className="game-phase-secondary-button is-cancel" title={t("orb.cancelAttackers")}>
                <X size={17} /> <span>{t("common.cancel")}</span>
              </button>
            )}
          </div>
        )}
      </div>
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
  t: ReturnType<typeof useTranslation>,
) {
  if (game.activeSide === "horde" && game.combat.hordeAttackers.length > 0) {
    const hasBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
    return { label: hasBlocks ? t("orb.defend") : t("orb.noDefend"), Icon: Shield, action: actions.resolveHordeCombat, tone: "defend" as const };
  }
  if (game.activeSide === "horde" && game.phase === "horde") {
    return { label: t("turn.horde"), Icon: FastForward, action: actions.runHordeMain, tone: "horde" as const };
  }
  if (game.activeSide === "horde") {
    return { label: t("orb.myTurn"), Icon: Check, action: actions.finishHordeTurn, tone: "main" as const };
  }
  if (game.setupTurnsRemaining > 0) {
    if (game.setupTurnsRemaining === 1) {
      return { label: t("orb.endTurn"), Icon: Check, action: actions.finishSetupAndRunHorde, tone: "horde" as const };
    }
    return { label: t("orb.nextTurn"), Icon: FastForward, action: actions.endPlayerTurn, tone: "main" as const };
  }
  if (game.setupCompletePendingHorde) {
    return { label: t("orb.endTurn"), Icon: Check, action: actions.runHordeMain, tone: "horde" as const };
  }
  if (game.phase === "combat" && game.combat.playerAttackers.length > 0) {
    return { label: t("common.confirm"), Icon: Check, action: actions.finishPlayerCombat, tone: "confirm" as const };
  }
  if (game.phase === "combat") {
    return { label: t("orb.noAttack"), Icon: Check, action: actions.goToEndStep, tone: "main" as const };
  }
  if (game.phase === "end") {
    return { label: t("orb.endTurn"), Icon: Check, action: actions.finishPlayerTurnAndRunHorde, tone: "horde" as const };
  }
  return { label: t("orb.toBattle"), Icon: Swords, action: actions.startPlayerCombat, tone: "default" as const };
}

function getDefendBlockedReason(game: GameState, t: ReturnType<typeof useTranslation>): string | undefined {
  if (game.activeSide !== "horde" || game.combat.hordeAttackers.length === 0) return undefined;
  for (const attackerId of game.combat.hordeAttackers) {
    const attacker = game.horde.battlefield.find((card) => card.instanceId === attackerId);
    if (!attacker || !hasKeyword(game, attacker, "MENACE")) continue;
    const blockerCount = game.combat.blockers[attackerId]?.length ?? 0;
    if (blockerCount === 1) return t("orb.menaceBlocked");
  }
  return undefined;
}

function hasAvailableAttackers(game: GameState): boolean {
  return game.player.battlefield.some((card) => card.cardTypes.includes("Creature") && !game.combat.playerAttackers.includes(card.instanceId) && canAttack(game, card));
}

function getPendingActionBlockedReason(summoningAnimationCount: number, pendingTriggeredEffectCount: number, hordeAutoTriggerCount: number, t: ReturnType<typeof useTranslation>): string | undefined {
  if (hordeAutoTriggerCount > 0) return t("orb.hordeResolving");
  if (pendingTriggeredEffectCount > 0) return t("orb.resolveTrigger");
  if (summoningAnimationCount > 0) return t("orb.waitSummon");
  return undefined;
}
