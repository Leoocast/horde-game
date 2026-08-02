import { Check, FastForward, Shield, Swords, X } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { canAttack, hasTrait } from "../engine/Traits";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { useTranslation } from "../i18n/useTranslation";
import { GameTooltip } from "./GameTooltip";

export function PhaseOrb({ game }: { game: GameState }) {
  const t = useTranslation();
  const playSfx = useAudioStore((state) => state.playSfx);
  const advancePhase = useGameStore((state) => state.advancePhase);
  const endPlayerTurn = useGameStore((state) => state.endPlayerTurn);
  const runHostMain = useGameStore((state) => state.runHostMain);
  const finishPlayerCombat = useGameStore((state) => state.finishPlayerCombat);
  const resolveHostCombat = useGameStore((state) => state.resolveHostCombat);
  const finishHostTurn = useGameStore((state) => state.finishHostTurn);
  const cancelBlocks = useGameStore((state) => state.cancelBlocks);
  const cancelPlayerAttackers = useGameStore((state) => state.cancelPlayerAttackers);
  const attackAll = useGameStore((state) => state.attackAll);
  const hostAttackAnimating = useGameStore((state) => Boolean(state.hostAttackAnimation));
  const playerAttackAnimating = useGameStore((state) => Boolean(state.playerAttackAnimation));
  const hostMillAnimating = useGameStore((state) => state.hostMillAnimationQueue.length > 0);
  const playerDiscardAnimating = useGameStore((state) => state.playerDiscardAnimationQueue.length > 0);
  const burnAnimating = useGameStore((state) => Boolean(state.burnAnimation));
  const lifePaymentAnimating = useGameStore((state) => Boolean(state.lifePaymentAnimation));
  const bloodPactAnimating = useGameStore((state) => Boolean(state.bloodPactAnimation));
  const drainEssenceAnimating = useGameStore((state) => Boolean(state.drainEssenceAnimation));
  const energyFlowAnimating = useGameStore((state) => Boolean(state.energyFlowAnimation));
  const resolvingHostCombat = useGameStore((state) => state.resolvingHostCombat);
  const summoningAnimationCount = useGameStore((state) => state.summoningAnimationCount);
  const pendingTriggeredEffectCount = useGameStore((state) => state.pendingTriggeredEffectCount);
  const hostAutoTriggerCount = useGameStore((state) => state.hostAutoTriggerCount);
  const playerAutoTriggerCount = useGameStore((state) => state.playerAutoTriggerCount);
  const targetingActive = useGameStore((state) => Boolean(state.counterTargeting || state.spellTargeting || state.fleshRootTitheSelection));
  const attackAnimating = hostAttackAnimating || playerAttackAnimating || hostMillAnimating || playerDiscardAnimating || burnAnimating || lifePaymentAnimating || bloodPactAnimating || drainEssenceAnimating || energyFlowAnimating || resolvingHostCombat;
  const defendBlockedReason = getDefendBlockedReason(game, t);
  const actionBlockedReason = defendBlockedReason ?? getPendingActionBlockedReason(
    summoningAnimationCount,
    pendingTriggeredEffectCount,
    hostAutoTriggerCount,
    playerAutoTriggerCount,
    t,
  );
  const orbDisabled = Boolean(game.winner) || attackAnimating || Boolean(actionBlockedReason);
  const hasAssignedBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
  const showCancelDefense = game.activeSide === "host" && game.combat.hostAttackers.length > 0 && hasAssignedBlocks;
  const showCancelAttack = game.activeSide === "player" && game.phase === "combat" && game.combat.playerAttackers.length > 0;
  const showAttackAll = game.activeSide === "player" && game.phase === "combat" && hasAvailableAttackers(game);
  const finishPlayerTurnAndRunHost = () => {
    endPlayerTurn({ runHostAfter: true });
    const latest = useGameStore.getState().game;
    if (latest.activeSide === "host" && latest.phase === "host") {
      useGameStore.getState().runHostMain();
    }
  };
  const finishSetupAndRunHost = () => {
    endPlayerTurn({ runHostAfter: true });
    const latest = useGameStore.getState().game;
    if (latest.activeSide === "host" && latest.phase === "host") {
      useGameStore.getState().runHostMain();
    }
  };

  const state = getOrbState(game, {
    startPlayerCombat: () => advancePhase("combat"),
    goToEndStep: () => advancePhase("end"),
    endPlayerTurn,
    finishPlayerTurnAndRunHost,
    finishSetupAndRunHost,
    runHostMain,
    finishPlayerCombat,
    resolveHostCombat,
    finishHostTurn,
  }, t);
  const orbTooltip = targetingActive ? undefined : actionBlockedReason;
  function runOrbAction() {
    playSfx("skipNextBattle");
    state.action();
  }

  return (
    <>
      <div className={["game-phase-orb fixed right-4 top-[46%] z-[80] -translate-y-1/2", game.gameMode === "chaos" ? "is-chaos" : ""].join(" ")}>
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
                <button data-audio-click="valid" onClick={attackAll} disabled={Boolean(game.winner) || attackAnimating} className="game-phase-secondary-button is-all">
                  <Swords size={17} /> <span>{t("orb.all")}</span>
                </button>
              </GameTooltip>
            )}
            {showCancelDefense && (
              <button data-audio-click="valid" onClick={cancelBlocks} disabled={Boolean(game.winner) || attackAnimating} className="game-phase-secondary-button is-cancel" title={t("orb.cancelBlocks")}>
                <X size={17} /> <span>{t("common.cancel")}</span>
              </button>
            )}
            {showCancelAttack && (
              <button data-audio-click="valid" onClick={cancelPlayerAttackers} disabled={Boolean(game.winner) || attackAnimating} className="game-phase-secondary-button is-cancel" title={t("orb.cancelAttackers")}>
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
    endPlayerTurn: (options?: { runHostAfter?: boolean }) => void;
    finishPlayerTurnAndRunHost: () => void;
    finishSetupAndRunHost: () => void;
    runHostMain: () => void;
    finishPlayerCombat: () => void;
    resolveHostCombat: () => void;
    finishHostTurn: () => void;
  },
  t: ReturnType<typeof useTranslation>,
) {
  if (game.activeSide === "host" && game.combat.hostAttackers.length > 0) {
    const hasBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
    return { label: hasBlocks ? t("orb.defend") : t("orb.noDefend"), Icon: Shield, action: actions.resolveHostCombat, tone: "defend" as const };
  }
  if (game.activeSide === "host" && game.phase === "host") {
    return { label: t("turn.host"), Icon: FastForward, action: actions.runHostMain, tone: "host" as const };
  }
  if (game.activeSide === "host") {
    return { label: t("orb.myTurn"), Icon: Check, action: actions.finishHostTurn, tone: "main" as const };
  }
  if (game.setupTurnsRemaining > 0) {
    if (game.setupTurnsRemaining === 1) {
      return { label: t("orb.endTurn"), Icon: Check, action: actions.finishSetupAndRunHost, tone: "host" as const };
    }
    return { label: t("orb.nextTurn"), Icon: FastForward, action: actions.endPlayerTurn, tone: "main" as const };
  }
  if (game.setupCompletePendingHost) {
    return { label: t("orb.endTurn"), Icon: Check, action: actions.runHostMain, tone: "host" as const };
  }
  if (game.phase === "combat" && game.combat.playerAttackers.length > 0) {
    return { label: t("common.confirm"), Icon: Check, action: actions.finishPlayerCombat, tone: "confirm" as const };
  }
  if (game.phase === "combat") {
    return { label: t("orb.noAttack"), Icon: Check, action: actions.goToEndStep, tone: "main" as const };
  }
  if (game.phase === "end") {
    return { label: t("orb.endTurn"), Icon: Check, action: actions.finishPlayerTurnAndRunHost, tone: "host" as const };
  }
  return { label: t("orb.toBattle"), Icon: Swords, action: actions.startPlayerCombat, tone: "default" as const };
}

function getDefendBlockedReason(game: GameState, t: ReturnType<typeof useTranslation>): string | undefined {
  if (game.activeSide !== "host" || game.combat.hostAttackers.length === 0) return undefined;
  for (const attackerId of game.combat.hostAttackers) {
    const attacker = game.host.field.find((card) => card.instanceId === attackerId);
    if (!attacker || !hasTrait(game, attacker, "DAUNTING")) continue;
    const blockerCount = game.combat.blockers[attackerId]?.length ?? 0;
    if (blockerCount === 1) return t("orb.menaceBlocked");
  }
  return undefined;
}

function hasAvailableAttackers(game: GameState): boolean {
  return game.player.field.some((card) => card.kinds.includes("ECHO") && !game.combat.playerAttackers.includes(card.instanceId) && canAttack(game, card));
}

function getPendingActionBlockedReason(
  summoningAnimationCount: number,
  pendingTriggeredEffectCount: number,
  hostAutoTriggerCount: number,
  playerAutoTriggerCount: number,
  t: ReturnType<typeof useTranslation>,
): string | undefined {
  if (hostAutoTriggerCount > 0) return t("orb.hostResolving");
  if (playerAutoTriggerCount > 0) return t("orb.playerResolving");
  if (pendingTriggeredEffectCount > 0) return t("orb.resolveTrigger");
  if (summoningAnimationCount > 0) return t("orb.waitSummon");
  return undefined;
}
