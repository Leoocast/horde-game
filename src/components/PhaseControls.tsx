import { FastForward, Moon, RotateCcw, Scroll, Shield, Swords, Sun } from "lucide-react";
import type { Phase } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

const phases: Array<{ phase: Phase; label: string; icon: typeof Sun }> = [
  { phase: "untap", label: "Untap", icon: RotateCcw },
  { phase: "draw", label: "Draw", icon: Scroll },
  { phase: "main", label: "Main", icon: Sun },
  { phase: "combat", label: "Combat", icon: Swords },
  { phase: "end", label: "End", icon: Moon },
];

export function PhaseControls() {
  const game = useGameStore((state) => state.game);
  const advancePhase = useGameStore((state) => state.advancePhase);
  const endPlayerTurn = useGameStore((state) => state.endPlayerTurn);
  const runHordeMain = useGameStore((state) => state.runHordeMain);
  const prepareHordeAttackers = useGameStore((state) => state.prepareHordeAttackers);
  const hordeActive = game.activeSide === "horde";
  return (
    <div className="flex flex-wrap gap-2">
      {phases.map(({ phase, label, icon: Icon }) => (
        <button key={phase} className={game.phase === phase ? "control-button-active" : "control-button"} onClick={() => advancePhase(phase)} disabled={hordeActive} title={label}>
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
      <button className="control-button" onClick={endPlayerTurn} disabled={hordeActive} title="End turn">
        <FastForward size={16} />
        <span>End Turn</span>
      </button>
      <button className="control-button-danger" onClick={runHordeMain} disabled={hordeActive} title="Horde main">
        <Swords size={16} />
        <span>Horde Turn</span>
      </button>
      <button className="control-button" onClick={prepareHordeAttackers} disabled={!hordeActive || game.combat.hordeAttackers.length > 0} title="Horde attacks">
        <Shield size={16} />
        <span>Attack</span>
      </button>
    </div>
  );
}
