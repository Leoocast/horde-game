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
  const hasAssignedBlocks = Object.values(game.combat.blockers).some((blockerIds) => blockerIds.length > 0);
  const showCancelDefense = game.activeSide === "horde" && game.combat.hordeAttackers.length > 0 && hasAssignedBlocks;

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
          "fixed right-4 top-1/2 z-[80] flex h-24 w-24 -translate-y-1/2 flex-col items-center justify-center overflow-hidden rounded-full border-4 text-[#ffe6aa] transition hover:scale-105 xl:right-8",
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
          disabled={Boolean(game.winner)}
          className="fixed right-6 top-[calc(50%+4.25rem)] z-[80] flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-[#b9d8ff] bg-[#0f3157] text-[9px] font-black uppercase tracking-wide text-[#ddecff] shadow-xl shadow-black/45 transition hover:scale-105 hover:bg-[#174c85] xl:right-12"
          title="Cancel blocks"
        >
          <X size={18} />
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
    return { label: "Defend", Icon: Sparkles, action: actions.resolveHordeCombat, tone: "defend" as const };
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
