import { Check, FastForward, Sparkles, Swords, X } from "lucide-react";
import { useState } from "react";
import { addMana, canPay, parseManaCost } from "../engine/ManaSystem";
import type { CardInstance } from "../engine/GameTypes";
import type { GameState } from "../engine/GameTypes";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";

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
  const hordeAttackAnimating = useGameStore((state) => Boolean(state.hordeAttackAnimation));
  const playerAttackAnimating = useGameStore((state) => Boolean(state.playerAttackAnimation));
  const attackAnimating = hordeAttackAnimating || playerAttackAnimating;
  const hasAssignedBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
  const showCancelDefense = game.activeSide === "horde" && game.combat.hordeAttackers.length > 0 && hasAssignedBlocks;
  const finishSetupAndRunHorde = () => {
    endPlayerTurn();
    useGameStore.getState().runHordeMain();
  };

  const state = getOrbState(game, {
    startPlayerCombat: () => advancePhase("combat"),
    endPlayerTurn,
    finishSetupAndRunHorde,
    runHordeMain,
    finishPlayerCombat,
    resolveHordeCombat,
    finishHordeTurn,
  });

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
      <button
        data-audio-click="off"
        onClick={runOrbAction}
        disabled={Boolean(game.winner) || attackAnimating}
        className={[
          "fixed right-6 top-[35.5%] z-[80] flex h-28 w-28 -translate-y-1/2 flex-col items-center justify-center overflow-hidden rounded-full border-4 text-[#ffe6aa] transition hover:scale-105 xl:right-10",
          state.tone === "confirm"
            ? "border-[#f6d77d] bg-[#436d1d] shadow-[inset_0_2px_0_rgba(255,246,190,0.45),0_0_28px_rgba(109,164,43,0.45)] hover:bg-[#5d8d25]"
            : state.tone === "horde"
              ? "border-[#f3bf63] bg-[#9b3b13] shadow-[inset_0_2px_0_rgba(255,231,173,0.45),0_0_28px_rgba(214,112,26,0.5)] hover:bg-[#b74b18]"
            : state.tone === "defend"
              ? "border-[#b9d8ff] bg-[#174c85] shadow-[inset_0_2px_0_rgba(221,239,255,0.45),0_0_28px_rgba(59,130,246,0.5)] hover:bg-[#1f66a8]"
            : state.tone === "skip"
              ? "border-[#b88945] bg-[#2c2115] shadow-[inset_0_2px_0_rgba(255,231,173,0.22),0_0_24px_rgba(0,0,0,0.45)] hover:bg-[#3d2b18]"
            : "border-[#f6d77d] bg-[#7b2513] shadow-[inset_0_2px_0_rgba(255,231,173,0.45),0_0_28px_rgba(166,69,24,0.48)] hover:bg-[#9a3318]",
        ].join(" ")}
        title={state.label}
      >
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/55" />
        <span className="pointer-events-none absolute inset-x-3 top-2 h-6 rounded-full bg-white/12 blur-sm" />
        <span className="relative z-10 flex flex-col items-center justify-center">
          <state.Icon size={26} />
          <span className="mt-1 text-xs font-black uppercase leading-tight">{state.label}</span>
        </span>
      </button>
      {showCancelDefense && (
        <button
          data-audio-click="valid"
          onClick={cancelBlocks}
          disabled={Boolean(game.winner) || attackAnimating}
          className="fixed right-12 top-[calc(35.5%+5rem)] z-[80] flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-[#b9d8ff] bg-[#0f3157] text-[9px] font-black uppercase tracking-wide text-[#ddecff] shadow-xl shadow-black/45 transition hover:scale-105 hover:bg-[#174c85] xl:right-16"
          title="Cancel blocks"
        >
          <X size={18} />
          Cancel
        </button>
      )}
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
    endPlayerTurn: () => void;
    finishSetupAndRunHorde: () => void;
    runHordeMain: () => void;
    finishPlayerCombat: () => void;
    resolveHordeCombat: () => void;
    finishHordeTurn: () => void;
  },
) {
  if (game.activeSide === "horde" && game.combat.hordeAttackers.length > 0) {
    return { label: "Defend", Icon: Sparkles, action: actions.resolveHordeCombat, tone: "defend" as const };
  }
  if (game.activeSide === "horde" && game.phase === "horde") {
    return { label: "End Turn", Icon: Check, action: actions.runHordeMain, tone: "horde" as const };
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
    return { label: "Skip", Icon: FastForward, action: actions.endPlayerTurn, tone: "skip" as const, warnIfActionsAvailable: true };
  }
  return { label: "Battle", Icon: Swords, action: actions.startPlayerCombat, tone: "default" as const };
}

function skipActionWarningDisabled(): boolean {
  return window.localStorage.getItem(SKIP_ACTION_WARNING_KEY) === "true";
}

function hasAvailablePlayerActions(game: GameState): boolean {
  if (game.winner || game.activeSide !== "player") return false;
  if (game.phase !== "main" && game.phase !== "secondMain" && game.phase !== "combat") return false;
  if (!game.player.landPlayedThisTurn && game.player.hand.some((card) => card.cardTypes.includes("Land"))) return true;
  if (game.phase === "combat") {
    return game.player.battlefield.some((card) => card.cardTypes.includes("Creature") && !card.tapped && !card.summoningSickness);
  }
  return game.player.hand.some((card) => !card.cardTypes.includes("Land") && canCastWithAvailableResources(game, card));
}

function canCastWithAvailableResources(game: GameState, card: CardInstance): boolean {
  const cost = parseManaCost(card.manaCost, 0);
  let simulatedPool = { ...game.player.manaPool };
  if (canPay(simulatedPool, cost)) return true;
  for (const land of game.player.battlefield) {
    if (!land.cardTypes.includes("Land") || land.tapped) continue;
    const produced = getStaticLandMana(land);
    if (!produced) continue;
    simulatedPool = addMana(simulatedPool, produced.color, produced.amount);
    if (canPay(simulatedPool, cost)) return true;
  }
  return false;
}

function getStaticLandMana(card: CardInstance): { color: string; amount: number } | undefined {
  const ability = card.activatedAbilities.find((item) => item.effect.type === "ADD_MANA");
  if (!ability?.cost?.tap) return undefined;
  const mana = ability.effect.mana as Record<string, number> | undefined;
  const entry = mana ? Object.entries(mana)[0] : undefined;
  const color = entry?.[0] === "chosenColor" ? card.chosenColor ?? "G" : entry?.[0] ?? "G";
  const amount = entry?.[1] ?? Number(ability.effect.amount ?? 1);
  return { color, amount };
}
