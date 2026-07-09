import { Check, FastForward, Sparkles, Swords, X } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";

export function PhaseOrb({ game }: { game: GameState }) {
  const playSfx = useAudioStore((state) => state.playSfx);
  const advancePhase = useGameStore((state) => state.advancePhase);
  const endPlayerTurn = useGameStore((state) => state.endPlayerTurn);
  const runHordeMain = useGameStore((state) => state.runHordeMain);
  const finishPlayerCombat = useGameStore((state) => state.finishPlayerCombat);
  const resolveHordeCombat = useGameStore((state) => state.resolveHordeCombat);
  const finishHordeTurn = useGameStore((state) => state.finishHordeTurn);
  const cancelBlocks = useGameStore((state) => state.cancelBlocks);
  const showCancelDefense = game.activeSide === "horde" && game.combat.hordeAttackers.length > 0;

  const state = getOrbState(game, {
    startPlayerCombat: () => advancePhase("combat"),
    endPlayerTurn,
    runHordeMain,
    finishPlayerCombat,
    resolveHordeCombat,
    finishHordeTurn,
  });

  return (
    <>
      <button
        data-audio-click="off"
        onClick={() => {
          playSfx("skipNextBattle");
          state.action();
        }}
        disabled={Boolean(game.winner)}
        className={[
          "fixed right-4 top-1/2 z-[80] flex h-24 w-24 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 text-white transition hover:scale-105 xl:right-8",
          state.tone === "confirm"
            ? "border-emerald-200 bg-emerald-600/95 shadow-[0_0_28px_rgba(52,211,153,0.55)] hover:bg-emerald-500"
            : state.tone === "horde"
              ? "border-orange-200 bg-orange-600/95 shadow-[0_0_28px_rgba(251,146,60,0.55)] hover:bg-orange-500"
            : state.tone === "skip"
              ? "border-stone-200 bg-stone-800/95 shadow-[0_0_24px_rgba(231,229,228,0.22)] hover:bg-stone-700"
              : "border-cyan-200 bg-cyan-700/90 shadow-[0_0_28px_rgba(34,211,238,0.55)] hover:bg-cyan-600",
        ].join(" ")}
        title={state.label}
      >
        <state.Icon size={26} />
        <span className="mt-1 text-xs font-black uppercase leading-tight">{state.label}</span>
      </button>
      {showCancelDefense && (
        <button
          data-audio-click="valid"
          onClick={cancelBlocks}
          disabled={Boolean(game.winner)}
          className="fixed right-5 top-[calc(50%+3.25rem)] z-[80] flex h-10 w-20 items-center justify-center gap-1 rounded-full border border-white/20 bg-stone-950/80 text-[11px] font-black uppercase tracking-wide text-stone-100 shadow-xl shadow-black/35 backdrop-blur-md transition hover:bg-rose-950/80 xl:right-10"
          title="Cancel blocks"
        >
          <X size={14} />
          Cancel
        </button>
      )}
    </>
  );
}

function getOrbState(
  game: GameState,
  actions: {
    startPlayerCombat: () => void;
    endPlayerTurn: () => void;
    runHordeMain: () => void;
    finishPlayerCombat: () => void;
    resolveHordeCombat: () => void;
    finishHordeTurn: () => void;
  },
) {
  if (game.activeSide === "horde" && game.combat.hordeAttackers.length > 0) {
    return { label: "Defend", Icon: Sparkles, action: actions.resolveHordeCombat, tone: "default" as const };
  }
  if (game.activeSide === "horde" && game.phase === "horde") {
    return { label: "End Turn", Icon: Check, action: actions.runHordeMain, tone: "horde" as const };
  }
  if (game.activeSide === "horde") {
    return { label: "My Turn", Icon: Check, action: actions.finishHordeTurn, tone: "horde" as const };
  }
  if (game.setupTurnsRemaining > 0) {
    return { label: "Next Turn", Icon: FastForward, action: actions.endPlayerTurn, tone: "skip" as const };
  }
  if (game.setupCompletePendingHorde) {
    return { label: "End Turn", Icon: Check, action: actions.runHordeMain, tone: "horde" as const };
  }
  if (game.phase === "combat" && game.combat.playerAttackers.length > 0) {
    return { label: "Confirm", Icon: Check, action: actions.finishPlayerCombat, tone: "confirm" as const };
  }
  if (game.phase === "combat") {
    return { label: "Skip", Icon: FastForward, action: actions.endPlayerTurn, tone: "skip" as const };
  }
  return { label: "Battle", Icon: Swords, action: actions.startPlayerCombat, tone: "default" as const };
}
