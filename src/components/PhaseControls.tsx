import { FastForward, Moon, RotateCcw, Scroll, Shield, Swords, Sun } from "lucide-react";
import type { Phase } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useTranslation } from "../i18n/useTranslation";
import type { TranslationKey } from "../i18n/translations";

const phases: Array<{ phase: Phase; labelKey: TranslationKey; icon: typeof Sun }> = [
  { phase: "untap", labelKey: "phase.untap", icon: RotateCcw },
  { phase: "draw", labelKey: "phase.draw", icon: Scroll },
  { phase: "main", labelKey: "phase.main", icon: Sun },
  { phase: "combat", labelKey: "phase.combat", icon: Swords },
  { phase: "end", labelKey: "phase.end", icon: Moon },
];

export function PhaseControls() {
  const t = useTranslation();
  const game = useGameStore((state) => state.game);
  const advancePhase = useGameStore((state) => state.advancePhase);
  const endPlayerTurn = useGameStore((state) => state.endPlayerTurn);
  const runHordeMain = useGameStore((state) => state.runHordeMain);
  const prepareHordeAttackers = useGameStore((state) => state.prepareHordeAttackers);
  const hordeActive = game.activeSide === "horde";
  return (
    <div className="flex flex-wrap gap-2">
      {phases.map(({ phase, labelKey, icon: Icon }) => (
        <button key={phase} className={game.phase === phase ? "control-button-active" : "control-button"} onClick={() => advancePhase(phase)} disabled={hordeActive} title={t(labelKey)}>
          <Icon size={16} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
      <button className="control-button" onClick={endPlayerTurn} disabled={hordeActive} title={t("orb.endTurn")}>
        <FastForward size={16} />
        <span>{t("orb.endTurn")}</span>
      </button>
      <button className="control-button-danger" onClick={runHordeMain} disabled={hordeActive} title={t("phase.hordePhase")}>
        <Swords size={16} />
        <span>{t("turn.horde")}</span>
      </button>
      <button className="control-button" onClick={prepareHordeAttackers} disabled={!hordeActive || game.combat.hordeAttackers.length > 0} title={t("orb.toBattle")}>
        <Shield size={16} />
        <span>{t("card.attacking")}</span>
      </button>
    </div>
  );
}
