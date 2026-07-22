import { Swords } from "lucide-react";
import type { GameMode } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  playerName: string;
  hordeName: string;
  hordeDeckId: string;
  gameMode: GameMode;
};

export function EncounterTransition({ playerName, hordeName, hordeDeckId, gameMode }: Props) {
  const t = useTranslation();
  const tone = gameMode === "chaos" ? "chaos" : hordeDeckId.includes("goblin") ? "goblins" : "undead";

  return (
    <div className={`encounter-transition is-${tone}`} role="status" aria-live="polite" data-audio-click="off">
      <div className="encounter-transition-vignette" />
      <div className="encounter-transition-rift" />
      <div className="encounter-transition-content">
        <p>{gameMode === "chaos" ? t("encounter.chaos") : t("encounter.standard")}</p>
        <div className="encounter-transition-matchup">
          <strong className="encounter-transition-name encounter-transition-name-player">{playerName}</strong>
          <span className="encounter-transition-versus"><Swords size={34} /><b>VS</b></span>
          <strong className="encounter-transition-name encounter-transition-name-horde">{hordeName}</strong>
        </div>
      </div>
    </div>
  );
}
